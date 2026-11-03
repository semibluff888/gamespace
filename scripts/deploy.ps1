<#
.SYNOPSIS
  构建网站并发布到自己的 VPS（Nginx 托管的静态站点）。

.DESCRIPTION
  1. npm run build 生成 dist/
  2. 把 dist/ 打成一个 tgz 包，用 scp 上传到服务器的 /tmp
  3. 在服务器上解压到 <Root>/releases/<发布时间>/，再原子地把 <Root>/current 软链接切到新版本
  4. 只保留最近 <Keep> 个版本（方便回滚）

  服务器上的 Nginx 配置 root 指向 <Root>/current（见 deploy/nginx/games.8201128.xyz.conf）。
  需要本机能用 ssh / scp 登录服务器（Windows 10/11 自带 OpenSSH 客户端），建议先配置 SSH 密钥免密登录。

.EXAMPLE
  npm run deploy -- -Server root@203.0.113.10
.EXAMPLE
  .\scripts\deploy.ps1 -Server myvps -SkipBuild     # myvps 是 ~/.ssh/config 里的主机别名
.EXAMPLE
  .\scripts\deploy.ps1 -DryRun                      # 只构建和打包，打印将要执行的远程命令，不连接服务器
#>
param(
  [string]$Server = $env:GAMESPACE_SERVER,
  [string]$Root = '/var/www/gamespace',
  [int]$Keep = 3,
  [switch]$SkipBuild,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked([string]$Exe, [string[]]$Arguments) {
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Exe 执行失败（退出码 $LASTEXITCODE）" }
}

function Invoke-Remote([string]$Exe, [string[]]$Arguments) {
  if ($DryRun) {
    Write-Host "    [dry-run] $Exe $($Arguments -join ' ')" -ForegroundColor DarkGray
    return
  }
  Invoke-Checked $Exe $Arguments
}

if (-not $Server -and -not $DryRun) {
  throw '请用 -Server 指定服务器，例如：npm run deploy -- -Server root@203.0.113.10（也可以设置环境变量 GAMESPACE_SERVER）'
}
if (-not $Server) { $Server = 'user@your-vps' }

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

# 1. 构建
if (-not $SkipBuild) {
  Write-Step '构建 dist/'
  Invoke-Checked 'npm' @('run', 'build')
}
$dist = Join-Path $projectRoot 'dist'
if (-not (Test-Path (Join-Path $dist 'index.html'))) {
  throw "找不到 $dist\index.html，请先运行 npm run build"
}

# 2. 打包（Windows 10/11 自带 tar）
$release = Get-Date -Format 'yyyyMMdd-HHmmss'
$archive = Join-Path ([IO.Path]::GetTempPath()) "gamespace-$release.tgz"
Write-Step "打包 dist/ → $archive"
Invoke-Checked 'tar' @('-czf', $archive, '-C', $dist, '.')
$sizeKB = [math]::Round((Get-Item $archive).Length / 1KB)
Write-Host "    $sizeKB KB"

# 3. 上传
$remoteArchive = "/tmp/gamespace-$release.tgz"
Write-Step "上传到 ${Server}:$remoteArchive"
Invoke-Remote 'scp' @($archive, "${Server}:$remoteArchive")

# 4. 在服务器上解压并切换版本
$remoteScript = @'
set -e
ROOT='__ROOT__'
REL='__REL__'
ARCHIVE='__ARCHIVE__'
KEEP=__KEEP__
mkdir -p "$ROOT/releases/$REL"
tar -xzf "$ARCHIVE" -C "$ROOT/releases/$REL"
chmod -R u=rwX,go=rX "$ROOT/releases/$REL"
# 先建临时软链接再 mv -T 覆盖：切换是原子的，访客不会看到半新半旧的文件
ln -sfn "$ROOT/releases/$REL" "$ROOT/current.tmp"
mv -Tf "$ROOT/current.tmp" "$ROOT/current"
rm -f "$ARCHIVE"
# 只保留最近 KEEP 个版本。目录名就是发布时间，按名字排序即可
# （不能按修改时间排：tar 解压会还原打包时的时间，同一个包发布两次时会误删正在使用的版本）
cd "$ROOT/releases" && ls -1 | sort | head -n -"$KEEP" | xargs -r rm -rf --
echo "OK: current -> releases/$REL"
exit 0
'@
$remoteScript = $remoteScript.Replace('__ROOT__', $Root).Replace('__REL__', $release).Replace('__ARCHIVE__', $remoteArchive).Replace('__KEEP__', "$Keep")
$remoteScript = $remoteScript -replace "`r", ''
# 用 base64 传输脚本，避开 Windows PowerShell 给原生命令传参时对引号 / 换行的处理问题
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
Write-Step "切换服务器上的 current → releases/$release"
if ($DryRun) {
  Write-Host '    [dry-run] 将在服务器上执行：' -ForegroundColor DarkGray
  $remoteScript.Split("`n") | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
}
Invoke-Remote 'ssh' @($Server, "echo $encoded | base64 -d | bash")

Remove-Item $archive -ErrorAction SilentlyContinue
Write-Step '完成'
