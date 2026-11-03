/**
 * 带容错的本地存储：隐私模式 / 禁用存储 / 预览环境下读写可能抛错或为空，
 * 所以全部包在 try/catch 里，并用内存兜底，保证页面在没有存储时也能正常运行。
 */
const PREFIX = 'semibluff:';

function make(getStore) {
  const mem = new Map();
  return {
    get(key, fallback = null) {
      const k = PREFIX + key;
      try {
        const raw = getStore().getItem(k);
        if (raw != null) return JSON.parse(raw);
      } catch {
        /* ignore */
      }
      return mem.has(k) ? mem.get(k) : fallback;
    },
    set(key, value) {
      const k = PREFIX + key;
      mem.set(k, value);
      try {
        getStore().setItem(k, JSON.stringify(value));
      } catch {
        /* ignore */
      }
    },
    remove(key) {
      const k = PREFIX + key;
      mem.delete(k);
      try {
        getStore().removeItem(k);
      } catch {
        /* ignore */
      }
    },
  };
}

export const storage = make(() => window.localStorage);
export const session = make(() => window.sessionStorage);
