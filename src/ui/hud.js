import { escapeHtml as esc } from './listMarkup.js';

/** HUD：品牌、解码进度、配色 / 音效 / 配乐 / 视图开关、雷达读数、操作提示、主题色 */
export function createHud({ site, progress, audio, themes, onToggleView }) {
  const html = document.documentElement;
  const base = getComputedStyle(html).getPropertyValue('--accent-base').trim() || '#6ef2ff';

  document.querySelectorAll('[data-site]').forEach((el) => {
    const v = site[el.dataset.site];
    if (v) el.textContent = v;
  });

  const gh = document.querySelector('[data-site-link="github"]');
  const link = (site.links || []).find((l) => l.id === 'github') || (site.links || [])[0];
  if (gh) {
    if (link) {
      gh.href = link.href;
      gh.setAttribute('aria-label', link.label);
      gh.title = link.label;
    } else {
      gh.remove();
    }
  }

  // 解码进度
  const progEl = document.querySelector('[data-hud-progress]');
  const decodedEl = document.querySelector('[data-decoded]');
  const totalEl = document.querySelector('[data-total]');
  const barEl = document.querySelector('[data-progress-bar]');
  totalEl.textContent = String(progress.total);
  barEl.innerHTML = '<i></i>'.repeat(progress.total);
  const segs = [...barEl.children];

  function setDecoded(count, { bump = false } = {}) {
    decodedEl.textContent = String(count);
    segs.forEach((s, i) => s.classList.toggle('is-on', i < count));
    progEl.classList.toggle('is-complete', count >= progress.total);
    progEl.setAttribute('aria-label', `已解码 ${count} / ${progress.total} 个信号`);
    if (bump) {
      progEl.classList.remove('is-bump');
      void progEl.offsetWidth;
      progEl.classList.add('is-bump');
    }
  }
  setDecoded(progress.count());

  // 音效
  const soundBtn = document.querySelector('[data-action="sound"]');
  const syncSound = (on) => {
    soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundBtn.setAttribute('aria-label', on ? '关闭配乐与音效' : '开启配乐与音效');
  };
  syncSound(audio.enabled);
  audio.onChange(syncSound);
  soundBtn.addEventListener('click', () => audio.toggle());

  // 弹出面板（配色 / 配乐）：按钮展开一个单选列表；面板保持打开，方便逐个对比。
  // 同一时间只开一个；Esc、点面板外、焦点离开时收起；方向键在列表里移动并立即生效。
  const topHud = document.querySelector('.hud--top');
  const popovers = [];

  function createPopover(wrap, { render, onPick }) {
    const btn = wrap.querySelector('.hud-btn');
    const panel = wrap.querySelector('.hud-panel');
    const list = wrap.querySelector('[data-pop-list]');
    list.innerHTML = render();
    const opts = [...list.querySelectorAll('[role="radio"]')];
    const current = () => opts.find((o) => o.tabIndex === 0);
    let open = false;

    function setOpen(v, { focus = false } = {}) {
      if (v === open) return;
      if (v) popovers.forEach((p) => p !== pop && p.setOpen(false));
      open = v;
      panel.hidden = !v;
      btn.setAttribute('aria-expanded', v ? 'true' : 'false');
      topHud.classList.toggle('has-popover', popovers.some((p) => p.open));
      if (v && focus) current()?.focus();
      if (!v && focus) btn.focus();
    }

    btn.addEventListener('click', (e) => setOpen(!open, { focus: e.detail === 0 }));
    // 面板已打开、焦点还在按钮上（例如用鼠标打开）时，上下键进入列表
    btn.addEventListener('keydown', (e) => {
      if (!open || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      e.preventDefault();
      e.stopPropagation();
      current()?.focus();
    });
    list.addEventListener('click', (e) => {
      const o = e.target.closest('[role="radio"]');
      if (o) onPick(o);
    });
    list.addEventListener('keydown', (e) => {
      const i = opts.indexOf(document.activeElement);
      if (i < 0) return;
      const k = e.key;
      let n = -1;
      if (k === 'ArrowDown' || k === 'ArrowRight') n = (i + 1) % opts.length;
      else if (k === 'ArrowUp' || k === 'ArrowLeft') n = (i - 1 + opts.length) % opts.length;
      else if (k === 'Home') n = 0;
      else if (k === 'End') n = opts.length - 1;
      if (n < 0) return;
      // 不让方向键继续冒泡到星图（锁定星球时左右键会切换星球）
      e.preventDefault();
      e.stopPropagation();
      opts[n].focus();
      onPick(opts[n]);
    });
    wrap.addEventListener('focusout', (e) => {
      if (open && e.relatedTarget && !wrap.contains(e.relatedTarget)) setOpen(false);
    });

    const pop = {
      wrap,
      panel,
      get open() {
        return open;
      },
      setOpen,
      /** 标出当前选中项 */
      check(match) {
        opts.forEach((o) => {
          const on = match(o);
          o.setAttribute('aria-checked', on ? 'true' : 'false');
          o.tabIndex = on ? 0 : -1;
        });
      },
    };
    popovers.push(pop);
    return pop;
  }

  // Esc 先收起面板（在 document 上拦截，星图的 Esc「退出锁定」挂在 window 上，不会同时触发）
  document.addEventListener('keydown', (e) => {
    const pop = popovers.find((p) => p.open);
    if (e.key === 'Escape' && pop) {
      e.preventDefault();
      e.stopPropagation();
      pop.setOpen(false, { focus: pop.wrap.contains(document.activeElement) });
    }
  });
  // 点击面板以外的地方时收起
  document.addEventListener('pointerdown', (e) => {
    popovers.forEach((p) => p.open && !p.wrap.contains(e.target) && p.setOpen(false));
  });

  // 配色（观测滤镜）
  const filterPop = createPopover(document.querySelector('[data-pop="filter"]'), {
    render: () =>
      themes.list
        .map(
          (t) => `<button type="button" class="hud-opt filter-opt" role="radio" data-theme-id="${t.id}" style="--sw: linear-gradient(90deg, ${t.swatch.join(', ')})">
  <span class="filter-opt__sw" aria-hidden="true"></span>
  <span class="hud-opt__name">${t.name}<em>${t.en}</em></span>
  <span class="hud-opt__desc">${t.desc}</span>
</button>`,
        )
        .join(''),
    onPick: (o) => themes.set(o.dataset.themeId),
  });
  const syncFilter = (id) => filterPop.check((o) => o.dataset.themeId === id);
  syncFilter(themes.id);
  themes.onChange(syncFilter);

  // 配乐：只有一首曲子时不需要这个按钮
  const bgmWrap = document.querySelector('[data-pop="bgm"]');
  let bgmPop = null;
  if (audio.tracks.length > 1) {
    bgmPop = createPopover(bgmWrap, {
      render: () =>
        audio.tracks
          .map(
            (t, i) => `<button type="button" class="hud-opt bgm-opt" role="radio" data-track-id="${esc(t.id)}">
  <span class="bgm-opt__no" aria-hidden="true"><b>${String(i + 1).padStart(2, '0')}</b><span class="bgm-opt__eq"><i></i><i></i><i></i></span></span>
  <span class="hud-opt__name">${esc(t.title)}</span>
  <span class="hud-opt__desc">${esc(t.by || '')}</span>
</button>`,
          )
          .join(''),
      onPick: (o) => audio.setTrack(o.dataset.trackId),
    });
    const syncTrack = (t) => bgmPop.check((o) => o.dataset.trackId === t?.id);
    syncTrack(audio.track);
    audio.onTrackChange(syncTrack);
    const syncPlaying = (on) => bgmPop.panel.classList.toggle('is-playing', on);
    syncPlaying(audio.enabled);
    audio.onChange(syncPlaying);
  } else {
    bgmWrap.remove();
  }

  // 视图
  const viewBtn = document.querySelector('[data-action="view"]');
  viewBtn.addEventListener('click', () => onToggleView());
  function setView(mode, { canMap = true } = {}) {
    viewBtn.setAttribute('aria-label', mode === 'list' ? '切换到星图视图' : '切换到列表视图');
    viewBtn.hidden = !canMap;
    popovers.forEach((p) => p.setOpen(false));
  }

  // 雷达读数（只在变化时写 DOM）
  const ro = {
    az: document.querySelector('[data-ro="az"]'),
    el: document.querySelector('[data-ro="el"]'),
    dst: document.querySelector('[data-ro="dst"]'),
  };
  const last = { az: '', el: '', dst: '' };
  function setReadout(az, el, dst) {
    const v = {
      az: (((az % 360) + 360) % 360).toFixed(1).padStart(5, '0'),
      el: el.toFixed(1).padStart(4, '0'),
      dst: String(Math.round(dst)).padStart(3, '0'),
    };
    for (const k of ['az', 'el', 'dst']) {
      if (v[k] !== last[k]) {
        ro[k].textContent = v[k];
        last[k] = v[k];
      }
    }
  }

  // 操作提示：首次交互后淡出
  const hints = document.querySelector('[data-hints]');
  let hintsTimer = 0;
  function noteInteraction() {
    if (hintsTimer || !hints) return;
    hintsTimer = setTimeout(() => hints.classList.add('is-faded'), 5000);
  }

  const statusText = document.querySelector('[data-status-text]');

  return {
    setDecoded,
    setView,
    setReadout,
    noteInteraction,
    get filterOpen() {
      return filterPop.open;
    },
    get bgmOpen() {
      return !!bgmPop?.open;
    },
    setAccent(color) {
      html.style.setProperty('--accent', color || base);
    },
    setState(state) {
      html.dataset.state = state;
    },
    setStatus(text) {
      if (statusText) statusText.textContent = text;
    },
  };
}
