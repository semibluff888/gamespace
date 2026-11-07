/**
 * ★ 作品清单 —— 新增 / 更新游戏只需要改这个文件（以及在 public/games/<id>/ 放截图）。
 *
 * 字段说明（? 为可选）：
 *   id          唯一短 id（小写字母、数字、-），用于网址深链接 #id 和终端命令
 *   title       中文名（主标题）            titleEn   英文名（HUD 显示）
 *   genre       类型                        tagline   一句话简介
 *   description 详细介绍
 *   platforms   平台，如 ['Web', 'Windows']  modes     模式，如 ['单人', '在线多人']
 *   engine      引擎 / 技术
 *   world       星球外观：{ style, accent?, palette?, size?, ring? }
 *               style 可选：casino | racing | horror | ink | encrypted | gas（通用，配 palette 三色即可）
 *   links       { play?, download?, source? } —— 留空的按钮不显示；都为空时显示「链接待补充」
 *   cover?      封面图（相对 public/）        shots?    截图列表；缩略图约定为同名 .thumb.webp
 *   version?    手写版本号                    updated?  手写更新日期（YYYY-MM-DD）
 *   releaseRepo? 'owner/repo'：自动读取 GitHub 最新 Release 的版本与日期（读取失败时回退到上面两项）
 *   badges?     徽章文字列表                  note?     档案底部小字
 *   position?   [x, y, z] 手动坐标（不写则自动螺旋布局，新增作品不会挪动已有作品）
 *   status?     'encrypted' = 未公开新作的占位信号
 *
 * 注意：此文件也会在构建时由 Node 读取，请保持为纯数据。
 */
export const games = [
  {
    id: 'poker',
    title: '德州扑克',
    titleEn: "TEXAS HOLD'EM",
    genre: '多人在线卡牌',
    tagline: '牌桌已就位。筹码与心理的较量，从翻牌前开始。',
    description:
      '浏览器即开即玩的在线德州扑克。快速开始、创建房间或从房间列表加入，完整的翻牌前 / 翻牌 / 转牌 / 河牌 / 摊牌流程；房间聊天、行动记录、断线重连、胜利动画与音效，中英文界面一键切换。',
    platforms: ['Web'],
    modes: ['在线多人 2–5 人', '房间聊天'],
    engine: 'HTML5 · Node WebSocket',
    world: { style: 'casino', accent: '#e8c46a' },
    links: {
      play: 'https://poker.8201128.xyz/',
      download: '',
      source: '',
    },
    cover: 'games/poker/cover.webp',
    shots: ['games/poker/shot-1.webp', 'games/poker/shot-2.webp', 'games/poker/shot-3.webp'],
  },
  {
    id: 'turbo',
    title: 'Turbo Legends',
    titleEn: 'TURBO LEGENDS',
    genre: '3D 卡丁车竞速',
    tagline: '漂移、道具、八车同场——浏览器里的卡丁车狂飙。',
    description:
      '原创角色与赛道的 3D 卡丁车竞速。4 条主题赛道、6 名可选赛车手、10 种道具，漂移蓄力三段加速、火箭起步与尾流；单人挑战 AI，或在服务器权威的在线房间里与好友同场竞速。支持键盘、手柄与触屏。',
    platforms: ['Web'],
    modes: ['单人', '在线多人 2–8 人'],
    engine: 'Three.js · Node WebSocket',
    world: { style: 'racing', accent: '#ff5fa2' },
    links: {
      play: 'https://race.8201128.xyz/',
      download: '',
      source: '',
    },
    cover: 'games/turbo/cover.webp',
    shots: ['games/turbo/shot-1.webp', 'games/turbo/shot-2.webp', 'games/turbo/shot-3.webp'],
  },
  {
    id: 'rainrot',
    title: '雨蚀：第九病区',
    titleEn: 'RAINROT · WARD 09',
    genre: '第一人称恐怖解谜',
    tagline: '雨夜，失联的疗养院。第九病区的灯，还亮着。',
    description:
      '原创第一人称单机恐怖解谜。雨夜进入失联的圣维罗妮卡疗养院，调查留下的档案，恢复西翼供电，深入地下终止培养循环，带着证据逃离。三个连贯谜题、三类敌人、实时光影与雨夜环境声——建议佩戴耳机。',
    platforms: ['Web', 'Windows'],
    modes: ['单人', '约 20–30 分钟'],
    engine: 'Godot 4',
    world: { style: 'horror', accent: '#7fd1b9' },
    links: {
      play: 'https://semibluff888.github.io/rainrot/',
      download: 'https://github.com/semibluff888/rainrot/releases/latest',
      source: '',
    },
    releaseRepo: 'semibluff888/rainrot',
    version: 'v0.1.0',
    updated: '2026-09-07',
    cover: 'games/rainrot/cover.webp',
    shots: [
      'games/rainrot/shot-1.webp',
      'games/rainrot/shot-2.webp',
      'games/rainrot/shot-3.webp',
      'games/rainrot/shot-4.webp',
    ],
  },
  {
    id: 'duel',
    title: '鬼灭之刃：宿命对决',
    titleEn: 'FATED DUEL',
    genre: '2D 格斗',
    tagline: '大正墨金，刀光相见。觉醒爆气，一决宿命。',
    description:
      '2D 格斗游戏。炭治郎、善逸、祢豆子、猗窝座四名角色与四张地图，支持电脑对战、本地双人与自由练习；觉醒爆气系统、奥义演出动画、打击特效，支持手柄与自定义按键。持续更新中。',
    platforms: ['Windows'],
    modes: ['人机对战', '本地双人', '自由练习'],
    engine: 'Godot 4',
    world: { style: 'ink', accent: '#e2b04a' },
    links: {
      play: '',
      download: 'https://github.com/semibluff888/demon-slayer/releases/latest',
      source: '',
    },
    releaseRepo: 'semibluff888/demon-slayer',
    version: 'v0.2.6',
    updated: '2026-10-10',
    badges: ['持续更新'],
    note: '同人游戏 · 非商业用途',
    cover: 'games/duel/cover.webp',
    shots: [
      'games/duel/shot-1.webp',
      'games/duel/shot-2.webp',
      'games/duel/shot-3.webp',
      'games/duel/shot-4.webp',
    ],
  },
  {
    id: 'signal-x',
    status: 'encrypted',
    title: '未知信号',
    titleEn: 'ENCRYPTED SIGNAL',
    genre: '未公开',
    tagline: '新的世界正在成形……',
    description:
      '信号强度不足，暂时无法解析。已知信息：这是一款尚未公开的新游戏。保持连接，等待它浮出深空。',
    platforms: [],
    modes: [],
    engine: '—',
    world: { style: 'encrypted', accent: '#9aa4b2' },
    links: {},
    decodePercent: 37,
  },
];
