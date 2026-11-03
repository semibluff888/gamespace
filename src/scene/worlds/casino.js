import {
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { LIGHT, NOISE, PLANET_VERT, RING_VERT, color, fbmDefine, sphereSegments } from './common.js';

/** 德州扑克：墨绿牌桌绒面 + 金色菱格 + 筹码边缘光环 + 四张环绕的扑克牌 */
const PLANET_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHover;
uniform float uDim;
uniform vec3 uLightDir;
uniform vec3 uFelt;
uniform vec3 uGold;
uniform vec3 uVelvet;
varying vec3 vObj;
varying vec3 vNw;
varying vec3 vPw;
${NOISE}
${LIGHT}
void main() {
  vec3 p = vObj;
  vec3 n = normalize(vNw);
  vec3 v = normalize(cameraPosition - vPw);
  vec3 l = uLightDir;
  float diff = wrapDiffuse(n, l, 0.25);

  float mott = fbm(p * 2.6) * 0.5 + 0.5;
  float fib = snoise(p * 46.0) * 0.5 + 0.5;
  vec3 felt = uFelt * (0.7 + 0.45 * mott) * (0.9 + 0.14 * fib);

  // 金色菱格（argyle）
  float lon = atan(p.z, p.x);
  float lat = asin(clamp(p.y, -1.0, 1.0));
  vec2 uv = vec2(lon, lat) * (6.0 / 3.14159265);
  vec2 q = vec2(uv.x + uv.y, uv.x - uv.y);
  vec2 fq = 0.5 - abs(fract(q) - 0.5);
  float dl = min(fq.x, fq.y);
  float aa = fwidth(q.x) * 1.2 + 0.0001;
  float lattice = (1.0 - smoothstep(0.018, 0.018 + aa, dl)) * smoothstep(0.93, 0.7, abs(p.y));

  // 赌注线
  float bet = 1.0 - smoothstep(0.004, 0.004 + fwidth(p.y) * 1.5, abs(abs(p.y) - 0.46));

  vec3 col = felt * (0.06 + 0.98 * diff);
  float glow = 0.22 + 1.1 * uHover;
  col += uGold * (lattice * glow + bet * (0.5 + 1.2 * uHover)) * (0.35 + 0.65 * diff);

  // 赌桌顶灯的柔和高光
  vec3 h = normalize(l + v + vec3(1e-4));
  col += vec3(1.0, 0.86, 0.6) * pow(max(dot(n, h), 0.0), 18.0) * 0.18;

  // 天鹅绒暗部与金色边缘光
  col = mix(col, uVelvet * 0.35, (1.0 - diff) * 0.25);
  col += uGold * fresnelTerm(n, v, 3.2) * (0.55 + 0.6 * uHover);

  col *= mix(1.0, 0.28, uDim);
  gl_FragColor = vec4(col, 1.0);
}
`;

const RING_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHover;
uniform float uDim;
uniform vec3 uLightDir;
uniform vec3 uGold;
uniform vec3 uVelvet;
uniform float uInner;
uniform float uOuter;
varying vec2 vLocal;
varying vec3 vNw;
varying vec3 vPw;
void main() {
  float rr = length(vLocal);
  float s = (rr - uInner) / (uOuter - uInner);
  float ang = atan(vLocal.y, vLocal.x);
  float a = ang / 6.2831853 * 32.0;
  float idx = floor(a);
  float fa = fract(a);
  vec3 ivory = vec3(0.93, 0.89, 0.8);
  vec3 block = mod(idx, 2.0) < 1.0 ? uVelvet * 1.35 : ivory * 0.82;
  float gap = smoothstep(0.0, 0.05, fa) * smoothstep(1.0, 0.95, fa);
  vec3 col = mix(vec3(0.015), block, gap);
  float edgeD = min(s, 1.0 - s);
  float edge = 1.0 - smoothstep(0.05, 0.11, edgeD);
  col = mix(col, uGold * 1.1, edge);
  float track = (1.0 - smoothstep(0.012, 0.03, abs(s - 0.5))) * step(0.5, fract(a * 2.0));
  col = mix(col, uGold * 1.3, track * 0.85);
  vec3 n = normalize(vNw);
  float diff = abs(dot(n, uLightDir)) * 0.75 + 0.25;
  col *= diff;
  col += uGold * edge * (0.25 + 1.4 * uHover);
  col *= mix(1.0, 0.28, uDim);
  gl_FragColor = vec4(col, 1.0);
}
`;

const CARD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CARD_FRAG = /* glsl */ `
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform float uHover;
uniform float uDim;
uniform vec3 uGold;
varying vec2 vUv;
void main() {
  vec4 c = gl_FrontFacing ? texture2D(uFront, vUv) : texture2D(uBack, vec2(1.0 - vUv.x, vUv.y));
  if (c.a < 0.5) discard;
  vec3 col = c.rgb * (0.9 + 0.35 * uHover);
  float edge = smoothstep(0.42, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
  col += uGold * edge * (0.3 + 1.2 * uHover);
  col *= mix(1.0, 0.25, uDim);
  gl_FragColor = vec4(col, 1.0);
}
`;

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) {
    g.roundRect(x, y, w, h, r);
    return;
  }
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const SUIT_FONT = '"Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols2", "DejaVu Sans", serif';
const RANK_FONT = 'Georgia, "Times New Roman", serif';

