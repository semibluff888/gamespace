/**
 * 纯函数：作品状态推导 + 列表视图 / <head> 元信息的 HTML 渲染。
 * 同时被浏览器端和构建插件（Node）使用，因此不能访问 DOM 或 window。
 */

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const STATUS = {
  online: { code: 'ONLINE', label: '浏览器即玩' },
  download: { code: 'DOWNLOAD', label: '下载游玩' },
  pending: { code: 'STANDBY', label: '链接待补充' },
  encrypted: { code: 'ENCRYPTED', label: '信号加密中' },
};

export function deriveStatus(game) {
  if (game.status === 'encrypted') return 'encrypted';
  if (game.links?.play) return 'online';
  if (game.links?.download) return 'download';
  return 'pending';
}

export function isPlayable(game) {
  return game.status !== 'encrypted';
}

/** 档案 / 卡片上的操作按钮（只返回有链接的） */
export function actionsFor(game) {
  const links = game.links || {};
  const out = [];
  if (links.play) out.push({ kind: 'play', href: links.play, label: '启动', en: 'LAUNCH', icon: '▶', newTab: false });
  if (links.download)
    out.push({ kind: 'download', href: links.download, label: '下载', en: 'DOWNLOAD', icon: '⇩', newTab: true });
  if (links.source) out.push({ kind: 'source', href: links.source, label: '源码', en: 'SOURCE', icon: '⌥', newTab: true });
  return out;
}

export function sigCode(index) {
  return `SIG-${String(index + 1).padStart(2, '0')}`;
}

/** 缩略图约定：shot-1.webp → shot-1.thumb.webp */
export function thumbOf(src) {
  return String(src).replace(/(\.[a-z0-9]+)$/i, '.thumb$1');
}

function absUrl(base, rel) {
  try {
    return new URL(rel, base).href;
  } catch {
    return rel;
  }
}

export function renderHeadMeta(site, games) {
  const title = `${site.brand} · ${site.subtitle}`;
  const names = games.filter(isPlayable).map((g) => g.title).join(' / ');
  const desc = site.description || names;
  const url = site.siteUrl || '';
  const img = url ? absUrl(url, site.ogImage) : site.ogImage;
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(desc)}" />`,
    url ? `<link rel="canonical" href="${escapeHtml(url)}" />` : '',
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(site.brand)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(desc)}" />`,
    url ? `<meta property="og:url" content="${escapeHtml(url)}" />` : '',
    `<meta property="og:image" content="${escapeHtml(img)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(desc)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(img)}" />`,
  ]
    .filter(Boolean)
    .join('\n    ');
}

function renderActions(game, cls = 'btn') {
  const actions = actionsFor(game);
  if (!actions.length) {
    const label = game.status === 'encrypted' ? '信号不足' : '链接待补充';
    return `<span class="${cls} ${cls}--disabled" aria-disabled="true">${escapeHtml(label)}</span>`;
  }
  return actions
    .map((a, i) => {
      const primary = i === 0 ? ` ${cls}--primary` : '';
      const tab = a.newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a class="${cls}${primary}" data-kind="${a.kind}" href="${escapeHtml(a.href)}"${tab}><span class="${cls}__icon" aria-hidden="true">${a.icon}</span>${escapeHtml(a.label)}<span class="${cls}__en">${a.en}</span></a>`;
    })
    .join('');
}

export function renderListHTML(games, site) {
  const cards = games
    .map((g, i) => {
      const status = deriveStatus(g);
      const st = STATUS[status];
      const accent = g.world?.accent || '#6ef2ff';
      const primary = actionsFor(g)[0];
      const img = g.cover
        ? `<img src="${escapeHtml(g.cover)}" alt="${escapeHtml(g.title)} 画面" loading="lazy" decoding="async" width="640" height="360" />`
        : `<span class="lv-card__nofeed" aria-hidden="true">NO VISUAL FEED</span>`;
      const media = primary
        ? `<a class="lv-card__media" href="${escapeHtml(primary.href)}"${primary.newTab ? ' target="_blank" rel="noopener noreferrer"' : ''} tabindex="-1" aria-hidden="true">${img}</a>`
        : `<div class="lv-card__media">${img}</div>`;
      const meta = [g.genre, ...(g.platforms || [])].filter(Boolean).map(escapeHtml).join(' · ');
      const badges = (g.badges || []).map((b) => `<span class="tag">${escapeHtml(b)}</span>`).join('');
      return `
      <li class="lv-card lv-card--${status}" data-id="${escapeHtml(g.id)}" style="--card-accent:${escapeHtml(accent)}">
        ${media}
        <div class="lv-card__body">
          <div class="lv-card__meta"><span class="chip chip--${status}"><i></i>${st.code}</span><span class="lv-card__code">${sigCode(i)}</span>${badges}</div>
          <h2 class="lv-card__title">${escapeHtml(g.title)}</h2>
          <p class="lv-card__en">${escapeHtml(g.titleEn || '')}</p>
          <p class="lv-card__genre">${meta}</p>
          <p class="lv-card__tagline">${escapeHtml(g.tagline || '')}</p>
          <div class="lv-card__actions">${renderActions(g)}</div>
        </div>
      </li>`;
    })
    .join('');
  const links = (site.links || [])
    .map((l) => `<a href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>`)
    .join('');
  return `
    <div class="lv">
      <header class="lv__head">
        <p class="lv__kicker">${escapeHtml(site.brand)} <span>//</span> ${escapeHtml(site.station)}</p>
        <h1 class="lv__title">${escapeHtml(site.listTitle || site.subtitle)}</h1>
        <p class="lv__desc">${escapeHtml(site.description)}</p>
      </header>
      <ul class="lv__grid">${cards}
      </ul>
      <footer class="lv__foot"><span>${escapeHtml(site.brand)} · ${new Date().getFullYear()}</span>${links}</footer>
    </div>`;
}
