/**
 * 站点级配置。改品牌名、域名、外链、开发者通讯文案都在这里。
 * 注意：此文件也会在构建时由 Node 读取（vite.config.js），请保持为纯数据，不要引入浏览器 API。
 */
export const site = {
  /** 品牌名（左上角、标题、开场） */
  brand: 'SEMIBLUFF',
  /** 观测站名称（HUD 英文点缀） */
  station: 'DEEP SPACE ARRAY',
  /** 中文副标题 */
  subtitle: '游戏作品星图',
  /** 页面描述（搜索引擎 / 分享卡片 / 列表视图） */
  description:
    'SEMIBLUFF 的游戏作品星图：德州扑克、卡丁车竞速、恐怖解谜、2D 格斗……在深空中扫描信号，探索每一个世界。',

  /**
   * 站点正式地址（末尾带 /）。只用于 canonical 与分享卡片图片的绝对地址；
   * 其余资源都是相对路径，换域名时只需改这一行。
   */
  siteUrl: 'https://games.8201128.xyz/',
  /** 分享图（相对 public/） */
  ogImage: 'og-cover.jpg',

  /** 手机端默认视图：'lite' = 轻量星图（触屏操作），'list' = 直接显示列表 */
  mobileMode: 'lite',

  /** 右上角外链 */
  links: [{ id: 'github', label: 'GitHub', href: 'https://github.com/semibluff888' }],

  /** 全部信号解码后，中心信标解锁的「开发者通讯」内容（文案可随意修改） */
  developer: {
    title: '开发者通讯',
    titleEn: 'DEV TRANSMISSION',
    handle: 'semibluff888',
    message: [
      '你好，观测员。你已经解码了这片星域里的全部信号。',
      '这里是 SEMIBLUFF 的作品星图：从牌桌、赛道，到雨夜的病区和刀光相见的擂台，每一颗星球都是我亲手搭建的一个世界。',
      'Semi-bluff，半诈唬——牌还没成，但下一张牌随时可能改变局面。新的世界仍在成形，下次连接时，留意星图上新出现的未知信号。',
    ],
    links: [{ label: 'GitHub · semibluff888', href: 'https://github.com/semibluff888' }],
  },
};
