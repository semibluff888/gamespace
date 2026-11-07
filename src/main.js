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

// 换曲提示（配乐面板打开时不弹，面板本身已经标出当前曲目）
audio.onTrackChange((t) => {
  if (!hud.bgmOpen) toasts.show({ k: 'BGM', v: [t.title, t.by].filter(Boolean).join(' — '), duration: 2200 });
});

/** 这次按键会被当成全局快捷键吗（输入框里打字、按着修饰键、开场动画中都不算） */
function isHotkey(e) {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return false;
  return !(e.metaKey || e.ctrlKey || e.altKey || html.dataset.mode === 'boot');
}
const isKey = (e, k) => e.key === k || e.key === k.toUpperCase();

// 全局快捷键：L 切换视图，M 声音开关，B 换曲（Shift + B 上一首），C 配色（Shift + C 反向）
window.addEventListener('keydown', (e) => {
  if (!isHotkey(e)) return;
  if (isKey(e, 'l') && caps.webgl2) toggleMode();
  else if (isKey(e, 'm')) audio.toggle();
  else if (isKey(e, 'b')) audio.stepTrack(e.shiftKey ? -1 : 1);
  else if (isKey(e, 'c') && mode === 'map' && html.dataset.state !== 'warp') themes.step(e.shiftKey ? -1 : 1);
});

// 声音默认开启，但浏览器只允许在用户手势里启动音频：第一次点击 / 轻点 / 按键时开始播放；
// 之后的每次手势也顺带检查一下，恢复被挂起的音频（例如切回标签页后），或补上被浏览器拦下的配乐播放。
// 喇叭按钮、配乐面板里的曲目和 M / B 键会自己开关 / 播放，这里跳过，免得先放一下又被关掉。
// 手机上 pointerdown 还不算手势（要等抬起），所以抬起、点击也都监听；没有手势激活时不去碰音频。
const unlockAudio = (e) => {
  if (navigator.userActivation && !navigator.userActivation.isActive) return;
  if (e.type === 'keydown') {
    if (isHotkey(e) && (isKey(e, 'm') || (isKey(e, 'b') && audio.tracks.length > 1))) return;
  } else if (e.target instanceof Element && e.target.closest('[data-action="sound"], [data-track-id]')) {
    return;
  }
  audio.resumeIfEnabled();
};
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(type, unlockAudio, true);
}

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
