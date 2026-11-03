import gsap from 'gsap';
import { escapeHtml as esc, STATUS, deriveStatus, actionsFor, thumbOf } from './listMarkup.js';
import { scrambleTo } from './scramble.js';

const isSheet = () => window.matchMedia('(max-width: 760px)').matches;

/**
 * 档案面板：桌面端右侧面板，手机端底部抽屉。
 * 「启动」是真实的 <a href>：普通左键点击交给 onLaunch 播放跃迁，Ctrl/中键等保持浏览器默认行为。
 */
export function createDossier(root, { onClose, onPrev, onNext, onLaunch, onReset }) {
  let current = null;
  let lastFocus = null;
  let isOpen = false;

  root.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (action && root.contains(action)) {
      const a = action.dataset.action;
      if (a === 'close') onClose();
      else if (a === 'prev') onPrev();
      else if (a === 'next') onNext();
      else if (a === 'reset') onReset();
      return;
    }
    const thumb = e.target.closest('.thumb');
    if (thumb) {
      selectShot(Number(thumb.dataset.index));
      return;
    }
    const launch = e.target.closest('a[data-kind="play"]');
    if (launch && current?.game) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      onLaunch(current.game, launch.href);
    }
  });

  function selectShot(index) {
    if (!current?.shots?.length) return;
    const shots = current.shots;
    const i = ((index % shots.length) + shots.length) % shots.length;
    const img = root.querySelector('.holo__img');
    const cap = root.querySelector('.holo__cap');
    if (img && img.dataset.index !== String(i)) {
      img.classList.add('is-loading');
      img.onload = () => img.classList.remove('is-loading');
      img.onerror = () => img.classList.remove('is-loading');
      img.src = shots[i];
      img.dataset.index = String(i);
    }
    if (cap) cap.textContent = `FEED ${String(i + 1).padStart(2, '0')}/${String(shots.length).padStart(2, '0')}`;
    root.querySelectorAll('.thumb').forEach((t) => t.classList.toggle('is-active', Number(t.dataset.index) === i));
  }

  function mediaHTML(game, shots) {
    if (!shots.length) {
      return `<figure class="holo"><div class="holo__nofeed">NO VISUAL FEED</div><span class="holo__scan"></span></figure>`;
    }
    const thumbs =
      shots.length > 1
        ? `<div class="dossier__thumbs">${shots
            .map(
              (s, i) =>
                `<button type="button" class="thumb${i === 0 ? ' is-active' : ''}" data-index="${i}" aria-label="查看第 ${i + 1} 张截图"><img src="${esc(thumbOf(s))}" data-full="${esc(s)}" alt="" loading="lazy" decoding="async" /></button>`,
            )
            .join('')}</div>`
        : '';
    return `<figure class="holo"><img class="holo__img" src="${esc(shots[0])}" data-index="0" alt="${esc(game.title)} 游戏画面" decoding="async" /><span class="holo__scan"></span><figcaption class="holo__cap">FEED 01/${String(shots.length).padStart(2, '0')}</figcaption></figure>${thumbs}`;
  }

  function actionsHTML(game) {
    const actions = actionsFor(game);
    if (!actions.length) {
      const label = game.status === 'encrypted' ? '信号不足 · 无法跃迁' : '链接待补充';
      return `<span class="btn btn--disabled" aria-disabled="true">${esc(label)}</span>`;
    }
    return actions
      .map((a, i) => {
        const tab = a.newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a class="btn${i === 0 ? ' btn--primary' : ''}" data-kind="${a.kind}" href="${esc(a.href)}"${tab}><span class="btn__icon" aria-hidden="true">${a.icon}</span>${esc(a.label)}<span class="btn__en">${a.en}</span></a>`;
      })
      .join('');
  }

  function navHTML(index, total) {
    return `<footer class="dossier__nav"><button type="button" data-action="prev" aria-label="上一个信号">◀ <span>上一个信号</span></button><span class="dossier__count">${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span><button type="button" data-action="next" aria-label="下一个信号"><span>下一个信号</span> ▶</button></footer>`;
  }

  function gameHTML(game, ctx) {
    const status = deriveStatus(game);
    const st = STATUS[status];
    const shots = (game.shots && game.shots.length ? game.shots : game.cover ? [game.cover] : []).filter(Boolean);
    const tags = (ctx.tags || []).map((t) => `<span class="tag tag--${esc(t.tone || 'gold')}">${esc(t.text)}</span>`).join('');
    const specs = [];
    if (game.platforms?.length) specs.push(['PLATFORM · 平台', game.platforms.join(' · ')]);
    if (game.modes?.length) specs.push(['MODE · 模式', game.modes.join(' · ')]);
    if (game.engine) specs.push(['ENGINE · 引擎', game.engine]);
    if (status !== 'encrypted' && (game.releaseRepo || game.version || game.updated)) {
      specs.push(['BUILD · 版本', ctx.versionText || (game.releaseRepo ? '读取中…' : '—'), 'data-version']);
    }
    const specsHTML = specs.length
      ? `<dl class="dossier__specs">${specs
          .map(([k, v, attr]) => `<div><dt>${esc(k)}</dt><dd${attr ? ` ${attr}` : ''}>${esc(v)}</dd></div>`)
          .join('')}</dl>`
      : '';
    const decode =
      status === 'encrypted'
        ? `<div class="dossier__decode"><div class="dossier__decode-label"><span>DECRYPTING · 解码进度</span><span>${game.decodePercent ?? 37}%</span></div><div class="dossier__decode-bar" style="--w:${game.decodePercent ?? 37}%"><i></i></div></div>`
        : '';
    return `
      <div class="dossier__handle" aria-hidden="true"></div>
      <header class="dossier__head">
        <div class="dossier__meta"><span class="chip chip--${status}"><i></i>${st.code}</span><span class="dossier__code">${esc(ctx.code)}</span>${tags}</div>
        <button type="button" class="dossier__close" data-action="close" aria-label="关闭档案（Esc）">✕</button>
        <h2 class="dossier__title" id="dossier-title" tabindex="-1">${esc(game.title)}</h2>
        <p class="dossier__en" data-scramble="${esc(game.titleEn || '')}">${esc(game.titleEn || '')}</p>
        <p class="dossier__genre">${esc(game.genre || '')} · ${esc(st.label)}</p>
      </header>
      <div class="dossier__scroll">
        ${mediaHTML(game, shots)}
        ${game.tagline ? `<p class="dossier__tagline">${esc(game.tagline)}</p>` : ''}
        ${game.description ? `<p class="dossier__desc">${esc(game.description)}</p>` : ''}
        ${decode}
        ${specsHTML}
        ${game.note ? `<p class="dossier__note">※ ${esc(game.note)}</p>` : ''}
      </div>
      <div class="dossier__actions">${actionsHTML(game)}</div>
      ${navHTML(ctx.index, ctx.total)}`;
  }

  function developerHTML(site, ctx) {
    const dev = site.developer || {};
    const msg = (dev.message || []).map((p) => `<p>${esc(p)}</p>`).join('');
    const links = (dev.links || [])
      .map(
        (l, i) =>
          `<a class="btn${i === 0 ? ' btn--primary' : ''}" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer"><span class="btn__icon" aria-hidden="true">↗</span>${esc(l.label)}</a>`,
      )
      .join('');
    return `
      <div class="dossier__handle" aria-hidden="true"></div>
      <header class="dossier__head">
        <div class="dossier__meta"><span class="chip chip--online"><i></i>UNLOCKED</span><span class="dossier__code">CORE // TRANSMISSION</span></div>
        <button type="button" class="dossier__close" data-action="close" aria-label="关闭档案（Esc）">✕</button>
        <h2 class="dossier__title" id="dossier-title" tabindex="-1">${esc(dev.title || '开发者通讯')}</h2>
        <p class="dossier__en" data-scramble="${esc(dev.titleEn || 'DEV TRANSMISSION')}">${esc(dev.titleEn || 'DEV TRANSMISSION')}</p>
        <p class="dossier__genre">${esc(site.brand)} · ${esc(dev.handle || '')}</p>
      </header>
      <div class="dossier__scroll">
        <div class="dossier__msg">${msg}</div>
        <div class="dossier__stats"><span>DECODED ${ctx.decoded}/${ctx.total}</span><span>FIRST LINK ${esc(ctx.firstLink)}</span><span>WORLDS ${ctx.worlds}</span></div>
        <button type="button" class="dossier__reset" data-action="reset">重置探索进度（重新体验解码）</button>
      </div>
      ${links ? `<div class="dossier__actions">${links}</div>` : ''}`;
  }

  function show(html, accent, { focusTitle = true } = {}) {
    const switching = isOpen;
    if (!isOpen) lastFocus = document.activeElement;
    isOpen = true;
    root.style.setProperty('--dc', accent);
    root.innerHTML = `<div class="dossier__frame">${html}</div>`;
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    root.setAttribute('role', 'dialog');

    const frame = root.querySelector('.dossier__frame');
    const parts = root.querySelectorAll(
      '.dossier__meta, .dossier__title, .dossier__en, .dossier__genre, .holo, .dossier__thumbs, .dossier__tagline, .dossier__desc, .dossier__decode, .dossier__specs, .dossier__note, .dossier__msg, .dossier__stats, .dossier__reset, .dossier__actions, .dossier__nav',
    );
    gsap.killTweensOf(frame);
    if (!switching) {
      const sheet = isSheet();
      gsap.fromTo(
        frame,
        { opacity: 0, x: sheet ? 0 : 40, y: sheet ? 60 : 0 },
        { opacity: 1, x: 0, y: 0, duration: 0.65, ease: 'expo.out' },
      );
    }
    gsap.fromTo(
      parts,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.035, ease: 'power3.out', delay: switching ? 0.02 : 0.12 },
    );
    // 缩略图缺失时退回原图（不用内联 onerror，兼容严格的内容安全策略）
    root.querySelectorAll('img[data-full]').forEach((img) => {
      img.addEventListener(
        'error',
        () => {
          if (img.src !== new URL(img.dataset.full, document.baseURI).href) img.src = img.dataset.full;
        },
        { once: true },
      );
    });
    const en = root.querySelector('[data-scramble]');
    if (en) scrambleTo(en, en.dataset.scramble, { duration: 800, delay: 120 });
    if (focusTitle) root.querySelector('.dossier__title')?.focus({ preventScroll: true });
  }

  return {
    get isOpen() {
      return isOpen;
    },
    get current() {
      return current;
    },
    openGame(game, ctx) {
      const shots = (game.shots && game.shots.length ? game.shots : game.cover ? [game.cover] : []).filter(Boolean);
      current = { kind: 'game', game, shots };
      show(gameHTML(game, ctx), game.world?.accent || '#6ef2ff', ctx);
    },
    openDeveloper(site, ctx) {
      current = { kind: 'developer', game: null, shots: [] };
      show(developerHTML(site, ctx), '#ffd479', ctx);
    },
    setVersion(gameId, text, tags) {
      if (current?.game?.id !== gameId) return;
      const cell = root.querySelector('[data-version]');
      if (cell) cell.textContent = text;
      if (tags) {
        const meta = root.querySelector('.dossier__meta');
        meta?.querySelectorAll('.tag').forEach((t) => t.remove());
        meta?.insertAdjacentHTML(
          'beforeend',
          tags.map((t) => `<span class="tag tag--${esc(t.tone || 'gold')}">${esc(t.text)}</span>`).join(''),
        );
      }
    },
    close({ restoreFocus = true, immediate = false } = {}) {
      if (!isOpen) return;
      isOpen = false;
      current = null;
      root.setAttribute('aria-hidden', 'true');
      const frame = root.querySelector('.dossier__frame');
      const done = () => {
        if (isOpen) return;
        root.classList.remove('is-open');
        root.innerHTML = '';
      };
      if (!frame || immediate) done();
      else {
        const sheet = isSheet();
        gsap.killTweensOf(frame);
        gsap.to(frame, { opacity: 0, x: sheet ? 0 : 30, y: sheet ? 40 : 0, duration: 0.3, ease: 'power2.in', onComplete: done });
      }
      if (restoreFocus && lastFocus && document.contains(lastFocus) && lastFocus !== document.body) {
        lastFocus.focus?.({ preventScroll: true });
      }
      lastFocus = null;
    },
  };
}
