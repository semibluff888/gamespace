function mq(query) {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function probeWebGL2() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function detectCapabilities() {
  const params = new URLSearchParams(window.location.search);
  const coarse = mq('(pointer: coarse)');
  const hover = mq('(hover: hover)');
  const small = window.innerWidth < 760 || Math.min(window.innerWidth, window.innerHeight) < 520;
  return {
    reducedMotion: mq('(prefers-reduced-motion: reduce)'),
    coarse,
    hover,
    small,
    mobile: coarse && !hover,
    keyboard: hover && !coarse,
    webgl2: params.get('nowebgl') == null && probeWebGL2(),
    forcedMode: params.get('mode'),
    forcedQuality: params.get('quality'),
    forcedTheme: params.get('theme'),
    debug: params.has('debug'),
  };
}

/** 'map' = 3D 星图，'list' = 列表视图 */
export function decideMode(caps, site) {
  if (!caps.webgl2) return 'list';
  if (caps.forcedMode === 'list' || caps.forcedMode === 'map') return caps.forcedMode;
  if (caps.reducedMotion) return 'list';
  if (caps.mobile && site.mobileMode === 'list') return 'list';
  return 'map';
}

/** 'high' | 'medium' | 'low' */
export function initialQuality(caps) {
  if (['high', 'medium', 'low'].includes(caps.forcedQuality)) return caps.forcedQuality;
  if (caps.mobile || caps.small) return 'low';
  return 'high';
}
