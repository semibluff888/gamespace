import { storage } from './storage.js';

const DECODED = 'decoded:v1';
const KNOWN = 'known:v1';
const FIRST = 'first-visit:v1';

/**
 * 信号解码进度（保存在 localStorage）。
 * - 只有非加密的作品计入进度。
 * - 「NEW SIGNAL」：老访客上次来时还不存在的作品，在解码前会带 NEW 标记。
 */
export function createProgress(games) {
  const ids = games.filter((g) => g.status !== 'encrypted').map((g) => g.id);
  const firstVisitAt = storage.get(FIRST, null);
  const firstVisit = firstVisitAt == null;

  const decoded = new Set((storage.get(DECODED, []) || []).filter((id) => ids.includes(id)));
  let known = storage.get(KNOWN, null);
  if (!Array.isArray(known)) {
    known = [...ids];
    storage.set(KNOWN, known);
  }
  const knownSet = new Set(known);
  const listeners = new Set();

  const save = () => {
    storage.set(DECODED, [...decoded]);
    storage.set(KNOWN, [...knownSet]);
  };
  const emit = (event) => listeners.forEach((fn) => fn(event));

  return {
    ids,
    total: ids.length,
    firstVisit,
    firstVisitAt: firstVisitAt ?? Date.now(),
    isTracked: (id) => ids.includes(id),
    isDecoded: (id) => decoded.has(id),
    isNew: (id) => !firstVisit && ids.includes(id) && !knownSet.has(id) && !decoded.has(id),
    count: () => decoded.size,
    allDecoded: () => ids.length > 0 && decoded.size >= ids.length,
    decode(id) {
      if (!ids.includes(id) || decoded.has(id)) return false;
      decoded.add(id);
      knownSet.add(id);
      save();
      emit({ type: 'decode', id, count: decoded.size });
      if (decoded.size >= ids.length) emit({ type: 'complete' });
      return true;
    },
    reset() {
      decoded.clear();
      save();
      emit({ type: 'reset' });
    },
    markVisited() {
      if (firstVisit) storage.set(FIRST, Date.now());
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
