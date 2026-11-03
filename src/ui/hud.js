/** HUD：品牌、解码进度、音效 / 视图开关、雷达读数、操作提示、主题色 */
export function createHud({ site, progress, audio, onToggleView }) {
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
    soundBtn.setAttribute('aria-label', on ? '关闭环境音效' : '开启环境音效');
  };
  syncSound(audio.enabled);
  audio.onChange(syncSound);
  soundBtn.addEventListener('click', () => audio.toggle());

  // 视图
  const viewBtn = document.querySelector('[data-action="view"]');
  viewBtn.addEventListener('click', () => onToggleView());
  function setView(mode, { canMap = true } = {}) {
    viewBtn.setAttribute('aria-label', mode === 'list' ? '切换到星图视图' : '切换到列表视图');
    viewBtn.hidden = !canMap;
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
