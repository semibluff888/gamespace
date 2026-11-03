/** 文字「解码」效果：乱码逐字收敛为目标文本 */
export const GLYPHS = '!<>-_\\/[]{}=+*^?#%&$@ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
const running = new WeakMap();

const pick = (chars) => chars[(Math.random() * chars.length) | 0];

export function noise(length, chars = GLYPHS) {
  let s = '';
  for (let i = 0; i < length; i++) s += pick(chars);
  return s;
}

export function cancelScramble(el) {
  const stop = running.get(el);
  if (stop) {
    stop();
    running.delete(el);
  }
}

export function scrambleTo(el, text, { duration = 650, delay = 0, chars = GLYPHS, onDone } = {}) {
  cancelScramble(el);
  const target = String(text);
  const from = el.textContent || '';
  const len = Math.max(target.length, from.length);
  const queue = [];
  for (let i = 0; i < len; i++) {
    const start = delay + Math.random() * duration * 0.35 + (i / Math.max(1, len)) * duration * 0.3;
    const end = start + duration * 0.25 + Math.random() * duration * 0.3;
    queue.push({ from: from[i] || '', to: target[i] || '', start, end, ch: '' });
  }
  const t0 = performance.now();
  let raf = 0;
  let lastSwap = 0;
  const tick = (now) => {
    const t = now - t0;
    const swap = now - lastSwap > 45;
    if (swap) lastSwap = now;
    let out = '';
    let done = 0;
    for (const q of queue) {
      if (t >= q.end) {
        out += q.to;
        done++;
      } else if (t >= q.start) {
        if (!q.ch || swap) q.ch = q.to === ' ' ? ' ' : pick(chars);
        out += q.ch;
      } else {
        out += q.from;
      }
    }
    el.textContent = out;
    if (done === queue.length) {
      running.delete(el);
      onDone?.();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  running.set(el, () => cancelAnimationFrame(raf));
}

/** 部分解码：进度 p 之前的字符已解出，其余为乱码 */
export function partialText(text, p, chars = GLYPHS) {
  const n = Math.floor(text.length * Math.min(1, Math.max(0, p)));
  let s = text.slice(0, n);
  for (let i = n; i < text.length; i++) s += text[i] === ' ' ? ' ' : pick(chars);
  return s;
}

/** 随机损坏少量字符（用于未知信号的闪烁） */
export function glitchText(text, amount = 0.2, chars = GLYPHS) {
  let s = '';
  for (const c of text) s += c !== ' ' && Math.random() < amount ? pick(chars) : c;
  return s;
}
