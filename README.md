# SEMIBLUFF · 游戏星图

一个可以「玩」的游戏门户：每款游戏是深空星图里的一颗星球。拖拽环视、悬停扫描解码信号、点击锁定查看档案，按「启动」跃迁进入游戏。全部信号解码后，中心信标会解锁一条「开发者通讯」。

- 技术：Vite + three.js + postprocessing + GSAP，原生 JS，无框架
- 纯静态站点：构建产物是 `dist/`，部署在自己的 VPS（Nginx + Let's Encrypt）上，访问地址 `https://games.8201128.xyz`
- 所有资源本地打包，运行时不依赖外部 CDN / Google Fonts

## 本地运行

需要 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # 输出到 dist/
npm run preview    # 本地预览构建结果 http://127.0.0.1:4173
npm run preview:lan  # 构建并在局域网开放预览，手机连同一个 Wi-Fi 访问 http://<电脑的局域网 IP>:4173
npm run deploy -- -Server <服务器>   # 构建并发布到 VPS（见 DEPLOY.md）
```

## 新增一款游戏

只需要两步，**不用改任何代码**：

1. 在 `src/data/games.js` 的数组**末尾**加一项（加在末尾不会挪动已有星球的位置）：

   ```js
   {
     id: 'my-game',                 // 小写字母 / 数字 / -，用于网址 #my-game
     title: '我的新游戏',
     titleEn: 'MY NEW GAME',
     genre: '动作冒险',
     tagline: '一句话简介',
     description: '详细介绍……',
     platforms: ['Web'],
     modes: ['单人'],
     engine: 'Godot 4',
     world: { style: 'gas', accent: '#7fd8ff', palette: ['#2b5cff', '#7fd8ff', '#d9f1ff'], ring: true },
     links: { play: 'https://…', download: '', source: '' },
     cover: 'games/my-game/cover.webp',
     shots: ['games/my-game/shot-1.webp'],
   },
   ```

   - `world.style` 可选 `casino` / `racing` / `horror` / `ink` / `encrypted` / `gas`。`gas` 是通用星球，配三个颜色即可。
   - 链接留空的按钮不会显示；三个都为空时显示「链接待补充」。
   - 想预告一款未公开的新作：写 `status: 'encrypted'`，它会显示为一颗解不开的加密信号。

2. 放截图到 `public/games/<id>/`：`cover.webp`（16:9 封面）、`shot-N.webp`，以及可选的缩略图 `shot-N.thumb.webp`（没有缩略图时自动用原图）。也可以把原图路径加进 `scripts/optimize-images.mjs` 的 `SOURCES`，再运行 `npm run images` 自动压缩生成。德州扑克与格斗游戏的截图原图（以及当时的截图脚本）放在本机的 `captures/`，不进 Git。

老访客再次访问时，新作品会显示为带 `NEW SIGNAL` 标记的未知信号；全景镜头会根据星球分布自动挑选不互相遮挡的角度；开发模式下 `games.js` 填错字段会在浏览器控制台提示。

## 更新游戏

- **改链接 / 文案**：直接改 `games.js` 对应项。
- **版本号自动更新**：给作品写 `releaseRepo: 'owner/repo'`，档案会实时读取 GitHub 最新 Release 的版本号和日期；30 天内有新版本会显示 `UPDATED`。读取失败时回退到手写的 `version` / `updated` 字段。下载链接建议指向 `…/releases/latest`，发新版后网站无需改动。

## 修改品牌、文案、外链

都在 `src/data/site.js`：品牌名、副标题、站点描述、`siteUrl`、右上角外链、手机端默认视图（`mobileMode`）、默认配色（`theme`），以及解锁后的「开发者通讯」内容。

## 星图配色（观测滤镜）

背景星云、星系尘埃盘、星空和近景星尘有 4 套配色，访客可以随时切换（右上角「配色」按钮、快捷键 C / Shift + C、控制台 `filter <id>`），选择会记在浏览器里：

| id | 名称 | 风格 |
|---|---|---|
| `classic` | 经典 | 原版蓝紫 |
| `visible` | 可见光 | 真实色彩 · 银河系：深蓝黑夜空里一条柔和的银白色银河带；星系盘是发光的乳白色核球 + 中央棒 + 蓝白旋臂，零星几处粉红 HII 区；星星几乎不闪烁，画面噪点也调得更低 |
| `narrowband` | 窄带 | 哈勃色调（SHO）：青色电离气体 + 金色尘埃，最亮的十来颗星带十字衍射芒 |
| `infrared` | 红外 | 韦布色调：琥珀 / 铁锈色尘埃 + 钢蓝色气体，橙红旋臂，最亮的十来颗星带六芒衍射芒 |

- 新访客的默认配色：改 `src/data/site.js` 的 `theme`。
- 临时指定（不会被记住，方便分享对比）：网址加 `?theme=visible`。
- 调整或新增一套配色：编辑 `src/data/themes.js`，每个字段都有注释；颜色写 sRGB 十六进制即可。新增的配色会自动出现在面板和控制台里。
- 切换时背景先淡出，再分 7 帧重新烘焙星云与星系贴图后淡入，不会卡顿；开启「减少动态效果」时直接替换。

## 部署

网站部署在自己的 VPS 上：Cloudflare 只负责 DNS 解析（灰色云，访客直连 VPS 的优化线路），VPS 上的 Nginx 托管 `dist/` 里的静态文件，HTTPS 证书来自 Let's Encrypt（acme.sh 自动续期）。完整步骤（DNS 设置、证书申请与续期、Nginx 配置讲解、发布与回滚、常见问题）见 **[DEPLOY.md](DEPLOY.md)**。

- Nginx 配置：[`deploy/nginx/games.8201128.xyz.conf`](deploy/nginx/games.8201128.xyz.conf)（站点）+ [`deploy/nginx/00-default.conf`](deploy/nginx/00-default.conf)（兜底站点，拦截 IP 直连并提供证书验证路径）
- 一键发布：`npm run deploy -- -Server <服务器>`，即 [`scripts/deploy.ps1`](scripts/deploy.ps1)：本地构建 → 上传 → 原子切换版本，保留最近 3 个版本可回滚
- GitHub Actions（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）只在推送时检查能否构建成功，不负责发布

换域名时只需改 `src/data/site.js` 里的 `siteUrl`（用于分享卡片和 canonical 地址）和 Nginx 配置里的 `server_name`；站点内的资源都是相对路径。

## 操作与快捷键

| 操作 | 桌面 | 触屏 |
|---|---|---|
| 环视 / 缩放 | 拖拽 / 滚轮 | 拖动 / 双指 |
| 扫描解码 | 指针停在信号上约 0.7 秒 | 轻点 |
| 锁定、打开档案 | 点击星球、标签或雷达光点 | 轻点 |
| 上一个 / 下一个 | ← / → | 档案底部按钮 |
| 返回全景 | Esc 或点空白处 | 关闭按钮 |
| 列表 / 星图 | L | 右上角按钮 |
| 声音开关 | M | 右上角喇叭 |
| 换背景配乐 | B（Shift + B 上一首） | 右上角「配乐」按钮 |
| 星图配色 | C（Shift + C 反向） | 右上角按钮 |
| 控制台 | ~ | — |

控制台命令：`help`、`ls`、`goto <id|序号>`、`launch <id|序号>`、`scan`、`about`、`sound [on|off]`、`bgm [曲目]`、`filter [配色]`、`list`、`reset`、`clear`、`exit`（还有几个隐藏彩蛋）。

## 背景配乐

声音默认开启：浏览器不允许网页自己出声，所以配乐在访客第一次点击 / 轻点 / 按键时淡入，之后循环播放（星图和列表视图都放）；切走标签页时淡出暂停，跃迁时自动压低。访客点右上角喇叭（或按 M）可以关掉声音，点「配乐」按钮（或按 B）换曲，换曲时交叉淡入淡出；两项选择都记在访客的浏览器里，关掉过声音的访客下次来仍是静音。

- 默认曲目是《星际穿越》原声 Cornfield Chase（Hans Zimmer，`public/audio/bgm-cut.mp3`）：0:34 至结尾的选段，开头加了 0.6 秒淡入、裁掉结尾静音，响度压到与 Orbit 相同（约 −14 LUFS），循环时从尾声的淡出接回安静的开头。注意这是受版权保护的电影原声，版权方投诉时把它从 `music.tracks` 里删掉、再删掉音频文件即可。
- 第二首是原创的「Orbit」（`public/audio/orbit.mp3`）：管风琴 + 钟表滴答的太空氛围曲，D 小调、160 秒无缝循环，由 `npm run bgm`（`scripts/compose-bgm.mjs`，需要 ffmpeg）离线合成，可以改脚本里的和弦、配器和段落后重新生成。
- 曲目列表在 `src/data/site.js` 的 `music.tracks`：第一首是新访客听到的默认曲目，`title` / `by` 显示在配乐面板里，`volume` 可按单曲覆盖（默认用 `music.volume`）。加曲子就把音频放进 `public/audio/` 再加一项；只剩一首时「配乐」按钮自动隐藏。

## 降级与调试参数

- 不支持 WebGL2、或系统开启「减少动态效果」时，默认显示列表视图（后者可以手动切回星图）。
- 运行时会监测帧率，自动降低画质；仍然太卡时提示切换到列表视图。
- 不能渲染到浮点纹理的设备自动使用 8 位缓冲；GPU 上下文丢失时自动切到列表视图。
- 调试参数：`?mode=list|map`、`?quality=high|medium|low`、`?theme=classic|visible|narrowband|infrared`、`?nowebgl`、`?debug`。

## 目录结构

```
index.html                 页面骨架（构建时注入 <head> 元信息与无 JS 回退列表）
vite.config.js             base './' + portal-html 插件
public/                    favicon、分享图 og-cover.jpg、各游戏截图 games/<id>/
scripts/optimize-images.mjs  从各项目导入并压缩截图
scripts/deploy.ps1         构建并发布到 VPS
deploy/nginx/              Nginx 站点配置
DEPLOY.md                  部署指南
src/
  main.js                  能力检测 → 开场 → 懒加载星图 / 列表视图
  data/games.js            ★ 作品清单
  data/site.js             站点配置
  data/themes.js           星图配色（背景星云 / 星系盘 / 星空的色调参数）
  scene/                   3D 场景：渲染与后期、相机、星空、星云、星系尘埃盘、信标、星球与 6 种风格预设
  ui/                      HUD、标签、准星、档案、雷达、开场、终端、列表渲染
  systems/                 解码进度、音效合成、配色、GitHub Release、能力检测、存储
  styles/                  样式
```
