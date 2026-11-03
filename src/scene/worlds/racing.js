import { DoubleSide, Group, Mesh, RingGeometry, ShaderMaterial, SphereGeometry } from 'three';
import { LIGHT, NOISE, PLANET_VERT, RING_VERT, color, fbmDefine, sphereSegments } from './common.js';

/** Turbo Legends：日落渐变条带星球 + 倾斜赛道环（红白路肩、滚动中线、三道光迹） */
const PLANET_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHover;
uniform float uDim;
uniform vec3 uLightDir;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform vec3 uDeep;
varying vec3 vObj;
varying vec3 vNw;
varying vec3 vPw;
${NOISE}
${LIGHT}
vec3 sunset(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 c = mix(uDeep, uColC, smoothstep(0.0, 0.3, x));
  c = mix(c, uColB, smoothstep(0.28, 0.58, x));
  c = mix(c, uColA, smoothstep(0.55, 0.85, x));
  return mix(c, vec3(1.0, 0.86, 0.62), smoothstep(0.88, 1.0, x));
}
void main() {
  vec3 p = vObj;
  vec3 n = normalize(vNw);
  vec3 v = normalize(cameraPosition - vPw);
  float diff = wrapDiffuse(n, uLightDir, 0.35);

  float warp = fbm(p * 2.2 + vec3(uTime * 0.03, 0.0, 0.0)) * 0.3;
  float band = 0.5 + 0.5 * sin(p.y * 7.0 + warp * 6.0) * 0.55 + (p.y * 0.35) + snoise(p * vec3(1.5, 10.0, 1.5) + uTime * 0.02) * 0.08;
  vec3 col = sunset(band);

  float lon = atan(p.z, p.x);
  float speed = uTime * (0.9 + uHover * 3.5);
  float streak = smoothstep(0.78, 1.0, snoise(vec3(lon * 2.5 - speed, p.y * 34.0, 0.0)));
  col += vec3(1.0, 0.9, 0.75) * streak * (0.35 + 0.6 * uHover) * (1.0 - abs(p.y));

  col *= 0.1 + 0.95 * diff;
  col += mix(uColB, uColC, 0.5) * fresnelTerm(n, v, 2.6) * 0.9;
  col *= mix(1.0, 0.28, uDim);
  gl_FragColor = vec4(col, 1.0);
}
`;

const TRACK_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHover;
uniform float uDim;
uniform vec3 uLightDir;
uniform float uInner;
uniform float uOuter;
uniform float uKart[3];
uniform vec3 uKartCol[3];
uniform float uTrail;
uniform vec3 uNeonA;
uniform vec3 uNeonB;
varying vec2 vLocal;
varying vec3 vNw;
varying vec3 vPw;
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  float rr = length(vLocal);
  float s = (rr - uInner) / (uOuter - uInner);
  float ang = atan(vLocal.y, vLocal.x);
  float u = ang / 6.2831853;

  vec3 col = vec3(0.045, 0.045, 0.06) * (0.85 + 0.3 * h12(floor(vLocal * 40.0)));
  float stripe = step(0.5, fract(u * 64.0));
  vec3 kerb = mix(vec3(0.85, 0.06, 0.1), vec3(0.92), stripe);
  float kerbMask = 1.0 - step(0.075, s) * step(s, 0.925);
  col = mix(col, kerb, kerbMask);

  float dash = step(0.55, fract(u * 72.0 - uTime * 0.35)) * (1.0 - smoothstep(0.01, 0.022, abs(s - 0.5)));
  col += vec3(1.0, 0.9, 0.6) * dash * 0.9;

  col += uNeonA * (1.0 - smoothstep(0.0, 0.02, abs(s - 0.1))) * 1.6;
  col += uNeonB * (1.0 - smoothstep(0.0, 0.02, abs(s - 0.9))) * 1.6;

  vec3 n = normalize(vNw);
  col *= abs(dot(n, uLightDir)) * 0.6 + 0.4;

  for (int k = 0; k < 3; k++) {
    float lane = 0.3 + 0.2 * float(k);
    float d = mod(uKart[k] - ang, 6.2831853);
    float laneMask = 1.0 - smoothstep(0.0, 0.07, abs(s - lane));
    float trail = exp(-d * uTrail) * laneMask;
    float head = exp(-d * 90.0) * (1.0 - smoothstep(0.0, 0.1, abs(s - lane)));
    col += uKartCol[k] * (trail * 2.2 + head * 6.0);
  }

  col *= mix(1.0, 0.28, uDim);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createRacing(ctx) {
  const { radius: r, quality, shared } = ctx;
  const [a, b, c] = ctx.palette || ['#ff9a3d', '#ff4f8b', '#6a4cff'];
  const group = new Group();
  const [ws, hs] = sphereSegments(quality);
  const planet = new Mesh(
    new SphereGeometry(r, ws, hs),
    new ShaderMaterial({
      uniforms: { ...shared, uColA: { value: color(a) }, uColB: { value: color(b) }, uColC: { value: color(c) }, uDeep: { value: color('#1a0f3c') } },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      defines: fbmDefine(quality),
    }),
  );
  group.add(planet);

  const inner = r * 1.5;
  const outer = r * 1.98;
  const kart = { value: [0, 2.1, 4.2] };
  const trail = { value: 3.2 };
  const track = new Mesh(
    new RingGeometry(inner, outer, quality === 'low' ? 160 : 320, 1),
    new ShaderMaterial({
      uniforms: {
        ...shared,
        uInner: { value: inner },
        uOuter: { value: outer },
        uKart: kart,
        uKartCol: { value: [color('#4aa8ff'), color('#ff5fa2'), color('#ffd23f')] },
        uTrail: trail,
        uNeonA: { value: color('#4aa8ff') },
        uNeonB: { value: color('#ff5fa2') },
      },
      vertexShader: RING_VERT,
      fragmentShader: TRACK_FRAG,
      side: DoubleSide,
    }),
  );
  const pivot = new Group();
  pivot.rotation.set(-Math.PI / 2 + 0.3, 0, -0.2);
  pivot.add(track);
  group.add(pivot);

  const speeds = [1.15, 0.92, 1.32];
  return {
    group,
    spinTarget: planet,
    update(dt, t, s) {
      const boost = 1 + s.hover * 2.6;
      for (let i = 0; i < 3; i++) kart.value[i] = (kart.value[i] + dt * speeds[i] * boost) % (Math.PI * 2);
      trail.value = 3.4 - s.hover * 2.2;
    },
  };
}
