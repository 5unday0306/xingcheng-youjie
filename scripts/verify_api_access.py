"""Bounded one-off API probe. No retries, no raw responses or secrets in reports."""
import argparse
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib import request, parse, error

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'docs' / 'verification' / 'api-probe-2026-10-24.json'

class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def load_keys():
    values = {}
    for line in (ROOT / '.env').read_text(encoding='utf-8-sig').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('\"').strip("'")
    for key in ('AMAP_WEB_SERVICE_KEY', 'DEEPSEEK_API_KEY'):
        if not values.get(key):
            raise ValueError('Missing required local configuration')
    return values


def call(url, payload=None, headers=None):
    start = time.monotonic()
    meta = {'at_utc': datetime.now(timezone.utc).isoformat(), 'attempts': 1}
    try:
        data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode('utf-8')
        req = request.Request(url, data=data, headers=headers or {})
        with request.build_opener(NoRedirect()).open(req, timeout=30) as response:
            meta['http_status'] = response.status
            result = json.loads(response.read(2_000_000).decode('utf-8'))
            if not isinstance(result, dict):
                raise ValueError('Response is not an object')
    except error.HTTPError as exc:
        meta.update(http_status=exc.code, error_type='HTTPError')
        result = None  # Do not print response body or a credential-bearing URL.
    except Exception as exc:
        meta['error_type'] = type(exc).__name__
        result = None
    meta['elapsed_seconds'] = round(time.monotonic() - start, 3)
    return result, meta


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--phase', choices=['map', 'model'], required=True)
    parser.add_argument('--live-authorized', action='store_true')
    args = parser.parse_args()
    if not args.live_authorized:
        parser.error('Explicit live authorization flag required; this makes real requests')
    keys = load_keys()
    report = json.loads(REPORT.read_text(encoding='utf-8')) if REPORT.exists() else {
        'kind': 'live_api_probe', 'authorized_budget_cny': 1,
        'limits': {'geocodes': 2, 'walking': 1, 'model': 1, 'retries': 0},
        'billing_note': 'No billing receipt; estimate only; maps raw data not persisted.'}
    if args.phase in report:
        raise SystemExit('Phase already recorded; refuse to repeat live requests')
    # Save a started marker before any call to prevent accidental repeated billing.
    report[args.phase] = {'state': 'started'}
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if args.phase == 'map':
        events, locations = [], []
        queries = [('山西省太原市滨河西路北段13号山西博物院东门', '东门'),
                   ('山西省太原市迎泽大街218号迎泽公园北门', '北门')]
        for address, gate in queries:
            params = parse.urlencode({'key': keys['AMAP_WEB_SERVICE_KEY'], 'address': address,
                                      'city': '太原', 'output': 'JSON'})
            body, meta = call('https://restapi.amap.com/v3/geocode/geo?' + params)
            meta['operation'] = 'geocode'
            if body:
                code = str(body.get('infocode', ''))
                meta['business_code'] = code if re.fullmatch(r'\d{5}', code) else 'unrecognized'
                found = body.get('geocodes', [])
                ok = body.get('status') == '1' and isinstance(found, list) and len(found) == 1
                point = found[0] if ok else {}
                loc = point.get('location', '')
                exact_gate = (ok and '太原' in str(point.get('city', '')) and
                              gate in str(point.get('formatted_address', '')) and
                              bool(re.fullmatch(r'\d{2,3}\.\d+,\d{2}\.\d+', loc)))
                meta.update(api_success=body.get('status') == '1', unique_result=ok,
                            gate_text_match=bool(exact_gate))
                if exact_gate:
                    locations.append(loc)
            events.append(meta)
            if not body or body.get('status') != '1':
                break  # Stop this service on an error, do not retry.
        route = {'state': 'not_called', 'reason': 'Both gate coordinates must be unambiguous'}
        if len(locations) == 2:
            params = parse.urlencode({'key': keys['AMAP_WEB_SERVICE_KEY'], 'origin': locations[0],
                                      'destination': locations[1], 'output': 'JSON'})
            body, route = call('https://restapi.amap.com/v3/direction/walking?' + params)
            route['state'] = 'called'
            if body:
                paths = body.get('route', {}).get('paths', [])
                route['api_success'] = body.get('status') == '1'
                route['numeric_distance_and_duration'] = bool(paths and all(
                    str(paths[0].get(k, '')).isdigit() for k in ['distance', 'duration']))
                # Only validation outcome is retained pending map-data retention permission.
        report['map'] = {'state': 'finished', 'geocodes': events, 'walking': route}
    else:
        system = ('Return only json with exactly candidate_ids, missing_data, warnings, all arrays of strings. '
                  'Use only supplied candidate IDs. List unknown facts in missing_data; do not invent prices, '
                  'coordinates, opening hours or a feasible itinerary. Example: '
                  '{"candidate_ids":["TY01"],"missing_data":["route"],"warnings":["not validated"]}')
        user = {'city': '太原', 'dates': ['2026-11-07', '2026-11-08'],
                'people': ['历史展览', '风景拍照', '美食少走路'],
                'constraints': {'daily_window': '09:00-18:00', 'per_person_total_cny': 600,
                                'daily_walking_km': 6, 'day2_replan_km': 4},
                'candidates': {'TY01': '山西博物院', 'TY04': '迎泽公园', 'TY06': '食品街（不是具体午餐店）'},
                'unknown': ['gate_coordinates', 'routes', 'date_specific_opening', 'lunch_venue', 'indoor_walking'],
                'task': 'Return candidate IDs and unknown fields only; this is an API format test.'}
        payload = {'model': 'deepseek-flash', 'messages': [
            {'role': 'system', 'content': system}, {'role': 'user', 'content': json.dumps(user, ensure_ascii=False)}],
            'thinking': {'type': 'disabled'}, 'response_format': {'type': 'json_object'},
            'max_tokens': 512, 'stream': False}
        body, meta = call('https://api.deepseek.com/chat/completions', payload,
                          {'Authorization': 'Bearer ' + keys['DEEPSEEK_API_KEY'], 'Content-Type': 'application/json'})
        if body:
            try:
                choice = body['choices'][0]
                obj = json.loads(choice['message']['content'])
                valid = (isinstance(obj, dict) and set(obj) == {'candidate_ids', 'missing_data', 'warnings'}
                         and all(isinstance(v, list) and all(isinstance(x, str) for x in v) for v in obj.values())
                         and bool(obj['candidate_ids']) and set(obj['candidate_ids']) <= set(user['candidates'])
                         and bool(obj['missing_data']) and choice.get('finish_reason') == 'stop')
                meta.update(json_parse=True, schema_and_id_check=bool(valid))
            except (KeyError, IndexError, TypeError, ValueError):
                meta.update(json_parse=False, schema_and_id_check=False)
            usage = body.get('usage', {})
            meta['usage'] = {k: v for k, v in usage.items() if k in ['prompt_tokens', 'completion_tokens', 'total_tokens'] and isinstance(v, int)}
            if all(k in meta['usage'] for k in ['prompt_tokens', 'completion_tokens']):
                meta['estimated_cny_peak_uncached'] = round((meta['usage']['prompt_tokens'] * 2 + meta['usage']['completion_tokens'] * 8) / 1_000_000, 8)
        report['model'] = {'state': 'finished', **meta}
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report[args.phase], ensure_ascii=True, indent=2))

if __name__ == '__main__':
    main()
