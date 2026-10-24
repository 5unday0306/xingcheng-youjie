"""Pre-push heuristic audit. Never opens .env; outputs locations/types, not matches.

Reads all blobs reachable from local Git refs and non-ignored working files.
This is not a proof of absence, OCR, a forensic scan, or a credential validator.
"""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

STRONG = {
    'service-token-shape': re.compile(rb'\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16})\b'),
    'private-key-block': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'credential-in-url': re.compile(rb'https?://[^\s/"<>]{1,150}:[^\s/@"<>]{4,150}@'),
}
ASSIGNED = re.compile(r'''(?:AMAP_\w*(?:KEY|CODE)|DEEPSEEK_API_KEY|api[_-]?key|securityJsCode|password|access_token)\s*["']?\s*[:=]\s*["'`]([^\s"'`]{8,})["'`]''', re.I)
CONTACTS = {
    'email-in-text': re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'),
    'phone-shape': re.compile(r'(?<![A-Za-z0-9])1[3-9]\d{9}(?![A-Za-z0-9])'),
    'identity-number-shape': re.compile(r'(?<!\w)\d{6}(?:19|20)\d{9}[\dXx](?!\w)'),
}

def private_path(path):
    p = pathlib.PurePosixPath(path)
    return p.name == '.env' or (p.name.startswith('.env.') and not p.name.endswith(('.example', '.template'))) or any(x in p.parts for x in ('private', 'secrets', '.secrets', 'credentials')) or p.suffix.lower() in ('.jsonl', '.pem', '.p12', '.pfx', '.zip', '.7z')

def scan(data, path, scope, findings):
    for kind, pattern in STRONG.items():
        if pattern.search(data): findings.append(dict(scope=scope,path=path,type=kind,severity='block'))
    if b'\0' in data: return
    text = data.decode('utf-8', errors='replace')
    for number, line in enumerate(text.splitlines(), 1):
        for match in ASSIGNED.finditer(line):
            value = match.group(1).lower()
            if not any(x in value for x in ('test-', 'canary', 'example', 'placeholder', '${', 'credentials.', 'process.env', 'your_', '你的', '您的', 'synthetic')):
                findings.append(dict(scope=scope,path=path,line=number,type='literal-credential-assignment',severity='review'))
        for kind, pattern in CONTACTS.items():
            if pattern.search(line): findings.append(dict(scope=scope,path=path,line=number,type=kind,severity='review'))

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--report', required=True)
    args=parser.parse_args()
    findings=[]; blobs={}; path_flags=set()
    commits=git('rev-list','--all').decode().splitlines()
    for commit in commits:
        for entry in git('ls-tree','-r','-z',commit).split(b'\0'):
            if not entry: continue
            head,name=entry.split(b'\t',1); mode,kind,sha=head.decode().split()
            path=name.decode('utf-8')
            if private_path(path): path_flags.add(path)
            if kind=='blob': blobs.setdefault(sha,set()).add(path)
    for path in sorted(path_flags): findings.append(dict(scope='history',path=path,type='private-or-credential-filename',severity='block'))
    skipped=0
    for sha,paths in blobs.items():
        path=sorted(paths)[0]
        if any(private_path(p) for p in paths): skipped+=1;continue
        data=git('cat-file','blob',sha)
        scan(data,path,'history-blob:'+sha,findings)
    paths=git('ls-files','-co','--exclude-standard','-z').decode('utf-8').split('\0')
    work_count=0
    for path in filter(None,paths):
        if private_path(path):
            findings.append(dict(scope='worktree',path=path,type='private-or-credential-filename',severity='block'));continue
        target=ROOT/path
        if target.is_symlink() or not target.resolve().is_relative_to(ROOT):
            findings.append(dict(scope='worktree',path=path,type='symlink-or-outside-root',severity='review'));continue
        if target.is_file(): scan(target.read_bytes(),path,'worktree',findings);work_count+=1
    scan(git('log','--all','--format=%B'),'Git commit messages','metadata',findings)
    identities=git('log','--all','--format=%an <%ae>%n%cn <%ce>').decode().splitlines()
    report=dict(executedAt=datetime.now(timezone.utc).isoformat(),head=git('rev-parse','HEAD').decode().strip(),
        commits=len(commits),uniqueHistoryBlobs=len(blobs),workingFiles=work_count,skippedSensitiveNamedBlobs=skipped,
        commitIdentityEntries=len(set(identities)),findings=findings,
        limits=['heuristics only; no proof of absence','no .env values read','binary text patterns only; no OCR','Git author identity travels with unchanged history','private session corpus excluded from Git audit and push'])
    out=ROOT/args.report;out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ('commits','uniqueHistoryBlobs','workingFiles','skippedSensitiveNamedBlobs','commitIdentityEntries','findings')},ensure_ascii=False,indent=2))
    return 2 if any(f['severity']=='block' for f in findings) else 0

if __name__=='__main__': raise SystemExit(main())