function makeTexture(draw) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 356;
  const g = c.getContext('2d');
  draw(g, c.width, c.height);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function cardFront(rank, suit, red) {
  return makeTexture((g, w, h) => {
    roundRectPath(g, 4, 4, w - 8, h - 8, 22);
    g.fillStyle = '#f6f1e4';
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#c9a85a';
    g.stroke();
    g.fillStyle = red ? '#c41e3a' : '#15151c';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 62px ${RANK_FONT}`;
    g.fillText(rank, 46, 54);
    g.font = `46px ${SUIT_FONT}`;
    g.fillText(suit, 46, 108);
    g.save();
    g.translate(w - 46, h - 54);
    g.rotate(Math.PI);
    g.font = `700 62px ${RANK_FONT}`;
    g.fillText(rank, 0, 0);
    g.font = `46px ${SUIT_FONT}`;
    g.fillText(suit, 0, 54);
    g.restore();
    g.font = `150px ${SUIT_FONT}`;
    g.fillText(suit, w / 2, h / 2 + 6);
  });
}

function cardBack() {
  return makeTexture((g, w, h) => {
    roundRectPath(g, 4, 4, w - 8, h - 8, 22);
    g.fillStyle = '#0d1a36';
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#d8b65e';
    g.stroke();
    g.save();
    roundRectPath(g, 22, 22, w - 44, h - 44, 12);
    g.clip();
    g.strokeStyle = 'rgba(216, 182, 94, 0.55)';
    g.lineWidth = 2;
    for (let i = -h; i < w + h; i += 22) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + h, h);
      g.moveTo(i, h);
      g.lineTo(i + h, 0);
      g.stroke();
    }
    g.restore();
    g.lineWidth = 3;
    g.strokeStyle = '#d8b65e';
    roundRectPath(g, 22, 22, w - 44, h - 44, 12);
    g.stroke();
    g.fillStyle = '#0d1a36';
    g.beginPath();
    g.arc(w / 2, h / 2, 46, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#e8c46a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 54px ${RANK_FONT}`;
    g.fillText('S', w / 2, h / 2 + 3);
  });
}

export function createCasino(ctx) {
  const { radius: r, quality, shared } = ctx;
  const [feltHex, goldHex, velvetHex] = ctx.palette || ['#0f5a3e', '#e8c46a', '#8e1b2a'];
  const uGold = { value: color(goldHex) };
  const uVelvet = { value: color(velvetHex) };
  const group = new Group();

  const [ws, hs] = sphereSegments(quality);
  const planet = new Mesh(
    new SphereGeometry(r, ws, hs),
    new ShaderMaterial({
      uniforms: { ...shared, uFelt: { value: color(feltHex) }, uGold, uVelvet },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      defines: fbmDefine(quality),
    }),
  );
  group.add(planet);

  const inner = r * 1.42;
  const outer = r * 1.74;
  const ring = new Mesh(
    new RingGeometry(inner, outer, quality === 'low' ? 128 : 220, 1),
    new ShaderMaterial({
      uniforms: { ...shared, uGold, uVelvet, uInner: { value: inner }, uOuter: { value: outer } },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      side: DoubleSide,
    }),
  );
  const ringPivot = new Group();
  ringPivot.rotation.set(-Math.PI / 2 + 0.36, 0, 0.24);
  ringPivot.add(ring);
  group.add(ringPivot);

  // 四张迷你扑克牌
  const back = cardBack();
  const faces = [
    ['A', '♠', false],
    ['K', '♥', true],
    ['Q', '♦', true],
    ['J', '♣', false],
  ];
  const cardPivot = new Group();
  cardPivot.rotation.set(0.32, 0, -0.18);
  group.add(cardPivot);
  const cardGeo = new PlaneGeometry(r * 0.42, r * 0.585);
  const cards = faces.map(([rank, suit, red], i) => {
    const mat = new ShaderMaterial({
      uniforms: { uFront: { value: cardFront(rank, suit, red) }, uBack: { value: back }, uHover: shared.uHover, uDim: shared.uDim, uGold },
      vertexShader: CARD_VERT,
      fragmentShader: CARD_FRAG,
      side: DoubleSide,
    });
    const mesh = new Mesh(cardGeo, mat);
    cardPivot.add(mesh);
    return { mesh, phase: (i / faces.length) * Math.PI * 2, spin: 0.6 + i * 0.17 };
  });

  let orbit = 0;
  return {
    group,
    spinTarget: planet,
    update(dt, t, s) {
      orbit += dt * (0.22 + s.hover * 0.9);
      ring.rotation.z += dt * (0.05 + s.hover * 0.25);
      const R = r * (2.2 + 0.55 * s.hover);
      cards.forEach((c, i) => {
        const a = orbit + c.phase + s.hover * (i - 1.5) * 0.18;
        c.mesh.position.set(Math.cos(a) * R, Math.sin(a * 2.0 + i) * r * 0.12 + (i - 1.5) * r * 0.16 * s.hover, Math.sin(a) * R);
        c.mesh.rotation.set(0.15 * Math.sin(t * 0.7 + i), Math.PI / 2 - a + Math.sin(t * c.spin + i) * 0.9, 0.12 * Math.cos(t * 0.5 + i));
      });
    },
  };
}
