import '@fontsource/chakra-petch/latin-400.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './styles/tokens.css';
import './styles/hud.css';
import './styles/labels.css';
import './styles/dossier.css';
import './styles/list.css';
import './styles/boot.css';
import './styles/terminal.css';

import { games } from './data/games.js';
import { site } from './data/site.js';
import { validateGames } from './data/validate.js';
import { detectCapabilities, decideMode, initialQuality } from './systems/capabilities.js';
import { createProgress } from './systems/progress.js';
import { createAudio } from './systems/audio.js';
import { createThemes } from './systems/theme.js';
import { createBoot } from './ui/boot.js';
import { createHud } from './ui/hud.js';
import { createToasts } from './ui/toast.js';

if (import.meta.env.DEV) validateGames(games);

const html = document.documentElement;
const caps = detectCapabilities();
let mode = decideMode(caps, site);
const progress = createProgress(games);
const audio = createAudio({ music: site.music });
const themes = createThemes({ fallback: site.theme, forced: caps.forcedTheme });
const toasts = createToasts(document.getElementById('toasts'));

let experience = null;
let loading = null;
let switching = false;

const hud = createHud({ site, progress, audio, themes, onToggleView: () => toggleMode() });

const boot = createBoot(document.getElementById('boot'), {
  brand: site.brand,
  signals: games.length,
  decoded: progress.count(),
  total: progress.total,
  firstVisit: progress.firstVisit,
  reducedMotion: caps.reducedMotion,
});

function ensureExperience(onProgress = () => {}) {
  if (experience) return Promise.resolve(experience);
  if (!loading) {
    loading = (async () => {
      onProgress(0.15);
      const mod = await import('./scene/experience.js');
      onProgress(0.35);
      experience = await mod.createExperience({
        canvas: document.getElementById('scene'),
        games,
        site,
        caps,
        quality: initialQuality(caps),
        progress,
        audio,
        themes,
        hud,
        toasts,
        onProgress,
        requestMode: (m) => setMode(m),
      });
      return experience;
    })().catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

function applyMode(m) {
  mode = m;
  html.dataset.mode = m;
  hud.setView(m, { canMap: caps.webgl2 });
  if (m === 'list') {
    experience?.setActive(false);
    document.getElementById('list-view').scrollTop = 0;
  } else {
    experience?.setActive(true);
  }
}

async function setMode(m) {
  if (m === mode || switching) return;
  if (m === 'map') {
    if (!caps.webgl2) return;
    switching = true;
    const remove = experience ? null : toasts.show({ k: 'LINKING', v: '正在建立星图…', duration: 15000 });
    try {
      const firstTime = !experience;
      await ensureExperience();
      applyMode('map');
      if (firstTime) experience.reveal({ intro: !caps.reducedMotion });
    } catch (err) {
      console.error(err);
      toasts.show({ k: 'ERROR', v: '3D 星图加载失败，继续使用列表视图', tone: 'alert' });
    } finally {
      remove?.();
      switching = false;
    }
  } else {
    applyMode('list');
  }
}

function toggleMode() {
  setMode(mode === 'map' ? 'list' : 'map');
}

// 配色切换的提示与音效（配色面板打开时不弹提示，面板本身已经标出当前项）
themes.onChange(() => {
  audio.play('filter');
  if (!hud.filterOpen) {
    const t = themes.theme;
    toasts.show({ k: 'FILTER', v: `${t.name} · ${t.desc}`, duration: 1800 });
  }
});

// 全局快捷键：L 切换视图，M 音效，C 配色（Shift + C 反向）
window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (e.metaKey || e.ctrlKey || e.altKey || html.dataset.mode === 'boot') return;
  if ((e.key === 'l' || e.key === 'L') && caps.webgl2) toggleMode();
  else if (e.key === 'm' || e.key === 'M') audio.toggle();
  else if ((e.key === 'c' || e.key === 'C') && mode === 'map' && html.dataset.state !== 'warp') themes.step(e.shiftKey ? -1 : 1);
});

// 浏览器要求在用户手势中启动音频：上次开启过声音的话，每次点击 / 按键时检查一下，
// 恢复被挂起的音频（例如切回标签页后），或补上被浏览器拦下的配乐播放
const unlockAudio = () => audio.resumeIfEnabled();
window.addEventListener('pointerdown', unlockAudio, true);
window.addEventListener('keydown', unlockAudio, true);

(async () => {
  const fontsReady = document.fonts?.ready?.then(() => boot.setProgress(0.12)).catch(() => {});
  if (mode === 'map') {
    try {
      await ensureExperience((p) => boot.setProgress(p));
    } catch (err) {
      console.error(err);
      mode = 'list';
      toasts.show({ k: 'ERROR', v: '3D 星图加载失败，已切换到列表视图', tone: 'alert', duration: 5000 });
    }
  }
  await Promise.race([fontsReady, new Promise((r) => setTimeout(r, 800))]);
  boot.setProgress(1);
  await boot.whenDone();
  applyMode(mode);
  const leaving = boot.leave();
  if (mode === 'map' && experience) experience.reveal({ intro: true });
  await leaving;
  progress.markVisited();
})();
