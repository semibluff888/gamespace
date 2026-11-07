/**
 * ★ 星图配色（观测滤镜）—— 背景星云、星系盘、星空与近景星尘的整体色调。
 *
 *   切换：右上角「配色」按钮、快捷键 C（Shift + C 反向）、控制台命令 filter <id>
 *   选择会记在访客的浏览器里；网址加 ?theme=<id> 可临时指定（不会被记住）；
 *   新访客的默认配色写在 site.js 的 theme 字段。
 *
 * 颜色一律写 sRGB 十六进制（与 CSS 相同），场景里会自动转换到线性空间。
 * 注意：HUD 也直接引用此文件（不加载 three.js），请保持为纯数据。
 *
 * 字段说明：
 *   sky   背景星云（启动 / 切换时烘焙进立方体贴图）
 *         floor 天空底色 · clouds 星云三色（两种大尺度色 + 致密处高光）· gain 星云亮度
 *         cover 覆盖范围 [下限, 上限]（下限越大，银河带以外越干净）· band 银河带对星云的加成
 *         mix 两种星云色的过渡区间（越窄交界越利落）· seam 交界处压暗（0 = 直接混色）
 *         highlight 高光色占比 · lanes 暗尘带遮挡强度
 *         glow 银河带中线细亮带 · milky / milkyEdge 银河弥漫星光的主带 / 外晕颜色 · knot 发射星云团块（HII 区）
 *   disc  星系尘埃盘：core 核球 · coreBoost 盘心额外提亮 [倍数, 半径] · bar 中央棒 [强度, 半长, 半宽, 方位角]
 *         arm / outer 内 / 外旋臂
 *         haze 旋臂间弥漫光（hazeMix 0 = 跟随旋臂色）· knot 旋臂上的发射星云团块
 *         intensity 整体亮度 · starsIn / starsOut 旋臂星点内 / 外颜色
 *   stars 远景星空：tints = [颜色, 权重] · twinkle 闪烁幅度（0 不闪）
 *         spikes 亮星衍射芒（0 无 · 4 十字 · 6 六芒）· spikeCount 全天有芒的星数（只给最亮的几颗）
 *   dust  近景星尘颜色 · grain 画面胶片噪点强度（默认 0.4）
 *   hole  中心黑洞：hot / cool 吸积盘内圈（高温）/ 外圈颜色
 *   ui    列表视图等 2D 界面的背景点缀
 */
