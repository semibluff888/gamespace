import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { LIGHT, NOISE, PLANET_VERT, color, fbmDefine, sphereSegments } from './common.js';

/** 鬼灭格斗：墨色星球 + 金箔裂纹 + 余烬旋涡 + 水蓝 / 雷金两道对冲刀光 */
const PLANET_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHover;
uniform float uDim;
uniform vec3 uLightDir;
uniform vec3 uGold;
uniform vec3 uCrimson;
uniform float uBurst;
varying vec3 vObj;
varying vec3 vNw;
varying vec3 vPw;
${NOISE}
${LIGHT}
void main() {
  vec3 p = vObj;
  vec3 n = normalize(vNw);
  vec3 v = normalize(cameraPosition - vPw);
  float diff = wrapDiffuse(n, uLightDir, 0.2);

  vec3 q = p * 1.9;
  float w1 = fbm(q + vec3(uTime * 0.015));
  float w2 = fbm(q * 1.6 + w1 * 2.2);
  float ink = fbm(q + w2 * 1.7);
  vec3 base = mix(vec3(0.01, 0.01, 0.013), vec3(0.075, 0.068, 0.085), smoothstep(-0.45, 0.6, ink));

  vec2 F = cellular(p * 3.6 + w1 * 0.25);
  float edge = F.y - F.x;
  float width = 0.024 + 0.016 * uHover + 0.02 * uBurst;
  float crack = 1.0 - smoothstep(width * 0.35, width, edge);
  float pulse = 0.55 + 0.45 * sin(uTime * 1.8 - F.x * 9.0);
  float hot = smoothstep(0.15, 0.7, fbm(p * 1.4 + 4.0));
  vec3 crackCol = mix(uGold, uCrimson, hot * 0.75);

  vec3 col = base * (0.12 + 0.95 * diff);
  col += crackCol * crack * pulse * (0.95 + 1.8 * uHover + 2.2 * uBurst);
  col += uGold * fresnelTerm(n, v, 3.4) * (0.22 + 0.45 * uHover);
  col *= mix(1.0, 0.28, uDim);
  gl_FragColor = vec4(col, 1.0);
}
`;

const EMBER_VERT = /* glsl */ `
attribute float aRadius;
attribute float aAngle;
attribute float aHeight;
attribute float aSpeed;
attribute float aSize;
attribute float aHue;
uniform float uTime;
uniform float uHover;
uniform float uBurst;
uniform float uPixelRatio;
uniform float uSpin;
varying float vHue;
varying float vFade;
void main() {
  float a = aAngle + uSpin * aSpeed;
  float rr = aRadius * (1.0 + uBurst * 0.55 + uHover * 0.12);
  vec3 pos = vec3(cos(a) * rr, aHeight + sin(uTime * 1.3 + aAngle * 3.0) * aRadius * 0.05, sin(a) * rr);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float flick = 0.6 + 0.4 * sin(uTime * (3.0 + aSpeed * 4.0) + aAngle * 13.0);
  vFade = flick;
  vHue = aHue;
  gl_PointSize = min(aSize * uPixelRatio * (150.0 / -mv.z) * (1.0 + uBurst * 0.6), 7.0 * uPixelRatio);
}
`;

const EMBER_FRAG = /* glsl */ `
uniform vec3 uGold;
uniform vec3 uCrimson;
uniform float uDim;
uniform float uBurst;
varying float vHue;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  vec3 col = mix(uGold, uCrimson, vHue) * (1.25 + uBurst * 1.8);
  gl_FragColor = vec4(col * a * vFade * mix(1.0, 0.25, uDim), 1.0);
}
`;

const ARC_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ARC_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uDim;
uniform float uHover;
varying vec2 vUv;
void main() {
  float head = pow(clamp(vUv.x, 0.0, 1.0), 2.4);
  float core = 1.0 - abs(vUv.y - 0.5) * 2.0;
  vec3 col = uColor * head * (1.4 + 2.0 * uHover) * (0.6 + 0.4 * core);
  gl_FragColor = vec4(col * mix(1.0, 0.25, uDim), 1.0);
}
`;

