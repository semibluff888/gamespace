# 部署指南：自己的 VPS + Nginx + Cloudflare

目标：通过 `https://games.8201128.xyz` 访问这个网站。

```
访客浏览器 ──HTTPS──▶ Cloudflare（CDN 缓存 / 边缘证书）──HTTPS──▶ VPS 上的 Nginx（443）──▶ /var/www/gamespace/current/
                                                                   （读取 dist/ 里的静态文件）
```

这个网站是**纯静态**的：`npm run build` 生成的 `dist/` 里只有 HTML / JS / CSS / 图片，服务器上不需要 Node.js，也不需要数据库。Nginx 只负责把这些文件发给浏览器。

目录：
1. [准备 VPS](#1-准备-vps)
2. [Cloudflare：DNS 与 SSL 模式](#2-cloudflaredns-与-ssl-模式)
3. [源站证书](#3-源站证书cloudflare-origin-ca)
4. [Nginx 站点配置](#4-nginx-站点配置)
5. [发布网站](#5-发布网站)
6. [验证](#6-验证)
7. [日常更新](#7-日常更新)
8. [常见问题](#8-常见问题)
9. [附录](#附录)

---

## 1. 准备 VPS

以 Debian 12 / Ubuntu 22.04+ 为例，以下命令在 VPS 上执行。

**先确认 80 / 443 端口没被占用**：

```bash
sudo ss -tlnp | grep -E ':(80|443)\b'
```

没有输出说明端口空闲。如果看到 `docker-proxy` 或 `nginx` 已经占着，多半是这台机器装过 kejilion 脚本的建站环境（它的 Nginx 跑在 Docker 容器里）。系统 Nginx 和它不能同时监听 80 / 443，可以选择：

- 换一台干净的 VPS 来部署（最省心，也最适合学习）；
- 或者把这个站点加进那套容器里的 Nginx。这样就绕开了这次想学的“自己配 Nginx”，本文不展开。

**安装 Nginx**：

```bash
sudo apt update
sudo apt install -y nginx
nginx -v                         # 查看版本
systemctl status nginx           # 应显示 active (running)
```

**放行端口**：如果用了 ufw，执行 `sudo ufw allow 'Nginx Full'`；云厂商控制台的安全组也要放行 TCP 80 和 443。

**创建网站目录**：

```bash
sudo mkdir -p /var/www/gamespace/releases
sudo chown -R "$USER":"$USER" /var/www/gamespace    # 让登录用户能直接发布，不用 sudo
```

发布后的目录结构（第 5 步的脚本会自动维护）：

```
/var/www/gamespace/
├── releases/
│   ├── 20261103-231500/     ← 每次发布一个新目录（只保留最近 3 个）
│   └── 20261104-090000/
└── current -> releases/20261104-090000     ← Nginx 的 root 指向这里
```

切换版本只是改一下 `current` 软链接，所以上线是瞬间完成的，回滚也只要把软链接指回上一个目录。

## 2. Cloudflare：DNS 与 SSL 模式

在 Cloudflare 后台选择域名 `8201128.xyz`：

1. **DNS → Records → Add record**
   - Type：`A`
   - Name：`games`
   - IPv4 address：VPS 的公网 IP
   - Proxy status：**Proxied**（橙色云朵）
2. **SSL/TLS → Overview**：加密模式选 **Full (strict)**。

   > ⚠️ 不要选 **Flexible**。Flexible 模式下 Cloudflare 用 HTTP 回源，而我们的 Nginx 会把 HTTP 请求 301 跳转到 HTTPS，两边互相踢皮球，浏览器报 `ERR_TOO_MANY_REDIRECTS`。

3. **SSL/TLS → Edge Certificates**：打开 **Always Use HTTPS**。

## 3. 源站证书（Cloudflare Origin CA）

Cloudflare 和你的 VPS 之间也要走 HTTPS，所以 VPS 上需要一张证书。开了橙色云时，最省事的是 Cloudflare 免费签发的源站证书：有效期最长 15 年，不用续期。

1. **SSL/TLS → Origin Server → Create Certificate**
   - 私钥类型：RSA (2048)
   - 主机名：`games.8201128.xyz`（也可以写 `*.8201128.xyz` 和 `8201128.xyz`，以后其他子域名也能用这张）
   - 有效期：15 years
2. 点击创建后，页面会显示 **Origin Certificate** 和 **Private Key**。私钥只显示这一次，务必复制下来。
3. 在 VPS 上保存：

```bash
sudo mkdir -p /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/games.8201128.xyz.pem    # 粘贴 Origin Certificate，保存
sudo nano /etc/ssl/cloudflare/games.8201128.xyz.key    # 粘贴 Private Key，保存
sudo chmod 600 /etc/ssl/cloudflare/games.8201128.xyz.key
```

> 这张证书只被 Cloudflare 信任，所以 DNS 记录必须保持橙色云。如果哪天想不经过 Cloudflare 直连，改用 Let's Encrypt，见[附录 B](#b-改用-lets-encrypt-证书)。

## 4. Nginx 站点配置

配置文件已经写好：[`deploy/nginx/games.8201128.xyz.conf`](deploy/nginx/games.8201128.xyz.conf)，里面每一段都有注释。

**上传并启用**（在你的 Windows 电脑上执行第一条，其余在 VPS 上执行）：

```powershell
scp deploy\nginx\games.8201128.xyz.conf root@你的VPS_IP:/etc/nginx/sites-available/
```

```bash
sudo ln -s /etc/nginx/sites-available/games.8201128.xyz.conf /etc/nginx/sites-enabled/
sudo nginx -t                    # 检查语法，必须看到 "syntax is ok" 和 "test is successful"
sudo systemctl reload nginx      # 平滑重载，不会中断已有连接
```

> 在 `sites-enabled/` 里建软链接就是“启用站点”，删掉软链接就是“停用站点”。配置文件本身一直放在 `sites-available/`。

**这份配置做了什么**（建议对照文件阅读）：

| 配置 | 作用 |
|---|---|
| 第一个 `server { listen 80; ... }` | HTTP 请求一律 301 跳转到 HTTPS |
| `listen 443 ssl http2` + `ssl_certificate` | 开启 HTTPS 和 HTTP/2，使用第 3 步的源站证书 |
| `root /var/www/gamespace/current` | 网站文件所在目录 |
| `try_files $uri $uri/ =404` | 按路径找文件，找不到返回 404 |
| `gzip ...` | 压缩 JS / CSS / SVG，传输体积减少约 70% |
| `map $uri $gamespace_cache_control` | 按路径决定缓存时间：带哈希的 `/assets/` 永久缓存，图片 1 天，`index.html` 每次都向服务器确认 |
| 一组 `add_header` | 安全响应头，包括内容安全策略（CSP），只允许加载本站资源和 GitHub API |
| `location ~ /\.` | 禁止访问 `.git`、`.env` 这类隐藏文件 |

> 值得记住的一个 Nginx 坑：**子级 location 里只要写了任何一条 `add_header`，就不会继承上一级的全部 `add_header`**，安全头会悄悄消失。所以这份配置把响应头全写在 server 级，再用 `map` 按路径算出缓存时间，location 里一条 `add_header` 都不写。

## 5. 发布网站

### 5.1 配置 SSH 免密登录（只需一次）

在 Windows 的 PowerShell 里执行：

```powershell
ssh-keygen -t ed25519            # 一路回车即可，生成 ~\.ssh\id_ed25519 和 .pub
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@你的VPS_IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
ssh root@你的VPS_IP               # 能直接登录、不再要密码就成功了
```

可选：在 `C:\Users\<你>\.ssh\config` 里起个别名，以后用 `gamesvps` 代替 `root@IP`：

```
Host gamesvps
    HostName 你的VPS_IP
    User root
```

### 5.2 一键发布

在项目目录执行：

```powershell
npm run deploy -- -Server gamesvps          # 或 -Server root@你的VPS_IP
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

### 5.3 回滚

```bash
ls -1 /var/www/gamespace/releases                # 列出保留的版本
ln -sfn /var/www/gamespace/releases/<上一个版本> /var/www/gamespace/current
```

改完立即生效，不需要重载 Nginx。

## 6. 验证

在任意电脑上：

```bash
curl -I https://games.8201128.xyz
```

应该看到：

- `HTTP/2 200`
- `server: cloudflare`，以及 `cf-ray` 头（说明经过了 Cloudflare）
- `cache-control: no-cache` 和 `content-security-policy: ...`（说明是我们的 Nginx 配置在生效）

再用浏览器打开网站，按 F12 看 Console，没有红色报错就说明一切正常。

在 VPS 上实时查看访问日志：

```bash
sudo tail -f /var/log/nginx/gamespace.access.log
```

## 7. 日常更新

1. 修改代码或 `src/data/games.js`，本地 `npm run dev` 预览；
2. 提交并推送到 GitHub（`git push`）。仓库里的 CI 会自动构建一遍，确认没有问题；
3. 发布：`npm run deploy -- -Server gamesvps`。

修改 Nginx 配置后，记得重新上传，并执行 `sudo nginx -t && sudo systemctl reload nginx`。

## 8. 常见问题

| 现象 | 原因与解决 |
|---|---|
| `ERR_TOO_MANY_REDIRECTS` | Cloudflare 的 SSL 模式是 Flexible，改成 **Full (strict)** |
| Cloudflare 526 Invalid SSL certificate | 源站证书没装对、路径写错或主机名不匹配；`sudo nginx -t` 检查，确认 `.pem` / `.key` 内容完整 |
| Cloudflare 521 / 522 | Nginx 没启动（`systemctl status nginx`），或 80 / 443 被防火墙、安全组挡住 |
| 403 Forbidden | `current` 软链接不存在或指向空目录（还没发布过），或 Nginx 读不到文件（脚本已设置权限，手动拷贝时注意） |
| `nginx -t` 报 `bind() to 0.0.0.0:80 failed` | 端口被其他程序占用，见第 1 步 |
| 替换了同名截图，网页上还是旧图 | 图片缓存 1 天；在 Cloudflare 后台 **Caching → Configuration → Purge Everything** 清缓存，或者换个文件名 |
| 日志里的访客 IP 全是 Cloudflare 的 | 正常，按[附录 A](#a-日志记录访客真实-ip) 配置即可显示真实 IP |

## 附录

### A. 日志记录访客真实 IP

开了 Cloudflare 代理后，Nginx 看到的来源 IP 都是 Cloudflare 的节点。新建 `/etc/nginx/conf.d/cloudflare-realip.conf`：

```nginx
# Cloudflare 的 IP 段：从 https://www.cloudflare.com/ips/ 复制最新列表，每段一行
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
# ……其余 IPv4 / IPv6 段照此补全……
real_ip_header CF-Connecting-IP;
```

然后执行 `sudo nginx -t && sudo systemctl reload nginx`。

### B. 改用 Let's Encrypt 证书

适合不想依赖 Cloudflare 源站证书，或者 DNS 改成灰色云（直连）的情况：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo mkdir -p /var/www/letsencrypt
sudo certbot --nginx -d games.8201128.xyz
```

certbot 会自动申请证书、修改站点配置里的 `ssl_certificate` 路径，并通过 systemd 定时器自动续期。

### C. 在服务器上构建（不想在本地构建时）

服务器上需要 Node.js 22：

```bash
git clone https://github.com/semibluff888/gamespace.git ~/gamespace
cd ~/gamespace && npm ci && npm run build
REL=$(date +%Y%m%d-%H%M%S)
mkdir -p /var/www/gamespace/releases/$REL && cp -r dist/. /var/www/gamespace/releases/$REL/
ln -sfn /var/www/gamespace/releases/$REL /var/www/gamespace/current
```

以后更新时，先执行 `git pull`，再重复后面几行。
