/** 悬停扫描准星：四角括号 + 进度环 + 状态文字 */
export function createReticle(el) {
  const textEl = el.querySelector('.reticle__text');
  let visible = false;
  let lastText = '';
  let lastTone = '';
  let lx = NaN;
  let ly = NaN;
  let ls = NaN;

  return {
    place(x, y, size) {
      const sizeChanged = !(Math.abs(size - ls) <= 0.5);
      if (sizeChanged) {
        ls = size;
        el.style.width = `${size.toFixed(1)}px`;
        el.style.height = `${size.toFixed(1)}px`;
      }
      if (sizeChanged || !(Math.abs(x - lx) <= 0.2) || !(Math.abs(y - ly) <= 0.2)) {
        lx = x;
        ly = y;
        el.style.transform = `translate3d(${(x - ls / 2).toFixed(1)}px, ${(y - ls / 2).toFixed(1)}px, 0)`;
      }
    },
    show() {
      if (!visible) {
        visible = true;
        el.classList.add('is-visible');
      }
    },
    hide() {
      if (visible) {
        visible = false;
        el.classList.remove('is-visible');
      }
    },
    setProgress(p) {
      el.style.setProperty('--p', String(Math.max(0, Math.min(1, p)).toFixed(3)));
    },
    setText(text) {
      if (text !== lastText) {
        lastText = text;
        textEl.textContent = text;
      }
    },
    setTone(tone) {
      if (tone === lastTone) return;
      if (lastTone) el.classList.remove(`is-${lastTone}`);
      if (tone) el.classList.add(`is-${tone}`);
      lastTone = tone;
    },
    setColor(color) {
      el.style.setProperty('--rc', color);
    },
    get visible() {
      return visible;
    },
  };
}
