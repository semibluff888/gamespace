import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * portal-html：在 index.html 中注入 <head> 元信息（标题 / OG / canonical）
 * 与作品列表（无 JS 时的回退内容，也利于搜索引擎与分享预览）。
 * 数据来自 src/data/*.js，渲染函数与浏览器端共用 src/ui/listMarkup.js。
 */
function portalHtml() {
  let root = process.cwd();
  const load = (rel) => import(pathToFileURL(resolve(root, rel)).href + `?t=${Date.now()}`);
  return {
    name: 'portal-html',
    configResolved(config) {
      root = config.root;
    },
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        const [{ games }, { site }, markup] = await Promise.all([
          load('src/data/games.js'),
          load('src/data/site.js'),
          load('src/ui/listMarkup.js'),
        ]);
        return html
          .replace('<!--PORTAL:HEAD-->', markup.renderHeadMeta(site, games))
          .replace('<!--PORTAL:LIST-->', markup.renderListHTML(games, site));
      },
    },
  };
}

export default defineConfig({
  // 相对路径：部署到任意域名或子路径（GitHub Pages、自定义域名、VPS）都可直接使用
  base: './',
  plugins: [portalHtml()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    assetsInlineLimit: 0,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
