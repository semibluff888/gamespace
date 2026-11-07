import { THEMES, themeById } from '../data/themes.js';
import { storage } from './storage.js';

const KEY = 'theme:v1';

/**
 * 当前配色（观测滤镜）：网址 ?theme= > 访客上次的选择 > site.theme 默认值。
 * 网址参数只对本次访问生效；在页面里切换才会记住。
 * 同时把 2D 界面用到的几个颜色写到 <html> 上（列表视图背景等）。
 */
export function createThemes({ fallback, forced } = {}) {
  const html = document.documentElement;
  const listeners = new Set();
  const valid = (id) => typeof id === 'string' && THEMES.some((t) => t.id === id);
  let current = [forced, storage.get(KEY), fallback].find(valid) || themeById().id;

  function applyCss() {
    const { ui } = themeById(current);
    html.dataset.theme = current;
    html.style.setProperty('--bg', ui.bg);
    ui.neb.forEach((c, i) => html.style.setProperty(`--neb-${i + 1}`, c));
  }
  applyCss();

  return {
    list: THEMES,
    get id() {
      return current;
    },
    get theme() {
      return themeById(current);
    },
    /** 切换配色；返回是否真的变了 */
    set(id) {
      if (!valid(id) || id === current) return false;
      current = id;
      storage.set(KEY, id);
      applyCss();
      listeners.forEach((fn) => fn(current));
      return true;
    },
    /** 按顺序切到下一个（dir = -1 为上一个） */
    step(dir = 1) {
      const i = THEMES.findIndex((t) => t.id === current);
      return this.set(THEMES[(i + dir + THEMES.length) % THEMES.length].id);
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
