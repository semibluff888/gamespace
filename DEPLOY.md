# 部署指南：自己的 VPS + Nginx + Let's Encrypt

目标：通过 `https://games.8201128.xyz` 访问这个网站。

```
访客浏览器 ──HTTPS──▶ VPS 上的 Nginx（443，Let's Encrypt 证书）──▶ /var/www/gamespace/current/
                                                                  （读取 dist/ 里的静态文件）
Cloudflare 只负责 DNS 解析（灰色云）：games.8201128.xyz → VPS 的 IP
```

这个网站是**纯静态**的：`npm run build` 生成的 `dist/` 里只有 HTML / JS / CSS / 图片 / 音频，服务器上不需要 Node.js，也不需要数据库。Nginx 只负责把这些文件发给浏览器。

**为什么不开 Cloudflare 代理（橙色云）**：Cloudflare 免费版在中国大陆没有节点，开了代理后，大陆访客会先绕到 Cloudflare 的海外节点（常见是美国西海岸），VPS 的优化线路就用不上了。灰色云让访客直接连 VPS。代价是没有 CDN 缓存和 DDoS 防护、VPS 的 IP 公开，HTTPS 证书也要自己在 VPS 上配置，这正是本文的主要内容。

目录：
1. [准备工作](#1-准备工作)
2. [Cloudflare：DNS 记录](#2-cloudflaredns-记录)
3. [Nginx 兜底站点](#3-nginx-兜底站点)
4. [HTTPS 证书（Let's Encrypt + acme.sh）](#4-https-证书lets-encrypt--acmesh)
5. [游戏星图站点配置](#5-游戏星图站点配置)
6. [发布网站](#6-发布网站)
7. [验证](#7-验证)
8. [日常更新](#8-日常更新)
9. [常见问题](#9-常见问题)
10. [附录](#附录)

---

## 1. 准备工作

### 1.1 SSH 免密登录（在 Windows 上，只需一次）

生成一把部署专用的密钥。不设密码短语，发布脚本才能自动登录；私钥只留在本机：

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\gamespace_vps -C gamespace-deploy
# 提示输入 passphrase 时直接回车两次
type $env:USERPROFILE\.ssh\gamespace_vps.pub      # 显示公钥，复制这一整行
```

在 VPS 上（比如 FinalShell 的终端里）把公钥追加到授权列表：

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
# 前面多输出一个换行，防止和文件原有的最后一行粘在一起
printf '\n%s\n' 'ssh-ed25519 AAAA……（刚才复制的那一行）' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

在 `C:\Users\<你>\.ssh\config` 里起个别名，以后用 `gamesvps` 代替 `root@IP`（本文和发布脚本都用这个别名）：

```
Host gamesvps
    HostName <VPS 的 IP>
    Port 22
    User root
    IdentityFile ~/.ssh/gamespace_vps
    IdentitiesOnly yes
    ServerAliveInterval 30
```

`IdentitiesOnly yes` 的意思是只用这一把密钥，不把电脑里的其他密钥挨个试一遍（试多了会被服务器当成登录失败）。执行 `ssh gamesvps`，能直接登录、不再要密码就成功了。

### 1.2 VPS：检查端口、安装软件

以 Debian 12 为例（Ubuntu 22.04+ 相同），以下命令在 VPS 上以 root 执行（不是 root 就在前面加 `sudo`）。

**先确认 80 / 443 端口没被占用**：

```bash
ss -tlnp | grep -E ':(80|443)\b'
```

没有输出说明端口空闲。机器上还跑着别的服务没关系，只要它们不占 80 / 443 就互不影响。如果看到 `docker-proxy` 或 `nginx` 已经占着，多半是这台机器装过 kejilion 脚本的建站环境（它的 Nginx 跑在 Docker 容器里），系统 Nginx 和它不能同时监听 80 / 443：换一台干净的 VPS，或者把站点加进那套容器里的 Nginx（本文不展开）。

另外看一眼 `crontab -l`：如果里面有 `acme.sh --cron`，说明这台机器上已经有 acme.sh 管理的证书，装好 Nginx 后要按 [4.4](#44-机器上已有别的-acmesh-证书时) 检查一遍。

**安装 Nginx 和时间同步**：

```bash
apt update
apt install -y nginx systemd-timesyncd
nginx -v                         # 查看版本（Debian 12 是 1.22.1）
systemctl status nginx           # 应显示 active (running)
timedatectl                      # 应显示 System clock synchronized: yes
```

> 为什么要装 `systemd-timesyncd`：有些 VPS 镜像没有任何自动校时，时钟会慢慢走偏（这台机器装之前已经慢了约 20 秒）。证书的有效期、证书申请、HTTP 缓存头都依赖准确的系统时间。

**防火墙**：用了 ufw 就执行 `ufw allow 'Nginx Full'`；云厂商控制台如果有安全组，也要放行 TCP 80 和 443。

**创建目录**：

```bash
mkdir -p /var/www/gamespace/releases          # 网站文件（发布脚本维护）
mkdir -p /var/www/letsencrypt                 # 证书验证文件（第 4 步）
mkdir -p /etc/nginx/ssl/games.8201128.xyz && chmod 700 /etc/nginx/ssl   # 证书，私钥只给 root 读
```

> `chmod 700` 不影响 Nginx：证书由以 root 身份运行的 master 进程在启动 / reload 时读取，worker 进程（www-data）不需要直接读这些文件。

发布后的网站目录结构（第 6 步的脚本会自动维护）：

```
/var/www/gamespace/
├── releases/
│   ├── 20261107-210319/     ← 每次发布一个新目录（只保留最近 3 个）
│   └── 20261108-090000/
└── current -> releases/20261108-090000     ← Nginx 的 root 指向这里
```

切换版本只是改一下 `current` 软链接，所以上线是瞬间完成的，回滚也只要把软链接指回上一个目录。

## 2. Cloudflare：DNS 记录

在 Cloudflare 后台选择域名 `8201128.xyz` → **DNS → Records → Add record**：

- Type：`A`
- Name：`games`
- IPv4 address：VPS 的公网 IP
- Proxy status：**DNS only**（灰色云朵）

> 不建议加 AAAA（IPv6）记录：优化线路通常只针对 IPv4，而大陆很多网络会优先走 IPv6，加了反而可能绕到普通线路上。

检查解析：关掉电脑上的代理后执行 `nslookup games.8201128.xyz`，或者在浏览器打开 `https://dns.google/resolve?name=games.8201128.xyz&type=A`，应该返回 VPS 的 IP，而不是 `104.x` / `172.x` 开头的 Cloudflare 地址。

> 电脑开着 Clash 之类的代理时，本机解析可能返回 `198.18.x.x`，那是代理软件的 fake-ip，不是 DNS 配错。

## 3. Nginx 兜底站点

配置文件：[`deploy/nginx/00-default.conf`](deploy/nginx/00-default.conf)。

Nginx 收到请求后，会拿请求里的域名（HTTP 看 `Host` 头，HTTPS 看 TLS 握手里的 SNI）去匹配各个 `server` 块的 `server_name`；一个都匹配不上，就交给这个端口上标了 `default_server` 的那个。灰色云下 VPS 的 IP 是公开的，扫描器整天直接用 IP 或乱填的域名来访问，兜底站点负责把它们挡掉：

- 80 端口返回 `444`：这是 Nginx 特有的状态码，什么都不回，直接断开连接；
- 443 端口用 `ssl_reject_handshake on`，在 TLS 握手阶段就拒绝。这样不用准备证书，也不会把本站证书暴露给扫描器；
- 唯一的例外是 `/.well-known/acme-challenge/`：不管哪个域名的证书验证请求，都从 `/var/www/letsencrypt` 返回文件。下一步申请证书就靠它。

启用（第一条在 Windows 的项目目录执行，其余在 VPS 上执行）：

```powershell
scp deploy\nginx\00-default.conf gamesvps:/etc/nginx/sites-available/
```

```bash
ln -s /etc/nginx/sites-available/00-default.conf /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default          # 停用 Debian 自带的 “Welcome to nginx!” 默认站点
nginx -t                                     # 检查语法，必须看到 "syntax is ok" 和 "test is successful"
systemctl reload nginx                       # 平滑重载，不会中断已有连接
```

> 在 `sites-enabled/` 里建软链接就是“启用站点”，删掉软链接就是“停用站点”，配置文件本身一直放在 `sites-available/`。
>
> reload 之后的一两秒内，旧的 worker 进程还在处理请求，这时测试可能看到旧配置的结果，稍等再测即可。

## 4. HTTPS 证书（Let's Encrypt + acme.sh）

灰色云下浏览器直接连 VPS，所以 VPS 上必须有一张浏览器信任的证书。Let's Encrypt 免费签发，有效期 90 天，用 [acme.sh](https://github.com/acmesh-official/acme.sh) 自动续期。

> Cloudflare 的“源站证书”（Origin CA）只有 Cloudflare 自己信任。灰色云下浏览器会直接报证书错误，不能用。

### 4.1 原理

**证书是怎么验证的（HTTP-01）**：acme.sh 向 Let's Encrypt 申请时，Let's Encrypt 给出一个随机文件名和内容；acme.sh 把文件写进 `/var/www/letsencrypt/.well-known/acme-challenge/`，Let's Encrypt 再从公网访问 `http://games.8201128.xyz/.well-known/acme-challenge/<文件名>`。能取到，就证明你控制着这个域名。这种方式叫 webroot 模式，靠的是兜底站点（以及第 5 步站点配置）里的那段 `location`。

**为什么要先启用兜底站点**：游戏星图的站点配置里有 `listen 443 ssl`，它引用的证书文件现在还不存在，`nginx -t` 会直接报错；可是申请证书，又需要 80 端口先能提供验证文件。兜底站点的 80 端口不依赖证书，正好打破这个“先有鸡还是先有蛋”的循环。

### 4.2 安装 acme.sh

机器上已经有 `~/.acme.sh/` 就跳过这一步（有些面板的一键脚本会自动装）：

```bash
curl https://get.acme.sh | sh
source ~/.bashrc       # 或者重新登录一次 SSH
```

安装时会顺带加一条 cron 定时任务（`crontab -l` 能看到 `acme.sh --cron`），定期检查所有证书，到期前自动续期。

### 4.3 申请并安装证书

**先用测试环境演练一遍（推荐）**：正式环境有频率限制（同一个域名每小时最多验证失败 5 次），测试环境不用担心这个。`--config-home` 指定一个临时目录，演练不会碰到正式的配置和证书：

```bash
~/.acme.sh/acme.sh --issue --server letsencrypt_test --config-home /tmp/acme-test \
  -d games.8201128.xyz -w /var/www/letsencrypt
rm -rf /tmp/acme-test
```

看到 `Cert success.` 就说明验证路径是通的。

**正式申请**：

```bash
# 1. 申请：证书保存在 ~/.acme.sh/games.8201128.xyz_ecc/ 里
~/.acme.sh/acme.sh --issue --server letsencrypt -d games.8201128.xyz -w /var/www/letsencrypt --keylength ec-256

# 2. 安装：复制到 Nginx 使用的位置，并记住以后每次续期后要执行的命令
~/.acme.sh/acme.sh --install-cert -d games.8201128.xyz --ecc \
  --key-file       /etc/nginx/ssl/games.8201128.xyz/privkey.pem \
  --fullchain-file /etc/nginx/ssl/games.8201128.xyz/fullchain.pem \
  --reloadcmd      "systemctl reload nginx"
```

- 不要让 Nginx 直接引用 `~/.acme.sh/` 里的文件：那是 acme.sh 的内部目录，结构可能会变。`--install-cert` 是官方推荐的做法；
- `--reloadcmd` 会被记下来，以后每次续期成功、复制完新证书后自动执行，Nginx 就用上了新证书；
- 证书满 60 天左右自动续期，不用人工干预。

查看本机所有证书和下次续期时间：

```bash
~/.acme.sh/acme.sh --list
```

### 4.4 机器上已有别的 acme.sh 证书时

一些面板的一键脚本会用 acme.sh 的 **standalone 模式**申请证书：续期时 acme.sh 临时自己监听 80 端口。装了 Nginx 后，80 端口一直被占着，这类证书到期续期就会失败（日志里是 `tcp port 80 is already used`），用这张证书的服务也会跟着出问题。

检查每张证书用的是哪种模式：

```bash
grep -H '^Le_Webroot=' ~/.acme.sh/*/*.conf      # 'no' 是 standalone 模式，路径是 webroot 模式
```

把 standalone 改成 webroot：兜底站点会为任何域名提供验证文件，所以只要改 acme.sh 为这个域名保存的配置里的一行（把 `<域名>` 换成实际域名；ECC 证书的目录名带 `_ecc` 后缀）：

```bash
C=~/.acme.sh/<域名>_ecc/<域名>.conf
cp -p "$C" ~/"<域名>.conf.bak-standalone"         # 先备份
sed -i "s|^Le_Webroot='no'\$|Le_Webroot='/var/www/letsencrypt'|" "$C"
```

前提是这个域名直接解析到这台 VPS，并且 HTTP 请求能到达 80 端口。改之前可以先用 4.3 的测试环境方法，把 `-d` 换成这个域名演练一遍。以后在这台机器上给别的域名申请证书，统一用 `--issue ... -w /var/www/letsencrypt`，不要再用面板菜单里的“申请证书”（它会用 standalone 模式，因为 80 端口被占而失败）。

## 5. 游戏星图站点配置

配置文件：[`deploy/nginx/games.8201128.xyz.conf`](deploy/nginx/games.8201128.xyz.conf)，里面每一段都有注释。证书到位后再启用：

```powershell
scp deploy\nginx\games.8201128.xyz.conf gamesvps:/etc/nginx/sites-available/
```

```bash
ln -s /etc/nginx/sites-available/games.8201128.xyz.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

**这份配置做了什么**（建议对照文件阅读）：

| 配置 | 作用 |
|---|---|
| 第一个 `server { listen 80; ... }` | 提供证书验证路径；其余 HTTP 请求一律 301 跳转到 HTTPS |
| `listen 443 ssl http2` + `ssl_certificate` | 开启 HTTPS 和 HTTP/2，使用第 4 步安装的证书 |
| `server_tokens off` | 错误页和响应头里不暴露 Nginx 版本号 |
| `root /var/www/gamespace/current` | 网站文件所在目录 |
| `try_files $uri $uri/ =404` | 按路径找文件，找不到返回 404 |
| `gzip ...` | 压缩 JS / CSS / SVG，传输体积减少约 70% |
| `map $uri $gamespace_cache_control` | 按路径决定缓存时间：带哈希的 `/assets/` 永久缓存，图片 1 天，`index.html` 每次都向服务器确认 |
| 一组 `add_header` | 安全响应头，包括内容安全策略（CSP），只允许加载本站资源和 GitHub API |
| `location ~ /\.` | 禁止访问 `.git`、`.env` 这类隐藏文件 |

> 值得记住的 Nginx 坑：
>
> - **子级 location 里只要写了任何一条 `add_header`，就不会继承上一级的全部 `add_header`**，安全头会悄悄消失。所以这份配置把响应头全写在 server 级，再用 `map` 按路径算出缓存时间，location 里一条 `add_header` 都不写。
> - **TLS 版本是在 Nginx 按 SNI 选中站点之前协商的**，实际生效的是默认站点的 `ssl_protocols`。所以兜底站点里也写了一遍 `ssl_protocols TLSv1.2 TLSv1.3`。

## 6. 发布网站

在项目目录执行：

```powershell
npm run deploy -- -Server gamesvps
```

脚本 [`scripts/deploy.ps1`](scripts/deploy.ps1) 依次完成：

1. `npm run build`，生成 `dist/`；
2. 把 `dist/` 打成一个 `.tgz` 包，用 `scp` 上传到服务器的 `/tmp`；
3. 在服务器上解压到 `/var/www/gamespace/releases/<发布时间>/`；
4. 原子地把 `current` 软链接切到新版本，访客不会看到半新半旧的文件；
5. 只保留最近 3 个版本。

其他用法：

```powershell
npm run deploy -- -Server gamesvps -SkipBuild   # 不重新构建，直接上传现有的 dist/
npm run deploy -- -DryRun                       # 只构建和打包，打印将要执行的远程命令，不连服务器
```

**回滚**（在 VPS 上）：

```bash
ls -1 /var/www/gamespace/releases                # 列出保留的版本
ln -sfn /var/www/gamespace/releases/<上一个版本> /var/www/gamespace/current
```

改完立即生效，不需要重载 Nginx。

## 7. 验证

```bash
curl -I https://games.8201128.xyz
```

应该看到：

- `HTTP/2 200`（旧版 curl 显示 `HTTP/1.1 200`）；
- `server: nginx`，不带版本号；
- `cache-control: no-cache` 和 `content-security-policy: ...`，说明是我们的 Nginx 配置在生效。

其他检查：

```bash
curl -I http://games.8201128.xyz/abc     # 301，Location 指向 https://games.8201128.xyz/abc
curl -I http://<VPS 的 IP>/              # curl: (52) Empty reply from server，兜底站点的 444 生效
echo | openssl s_client -connect games.8201128.xyz:443 -servername games.8201128.xyz 2>/dev/null | grep 'Verify return code'
                                         # Verify return code: 0 (ok)
```

再用浏览器打开网站，按 F12 看 Console，没有红色报错就说明一切正常。

> 测速要关掉电脑上的代理（或者用手机流量），否则测到的是代理线路，不是访客直连 VPS 的速度。

在 VPS 上实时查看访问日志（灰色云下，日志里就是访客的真实 IP）：

```bash
tail -f /var/log/nginx/gamespace.access.log
```

**可选：开启 HSTS**。等证书自动续期成功过一次之后，可以取消站点配置里 `Strict-Transport-Security` 那一行的注释。开启后浏览器会记住“这个域名只走 HTTPS”；但证书一旦失效，访客连“继续访问”的按钮都没有，所以不要急着开。

## 8. 日常更新

1. 修改代码或 `src/data/games.js`，本地 `npm run dev` 预览；
2. 提交并推送到 GitHub（`git push`），仓库里的 CI 会自动构建一遍，确认没有问题；
3. 发布：`npm run deploy -- -Server gamesvps`。

修改 Nginx 配置后，记得重新上传，并执行 `nginx -t && systemctl reload nginx`。

## 9. 常见问题

| 现象 | 原因与解决 |
|---|---|
| 浏览器报证书错误（`NET::ERR_CERT_AUTHORITY_INVALID` 等） | 用了 Cloudflare 源站证书，DNS 却是灰色云；或证书路径写错。按第 4 步换成 Let's Encrypt 证书，再用 `nginx -t` 检查 |
| 网站打不开、连接超时 | `systemctl status nginx` 看 Nginx 是否在运行；检查云厂商安全组和 ufw 是否放行 80、443 |
| `nginx -t` 报 `bind() to 0.0.0.0:80 failed` | 端口被其他程序占用，见 1.2 |
| `nginx -t` 报 `cannot load certificate` | 证书还没申请或路径不对；先完成第 4 步，再启用站点配置 |
| 403 Forbidden | `current` 软链接不存在或指向空目录（还没发布过）；或者手动拷贝的文件 Nginx 读不到（发布脚本已设置权限） |
| acme.sh 报 `Verify error` / `Timeout during connect` | 公网访问不到 80 端口（安全组、防火墙），或者兜底站点被停用了。`curl -I http://games.8201128.xyz/.well-known/acme-challenge/x` 应该返回 404，而不是连不上 |
| acme.sh 报 `tcp port 80 is already used` | 这张证书还是 standalone 模式，按 4.4 改成 webroot |
| 刚 reload 完，测试结果不对 | 旧 worker 进程还在处理请求，等一两秒再测 |
| 替换了同名截图，网页上还是旧图 | 图片缓存 1 天；浏览器强制刷新（Ctrl + F5），或者换个文件名 |
| 本机解析出 `198.18.x.x` | 代理软件的 fake-ip，不影响访客，见第 2 步 |

## 附录

### A. 以后想开 Cloudflare 代理（橙色云）

比如 VPS 遭到攻击，需要 Cloudflare 挡一挡的时候：

1. DNS 记录切换成 **Proxied**（橙色云）；
2. **SSL/TLS → Overview** 选 **Full (strict)**。Let's Encrypt 证书 Cloudflare 也信任，不用换证书；

   > ⚠️ 不要选 **Flexible**：Flexible 模式下 Cloudflare 用 HTTP 回源，而 Nginx 会把 HTTP 请求 301 跳转到 HTTPS，两边互相踢皮球，浏览器报 `ERR_TOO_MANY_REDIRECTS`。

3. 保持 **Always Use HTTPS** 关闭：Nginx 已经负责跳转，关着它，可以避免 Cloudflare 把证书验证的 HTTP 请求提前跳到 HTTPS，导致续期失败；
4. 让日志记录访客的真实 IP，新建 `/etc/nginx/conf.d/cloudflare-realip.conf`：

   ```nginx
   # Cloudflare 的 IP 段：从 https://www.cloudflare.com/ips/ 复制最新列表，每段一行
   set_real_ip_from 173.245.48.0/20;
   set_real_ip_from 103.21.244.0/22;
   # ……其余 IPv4 / IPv6 段照此补全……
   real_ip_header CF-Connecting-IP;
   ```

   然后执行 `nginx -t && systemctl reload nginx`。

开了橙色云以后：替换同名图片，要在 Cloudflare 后台 **Caching → Configuration → Purge Everything** 清一次缓存；如果开启了会往页面里注入脚本的功能（如 Web Analytics、Rocket Loader），需要把对应域名加进 CSP 的 `script-src` / `connect-src`，否则会被拦截。

### B. 在服务器上构建（不想在本地构建时）

服务器上需要 Node.js 22：

```bash
git clone https://github.com/semibluff888/gamespace.git ~/gamespace
cd ~/gamespace && npm ci && npm run build
REL=$(date +%Y%m%d-%H%M%S)
mkdir -p /var/www/gamespace/releases/$REL && cp -r dist/. /var/www/gamespace/releases/$REL/
ln -sfn /var/www/gamespace/releases/$REL /var/www/gamespace/current
```

以后更新时，先执行 `git pull`，再重复后面几行。
