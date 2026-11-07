import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector4,
  WebGLRenderTarget,
} from 'three';

/**
 * 星系尘埃盘：铺在星图平面上的三条螺旋旋臂（星云）+ 沿旋臂分布的星点，缓慢旋转。
 * 旋臂星云在启动时烘焙成一张贴图，之后每帧只是一个带贴图的平面 + 一组点，几乎零开销；
 * 切换配色（src/data/themes.js 的 disc 字段）时复用同一个材质重新烘焙，并给星点重新着色。
 */
const ARMS = 3;
const PITCH = 0.3; // 旋臂倾角（弧度）
const R0 = 5.5;
const HALF = 135; // 圆盘半径（世界单位）

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// 烘焙：输出值放大到接近 0..1 以提高 8 位贴图精度，显示时再乘回 uIntensity
const HAZE_FRAG = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uArm;
uniform vec3 uOuter;
uniform vec3 uHaze;
uniform vec3 uKnot;
uniform float uCoreGain;
uniform float uHazeMix;
uniform float uKnotGain;
uniform vec4 uBar;
uniform float uHalf;
uniform float uR0;
uniform float uTanPitch;
varying vec2 vUv;
// 轻量 2D value noise（比 3D simplex 编译快得多，柔和云纹足够用）
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vfbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(7.1, 3.7);
    a *= 0.5;
  }
  return s / 0.9375;
}
void main() {
  vec2 p = (vUv - 0.5) * 2.0 * uHalf;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float spiral = log(max(r, 1.0) / uR0) / uTanPitch;
  float arms = 0.0;
  for (int k = 0; k < ARMS; k++) {
    float d = ang - spiral - float(k) * 6.2831853 / float(ARMS);
    d = mod(d + 3.14159265, 6.2831853) - 3.14159265;
    float w = 0.3 + r * 0.0032;
    arms += exp(-d * d / (w * w));
  }
  float n = vfbm(p * 0.05 + 1.7);
  float n2 = vfbm(p * 0.15 + 9.3);
  float disk = smoothstep(uHalf, uHalf * 0.3, r);
  float armFade = smoothstep(9.0, 26.0, r);
  float lanes = smoothstep(0.56, 0.8, n2);
  float dust = arms * armFade * (0.25 + 0.75 * n) * disk * (1.0 - lanes * 0.65);
  vec3 tint = mix(uArm, uOuter, smoothstep(16.0, 100.0, r));
  vec3 col = tint * dust;
  col += mix(tint, uHaze, uHazeMix) * disk * n * 0.1 * smoothstep(4.0, 20.0, r);
  // 旋臂上的发射星云团块（HII 区）
  if (uKnotGain > 0.0) {
    float kn = vnoise(p * 0.8 + 5.3) * 0.6 + vnoise(p * 2.1 + 1.9) * 0.4;
    float knot = smoothstep(0.64, 0.9, kn);
    col += uKnot * knot * knot * arms * armFade * disk * (1.0 - lanes * 0.5) * uKnotGain;
  }
  col += uCore * exp(-r * r / 260.0) * uCoreGain;
  // 中央棒（银河系是棒旋星系）：uBar = (强度, 半长, 半宽, 方位角)
  if (uBar.x > 0.0) {
    vec2 q = vec2(p.x * cos(uBar.w) + p.y * sin(uBar.w), p.y * cos(uBar.w) - p.x * sin(uBar.w));
    col += uCore * exp(-(q.x * q.x) / (uBar.y * uBar.y) - (q.y * q.y) / (uBar.z * uBar.z)) * uBar.x;
  }
  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
}
`;

const PLANE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// uCoreBoost = (倍数, 半径)：只提亮盘心（贴图是 8 位的，核球想要真正发亮只能在显示时加）
const PLANE_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uIntensity;
uniform vec2 uCoreBoost;
uniform float uDim;
uniform float uFade;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(uMap, vUv).rgb;
  float r = length(vUv - 0.5) * ${(HALF * 2).toFixed(1)};
  float boost = 1.0 + uCoreBoost.x * exp(-r * r / (2.0 * uCoreBoost.y * uCoreBoost.y));
  gl_FragColor = vec4(c * uIntensity * boost * mix(1.0, 0.45, uDim) * uFade, 1.0);
}
`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.65 + 0.35 * sin(uTime * (0.6 + aPhase * 1.5) + aPhase * 30.0);
  vColor = aColor * tw;
  gl_PointSize = clamp(aSize * uPixelRatio * (240.0 / -mv.z), 0.0, 5.0 * uPixelRatio);
}
`;

const STAR_FRAG = /* glsl */ `
uniform float uDim;
uniform float uFade;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * a * a * mix(1.0, 0.4, uDim) * uFade, 1.0);
}
`;

const gaussian = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

export async function createGalaxy(renderer, { quality = 'high', pixelRatio = 1, theme } = {}) {
  // ---------- 1. 烘焙旋臂星云贴图（切换配色时复用材质重新烘焙，不重新编译） ----------
  const size = quality === 'low' ? 1024 : 2048;
  const rt = new WebGLRenderTarget(size, size, {
    type: UnsignedByteType,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  });
  rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const bakeScene = new Scene();
  const bakeCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bu = {
    uCore: { value: new Color() },
    uArm: { value: new Color() },
    uOuter: { value: new Color() },
    uHaze: { value: new Color() },
    uKnot: { value: new Color() },
    uCoreGain: { value: 0 },
    uHazeMix: { value: 0 },
    uKnotGain: { value: 0 },
    uBar: { value: new Vector4() },
    uHalf: { value: HALF },
    uR0: { value: R0 },
    uTanPitch: { value: Math.tan(PITCH) },
  };
  const quad = new Mesh(
    new PlaneGeometry(2, 2),
    new ShaderMaterial({
      uniforms: bu,
      vertexShader: QUAD_VERT,
      fragmentShader: HAZE_FRAG,
      defines: { ARMS },
      depthTest: false,
      depthWrite: false,
    }),
  );
  quad.frustumCulled = false;
  bakeScene.add(quad);
  const prev = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(rt);
    const ready = renderer.compileAsync(bakeScene, bakeCam);
    renderer.setRenderTarget(prev);
    await ready;
  } catch {
    /* ignore */
  }

  function bakeDisc(d) {
    bu.uCore.value.set(d.core);
    bu.uArm.value.set(d.arm);
    bu.uOuter.value.set(d.outer);
    bu.uHaze.value.set(d.haze);
    bu.uKnot.value.set(d.knot);
    bu.uCoreGain.value = d.coreGain;
    bu.uHazeMix.value = d.hazeMix;
    bu.uKnotGain.value = d.knotGain;
    bu.uBar.value.set(...(d.bar || [0, 1, 1, 0]));
    const was = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(bakeScene, bakeCam);
    renderer.setRenderTarget(was);
  }

  const group = new Group();
  const uDim = { value: 0 };
  const uFade = { value: 1 };

  // ---------- 2. 星云平面 ----------
  const planeUniforms = { uMap: { value: rt.texture }, uIntensity: { value: 0.15 }, uCoreBoost: { value: new Vector2() }, uDim, uFade };
  const plane = new Mesh(
    new PlaneGeometry(HALF * 2, HALF * 2),
    new ShaderMaterial({
      uniforms: planeUniforms,
      vertexShader: PLANE_VERT,
      fragmentShader: PLANE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.renderOrder = -1.5;
  group.add(plane);

  // ---------- 3. 沿旋臂分布的星点 ----------
  // 烘焙空间 p = (x, -z)，旋臂角 b 对应世界坐标 x = r·cos b，z = -r·sin b
  const count = quality === 'low' ? 1600 : 3800;
  const pos = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phase = new Float32Array(count);
  const col = new Float32Array(count * 3);
  // 每颗星的「内外位置」与亮度系数，切换配色时据此重新着色
  const mixT = new Float32Array(count);
  const gain = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = 14 + Math.pow(Math.random(), 1.2) * 104;
    const k = (Math.random() * ARMS) | 0;
    const b = Math.log(r / R0) / Math.tan(PITCH) + (k * Math.PI * 2) / ARMS + gaussian() * (0.26 + r * 0.0028);
    pos[i * 3] = Math.cos(b) * r;
    pos[i * 3 + 1] = gaussian() * (0.4 + r * 0.012);
    pos[i * 3 + 2] = -Math.sin(b) * r;
    const bright = Math.random() < 0.03;
    sizes[i] = bright ? 1.8 + Math.random() * 1.2 : 0.35 + Math.pow(Math.random(), 3) * 1.1;
    phase[i] = Math.random();
    mixT[i] = Math.min(1, r / 115);
    gain[i] = bright ? 1.4 : 0.35 + Math.random() * 0.4;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new BufferAttribute(phase, 1));
  geo.setAttribute('aColor', new BufferAttribute(col, 3));
  const starMat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio }, uDim, uFade },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const stars = new Points(geo, starMat);
  stars.frustumCulled = false;
  group.add(stars);

  const inner = new Color();
  const outer = new Color();
  const c = new Color();
  function colorStars(d) {
    inner.set(d.starsIn);
    outer.set(d.starsOut);
    for (let i = 0; i < count; i++) {
      c.copy(inner).lerp(outer, mixT[i]).multiplyScalar(gain[i]);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.attributes.aColor.needsUpdate = true;
  }

  function setTheme(t) {
    bakeDisc(t.disc);
    planeUniforms.uIntensity.value = t.disc.intensity;
    planeUniforms.uCoreBoost.value.set(...(t.disc.coreBoost || [0, 1]));
    colorStars(t.disc);
  }
  setTheme(theme);

  return {
    object: group,
    setTheme,
    update(dt, t, dim, fade = 1) {
      group.rotation.y = -t * 0.006;
      starMat.uniforms.uTime.value = t;
      uDim.value = dim;
      uFade.value = fade;
    },
    setPixelRatio(pr) {
      starMat.uniforms.uPixelRatio.value = pr;
    },
  };
}
