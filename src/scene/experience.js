import gsap from 'gsap';
import { Vector3 } from 'three';
import { Stage } from './Stage.js';
import { CameraRig } from './CameraRig.js';
import { Picker } from './Picker.js';
import { createStarfield, createDust } from './Starfield.js';
import { createNebula } from './Nebula.js';
import { createGalaxy } from './GalaxyDisc.js';
import { createBeacon } from './Beacon.js';
import { WorldNode } from './WorldNode.js';
import { layoutWorlds } from './layout.js';
import { createLabels } from '../ui/labels.js';
import { createReticle } from '../ui/reticle.js';
import { createRadar } from '../ui/radar.js';
import { createDossier } from '../ui/dossier.js';
import { createTerminal } from '../ui/terminal.js';
import { sigCode, actionsFor, STATUS, deriveStatus } from '../ui/listMarkup.js';
import { fetchLatestRelease, releaseInfo, formatDate } from '../systems/releases.js';
import { themeById } from '../data/themes.js';

const SCAN_TIME = 0.7;
// 切换配色：天空淡出 → 分帧重新烘焙 → 淡入（秒）
const THEME_FADE_OUT = 0.28;
const THEME_FADE_IN = 0.75;
const DEFAULT_LIMITS = { minR: 26, maxR: 230, minPhi: 0.32, maxPhi: 1.5 };
const ORIGIN = new Vector3();
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export async function createExperience(opts) {
  const { canvas, games, site, caps, quality, progress, audio, themes, hud, toasts, onProgress = () => {}, requestMode } = opts;
  const isSheet = () => window.matchMedia('(max-width: 760px)').matches;
  const timings = {};
  let t0 = performance.now();
  const mark = (k) => {
    const now = performance.now();
    timings[k] = Math.round(now - t0);
    t0 = now;
  };

  // ---------- 场景 ----------
  const stage = new Stage(canvas, {
    quality,
    onPoorPerformance: (avg) => {
      if (avg > 1 / 14) {
        requestMode('list');
        toasts.show({ k: 'PERFORMANCE', v: '设备性能不足，已切换到列表视图', tone: 'alert', duration: 5000 });
      } else {
        toasts.show({
          k: 'PERFORMANCE',
          v: '画面不够流畅？可以切换到列表视图',
          tone: 'alert',
          duration: 8000,
          action: { label: '切换', run: () => requestMode('list') },
        });
      }
    },
  });
  const { scene, camera, renderer } = stage;
  mark('stage');
  onProgress(0.45);
  await nextFrame();

  const nebula = await createNebula(renderer, { quality, floatOk: stage.floatOk, theme: themes.theme });
  scene.background = nebula.texture;
  mark('nebula');
  onProgress(0.6);
  await nextFrame();

  const galaxy = await createGalaxy(renderer, { quality, pixelRatio: stage.pixelRatio, theme: themes.theme });
  scene.add(galaxy.object);
  mark('galaxy');
  onProgress(0.66);

  const stars = createStarfield(quality, stage.pixelRatio, themes.theme);
  const dust = createDust(quality, stage.pixelRatio, themes.theme);
  const beacon = createBeacon();
  scene.add(stars.object, dust.object, beacon.group);

  const positions = layoutWorlds(games);
  const worlds = games.map((g, i) => new WorldNode(g, i, positions[i], { quality, pixelRatio: stage.pixelRatio }));
  worlds.forEach((w) => {
    w.decoded = !w.encrypted && progress.isDecoded(w.id);
    scene.add(w.group);
  });
  const entities = [...worlds, beacon];
  const byId = new Map(entities.map((e) => [e.id, e]));
  mark('worlds');
  onProgress(0.75);
  await nextFrame();

  // ---------- 交互组件 ----------
  const rig = new CameraRig(camera, canvas, {
    onInteract: () => {
      hud.noteInteraction();
      if (state === 'intro') setState('explore');
    },
  });
  rig.setLimits(DEFAULT_LIMITS);

  const labels = createLabels(document.getElementById('labels'), {
    onSelect: (id) => {
      const node = byId.get(id);
      if (node) select(node);
    },
    onHover: (id, on) => {
      labelHoverId = on ? id : labelHoverId === id ? null : labelHoverId;
    },
  });
  const reticle = createReticle(document.getElementById('reticle'));
  const radar = createRadar(document.getElementById('radar'), {
    onPick: (id) => {
      const node = byId.get(id);
      if (node) select(node);
    },
  });
  const dossier = createDossier(document.getElementById('dossier'), {
    onClose: () => unfocus(),
    onPrev: () => step(-1),
    onNext: () => step(1),
    onLaunch: (game, href) => launch(game, href),
    onReset: () => {
      progress.reset();
      unfocus();
      toasts.show({ k: 'RESET', v: '探索进度已重置，所有信号重新加密', tone: 'alert' });
    },
  });
  const picker = new Picker(camera, canvas, {
    getTargets: () => entities.map((e) => e.hit),
    onSelect: (node) => select(node),
    onEmpty: () => {
      if (state === 'focus') unfocus();
    },
  });
  const flash = document.getElementById('warp-flash');

  // ---------- 状态 ----------
  let state = 'idle';
  let focused = null;
  let hovered = null;
  let labelHoverId = null;
  let overviewPose = null;
  let discDim = 0;
  let warpTimer = 0;
  let warpNode = null;
  let active = true;
  const live = {};
  const tmpInfo = { visible: false, x: 0, y: 0, r: 0, dist: 0 };
  const labelInfo = new Map(entities.map((e) => [e.id, { visible: false, x: 0, y: 0, r: 0, dist: 0 }]));

  function setState(s) {
    state = s;
    hud.setState(s);
  }

  /**
   * 自动挑选全景的镜头方位：让离镜头最近的星球和中心正后方的星球都尽量偏离视线，
   * 避免有星球正好挡在中心信标前面或藏在它身后。作品增减时会自动重新计算。
   */
  function bestAzimuth() {
    const angles = worlds.map((w) => Math.atan2(w.position.z, w.position.x));
    const dist = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    let best = Math.PI / 4;
    let bestScore = -Infinity;
    for (let deg = 0; deg < 360; deg += 1) {
      const a = (deg * Math.PI) / 180;
      let near = Infinity;
      let far = Infinity;
      let penalty = 0;
      angles.forEach((t, i) => {
        near = Math.min(near, dist(a, t));
        far = Math.min(far, dist(a + Math.PI, t));
        // 占位的加密信号不要站在前景：越靠近镜头扣分越多
        if (worlds[i].encrypted) penalty += 0.2 * Math.max(0, Math.cos(dist(a, t)));
      });
      const score = Math.min(near, far * 0.9) - penalty;
      if (score > bestScore + 1e-6) {
        bestScore = score;
        best = a;
      }
    }
    // 星球方位角 α = atan2(z, x)，相机 rig 的 theta 满足 (sinθ, cosθ) 指向 α，因此 θ = π/2 − α
    return Math.PI / 2 - best;
  }
  const overviewTheta = bestAzimuth();

  function defaultPose() {
    const aspect = stage.width / stage.height;
    // 按所有星球的实际分布范围取景：作品越多，镜头自动越远
    const extent = Math.max(30, ...worlds.map((w) => Math.hypot(w.position.x, w.position.z) + w.radius * 2));
    if (aspect < 0.85) {
      // 竖屏：按水平视野计算距离，俯角更大
      const half = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * aspect);
      // 竖屏：更接近俯视（约 55°），星系盘接近圆形，星球在上下方向也能拉开
      return { theta: overviewTheta, phi: 0.6, radius: Math.min(DEFAULT_LIMITS.maxR, (extent * 1.04) / Math.tan(half)), target: ORIGIN.clone() };
    }
    const base = extent * 1.85;
    const radius = Math.min(DEFAULT_LIMITS.maxR, aspect >= 1.2 ? base : base * Math.min(1.6, 1.25 / aspect));
    return { theta: overviewTheta, phi: 1.0, radius, target: ORIGIN.clone() };
  }

  // ---------- 标签内容 ----------
  function labelTags(w) {
    const tags = [];
    if (progress.isNew(w.id)) tags.push({ text: 'NEW SIGNAL', tone: 'new' });
    if (live[w.id] !== undefined || w.game.updated) {
      const info = releaseInfo(w.game, live[w.id]);
      if (info.recent) tags.push({ text: 'UPDATED', tone: 'updated' });
    }
    return tags;
  }

  function dossierTags(w) {
    return [...labelTags(w), ...(w.game.badges || []).map((b) => ({ text: b, tone: 'gold' }))];
  }

  function refreshLabel(w, animate = false) {
    const g = w.game;
    w.decoded = !w.encrypted && progress.isDecoded(w.id);
    if (w.encrypted) {
      labels.setContent(w.id, { name: 'ENCRYPTED SIGNAL', sub: '信号加密中 · 无法解析', unknown: true, aria: '加密信号：尚未公开的新游戏。按回车打开档案' });
    } else if (!w.decoded) {
      labels.setContent(w.id, {
        name: 'UNKNOWN SIGNAL',
        sub: caps.mobile ? '未知信号 · 轻点解码' : '未知信号 · 悬停扫描以解码',
        unknown: true,
        aria: `未知信号 ${sigCode(w.index)}。按回车解码并打开档案`,
      });
    } else {
      labels.setContent(w.id, {
        name: g.titleEn || g.title,
        sub: `${g.title} · ${g.genre}`,
        unknown: false,
        animate,
        aria: `${g.title}，${g.genre}。按回车打开档案`,
      });
    }
    labels.setTags(w.id, labelTags(w));
  }

  function refreshCoreLabel() {
    const unlocked = beacon.unlocked;
    labels.setClass('core', 'is-locked', !unlocked);
    if (unlocked) {
      labels.setContent('core', { name: 'DEV TRANSMISSION', sub: `${site.developer?.title || '开发者通讯'} · 已解锁`, aria: '开发者通讯：已解锁，按回车查看' });
    } else {
      labels.setContent('core', {
        name: `CORE // LOCKED ${progress.count()}/${progress.total}`,
        sub: '解码全部信号以解锁',
        aria: `信标核心：已锁定，已解码 ${progress.count()} / ${progress.total} 个信号`,
      });
    }
  }

  worlds.forEach((w) => {
    labels.add({ id: w.id, code: sigCode(w.index), accent: w.accentHex });
    refreshLabel(w);
  });
  labels.add({ id: 'core', kind: 'core', code: 'CORE', accent: '#6ef2ff' });
  beacon.setUnlocked(progress.allDecoded(), false);
  refreshCoreLabel();

  // ---------- 解码 ----------
  function decode(w) {
    if (w.encrypted || w.decoded) return;
    progress.decode(w.id);
    w.decoded = true;
    w.scan = 0;
    w.triggerFlash();
    refreshLabel(w, true);
    labels.pulse(w.id, 'is-reveal');
    audio.scan(null);
    audio.play('decode');
    hud.setDecoded(progress.count(), { bump: true });
    toasts.show({ k: 'SIGNAL DECODED', v: `${w.game.title} · ${w.game.genre}`, tone: 'ok' });
    refreshCoreLabel();
    if (progress.allDecoded()) setTimeout(unlockCore, 1100);
  }

  function unlockCore() {
    if (beacon.unlocked) return;
    beacon.setUnlocked(true, true);
    refreshCoreLabel();
    labels.pulse('core', 'is-reveal');
    audio.play('unlock');
    toasts.show({
      k: 'NEW TRANSMISSION',
      v: '信标核心收到一条加密通讯 · 已解锁',
      tone: 'gold',
      duration: 5200,
      action: { label: '查看', run: () => select(beacon) },
    });
  }

  function deny() {
    beacon.deny();
    labels.pulse('core', 'is-denied', 500);
    audio.play('deny');
    toasts.show({ k: 'ACCESS DENIED', v: `解码全部信号以解锁（${progress.count()}/${progress.total}）`, tone: 'alert' });
  }

  progress.on((e) => {
    if (e.type !== 'reset') return;
    worlds.forEach((w) => {
      w.scan = 0;
      refreshLabel(w);
    });
    beacon.setUnlocked(false, false);
    refreshCoreLabel();
    hud.setDecoded(0);
  });

  // ---------- 版本信息 ----------
  function versionText(g) {
    if (!g.releaseRepo && !g.version && !g.updated) return null;
    if (g.releaseRepo && live[g.id] === undefined) return null;
    const info = releaseInfo(g, live[g.id]);
    if (!info.version && !info.date) return '—';
    return [info.version, info.date].filter(Boolean).join(' · ');
  }

  async function loadRelease(w) {
    const g = w.game;
    if (!g.releaseRepo || live[g.id] !== undefined) return;
    const data = await fetchLatestRelease(g.releaseRepo);
    live[g.id] = data;
    refreshLabel(w);
    dossier.setVersion(g.id, versionText(g) || '—', dossierTags(w));
  }

  // ---------- 锁定 / 档案 ----------
  function viewFrom(node, distMul) {
    const d = camera.position.clone().sub(node.position);
    const len = d.length() || 1;
    const theta = Math.atan2(d.x, d.z);
    const phi = Math.min(1.32, Math.max(0.95, Math.acos(Math.max(-1, Math.min(1, d.y / len)))));
    return { theta, phi, radius: node.radius * distMul };
  }

  function focusNode(node, openPanel) {
    if (state === 'warp') return;
    if (!focused) overviewPose = rig.pose();
    if (focused && focused !== node) focused.focused = false;
    focused = node;
    node.focused = true;
    setState('focus');
    labels.setHidden(true);
    hud.setAccent(node.accentHex);
    const sheet = isSheet();
    const v = viewFrom(node, sheet ? 7.5 : node.kind === 'core' ? 6.5 : 5.2);
    rig.setLimits({ minR: node.radius * 2.6, maxR: node.radius * 11, minPhi: 0.2, maxPhi: 2.2 });
    rig.flyTo({ ...v, target: node.position, shift: sheet ? { x: 0, y: 0.3 } : { x: 0.17, y: 0 }, duration: 1.35 });
    openPanel();
    audio.play('lock');
    audio.play('open');
    setHash(node.id);
  }

  function focusWorld(w) {
    focusNode(w, () => {
      dossier.openGame(w.game, {
        index: worlds.indexOf(w),
        total: worlds.length,
        code: sigCode(w.index),
        tags: dossierTags(w),
        versionText: versionText(w.game),
      });
    });
    loadRelease(w);
  }

  function focusCore() {
    focusNode(beacon, () => {
      dossier.openDeveloper(site, {
        decoded: progress.count(),
        total: progress.total,
        firstLink: formatDate(progress.firstVisitAt),
        worlds: worlds.filter((w) => !w.encrypted).length,
      });
    });
  }

  function select(node) {
    if (!node || state === 'warp') return;
    if (node.kind === 'core') {
      if (!beacon.unlocked) {
        deny();
        return;
      }
      if (focused !== beacon) focusCore();
      return;
    }
    if (!node.encrypted && !node.decoded) decode(node);
    if (focused !== node) focusWorld(node);
  }

  function unfocus({ instant = false } = {}) {
    if (state !== 'focus' && !focused) return;
    if (focused) focused.focused = false;
    focused = null;
    dossier.close({ immediate: instant });
    audio.play('close');
    setState('explore');
    hud.setAccent(null);
    labels.setHidden(false);
    rig.setLimits(DEFAULT_LIMITS);
    const pose = overviewPose || defaultPose();
    overviewPose = null;
    if (instant) {
      rig.set(pose);
      rig.viewShift.x = 0;
      rig.viewShift.y = 0;
    } else {
      rig.flyTo({ ...pose, shift: { x: 0, y: 0 }, duration: 1.2 });
    }
    clearHash();
  }

  function step(dir) {
    if (state === 'warp') return;
    const i = focused && focused.kind === 'world' ? worlds.indexOf(focused) : dir > 0 ? -1 : 0;
    const next = worlds[(i + dir + worlds.length) % worlds.length];
    select(next);
  }

  // ---------- 跃迁 ----------
  function launch(game, href) {
    if (state === 'warp') return;
    const w = byId.get(game.id);
    if (caps.reducedMotion || !w) {
      window.location.assign(href);
      return;
    }
    setState('warp');
    warpNode = w;
    labels.setHidden(true);
    reticle.hide();
    dossier.close({ restoreFocus: false });
    audio.play('warp');
    stage.fx.uniforms.get('tint').value.set(w.accentHex);
    flash.style.setProperty('--flash-c', w.accentHex);
    rig.flyTo({ radius: w.radius * 1.25, target: w.position, shift: { x: 0, y: 0 }, duration: 1.05, ease: 'power3.in' });
    const tl = gsap.timeline();
    tl.to(stage.fx, { warp: 1, duration: 1.0, ease: 'power2.in' }, 0);
    stage.fovLocked = true;
    tl.to(camera, { fov: 100, duration: 1.05, ease: 'power3.in' }, 0);
    tl.to(flash, { opacity: 1, duration: 0.32, ease: 'power2.in' }, 0.74);
    tl.call(() => window.location.assign(href), null, 1.08);
    clearTimeout(warpTimer);
    warpTimer = setTimeout(resetWarp, 9000);
  }

  function resetWarp() {
    clearTimeout(warpTimer);
    audio.syncMusic();
    gsap.killTweensOf([stage.fx, camera, flash]);
    stage.fx.warp = 0;
    stage.fx.glitch = 0;
    stage.fovLocked = false;
    camera.fov = stage.baseFov;
    camera.updateProjectionMatrix();
    flash.style.opacity = '0';
    if (state === 'warp') {
      setState('explore');
      warpNode = null;
      const node = byId.get(hashId());
      if (node && node.kind === 'world') focusWorld(node);
      else unfocus({ instant: true });
    }
  }

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) resetWarp();
  });

  // ---------- 网址深链接 ----------
  function hashId() {
    try {
      return decodeURIComponent(window.location.hash.replace(/^#/, ''));
    } catch {
      return '';
    }
  }
  function setHash(id) {
    history.replaceState(history.state, '', `${location.pathname}${location.search}#${encodeURIComponent(id)}`);
  }
  function clearHash() {
    if (location.hash) history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  }
  window.addEventListener('hashchange', () => {
    if (!active) return;
    const node = byId.get(hashId());
    if (node && node !== focused) select(node);
    else if (!node && focused) unfocus();
  });

  // ---------- 悬停 ----------
  function setHovered(node) {
    if (node === hovered) return;
    if (hovered) {
      hovered.hovered = false;
      labels.setClass(hovered.id, 'is-hover', false);
    }
    hovered = node;
    canvas.classList.toggle('is-targeting', !!node);
    if (!node) {
      audio.scan(null);
      return;
    }
    node.hovered = true;
    labels.setClass(node.id, 'is-hover', true);
    audio.play('hover');
    if (node.kind === 'world' && node.game.world?.style === 'horror' && !caps.reducedMotion) {
      node.triggerGlitch(1);
      gsap.fromTo(stage.fx, { glitch: 0.45 }, { glitch: 0, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
      audio.play('glitch');
    }
  }

  function updateReticle() {
    const node = hovered;
    if (!node || state === 'warp' || state === 'intro' || node === focused || caps.mobile) {
      reticle.hide();
      return;
    }
    const info = node.project(camera, stage.width, stage.height, tmpInfo);
    if (!info.visible) {
      reticle.hide();
      return;
    }
    const size = Math.max(64, info.r * 2 * (node.kind === 'core' ? 2.1 : 1.32) + 26);
    reticle.place(info.x, info.y, size);
    reticle.setColor(node.accentHex);
    if (node.kind === 'core') {
      const c = progress.count();
      const t = progress.total;
      if (beacon.unlocked) {
        reticle.setTone('done');
        reticle.setText('TRANSMISSION READY');
        reticle.setProgress(1);
      } else {
        reticle.setTone('denied');
        reticle.setText(`ACCESS DENIED · ${c}/${t}`);
        reticle.setProgress(c / Math.max(1, t));
      }
    } else if (node.encrypted) {
      const cap = (node.game.decodePercent ?? 37) / 100;
      const pct = Math.round(node.scan * 100);
      const stalled = node.scan >= cap - 0.001;
      reticle.setTone(stalled ? 'denied' : '');
      reticle.setText(stalled ? `SIGNAL TOO WEAK · ${pct}%` : `DECRYPTING ${String(pct).padStart(2, '0')}%`);
      reticle.setProgress(node.scan);
    } else if (!node.decoded) {
      reticle.setTone('');
      reticle.setText(`SCANNING ${String(Math.round(node.scan * 100)).padStart(2, '0')}%`);
      reticle.setProgress(node.scan);
    } else {
      reticle.setTone('done');
      reticle.setText(caps.keyboard ? 'LOCK ON · CLICK' : 'LOCK ON');
      reticle.setProgress(1);
    }
    reticle.show();
  }

  // ---------- 雷达数据 ----------
  const radarEntities = entities.map((e) => ({ id: e.id, x: e.position.x, z: e.position.z, core: e.kind === 'core', color: '#cfd8e6', dim: false }));
  function updateRadarEntities() {
    radarEntities.forEach((re, i) => {
      const e = entities[i];
      if (e.kind === 'core') {
        re.color = beacon.unlocked ? '#ffd479' : '#6ef2ff';
      } else {
        re.color = e.decoded ? e.accentHex : e.encrypted ? '#8e97a6' : '#e4ecf8';
        re.dim = e.encrypted;
      }
    });
  }

  // ---------- 配色（观测滤镜） ----------
  // 背景星云、星系盘、星空在切换时先淡出，天空全黑时每帧烘焙一个立方体面（共 6 帧）+ 星系盘，再淡入；
  // 连续快速切换时只会烘焙最后选中的那一套
  const swap = { fade: 1, step: -1, id: themes.id, applied: themes.id };
  function applyRest(t) {
    galaxy.setTheme(t);
    stars.setTheme(t);
    dust.setTheme(t);
    stage.noise.blendMode.opacity.value = t.grain ?? 0.4;
  }
  stage.noise.blendMode.opacity.value = themes.theme.grain ?? 0.4;
  themes.onChange(() => {
    if (!caps.reducedMotion) return;
    // 减少动态效果：直接整体替换，不做淡入淡出
    const t = themes.theme;
    nebula.bake(t);
    applyRest(t);
    swap.applied = swap.id = t.id;
    swap.step = -1;
    swap.fade = 1;
  });
  function updateThemeSwap(dt) {
    const want = themes.id;
    if (swap.step >= 0) {
      if (swap.id !== want) {
        swap.id = want;
        swap.step = 0;
      }
      const t = themeById(swap.id);
      if (swap.step < nebula.faces) {
        nebula.renderFace(t, swap.step++);
      } else {
        applyRest(t);
        swap.applied = swap.id;
        swap.step = -1;
      }
    } else if (swap.applied !== want) {
      swap.fade = Math.max(0, swap.fade - dt / THEME_FADE_OUT);
      if (swap.fade === 0) {
        swap.id = want;
        swap.step = 0;
      }
    } else if (swap.fade < 1) {
      swap.fade = Math.min(1, swap.fade + dt / THEME_FADE_IN);
    }
    return swap.fade * swap.fade * (3 - 2 * swap.fade);
  }

  // ---------- 每帧 ----------
  function frame(dt, t) {
    rig.update(dt, { allowAutoRotate: state === 'explore' && !hovered, parallax: state !== 'warp' });

    const canHover = state === 'explore' || state === 'focus';
    const picked = canHover && !terminal.isOpen ? picker.hoverPick() : null;
    const labelNode = canHover && labelHoverId ? byId.get(labelHoverId) : null;
    setHovered(labelNode || picked || null);

    let scanning = false;
    for (const w of worlds) {
      const isScan = w === hovered && !w.decoded && canHover;
      if (isScan) {
        const cap = w.encrypted ? (w.game.decodePercent ?? 37) / 100 : 1;
        w.scan = Math.min(cap, w.scan + dt / SCAN_TIME);
        scanning = !w.encrypted || w.scan < cap;
        if (!w.encrypted && w.scan >= 1) decode(w);
        else audio.scan(w.scan);
      } else if (w.scan > 0 && !w.decoded) {
        w.scan = Math.max(0, w.scan - dt * 2.5);
      }
      labels.setScan(w.id, w.decoded ? 0 : w.scan, w.encrypted ? 'ENCRYPTED SIGNAL' : w.game.titleEn || w.game.title);
    }
    if (!scanning) audio.scan(null);

    const dimOthers = state === 'focus' || state === 'warp';
    for (const w of worlds) w.update(dt, t, camera, { dimOthers });
    beacon.update(dt, t, camera, { dimOthers });
    const skyK = updateThemeSwap(dt);
    scene.backgroundIntensity = skyK;
    stars.update(t, skyK);
    dust.update(dt, t, skyK);
    discDim += ((dimOthers ? 1 : 0) - discDim) * (1 - Math.exp(-dt * 3));
    galaxy.update(dt, t, discDim, skyK);

    // 标签位置 + 防重叠：悬停的、离镜头近的优先；冲突时先换到另一侧，两侧都冲突就淡化较远的那个
    const W = stage.width;
    const H = stage.height;
    const pending = [];
    for (const e of entities) {
      const info = e.project(camera, W, H, labelInfo.get(e.id));
      if (!info.visible || info.x < -240 || info.x > W + 60 || info.y < -60 || info.y > H + 120) {
        labels.place(e.id, 0, 0, 0, false);
        continue;
      }
      pending.push(e);
    }
    const layoutOf = (e) => {
      const info = labelInfo.get(e.id);
      const off = info.r * (e.kind === 'core' ? 1.5 : 0.8) + 2;
      const w = labels.width(e.id) || (W < 760 ? 140 : 200);
      const h = labels.height(e.id) || 40;
      const ay = info.y - off;
      const top = ay - 17 - h / 2 - 3;
      const bottom = ay - 17 + h / 2 + 3;
      const R = { l: info.x + off + 30, r: info.x + off + 38 + w, t: top, b: bottom };
      const L = { l: info.x - off - 38 - w, r: info.x - off - 30, t: top, b: bottom };
      return { info, off, ay, R, L, fitR: R.r <= W - 6, fitL: L.l >= 6 };
    };
    const lay = new Map(pending.map((e) => [e, layoutOf(e)]));
    // 排序：悬停的最先；然后是贴边、只有一侧放得下的；最后按离镜头远近
    const rank = (e) => (e === hovered ? 0 : lay.get(e).fitR !== lay.get(e).fitL ? 1 : 2);
    pending.sort((a, b) => rank(a) - rank(b) || lay.get(a).info.dist - lay.get(b).info.dist);
    // 星球本身也是障碍物：标签不能盖住任何星球，否则点那颗星球会误点到标签
    const placed = pending.map((e) => {
      const { info } = lay.get(e);
      const rr = info.r * (e.kind === 'core' ? 1.2 : 1.0);
      return { l: info.x - rr, r: info.x + rr, t: info.y - rr, b: info.y + rr };
    });
    const overlaps = (rc, pad = 0) => placed.some((p) => rc.l - pad < p.r && rc.r + pad > p.l && rc.t - pad < p.b && rc.b + pad > p.t);
    for (const e of pending) {
      const { info, off, ay, R, L, fitR, fitL } = lay.get(e);
      let o = Math.min(1, Math.max(0.45, 1.3 - info.dist / 210));
      if (e.kind === 'core' && !beacon.unlocked) o *= 0.7;
      if (e === hovered) o = 1;
      // 默认放右侧；从左侧翻回右侧时多留一点余量，避免来回跳。
      // 两侧都被挡住时，允许整个标签上下挪动一点（最多 ±24 px）
      const wasL = labels.isFlipped(e.id);
      const rightComfy = R.r + 16 <= W - 6 && !overlaps(R, 16);
      const prefer = wasL && !rightComfy ? ['L', 'R'] : ['R', 'L'];
      let pick = null;
      for (const dy of [0, -10, 10, -17, 17, -24, 24]) {
        for (const sd of prefer) {
          if (sd === 'R' ? !fitR : !fitL) continue;
          const base = sd === 'R' ? R : L;
          const rc = { l: base.l, r: base.r, t: base.t + dy, b: base.b + dy };
          if (!overlaps(rc)) {
            pick = { sd, dy, rc };
            break;
          }
        }
        if (pick) break;
      }
      const clear = !!pick;
      if (!pick) {
        const sd = fitL && !fitR ? 'L' : wasL ? 'L' : 'R';
        pick = { sd, dy: 0, rc: sd === 'R' ? R : L };
      }
      if (clear || e === hovered) placed.push(pick.rc);
      const faded = !clear && e !== hovered;
      labels.setClass(e.id, 'is-faded', faded);
      labels.place(e.id, pick.sd === 'L' ? info.x - off : info.x + off, ay + pick.dy, faded ? Math.min(o, 0.12) : o, true, pick.sd === 'L');
    }
    labels.tick(performance.now());

    if (state === 'warp' && warpNode) {
      const info = warpNode.project(camera, W, H, tmpInfo);
      if (info.visible) stage.fx.uniforms.get('center').value.set(info.x / W, 1 - info.y / H);
    }

    updateReticle();
    updateRadarEntities();
    radar.update(dt, {
      theta: rig.theta,
      target: rig.target,
      entities: radarEntities,
      accent: focused ? focused.accentHex : '#6ef2ff',
      focusedId: focused?.id,
      hoveredId: hovered?.id,
    });
    hud.setReadout((rig.theta * 180) / Math.PI, 90 - (rig.phi * 180) / Math.PI, rig.radius);
  }

  // ---------- 终端 ----------
  const resolveNode = (arg) => {
    if (!arg) return null;
    const a = arg.toLowerCase();
    if (byId.has(a)) return byId.get(a);
    const m = a.match(/^(?:sig-?)?(\d+)$/);
    if (m) return worlds[Number(m[1]) - 1] || null;
    return worlds.find((w) => w.game.title.toLowerCase() === a || (w.game.titleEn || '').toLowerCase() === a) || null;
  };
  const observerId = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0');

  const commands = {
    help: {
      desc: '显示可用命令',
      run: (a, io) => {
        io.print('可用命令：', 't-hi');
        Object.entries(commands)
          .filter(([, c]) => !c.hidden)
          .forEach(([k, c]) => io.print(`  ${(c.usage || k).padEnd(20)} ${c.desc}`));
      },
    },
    ls: {
      desc: '列出星图中的所有信号',
      run: (a, io) => {
        worlds.forEach((w) => {
          const st = STATUS[deriveStatus(w.game)].code;
          const name = w.encrypted ? '▓▓▓▓▓▓▓▓' : w.decoded ? `${w.game.title}（${w.game.titleEn}）` : '??? 未解码';
          io.print(`  ${sigCode(w.index)}  ${w.id.padEnd(10)} ${st.padEnd(10)} ${name}`, w.decoded ? '' : 't-dim');
        });
        io.print(`  CORE    core       ${beacon.unlocked ? 'UNLOCKED' : 'LOCKED  '}   信标核心`, 't-dim');
      },
    },
    goto: {
      usage: 'goto <id|序号>',
      desc: '锁定并飞向信号',
      run: (a, io) => {
        const node = resolveNode(a[0]);
        if (!node) return io.print('找不到该信号。用 ls 查看列表。', 't-err');
        if (node.kind === 'core' && !beacon.unlocked) return io.print(`ACCESS DENIED · 需要解码全部信号（${progress.count()}/${progress.total}）`, 't-err');
        io.print(`锁定 ${node.kind === 'core' ? 'CORE' : sigCode(node.index)} …`, 't-ok');
        terminal.close();
        select(node);
      },
    },
    launch: {
      usage: 'launch <id|序号>',
      desc: '跃迁进入游戏',
      run: (a, io) => {
        const node = resolveNode(a[0]);
        if (!node || node.kind !== 'world') return io.print('找不到该信号。用 ls 查看列表。', 't-err');
        const act = actionsFor(node.game)[0];
        if (!act) return io.print(node.encrypted ? '信号强度不足，无法跃迁。' : '该游戏的链接待补充。', 't-err');
        if (act.newTab) {
          window.open(act.href, '_blank', 'noopener');
          return io.print(`已在新标签页打开：${act.href}`, 't-ok');
        }
        io.print('跃迁序列启动 …', 't-ok');
        terminal.close();
        select(node);
        setTimeout(() => launch(node.game, act.href), focused === node ? 300 : 1450);
      },
    },
    scan: {
      desc: '扫描星域',
      run: (a, io) => {
        worlds.forEach((w, i) => setTimeout(() => w.triggerFlash(), i * 160));
        worlds.forEach((w) => {
          const strength = w.encrypted ? 37 : 70 + Math.round((1 - w.position.length() / 60) * 30);
          const az = ((Math.atan2(w.position.x, w.position.z) * 180) / Math.PI + 360) % 360;
          io.print(`  ${sigCode(w.index)}  强度 ${String(strength).padStart(3)}%  方位 ${az.toFixed(1).padStart(5)}°  ${w.decoded ? 'DECODED' : w.encrypted ? 'ENCRYPTED' : 'UNKNOWN'}`);
        });
        io.print(
          progress.allDecoded() ? '所有信号已解码。信标核心有一条留言（about）。' : '提示：把指针停在信号上片刻即可解码。',
          progress.allDecoded() ? 't-gold' : 't-dim',
        );
      },
    },
    about: {
      desc: '开发者通讯（需要解码全部信号）',
      run: (a, io) => {
        if (!beacon.unlocked) return io.print(`ACCESS DENIED · 已解码 ${progress.count()}/${progress.total}`, 't-err');
        terminal.close();
        select(beacon);
      },
    },
    sound: {
      usage: 'sound [on|off]',
      desc: '配乐与音效开关',
      run: (a, io) => {
        const v = a[0] === 'on' ? true : a[0] === 'off' ? false : !audio.enabled;
        audio.setEnabled(v);
        io.print(`配乐与音效：${audio.enabled ? 'ON' : 'OFF'}`, 't-ok');
      },
    },
    bgm: {
      usage: 'bgm [曲目]',
      desc: '查看 / 切换背景配乐',
      run: (a, io) => {
        const q = a.join(' ').toLowerCase();
        if (!q) {
          audio.tracks.forEach((t, i) => {
            const on = t.id === audio.track?.id;
            io.print(`  ${on ? '●' : '○'} ${String(i + 1).padStart(2, '0')}  ${t.id.padEnd(10)} ${t.title}${t.by ? ` · ${t.by}` : ''}`, on ? 't-ok' : '');
          });
          return io.print(audio.tracks.length > 1 ? '用法：bgm <名称|序号>，或按 B 键切换下一首。' : '只有一首配乐。', 't-dim');
        }
        const t = audio.tracks.find((x, i) => x.id === q || String(i + 1) === q.replace(/^0+/, '') || x.title.toLowerCase() === q);
        if (!t) return io.print('没有这首曲子。输入 bgm 查看列表。', 't-err');
        audio.setTrack(t.id);
        io.print(`背景配乐：${t.title}${t.by ? ` · ${t.by}` : ''}`, 't-ok');
      },
    },
    music: { hidden: true, run: (a, io) => commands.bgm.run(a, io) },
    filter: {
      usage: 'filter [配色]',
      desc: '切换星图配色（观测滤镜）',
      run: (a, io) => {
        const q = (a[0] || '').toLowerCase();
        if (!q) {
          themes.list.forEach((t) => {
            const on = t.id === themes.id;
            io.print(`  ${on ? '●' : '○'} ${t.id.padEnd(11)} ${t.name} · ${t.desc}`, on ? 't-ok' : '');
          });
          return io.print('用法：filter <名称>，或在星图里按 C 键循环切换。', 't-dim');
        }
        const t = themes.list.find((x) => x.id === q || x.en.toLowerCase() === q || x.name === a[0]);
        if (!t) return io.print('没有这个配色。输入 filter 查看列表。', 't-err');
        themes.set(t.id);
        io.print(`观测滤镜：${t.name} ${t.en} · ${t.desc}`, 't-ok');
      },
    },
    theme: { hidden: true, run: (a, io) => commands.filter.run(a, io) },
    list: {
      desc: '切换到列表视图',
      run: () => {
        terminal.close();
        requestMode('list');
      },
    },
    reset: {
      desc: '重置探索进度',
      run: (a, io) => {
        progress.reset();
        if (state === 'focus') unfocus();
        io.print('探索进度已重置，所有信号重新加密。', 't-ok');
      },
    },
    clear: { desc: '清屏', run: (a, io) => io.clear() },
    exit: { desc: '关闭控制台', run: (a, io) => io.close() },
    whoami: { hidden: true, run: (a, io) => io.print(`observer#${observerId} · 深空阵列临时观测员`) },
    sudo: { hidden: true, run: (a, io) => io.print('observer 不在 sudoers 文件中。此事件将被报告。', 't-err') },
    rm: { hidden: true, run: (a, io) => io.print('权限不足。……以及，请不要这样做。', 't-err') },
    semibluff: { hidden: true, run: (a, io) => io.print('semi-bluff · 半诈唬：牌还没成，但下一张牌随时可能改变局面。', 't-gold') },
    hello: { hidden: true, run: (a, io) => io.print('你好，观测员。信号已经在等你了。') },
    hi: { hidden: true, run: (a, io) => io.print('你好，观测员。信号已经在等你了。') },
    ping: { hidden: true, run: (a, io) => io.print('PONG · 往返 0.42 光秒') },
    date: {
      hidden: true,
      run: (a, io) => {
        const d = new Date();
        const start = new Date(d.getFullYear(), 0, 0);
        const day = Math.floor((d - start) / 86400000);
        io.print(`STARDATE ${d.getFullYear()}.${String(day).padStart(3, '0')} · ${d.toLocaleTimeString('zh-CN', { hour12: false })}`);
      },
    },
  };

  const terminal = createTerminal(document.getElementById('terminal'), {
    commands,
    complete: (word, idx, cmd) => {
      const c = (cmd || '').toLowerCase();
      if (c === 'goto' || c === 'launch') return [...worlds.map((w) => w.id), ...(c === 'goto' ? ['core'] : [])];
      if (c === 'sound') return ['on', 'off'];
      if (c === 'bgm' || c === 'music') return audio.tracks.map((t) => t.id);
      if (c === 'filter' || c === 'theme') return themes.list.map((t) => t.id);
      return [];
    },
    sound: (n) => audio.play(n),
    onOpenChange: (open) => {
      picker.enabled = !open;
    },
  });

  // ---------- 键盘 ----------
  window.addEventListener('keydown', (e) => {
    if (!active || terminal.isOpen) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '`' || e.key === '~' || e.code === 'Backquote') {
      if (state !== 'warp') {
        e.preventDefault();
        terminal.toggle();
      }
      return;
    }
    if (state === 'warp') return;
    if (e.key === 'Escape' && state === 'focus') {
      e.preventDefault();
      unfocus();
    } else if (e.key === 'ArrowLeft' && state === 'focus') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'ArrowRight' && state === 'focus') {
      e.preventDefault();
      step(1);
    }
  });

  // ---------- 尺寸 / 可见性 ----------
  const onResize = (w, h, pr) => {
    rig.setSize(w, h);
    stars.setPixelRatio(pr);
    dust.setPixelRatio(pr);
    galaxy.setPixelRatio(pr);
    worlds.forEach((n) => n.setPixelRatio(pr));
    radar.resize();
    labels.remeasure();
  };
  stage.onResize(onResize);
  onResize(stage.width, stage.height, stage.pixelRatio);
  document.fonts?.ready?.then(() => labels.remeasure()).catch(() => {});

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stage.pause();
    else if (active) stage.resume();
  });

  // 图形上下文丢失（例如手机 GPU 重置）：切到列表视图，避免留下一块黑屏
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    requestMode('list');
    toasts.show({ k: 'GPU', v: '图形渲染中断，已切换到列表视图', tone: 'alert', duration: 5000 });
  });

  // ---------- 预编译 ----------
  rig.set(defaultPose());
  rig.update(0);
  // 预编译：绑定后期管线的输入缓冲，保证编译出的程序（线性输出）与实际渲染一致，否则首帧会同步重编译
  try {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(stage.composer.inputBuffer);
    const ready = renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(prev);
    await ready;
  } catch {
    /* ignore */
  }
  mark('compile');
  onProgress(0.92);
  stage.frame = frame;
  stage.warmup();
  mark('firstRender');
  onProgress(1);

  // 开发调试：查询星球的屏幕坐标与当前状态（仅开发模式或 ?debug）
  if (import.meta.env.DEV || caps.debug) {
    window.__starchart = {
      screen: (id) => {
        const n = byId.get(id);
        return n ? { ...n.project(camera, stage.width, stage.height, {}) } : null;
      },
      state: () => state,
      quality: () => stage.quality,
      theme: () => ({ ...swap }),
      rig,
      timings: () => ({ ...timings }),
      stage,
      radarBlips: () => {
        const r = document.getElementById('radar').getBoundingClientRect();
        return radar.blips.map((b) => ({ id: b.id, x: r.left + b.x, y: r.top + b.y }));
      },
    };
  }

  // 预取 Release 信息（更新「UPDATED」标签）
  setTimeout(() => worlds.filter((w) => w.game.releaseRepo).forEach((w) => loadRelease(w)), 1500);

  return {
    stage,
    /** 开场：镜头从信标附近拉远到全景 */
    reveal({ intro = true } = {}) {
      stage.start(frame);
      const final = defaultPose();
      const target = byId.get(hashId());
      const after = () => {
        if (state === 'intro' || state === 'idle') setState('explore');
        if (target && !focused) select(target);
      };
      // 带深链接（例如从游戏返回）时跳过开场镜头，直接锁定目标
      if (!intro || caps.reducedMotion || target) {
        rig.set(final);
        after();
        return;
      }
      setState('intro');
      rig.set({ theta: final.theta - 1.1, phi: 1.4, radius: 30, target: ORIGIN });
      rig.flyTo({ ...final, duration: progress.firstVisit ? 3.0 : 1.9, ease: 'power3.out' }).then(after);
    },
    setActive(on) {
      active = on;
      if (on) {
        stage.resume();
      } else {
        if (state === 'focus') unfocus({ instant: true });
        terminal.close();
        setHovered(null);
        reticle.hide();
        stage.pause();
      }
    },
  };
}