export const THEMES = [
  {
    id: 'classic',
    name: '经典',
    en: 'CLASSIC',
    desc: '原版蓝紫',
    swatch: ['#1f2a7a', '#6a1a63', '#3f7dff', '#9a46d6'],
    sky: {
      floor: '#070a16',
      clouds: ['#1f2a7a', '#6a1a63', '#0c5a6b'],
      gain: 0.34,
      cover: [0, 0.95],
      band: 0.75,
      highlight: 0.55,
      lanes: 0.65,
      glow: '#ecf3ff',
      glowGain: 0.012,
      milky: '#ffffff',
      milkyGain: 0,
      knot: '#ffffff',
      knotGain: 0,
    },
    disc: {
      core: '#ffd9a8',
      coreGain: 0.32,
      arm: '#3f7dff',
      outer: '#9a46d6',
      haze: '#3f7dff',
      hazeMix: 0,
      knot: '#ffffff',
      knotGain: 0,
      intensity: 0.15,
      starsIn: '#d6e4ff',
      starsOut: '#b98cff',
    },
    stars: {
      tints: [
        ['#b9d2ff', 1],
        ['#ffffff', 1],
        ['#ffe2c4', 1],
        ['#9fc4ff', 1],
        ['#ffd0e8', 1],
      ],
      twinkle: 1,
      spikes: 0,
    },
    dust: '#7fb8ff',
    hole: { hot: '#e4ecff', cool: '#7b62ff' },
    ui: {
      bg: '#03050b',
      neb: ['rgba(60, 70, 180, 0.16)', 'rgba(140, 40, 120, 0.12)', 'rgba(20, 110, 130, 0.12)'],
    },
  },

  {
    // 银河系的感觉，简洁干净：深蓝黑的夜空里一条柔和发光的银河带（主带暖白、外晕冷蓝，中间一道淡淡的暗缝），
    // 星系盘是金色核球 + 中央棒 + 蓝白旋臂，零星几处粉红色 HII 区；恒星是自然的白 / 淡蓝 / 淡黄，几乎不闪烁
    id: 'visible',
    name: '可见光',
    en: 'VISIBLE',
    desc: '真实色彩 · 银河系',
    swatch: ['#04060c', '#8fa8f0', '#eef0ff', '#ffd9a0'],
    sky: {
      floor: '#04060c',
      clouds: ['#1c2438', '#272236', '#36497a'],
      gain: 0.035,
      cover: [0.35, 1.2],
      band: 0.7,
      highlight: 0.3,
      lanes: 0.25,
      glow: '#ffffff',
      glowGain: 0.004,
      milky: '#f6f3ff',
      milkyEdge: '#9cb2ff',
      milkyGain: 0.12,
      knot: '#ff6a8c',
      knotGain: 0,
    },
    disc: {
      core: '#fff0d8',
      coreGain: 0.45,
      coreBoost: [2.8, 8.5],
      bar: [0.3, 22, 7, 0.6],
      arm: '#d2e0ff',
      outer: '#86a4ff',
      haze: '#ffe6c8',
      hazeMix: 0.35,
      knot: '#ff79a6',
      knotGain: 0.13,
      intensity: 0.15,
      starsIn: '#fff3df',
      starsOut: '#d0dcff',
    },
    stars: {
      tints: [
        ['#ffffff', 0.34],
        ['#e6edff', 0.26],
        ['#fff5e4', 0.24],
        ['#cddbff', 0.1],
        ['#ffe2bd', 0.06],
      ],
      twinkle: 0.35,
      spikes: 0,
    },
    dust: '#cfd8ea',
    grain: 0.12,
    hole: { hot: '#fff3df', cool: '#ff8a3c' },
    ui: {
      bg: '#04060c',
      neb: ['rgba(90, 110, 170, 0.12)', 'rgba(200, 170, 120, 0.06)', 'rgba(60, 90, 160, 0.08)'],
    },
  },

  {
    // 参考哈勃窄带合成（SHO：硫 → 红、氢 → 绿、氧 → 蓝）：青绿色电离气体 + 金色尘埃边缘
    id: 'narrowband',
    name: '窄带',
    en: 'NARROWBAND',
    desc: '哈勃色调 · 金青',
    swatch: ['#06262e', '#1f8f93', '#d9a03a', '#ffe08a'],
    sky: {
      floor: '#03080a',
      clouds: ['#0d3a50', '#a8661a', '#3cbcc6'],
      gain: 0.34,
      cover: [0.02, 0.95],
      band: 0.75,
      mix: [-0.05, 0.35],
      seam: 0.55,
      highlight: 0.45,
      lanes: 0.72,
      glow: '#fff3d0',
      glowGain: 0.012,
      milky: '#ffe2a6',
      milkyEdge: '#9fe6e0',
      milkyGain: 0.012,
      knot: '#ffc84a',
      knotGain: 0.06,
    },
    disc: {
      core: '#fff4e2',
      coreGain: 0.45,
      arm: '#2fbcc4',
      outer: '#e09a2c',
      haze: '#33c4bb',
      hazeMix: 0,
      knot: '#ffd36a',
      knotGain: 0.3,
      intensity: 0.15,
      starsIn: '#e4fffb',
      starsOut: '#ffe2a6',
    },
    stars: {
      tints: [
        ['#ffffff', 0.4],
        ['#e3f4ff', 0.2],
        ['#fff1d0', 0.2],
        ['#c8ecff', 0.1],
        ['#ffe2b0', 0.1],
      ],
      twinkle: 0.4,
      spikes: 4,
      spikeCount: 10,
    },
    dust: '#8fe3d8',
    hole: { hot: '#fff0c8', cool: '#e2a032' },
    ui: {
      bg: '#02070a',
      neb: ['rgba(20, 120, 130, 0.14)', 'rgba(170, 120, 30, 0.1)', 'rgba(30, 140, 150, 0.1)'],
    },
  },

  {
    // 参考韦布红外影像：琥珀 / 铁锈色尘埃云 + 钢蓝色气体，星系旋臂呈橙红色、旋臂间泛蓝；最亮的几颗星带六芒衍射芒
    id: 'infrared',
    name: '红外',
    en: 'INFRARED',
    desc: '韦布色调 · 橙蓝',
    swatch: ['#0b1220', '#2b4a7a', '#c4621f', '#ffb460'],
    sky: {
      floor: '#04050a',
      clouds: ['#22436a', '#8f3e14', '#ff9a40'],
      gain: 0.32,
      cover: [0.05, 0.95],
      band: 0.75,
      mix: [-0.1, 0.35],
      seam: 0.5,
      highlight: 0.38,
      lanes: 0.75,
      glow: '#ffd8b0',
      glowGain: 0.012,
      milky: '#ffc890',
      milkyEdge: '#9db8e8',
      milkyGain: 0.018,
      knot: '#ffad5c',
      knotGain: 0.06,
    },
    disc: {
      core: '#e6edff',
      coreGain: 0.36,
      arm: '#ff8a3a',
      outer: '#de4a2a',
      haze: '#2e4a8a',
      hazeMix: 0.85,
      knot: '#ffd080',
      knotGain: 0.3,
      intensity: 0.15,
      starsIn: '#eef3ff',
      starsOut: '#ffc49a',
    },
    stars: {
      tints: [
        ['#ffffff', 0.35],
        ['#dce8ff', 0.25],
        ['#ffe8cc', 0.2],
        ['#ff9e78', 0.08],
        ['#c4d6ff', 0.12],
      ],
      twinkle: 0.4,
      spikes: 6,
      spikeCount: 12,
    },
    dust: '#ffb27a',
    hole: { hot: '#ffe5c0', cool: '#ff7a2c' },
    ui: {
      bg: '#04050a',
      neb: ['rgba(40, 70, 130, 0.14)', 'rgba(190, 90, 30, 0.1)', 'rgba(150, 60, 30, 0.08)'],
    },
  },
];

export const DEFAULT_THEME = 'visible';

export function themeById(id) {
  return THEMES.find((t) => t.id === id) || THEMES.find((t) => t.id === DEFAULT_THEME) || THEMES[0];
}
