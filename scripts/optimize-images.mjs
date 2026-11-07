/**
 * 从各游戏项目导入截图，压缩为 webp 放进 public/games/<id>/。
 *   npm run images            处理全部
 *   npm run images -- duel    只处理指定作品
 *
 * 输出：cover.webp（1280×720 封面）、shot-N.webp（最宽 1600）、shot-N.thumb.webp（360×203 缩略图）
 * 新增作品时，在下面的 SOURCES 里加一项即可（路径是你本机上的原图位置）。
 *
 * captures/（不进 Git）：从线上版本 / 游戏工程实际渲染出来的截图原图，以及当时用的截图脚本：
 *   captures/poker/capture-poker.cjs   以游客进入本地运行的线上版本 → 建房、加 AI、自动跟注，连拍一整手牌
 *   captures/duel/capture_castle.gd    在格斗工程里渲染无限城地图上的必杀瞬间（只读工程，图片写到外部目录）
 *   captures/duel/capture_title_opening.gd  渲染主界面与无限城开场「第壹回合 → 全集中 → 开战」
 *   captures/duel/capture_ranged.gd    拉开距离渲染远程放波（水面斩·重 / 空式·重），两名角色完整入镜
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'games');

const TURBO = 'J:/Project/turbo-legends';
const RAINROT = 'J:/Project/rainrot';
const CAPTURES = join(ROOT, 'captures');

const SOURCES = {
  // 线上 v2.1.0（与 GitHub main 一致），默认背景 WSOP1
  poker: {
    cover: `${CAPTURES}/poker/table-river.png`,
    shots: [`${CAPTURES}/poker/table-river.png`, `${CAPTURES}/poker/showdown.png`, `${CAPTURES}/poker/lobby.png`],
  },
  // 比赛画面放第一张：列表视图显示的封面就是它
  turbo: {
    cover: `${TURBO}/docs/screenshots/race-start.png`,
    shots: [
      `${TURBO}/docs/screenshots/race-start.png`,
      `${TURBO}/docs/screenshots/main-menu.png`,
      `${TURBO}/docs/screenshots/multiplayer-lobby.png`,
    ],
  },
  rainrot: {
    cover: `${RAINROT}/WebVersion/site/poster.jpg`,
    shots: [
      `${RAINROT}/WebVersion/site/poster.jpg`,
      `${RAINROT}/captures/12_smily_corridor.png`,
      `${RAINROT}/captures/05_laboratory.png`,
      `${RAINROT}/captures/13_nurse_morgue.png`,
    ],
  },
  // 炭治郎超必杀「水之呼吸·拾之型 生生流转」→ 远距离放波「壹之型 水面斩·重」（都在无限城）→ 主界面 → 选人界面
  // （capture_castle.gd 的 t-super-062、capture_ranged.gd 的 t-236C-052：双方相距 310，两名角色都完整入镜）
  duel: {
    cover: `${CAPTURES}/duel/tanjiro-super.jpg`,
    shots: [
      `${CAPTURES}/duel/tanjiro-super.jpg`,
      `${CAPTURES}/duel/tanjiro-236C.jpg`,
      `${CAPTURES}/duel/main-menu.jpg`,
      `${CAPTURES}/duel/select.webp`,
    ],
  },
};

const only = process.argv.slice(2);
let ok = 0;
let skipped = 0;

for (const [id, src] of Object.entries(SOURCES)) {
  if (only.length && !only.includes(id)) continue;
  const dir = join(OUT, id);
  await mkdir(dir, { recursive: true });

  if (src.cover && existsSync(src.cover)) {
    await sharp(src.cover).resize(1280, 720, { fit: 'cover', position: 'attention' }).webp({ quality: 78 }).toFile(join(dir, 'cover.webp'));
    ok++;
  } else {
    console.warn(`[${id}] 找不到封面：${src.cover}`);
    skipped++;
  }

  for (const [i, file] of (src.shots || []).entries()) {
    if (!existsSync(file)) {
      console.warn(`[${id}] 找不到截图：${file}`);
      skipped++;
      continue;
    }
    const n = i + 1;
    await sharp(file).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toFile(join(dir, `shot-${n}.webp`));
    await sharp(file).resize(360, 203, { fit: 'cover' }).webp({ quality: 70 }).toFile(join(dir, `shot-${n}.thumb.webp`));
    ok++;
  }
  console.log(`✓ ${id}`);
}

console.log(`完成：${ok} 张已生成${skipped ? `，${skipped} 张缺失` : ''}。`);
