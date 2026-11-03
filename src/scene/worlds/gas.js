import { DoubleSide, Group, Mesh, RingGeometry, ShaderMaterial, SphereGeometry } from 'three';
import { LIGHT, NOISE, PLANET_VERT, RING_VERT, color, fbmDefine, sphereSegments } from './common.js';

/** 通用预设：可配三色的气态巨行星（可选带环）。新作品不想单独写 shader 时用它。 */
const FRAG = /* glsl */ `
uniform float uTime;
uniform float uHover;
uniform float uDim;
uniform vec3 uLightDir;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uAccent;
varying vec3 vObj;
varying vec3 vNw;
varying vec3 vPw;
${NOISE}
${LIGHT}
void main() {
  vec3 p = vObj;
  vec3 n = normalize(vNw);
  vec3 v = normalize(cameraPosition - vPw);
  float diff = wrapDiffuse(n, uLightDir, 0.3);
  float turb = fbm(p * vec3(2.0, 5.0, 2.0) + vec3(uTime * 0.012, 0.0, 0.0));
  float b = p.y * 4.5 + turb * 0.9;
  vec3 col = mix(uC1, uC2, 0.5 + 0.5 * sin(b * 3.0));
  col = mix(col, uC3, smoothstep(0.25, 0.85, fbm(p * 4.0 + turb)) * 0.6);
  vec3 spot = normalize(vec3(0.6, -0.25, 0.75));
  col = mix(col, uC3 * 1.3, smoothstep(0.92, 0.97, dot(p, spot)) * 0.8);
  col *= 0.08 + 0.95 * diff;
  col += uAccent * fresnelTerm(n, v, 2.8) * (0.6 + 0.6 * uHover);
  col *= mix(1.0, 0.28, uDim);
  gl_FragColor = vec4(col, 1.0);
}
`;

const RING_FRAG = /* glsl */ `
uniform float uDim;
uniform float uHover;
uniform vec3 uLightDir;
uniform vec3 uC1;
uniform vec3 uC3;
uniform float uInner;
uniform float uOuter;
varying vec2 vLocal;
varying vec3 vNw;
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
void main() {
  float s = (length(vLocal) - uInner) / (uOuter - uInner);
  float bands = 0.4 + 0.6 * h11(floor(s * 40.0));
  float alpha = bands * smoothstep(0.0, 0.08, s) * smoothstep(1.0, 0.85, s) * 0.75;
  vec3 col = mix(uC1, uC3, s) * (abs(dot(normalize(vNw), uLightDir)) * 0.6 + 0.4) * (1.0 + 0.6 * uHover);
  gl_FragColor = vec4(col * mix(1.0, 0.28, uDim), alpha);
}
`;

export function createGas(ctx) {
  const { radius: r, quality, shared, accent } = ctx;
  const [c1, c2, c3] = ctx.palette || ['#2b5cff', '#7fd8ff', '#d9f1ff'];
  const uC1 = { value: color(c1) };
  const uC3 = { value: color(c3) };
  const group = new Group();
  const [ws, hs] = sphereSegments(quality);
  const planet = new Mesh(
    new SphereGeometry(r, ws, hs),
    new ShaderMaterial({
      uniforms: { ...shared, uC1, uC2: { value: color(c2) }, uC3, uAccent: { value: color(accent) } },
      vertexShader: PLANET_VERT,
      fragmentShader: FRAG,
      defines: fbmDefine(quality),
    }),
  );
  group.add(planet);

  if (ctx.ring) {
    const inner = r * 1.4;
    const outer = r * 2.1;
    const ring = new Mesh(
      new RingGeometry(inner, outer, 160, 1),
      new ShaderMaterial({
        uniforms: { ...shared, uC1, uC3, uInner: { value: inner }, uOuter: { value: outer } },
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    const pivot = new Group();
    pivot.rotation.set(-Math.PI / 2 + 0.42, 0, 0.18);
    pivot.add(ring);
    group.add(pivot);
  }

  return { group, spinTarget: planet, update() {} };
}
