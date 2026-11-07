import { BackSide, Color, CubeCamera, HalfFloatType, LinearFilter, Mesh, Scene, ShaderMaterial, SphereGeometry, UnsignedByteType, Vector2, Vector3, WebGLCubeRenderTarget } from 'three';
import { NOISE } from './worlds/common.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform vec3 uGlow;
uniform vec3 uMilky;
uniform vec3 uMilkyEdge;
uniform vec3 uKnot;
uniform vec3 uFloor;
uniform vec3 uBandN;
uniform vec2 uCover;
uniform vec2 uMix;
uniform float uGain;
uniform float uBand;
uniform float uHighlight;
uniform float uLanes;
uniform float uSeam;
uniform float uGlowGain;
uniform float uMilkyGain;
uniform float uKnotGain;
varying vec3 vDir;
${NOISE}
float fbm3(vec3 p) {
  return snoise(p) * 0.5 + snoise(p * 2.03 + vec3(1.7, 9.2, 3.1)) * 0.25 + snoise(p * 4.11 + vec3(5.3, 2.8, 7.7)) * 0.125;
}
void main() {
  vec3 d = normalize(vDir);
  float lat = dot(d, uBandN);
  float band = exp(-lat * lat * 7.0);
  float n1 = fbm(d * 1.8 + 3.0);
  float n2 = fbm(d * 3.6 + n1 * 1.6);
  float n3 = fbm(d * 7.5 + n2);
  float clouds = smoothstep(uCover.x, uCover.y, n2 * 0.55 + band * uBand + n3 * 0.15);
  // 两种大尺度星云色。uSeam 让两色交界处变暗（像隔开两团气体的尘埃），
  // 避免两种颜色直接混出发灰、发浑的中间色
  float t = smoothstep(uMix.x, uMix.y, n1);
  vec3 col = mix(uA, uB, t) * (1.0 - uSeam * 4.0 * t * (1.0 - t));
  col = mix(col, uC, smoothstep(0.2, 0.8, n3) * uHighlight);
  vec3 outc = col * clouds * uGain;
  float lanes = smoothstep(0.1, 0.5, fbm(d * 5.0 + 11.0));
  float rift = 1.0 - lanes * band * uLanes;
  outc *= rift;
  outc += uGlow * pow(band, 6.0) * uGlowGain * (0.5 + n2);
  // 银河带的弥漫星光：窄而亮的主带 + 宽而淡的外晕，沿银河方向缓慢起伏，
  // 中央一条柔和、时断时续的暗缝；主带偏暖、外晕偏冷。只用大尺度噪声，干净不发糊
  if (uMilkyGain > 0.0) {
    float core = pow(band, 6.0);
    float halo = pow(band, 1.8);
    float along = 0.45 + 0.55 * smoothstep(-0.5, 0.5, n1);
    float riftC = exp(-pow((lat + 0.03 * n1) / 0.032, 2.0)) * smoothstep(-0.35, 0.35, n2);
    float lum = (core * 0.85 + halo * 0.22) * along * (1.0 - riftC * 0.6);
    outc += mix(uMilkyEdge, uMilky, smoothstep(0.05, 0.7, core)) * lum * uMilkyGain;
  }
  // 发射星云团块（HII 区）：沿银河带零星分布，边缘柔和
  if (uKnotGain > 0.0) {
    float k = fbm3(d * 7.0 + 23.0) + n3 * 0.3;
    float knots = smoothstep(0.3, 0.75, k);
    knots *= knots * smoothstep(0.25, 0.8, band) * (0.55 + 0.45 * smoothstep(-0.3, 0.5, n2));
    outc += uKnot * knots * uKnotGain * (0.5 + 0.5 * rift);
  }
  outc += uFloor;
  gl_FragColor = vec4(outc, 1.0);
}
`;

const FACES = 6;

/**
 * 程序化星云：烘焙进立方体贴图作为场景背景，之后每帧零开销。
 * 切换配色时复用同一个材质与贴图重新烘焙（不重新编译 shader）；
 * renderFace 可把 6 个面分摊到多帧，避免切换时卡顿。
 */
export async function createNebula(renderer, { quality, floatOk = true, theme }) {
  const size = quality === 'low' ? 512 : 1024;
  const rt = new WebGLCubeRenderTarget(size, { type: floatOk ? HalfFloatType : UnsignedByteType, generateMipmaps: false, minFilter: LinearFilter, magFilter: LinearFilter });
  const cam = new CubeCamera(0.1, 100, rt);
  const scene = new Scene();
  const u = {
    uA: { value: new Color() },
    uB: { value: new Color() },
    uC: { value: new Color() },
    uGlow: { value: new Color() },
    uMilky: { value: new Color() },
    uMilkyEdge: { value: new Color() },
    uKnot: { value: new Color() },
    uFloor: { value: new Color() },
    uBandN: { value: new Vector3(0.25, 1, 0.18).normalize() },
    uCover: { value: new Vector2() },
    uMix: { value: new Vector2() },
    uGain: { value: 0 },
    uBand: { value: 0 },
    uHighlight: { value: 0 },
    uLanes: { value: 0 },
    uSeam: { value: 0 },
    uGlowGain: { value: 0 },
    uMilkyGain: { value: 0 },
    uKnotGain: { value: 0 },
  };
  const mesh = new Mesh(
    new SphereGeometry(10, 96, 48),
    new ShaderMaterial({
      uniforms: u,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: BackSide,
      depthWrite: false,
      defines: { FBM_OCTAVES: quality === 'low' ? 4 : 6 },
    }),
  );
  scene.add(mesh);

  function setTheme(t) {
    const s = t.sky;
    u.uA.value.set(s.clouds[0]);
    u.uB.value.set(s.clouds[1]);
    u.uC.value.set(s.clouds[2]);
    u.uGlow.value.set(s.glow);
    u.uMilky.value.set(s.milky);
    u.uMilkyEdge.value.set(s.milkyEdge || s.milky);
    u.uKnot.value.set(s.knot);
    u.uFloor.value.set(s.floor);
    u.uCover.value.set(s.cover[0], s.cover[1]);
    u.uMix.value.set(...(s.mix || [-0.3, 0.6]));
    u.uGain.value = s.gain;
    u.uBand.value = s.band;
    u.uHighlight.value = s.highlight;
    u.uLanes.value = s.lanes;
    u.uSeam.value = s.seam || 0;
    u.uGlowGain.value = s.glowGain;
    u.uMilkyGain.value = s.milkyGain;
    u.uKnotGain.value = s.knotGain;
  }

  setTheme(theme);
  // 先异步编译（KHR_parallel_shader_compile），避免同步编译阻塞主线程
  try {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    const ready = renderer.compileAsync(scene, cam.children[0]);
    renderer.setRenderTarget(prev);
    await ready;
  } catch {
    /* ignore */
  }
  // 首次完整烘焙（顺带初始化 6 个子相机的朝向与矩阵）
  cam.update(renderer, scene);

  return {
    texture: rt.texture,
    faces: FACES,
    /** 用配色 t 重新烘焙第 i 个面（i = 0 时写入配色参数） */
    renderFace(t, i) {
      if (i === 0) setTheme(t);
      const prevRT = renderer.getRenderTarget();
      const prevFace = renderer.getActiveCubeFace();
      const prevMip = renderer.getActiveMipmapLevel();
      renderer.setRenderTarget(rt, i);
      renderer.render(scene, cam.children[i]);
      renderer.setRenderTarget(prevRT, prevFace, prevMip);
    },
    /** 一次性烘焙全部 6 个面 */
    bake(t) {
      setTheme(t);
      cam.update(renderer, scene);
    },
  };
}
