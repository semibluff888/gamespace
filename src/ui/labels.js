import { escapeHtml as esc } from './listMarkup.js';
import { scrambleTo, cancelScramble, partialText, glitchText } from './scramble.js';

/**
 * 星球标签（真实的 <button>：可 Tab 遍历、Enter 打开）。
 * 位置每帧由场景投影后调用 place() 更新。
 */
export function createLabels(container, { onSelect, onHover }) {
  const items = new Map();

  function add({ id, kind = 'world', code, accent }) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `wlabel${kind === 'core' ? ' wlabel--core' : ''}`;
    el.dataset.id = id;
    el.style.setProperty('--wl', accent);
    el.innerHTML = `<svg class="wlabel__lead" viewBox="0 0 30 30" aria-hidden="true"><circle cx="1" cy="29" r="1.8"/><path d="M1 29 L17 13 L30 13"/></svg><span class="wlabel__box"><span class="wlabel__code">${esc(code)}<i class="wlabel__bars" aria-hidden="true"><b></b><b></b><b></b><b></b></i></span><span class="wlabel__name"></span><span class="wlabel__sub"></span><span class="wlabel__tags"></span></span>`;
    const item = {
      id,
      el,
      kind,
      nameEl: el.querySelector('.wlabel__name'),
      subEl: el.querySelector('.wlabel__sub'),
      tagsEl: el.querySelector('.wlabel__tags'),
      name: '',
      unknown: false,
      glitchUntil: 0,
      flip: false,
      w: 0,
      measureQueued: false,
      x: -9999,
      y: -9999,
      o: -1,
      visible: true,
    };
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(id, { viaKeyboard: e.detail === 0 });
    });
    el.addEventListener('pointerenter', (e) => e.pointerType !== 'touch' && onHover(id, true));
    el.addEventListener('pointerleave', (e) => e.pointerType !== 'touch' && onHover(id, false));
    el.addEventListener('focus', () => onHover(id, true));
    el.addEventListener('blur', () => onHover(id, false));
    container.append(el);
    items.set(id, item);
    return item;
  }

  function measure(it) {
    if (it.measureQueued) return;
    it.measureQueued = true;
    requestAnimationFrame(() => {
      it.measureQueued = false;
      const box = it.el.querySelector('.wlabel__box');
      if (box) {
        it.w = box.offsetWidth;
        it.h = box.offsetHeight;
      }
    });
  }

  function setContent(id, { name, sub, unknown = false, aria, animate = false }) {
    const it = items.get(id);
    if (!it) return;
    measure(it);
    it.unknown = unknown;
    it.el.classList.toggle('is-unknown', unknown);
    if (name != null && name !== it.name) {
      it.name = name;
      if (animate) scrambleTo(it.nameEl, name, { duration: 700 });
      else {
        cancelScramble(it.nameEl);
        it.nameEl.textContent = name;
      }
    }
    if (sub != null) it.subEl.textContent = sub;
    if (aria) it.el.setAttribute('aria-label', aria);
  }

  /** 扫描中：名字按进度逐步解出 */
  function setScan(id, p, target) {
    const it = items.get(id);
    if (!it) return;
    const decoding = p > 0;
    if (decoding !== it.decoding) {
      it.decoding = decoding;
      it.el.classList.toggle('is-decoding', decoding);
    }
    if (decoding) {
      const now = performance.now();
      if (now - (it.scanAt || 0) < 50) return;
      it.scanAt = now;
      cancelScramble(it.nameEl);
      it.nameEl.textContent = partialText(target, p);
    } else if (it.wasScan) {
      it.nameEl.textContent = it.name;
    }
    it.wasScan = decoding;
  }

  function setTags(id, tags) {
    const it = items.get(id);
    if (!it) return;
    it.tagsEl.innerHTML = tags.map((t) => `<span class="tag tag--${esc(t.tone || 'gold')}">${esc(t.text)}</span>`).join('');
    measure(it);
  }

  function place(id, x, y, opacity, visible = true, flip = false) {
    const it = items.get(id);
    if (!it) return;
    if (flip !== it.flip) {
      it.flip = flip;
      it.el.classList.toggle('is-flip', flip);
    }
    if (visible !== it.visible) {
      it.visible = visible;
      it.el.style.visibility = visible ? '' : 'hidden';
    }
    if (!visible) return;
    if (Math.abs(x - it.x) > 0.2 || Math.abs(y - it.y) > 0.2) {
      it.x = x;
      it.y = y;
      it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
    const o = Math.round(opacity * 100) / 100;
    if (o !== it.o) {
      it.o = o;
      it.el.style.opacity = String(o);
    }
  }

  /** 未知信号的随机字符闪烁 */
  function tick(now) {
    for (const it of items.values()) {
      if (!it.unknown || it.el.classList.contains('is-decoding')) continue;
      if (now > it.glitchUntil) {
        if (it.nameEl.textContent !== it.name) it.nameEl.textContent = it.name;
        if (Math.random() < 0.0035) {
          it.nameEl.textContent = glitchText(it.name, 0.25);
          it.glitchUntil = now + 70 + Math.random() * 70;
        }
      }
    }
  }

  return {
    add,
    setContent,
    setScan,
    setTags,
    place,
    tick,
    get: (id) => items.get(id),
    isFlipped: (id) => !!items.get(id)?.flip,
    width: (id) => items.get(id)?.w || 0,
    height: (id) => items.get(id)?.h || 0,
    remeasure() {
      items.forEach((it) => measure(it));
    },
    setClass(id, cls, on) {
      items.get(id)?.el.classList.toggle(cls, on);
    },
    pulse(id, cls, ms = 900) {
      const el = items.get(id)?.el;
      if (!el) return;
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), ms);
    },
    setHidden(hidden) {
      container.classList.toggle('is-hidden', hidden);
    },
    focus(id) {
      items.get(id)?.el.focus({ preventScroll: true });
    },
  };
}
