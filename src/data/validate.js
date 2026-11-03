/** 开发模式下校验 games.js，发现问题在控制台提示（不影响页面运行） */
const STYLES = ['casino', 'racing', 'horror', 'ink', 'encrypted', 'gas'];

export function validateGames(games) {
  const problems = [];
  const ids = new Set();
  games.forEach((g, i) => {
    const where = `games[${i}]${g?.id ? ` (${g.id})` : ''}`;
    if (!g || typeof g !== 'object') return problems.push(`${where}: 不是对象`);
    if (!g.id || !/^[a-z0-9-]+$/.test(g.id)) problems.push(`${where}: id 缺失或格式不对（只能用小写字母、数字、-）`);
    if (ids.has(g.id)) problems.push(`${where}: id 重复`);
    ids.add(g.id);
    if (!g.title) problems.push(`${where}: 缺少 title`);
    const style = g.world?.style;
    if (!STYLES.includes(style)) problems.push(`${where}: world.style「${style}」未知，可选 ${STYLES.join(' / ')}`);
    if (g.world?.palette && (!Array.isArray(g.world.palette) || g.world.palette.length < 3))
      problems.push(`${where}: world.palette 需要至少 3 个颜色`);
    if (g.links) {
      for (const [k, v] of Object.entries(g.links)) {
        if (v && typeof v !== 'string') problems.push(`${where}: links.${k} 应为字符串`);
      }
    }
    if (g.shots && !Array.isArray(g.shots)) problems.push(`${where}: shots 应为数组`);
    if (g.position && (!Array.isArray(g.position) || g.position.length !== 3))
      problems.push(`${where}: position 应为 [x, y, z]`);
    if (g.releaseRepo && !/^[\w.-]+\/[\w.-]+$/.test(g.releaseRepo)) problems.push(`${where}: releaseRepo 应为 'owner/repo'`);
  });
  if (problems.length) {
    console.warn(`[games.js] 发现 ${problems.length} 个问题：\n- ${problems.join('\n- ')}`);
  }
  return problems;
}
