import { session } from './storage.js';

const TTL = 60 * 60 * 1000;
const RECENT_DAYS = 30;
const inflight = new Map();

/** 读取 GitHub 最新 Release（4 秒超时，会话内缓存；失败返回 null，不抛错） */
export function fetchLatestRelease(repo, { timeout = 4000 } = {}) {
  if (!repo) return Promise.resolve(null);
  const key = `release:${repo}`;
  const cached = session.get(key, null);
  if (cached && Date.now() - cached.at < TTL) return Promise.resolve(cached.data);
  if (inflight.has(repo)) return inflight.get(repo);

  const task = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        signal: ctrl.signal,
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) return null;
      const json = await res.json();
      const data = {
        tag: json.tag_name || json.name || '',
        date: json.published_at || json.created_at || '',
        url: json.html_url || '',
      };
      session.set(key, { at: Date.now(), data });
      return data;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      inflight.delete(repo);
    }
  })();
  inflight.set(repo, task);
  return task;
}

export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 合并实时 Release 与手写字段 */
export function releaseInfo(game, live) {
  const version = live?.tag || game.version || '';
  const date = live?.date || game.updated || '';
  const t = date ? new Date(date).getTime() : NaN;
  const recent = Number.isFinite(t) && Date.now() - t < RECENT_DAYS * 86400000;
  return { version, date: formatDate(date), recent, live: !!live };
}
