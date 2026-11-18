# Linux服务器部署（待真实上线）

2026-11-16：仅完成部署适配与本地检查，尚无服务器、域名或公网地址；没有采购云资源。以下不是上线成功记录。

## 资源与边界

建议Linux云服务器（Ubuntu 24.04，2核/2GB起、20GB磁盘起），可访问高德和DeepSeek。需一个已持有域名的两个DNS记录，主站和地图子域名指向同一服务器。大陆服务器的域名服务可能需要备案，按云平台要求办理；其他区域同样须遵守账号及供应商规则。

账号实名、购买、DNS和供应商域名权限需要账号持有人完成或授权。云主机、域名和API可能收费，目前未采购，也不承诺免费。

当前是受密码保护的单共享工作区，不是多人账户服务：多窗口共享服务端采用方案、锁定和调用额度。评审访问请保留密码，不公开无保护API，也不要同时互相覆盖编辑。需求在各浏览器本地保存，跨域名不会自动迁移。

## 首次启动

前置：Linux Docker Engine、Compose v2、Git。开放80/443，保持4177/4184不可从公网访问。DNS必须生效，先核对80/443未被其他服务占用，不强停其他应用。

```sh
git clone https://github.com/5unday0306/xingcheng-youjie.git
cd xingcheng-youjie
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
docker run --rm -it caddy:2.10.2-alpine caddy hash-password
```

在服务器本地编辑deploy/.env，填真实域名、邮箱、访问密码哈希及四项API配置；不要发到聊天。哈希保留单引号以防Compose展开美元符号。不要打印包含密钥的完整Compose配置。

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yaml build
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d
```

Caddy自动申请TLS证书。高德控制台须按账号规则允许新JS域名，并核对Web服务IP限制是否允许服务器出站IP；安全码仍仅用于受限服务端代理。主站和地图使用固定独立HTTPS主机；不信任任意转发头，不关闭SSL、不扩大CSP。

Node监听仍在回环地址，Caddy通过Linux host网络访问。本模板不适用于Windows Docker Desktop或直接多副本部署。

## 保存与恢复

镜像不带本机.env、私有对话、旧账本、采用状态或完整仓库；凭据通过运行环境传入。app_state卷保存服务器新采用结构、锁定、角色历史和调用账本；本机原方案保持，不自动迁移。道路几何不从本机搬运。

重启服务使用Compose的restart app；升级先确认无执行任务、备份app_state，再拉取指定SHA、重建和启动。不要删除持久卷。回退须使用已验证版本和备份，不强推、不清账本。凭据、供应商配额和网络故障仍需手动恢复。

## 真实上线验收（未执行）

1. 主站未登录返回401，登录后可访问；4177/4184公网不可达。
2. 两域名TLS有效，CSP固定来源、私有路径不可访问。
3. 手动加载一次真实底图，核对显示、拖动、缩放、390切页签无重复初始化。
4. 有界四角色真实规划、不同候选和地图双向定位；超限不得采用。
5. 独立测试状态核对采用、锁定、刷新和服务重启。刷新不生成；地图需手动重取时明确提示。
6. 核对远端SHA、真实网址、调用增量和剩余限制。

本地固定来源与安全边界回归已执行，详情见开发记录。本机无Docker，镜像构建、Caddy实际加载、证书、云平台和真实远程接口尚未验证。未更新视频或PDF。
