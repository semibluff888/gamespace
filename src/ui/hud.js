/** HUD：品牌、解码进度、配色 / 音效 / 视图开关、雷达读数、操作提示、主题色 */
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

  // 配色（观测滤镜）：按钮展开一个单选列表；面板保持打开，方便逐个对比
  const filterWrap = document.querySelector('[data-filter]');
  const filterBtn = filterWrap.querySelector('[data-action="filter"]');
  const filterPanel = filterWrap.querySelector('.filter-panel');
  const filterList = filterWrap.querySelector('[data-filter-list]');
  const topHud = filterWrap.closest('.hud');
  filterList.innerHTML = themes.list
    .map(
      (t) => `<button type="button" class="filter-opt" role="radio" data-theme-id="${t.id}" style="--sw: linear-gradient(90deg, ${t.swatch.join(', ')})">
  <span class="filter-opt__sw" aria-hidden="true"></span>
  <span class="filter-opt__name">${t.name}<em>${t.en}</em></span>
  <span class="filter-opt__desc">${t.desc}</span>
</button>`,
    )
    .join('');
  const opts = [...filterList.querySelectorAll('.filter-opt')];
  let filterOpen = false;

  function syncFilter(id) {
    opts.forEach((o) => {
      const on = o.dataset.themeId === id;
      o.setAttribute('aria-checked', on ? 'true' : 'false');
      o.tabIndex = on ? 0 : -1;
    });
  }
  syncFilter(themes.id);
  themes.onChange(syncFilter);

  function setFilterOpen(open, { focus = false } = {}) {
    if (open === filterOpen) return;
    filterOpen = open;
    filterPanel.hidden = !open;
    filterBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    topHud.classList.toggle('has-popover', open);
    if (open && focus) opts.find((o) => o.tabIndex === 0)?.focus();
    if (!open && focus) filterBtn.focus();
  }
  filterBtn.addEventListener('click', (e) => setFilterOpen(!filterOpen, { focus: e.detail === 0 }));
  // 面板已打开、焦点还在按钮上（例如用鼠标打开）时，上下键进入列表
  filterBtn.addEventListener('keydown', (e) => {
    if (!filterOpen || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    e.stopPropagation();
    opts.find((o) => o.tabIndex === 0)?.focus();
  });
  filterList.addEventListener('click', (e) => {
    const o = e.target.closest('.filter-opt');
    if (o) themes.set(o.dataset.themeId);
  });
  filterList.addEventListener('keydown', (e) => {
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
    themes.set(opts[n].dataset.themeId);
  });
  // Esc 先收起面板（在 document 上拦截，星图的 Esc「退出锁定」挂在 window 上，不会同时触发）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && filterOpen) {
      e.preventDefault();
      e.stopPropagation();
      setFilterOpen(false, { focus: filterWrap.contains(document.activeElement) });
    }
  });
  // 点击面板以外的地方或焦点离开时收起
  document.addEventListener('pointerdown', (e) => {
    if (filterOpen && !filterWrap.contains(e.target)) setFilterOpen(false);
  });
  filterWrap.addEventListener('focusout', (e) => {
    if (filterOpen && e.relatedTarget && !filterWrap.contains(e.relatedTarget)) setFilterOpen(false);
  });

  // 视图
  const viewBtn = document.querySelector('[data-action="view"]');
  viewBtn.addEventListener('click', () => onToggleView());
  function setView(mode, { canMap = true } = {}) {
    viewBtn.setAttribute('aria-label', mode === 'list' ? '切换到星图视图' : '切换到列表视图');
    viewBtn.hidden = !canMap;
    if (mode === 'list') setFilterOpen(false);
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
      return filterOpen;
    },
    closeFilter() {
      setFilterOpen(false);
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