export function createInk(ctx) {
  const { radius: r, quality, shared, pixelRatio } = ctx;
  const [goldHex, crimsonHex] = ctx.palette || ['#e2b04a', '#c0283a'];
  const uGold = { value: color(goldHex) };
  const uCrimson = { value: color(crimsonHex) };
  const uBurst = { value: 0 };
  const uSpin = { value: 0 };
  const group = new Group();

  const [ws, hs] = sphereSegments(quality);
  const planet = new Mesh(
    new SphereGeometry(r, ws, hs),
    new ShaderMaterial({
      uniforms: { ...shared, uGold, uCrimson, uBurst },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      defines: fbmDefine(quality),
    }),
  );
  group.add(planet);

  // 余烬旋涡
  const count = quality === 'low' ? 260 : 620;
  const geo = new BufferGeometry();
  const attrs = { aRadius: [], aAngle: [], aHeight: [], aSpeed: [], aSize: [], aHue: [] };
  for (let i = 0; i < count; i++) {
    const rr = r * (1.22 + Math.pow(Math.random(), 1.6) * 1.25);
    attrs.aRadius.push(rr);
    attrs.aAngle.push(Math.random() * Math.PI * 2);
    attrs.aHeight.push((Math.random() - 0.5) * r * 0.55 * (rr / r - 0.9));
    attrs.aSpeed.push(0.5 + Math.random() * 0.9);
    attrs.aSize.push(0.6 + Math.random() * 1.4);
    attrs.aHue.push(Math.random() < 0.3 ? 0.85 : Math.random() * 0.35);
  }
  geo.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  for (const [k, arr] of Object.entries(attrs)) geo.setAttribute(k, new BufferAttribute(new Float32Array(arr), 1));
  const embers = new Points(
    geo,
    new ShaderMaterial({
      uniforms: { uTime: shared.uTime, uHover: shared.uHover, uDim: shared.uDim, uBurst, uSpin, uGold, uCrimson, uPixelRatio: { value: pixelRatio } },
      vertexShader: EMBER_VERT,
      fragmentShader: EMBER_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  embers.frustumCulled = false;
  const emberPivot = new Group();
  emberPivot.rotation.set(0.38, 0, 0.2);
  emberPivot.add(embers);
  group.add(emberPivot);

  // 两道对冲刀光
  const makeArc = (hex, tilt) => {
    const mesh = new Mesh(
      new TorusGeometry(r * 1.58, r * 0.016, 6, 180, Math.PI * 1.3),
      new ShaderMaterial({
        uniforms: { uColor: { value: color(hex) }, uDim: shared.uDim, uHover: shared.uHover },
        vertexShader: ARC_VERT,
        fragmentShader: ARC_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    const pivot = new Group();
    pivot.rotation.set(tilt[0], tilt[1], tilt[2]);
    pivot.add(mesh);
    group.add(pivot);
    return mesh;
  };
  const water = makeArc('#4fc3ff', [1.25, 0.2, 0.35]);
  const thunder = makeArc('#ffd23f', [-1.1, -0.3, -0.5]);

  let burst = 0;
  let wasHover = false;
  return {
    group,
    spinTarget: planet,
    atmosphere: { color: crimsonHex, intensity: 0.85 },
    setPixelRatio(pr) {
      embers.material.uniforms.uPixelRatio.value = pr;
    },
    update(dt, t, s) {
      const hovering = s.hover > 0.5;
      if (hovering && !wasHover) burst = 1;
      wasHover = hovering;
      burst = Math.max(0, burst - dt * 1.6);
      uBurst.value = burst * burst;
      uSpin.value += dt * (0.35 + s.hover * 1.1 + burst * 2.0);
      water.rotation.z += dt * (1.1 + s.hover * 2.2);
      thunder.rotation.z -= dt * (1.4 + s.hover * 2.6);
    },
  };
}
