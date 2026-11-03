import { escapeHtml as esc } from './listMarkup.js';

/** 显示宽度：中日韩字符按 2 计 */
function displayWidth(s) {
  let w = 0;
  for (const ch of s) w += /[⺀-鿿豈-﫿＀-￯]/.test(ch) ? 2 : 1;
  return w;
}

const pad2 = (n) => String(n).padStart(2, '0');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 终端打字式开场，同时作为真实的加载进度。
 * 首次访问约 2 秒；回访只有一两行；任意键 / 点击跳过；减少动态效果时直接显示。
 */
export function createBoot(root, { brand, signals, decoded, total, firstVisit, reducedMotion }) {
  const logEl = root.querySelector('[data-boot-log]');
  const barEl = root.querySelector('[data-boot-bar]');
  const pctEl = root.querySelector('[data-boot-pct]');
  const quick = !firstVisit;
  if (quick) root.classList.add('is-quick');

  const COL = 30;
  const raw = quick
    ? [
        { t: `${brand} DEEP-SPACE ARRAY`, cls: 'b-title' },
        { t: '> 重新建立链路', ok: 'OK' },
        { t: '> 解码进度', ok: `${pad2(decoded)}/${pad2(total)}`, okCls: 'b-hi' },
      ]
    : [
        { t: `${brand} DEEP-SPACE ARRAY · v1.0`, cls: 'b-title' },
        { t: '> 建立上行链路', ok: 'OK' },
        { t: '> 校准星图坐标', ok: 'OK' },
        { t: '> 扫描异常信号', ok: `${pad2(signals)} DETECTED`, okCls: 'b-hi' },
        { t: '> 解码进度', ok: `${pad2(decoded)}/${pad2(total)}`, okCls: 'b-hi' },
        { t: '> 进入观测模式' },
      ];
  const lines = raw.map((l) => {
    const head = l.ok ? `${l.t} ${'.'.repeat(Math.max(3, COL - displayWidth(l.t)))} ` : l.t;
    return { ...l, head };
  });

  let skipped = reducedMotion;
  let typingDone = false;
  let progress = 0;
  let cursor = false;
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  const doneLines = [];

  const lineHTML = (l, upto, withOk) => {
    let s = `<span class="${l.cls || ''}">${esc(upto == null ? l.head : l.t.slice(0, upto))}</span>`;
    if (withOk && l.ok) s += `<span class="${l.okCls || 'b-ok'}">${esc(l.ok)}</span>`;
    return s;
  };

  const render = (partial = '') => {
    const parts = [...doneLines];
    if (partial) parts.push(partial);
    logEl.innerHTML = parts.join('\n') + (cursor ? '<span class="b-cursor"></span>' : '');
  };

  const check = () => {
    if (typingDone && progress >= 1) resolveDone();
  };

  const charDelay = quick ? 10 : 22;
  (async () => {
    for (const l of lines) {
      if (!skipped) {
        for (let k = 1; k <= l.t.length; k++) {
          if (skipped) break;
          render(lineHTML(l, k, false));
          await wait(charDelay);
        }
        if (!skipped && l.ok) {
          render(lineHTML(l, null, false));
          await wait(quick ? 50 : 110);
        }
      }
      doneLines.push(lineHTML(l, null, true));
      render();
      if (!skipped) await wait(quick ? 20 : 60);
    }
    typingDone = true;
    cursor = true;
    render();
    check();
  })();

  const skip = () => {
    skipped = true;
  };
  window.addEventListener('keydown', skip);
  root.addEventListener('pointerdown', skip);

  return {
    setProgress(p) {
      progress = Math.max(progress, Math.min(1, p));
      barEl.style.width = `${(progress * 100).toFixed(1)}%`;
      pctEl.textContent = `${String(Math.round(progress * 100)).padStart(3, '0')}%`;
      check();
    },
    whenDone: () => done,
    leave() {
      window.removeEventListener('keydown', skip);
      root.classList.add('is-leaving');
      const ms = reducedMotion ? 320 : quick ? 470 : 780;
      return new Promise((r) =>
        setTimeout(() => {
          root.remove();
          r();
        }, ms),
      );
    },
  };
}
