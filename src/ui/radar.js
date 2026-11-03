/**
 * 雷达小地图（Canvas 2D）：以镜头注视点为中心、镜头前方朝上；扫描线扫过时光点变亮；点击光点飞往该信号。
 */
export function createRadar(canvas, { onPick }) {
  const ctx = canvas.getContext('2d');
  let size = 0;
  let dpr = 1;
  let sweep = 0;
  let acc = 0;
  let blips = [];
  const RANGE = 62;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = Math.max(60, Math.round(rect.width));
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best = null;
    let bestD = 14;
    for (const b of blips) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (best) onPick(best.id);
  });

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbCache = new Map();
  const rgba = (hex, a) => {
    if (!rgbCache.has(hex)) rgbCache.set(hex, hexToRgb(hex));
    const [r, g, b] = rgbCache.get(hex);
    return `rgba(${r},${g},${b},${a})`;
  };

  /**
   * @param {number} dt
   * @param {{theta:number, target:{x:number,z:number}, entities:Array, accent:string, focusedId?:string, hoveredId?:string}} s
   */
  function update(dt, s) {
    sweep = (sweep + dt * 1.7) % (Math.PI * 2);
    acc += dt;
    if (acc < 1 / 30) return;
    acc = 0;
    if (!size) resize();
    const c = ctx;
    const R = size / 2 - 3;
    const cx = size / 2;
    const cy = size / 2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);

    // 底盘
    const accent = s.accent || '#6ef2ff';
    c.fillStyle = 'rgba(4, 8, 18, 0.55)';
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = rgba(accent, 0.35);
    c.stroke();
    c.strokeStyle = rgba(accent, 0.12);
    c.beginPath();
    c.moveTo(cx - R, cy);
    c.lineTo(cx + R, cy);
    c.moveTo(cx, cy - R);
    c.lineTo(cx, cy + R);
    c.stroke();

    // 视野锥（前方朝上）
    const fov = 0.55;
    c.fillStyle = rgba(accent, 0.07);
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, R, -Math.PI / 2 - fov, -Math.PI / 2 + fov);
    c.closePath();
    c.fill();

    // 扫描扇区
    const grad = c.createConicGradient ? c.createConicGradient(sweep - 0.9, cx, cy) : null;
    if (grad) {
      grad.addColorStop(0, rgba(accent, 0));
      grad.addColorStop(0.143, rgba(accent, 0.28));
      grad.addColorStop(0.1431, rgba(accent, 0));
      grad.addColorStop(1, rgba(accent, 0));
      c.fillStyle = grad;
      c.beginPath();
      c.arc(cx, cy, R, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = rgba(accent, 0.6);
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
    c.stroke();

    // 光点
    const sinT = Math.sin(s.theta);
    const cosT = Math.cos(s.theta);
    const scale = R / RANGE;
    blips = [];
    for (const e of s.entities) {
      const dx = e.x - s.target.x;
      const dz = e.z - s.target.z;
      // right = (cosθ, -sinθ)，forward = (-sinθ, -cosθ)
      let rx = (dx * cosT - dz * sinT) * scale;
      let ry = (-dx * sinT - dz * cosT) * scale;
      const len = Math.hypot(rx, ry);
      const edge = len > R - 5;
      if (edge) {
        rx *= (R - 5) / len;
        ry *= (R - 5) / len;
      }
      const x = cx + rx;
      const y = cy - ry;
      const ang = Math.atan2(y - cy, x - cx);
      let behind = sweep - ang;
      behind = ((behind % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const ping = Math.exp(-behind * 1.6);
      const col = e.color || accent;
      const base = e.dim ? 0.35 : 0.7;
      const a = Math.min(1, base + ping * 0.6);
      const r = e.core ? 3 : e.id === s.focusedId ? 4 : 2.6;
      c.fillStyle = rgba(col, a);
      c.beginPath();
      if (e.core) c.rect(x - r, y - r, r * 2, r * 2);
      else c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      if (ping > 0.15 && !edge) {
        c.strokeStyle = rgba(col, ping * 0.5);
        c.beginPath();
        c.arc(x, y, r + 3 + (1 - ping) * 5, 0, Math.PI * 2);
        c.stroke();
      }
      if (e.id === s.focusedId || e.id === s.hoveredId) {
        c.strokeStyle = rgba('#ffffff', 0.85);
        c.beginPath();
        c.arc(x, y, r + 4, 0, Math.PI * 2);
        c.stroke();
      }
      blips.push({ id: e.id, x, y });
    }
  }

  return {
    update,
    resize,
    /** 调试用：当前光点在雷达画布内的坐标 */
    get blips() {
      return blips.map((b) => ({ ...b }));
    },
  };
}
