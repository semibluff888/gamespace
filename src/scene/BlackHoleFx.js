import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { Color, Matrix4, Uniform, Vector3 } from 'three';

/**
 * 中心黑洞（后期效果）：对黑洞附近的每个像素做光线步进，按史瓦西度规近似弯折光线
 * （x'' = -1.5·h²·x / r⁵，单位：史瓦西半径 = 1），沿弯折后的光线：
 *  - 穿过赤道面时采样吸积盘（开普勒较差自转的纹理、相对论性多普勒增亮、引力红移）
 *  - 落入视界的光线为黑色（阴影）
 *  - 逃逸的光线回到屏幕上取已经渲染好的画面：按偏折角把取样点往黑洞方向挪（星系核就在黑洞旁边，
 *    不能当成无穷远的背景，否则整片核球会被扫成一个大光环，所以位移乘一个距离系数 uLensK）；
 *    偏折很大的光线（贴着光子球绕过来的）取天空立方体贴图
 * 前景（比黑洞更近的星球）不受影响。只处理黑洞影响范围内的像素，其余像素原样输出。
 */
const R_INF = 22; // 影响半径（史瓦西半径的倍数）：引力在这里平滑地减到 0，保证边缘无缝

const FRAG = /* glsl */ `
uniform vec3 uCamPos;
uniform mat4 uCamWorld;
uniform mat4 uProjInv;
uniform mat4 uViewProj;
uniform vec3 uCenter;
uniform float uScale;
uniform vec3 uScreen;
uniform float uFront;
uniform samplerCube uSky;
uniform float uSkyK;
uniform float uTime;
uniform float uDisk;
uniform vec3 uHot;
uniform vec3 uCool;
uniform float uLensK;
uniform float uFovY;

#define R_IN 2.6
#define R_OUT 9.5
#define R_INF ${R_INF.toFixed(1)}

float bhHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// 值噪声，x 方向以 period 为周期（绕盘一圈无接缝）
float bhNoise(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, period);
  float x1 = mod(i.x + 1.0, period);
  float a = bhHash(vec2(x0, i.y));
  float b = bhHash(vec2(x1, i.y));
  float c = bhHash(vec2(x0, i.y + 1.0));
  float d = bhHash(vec2(x1, i.y + 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// 吸积盘：rgb = 发光，a = 不透明度
vec4 bhDisk(vec3 q, vec3 dir) {
  float r = length(q.xz);
  if (r < R_IN || r > R_OUT) return vec4(0.0);
  float x = (r - R_IN) / (R_OUT - R_IN);
  // 内缘最亮、向外柔和地变暗
  float prof = smoothstep(0.0, 0.05, x) * pow(1.0 - x, 1.7) * pow(R_IN / r, 1.1);
  // 较差自转的细丝纹理（内圈转得快）
  float phi = atan(q.z, q.x);
  float u = (phi + uTime * 2.4 * pow(r, -1.5)) / 6.2831853;
  float n = bhNoise(vec2(u * 48.0, r * 2.6), 48.0) * 0.55 + bhNoise(vec2(u * 112.0, r * 6.5), 112.0) * 0.3 + bhNoise(vec2(u * 240.0, r * 13.0), 240.0) * 0.15;
  float streak = mix(0.45, 1.35, n);
  // 相对论性多普勒增亮（迎面转来的一侧更亮、更白）+ 引力红移
  vec3 tang = normalize(vec3(q.z, 0.0, -q.x));
  float beta = 0.8 * sqrt(0.5 / (r - 1.0));
  float gam = inversesqrt(1.0 - beta * beta);
  float g = sqrt(1.0 - 1.0 / r) / (gam * (1.0 - beta * dot(tang, -dir)));
  float boost = g * g * g;
  float heat = clamp(prof * 1.25 * g * g, 0.0, 1.0);
  vec3 col = mix(uCool, uHot, heat) * prof * streak * boost * uDisk * 4.6;
  float a = clamp(prof * 2.4 * streak, 0.0, 0.93);
  return vec4(col, a);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 d = (uv - uScreen.xy) * vec2(aspect, 1.0);
  if (uScreen.z <= 0.0 || dot(d, d) > uScreen.z * uScreen.z) {
    outputColor = inputColor;
    return;
  }
  // 比黑洞更近的东西（例如挡在前面的星球）不弯折
  if (-getViewZ(depth) < uFront) {
    outputColor = inputColor;
    return;
  }

  vec4 vp = uProjInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(mat3(uCamWorld) * (vp.xyz / vp.w));
  vec3 ro = (uCamPos - uCenter) / uScale;

  float b = dot(ro, rd);
  float c = dot(ro, ro) - R_INF * R_INF;
  float disc = b * b - c;
  if (disc <= 0.0) {
    outputColor = inputColor;
    return;
  }
  vec3 p = ro + rd * max(-b - sqrt(disc), 0.0);
  vec3 v = rd;
  vec3 lm = cross(p, v);
  float h2 = dot(lm, lm);

  vec3 col = vec3(0.0);
  float alpha = 0.0;
  bool captured = false;
  for (int i = 0; i < STEPS; i++) {
    float r = length(p);
    float stepLen = clamp(0.09 * (r - 0.85), 0.018, 1.2);
    float dt = stepLen / length(v);
    vec3 prev = p;
    // 蛙跳积分；引力在影响半径边缘平滑地减为 0
    float r5 = r * r * r * r * r;
    v -= 1.5 * h2 * p / r5 * (1.0 - smoothstep(R_INF * 0.45, R_INF, r)) * dt * 0.5;
    p += v * dt;
    float r1 = length(p);
    float r15 = r1 * r1 * r1 * r1 * r1;
    v -= 1.5 * h2 * p / r15 * (1.0 - smoothstep(R_INF * 0.45, R_INF, r1)) * dt * 0.5;

    if (prev.y * p.y <= 0.0) {
      vec3 q = mix(prev, p, prev.y / (prev.y - p.y + 1e-6));
      vec4 s = bhDisk(q, normalize(v));
      col += (1.0 - alpha) * s.rgb * s.a;
      alpha += (1.0 - alpha) * s.a;
    }
    if (r1 < 1.0) {
      captured = true;
      break;
    }
    if ((r1 > R_INF && dot(p, v) > 0.0) || alpha > 0.995) break;
  }

  vec3 bg = vec3(0.0);
  if (!captured) {
    vec3 dir = normalize(v);
    float bend = acos(clamp(dot(rd, dir), -1.0, 1.0));
    // 点质量透镜：像点 θ 对应的源在 θ - k·α（朝黑洞方向挪），过了中心就是另一侧的次像
    float rl = length(d);
    vec2 src = d - (d / max(rl, 1e-5)) * (uLensK * bend / uFovY);
    vec2 suv = uScreen.xy + src / vec2(aspect, 1.0);
    vec2 m = smoothstep(vec2(0.0), vec2(0.03), suv) * smoothstep(vec2(0.0), vec2(0.03), 1.0 - suv);
    vec3 sky = textureCube(uSky, dir).rgb * uSkyK;
    vec3 near = mix(sky, texture2D(inputBuffer, clamp(suv, 0.0, 1.0)).rgb, m.x * m.y);
    bg = mix(near, sky, smoothstep(0.6, 1.5, bend));
  }
  outputColor = vec4(col + (1.0 - alpha) * bg, inputColor.a);
}
`;

const STEPS = { high: 180, medium: 130, low: 90 };

export class BlackHoleFx extends Effect {
  constructor(camera, { quality = 'high', scale = 0.5 } = {}) {
    super('BlackHoleFx', FRAG, {
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      blendFunction: BlendFunction.SET,
      defines: new Map([['STEPS', String(STEPS[quality] || STEPS.high)]]),
      uniforms: new Map([
        ['uCamPos', new Uniform(new Vector3())],
        ['uCamWorld', new Uniform(new Matrix4())],
        ['uProjInv', new Uniform(new Matrix4())],
        ['uViewProj', new Uniform(new Matrix4())],
        ['uCenter', new Uniform(new Vector3())],
        ['uScale', new Uniform(scale)],
        ['uScreen', new Uniform(new Vector3(0.5, 0.5, 0))],
        ['uFront', new Uniform(0)],
        ['uSky', new Uniform(null)],
        ['uSkyK', new Uniform(1)],
        ['uTime', new Uniform(0)],
        ['uDisk', new Uniform(0.15)],
        ['uHot', new Uniform(new Color('#fff4e2'))],
        ['uCool', new Uniform(new Color('#ff8c42'))],
        ['uLensK', new Uniform(0.1)],
        ['uFovY', new Uniform(0.87)],
      ]),
    });
    this.camera = camera;
    this.center = this.uniforms.get('uCenter').value;
    this._v = new Vector3();
    this._f = new Vector3();
  }

  get influence() {
    return R_INF * this.uniforms.get('uScale').value;
  }

  setQuality(quality) {
    const n = String(STEPS[quality] || STEPS.high);
    if (this.defines.get('STEPS') !== n) {
      this.defines.set('STEPS', n);
      this.setChanged();
    }
  }

  setSky(texture) {
    this.uniforms.get('uSky').value = texture;
  }

  /** 每帧由信标更新：吸积盘亮度、时间、天空亮度（切换配色时淡入淡出） */
  setState({ disk, time, skyK }) {
    const u = this.uniforms;
    if (disk != null) u.get('uDisk').value = disk;
    if (time != null) u.get('uTime').value = time;
    if (skyK != null) u.get('uSkyK').value = skyK;
  }

  setColors({ hot, cool }) {
    const u = this.uniforms;
    u.get('uHot').value.set(hot);
    u.get('uCool').value.set(cool);
  }

  update() {
    const cam = this.camera;
    const u = this.uniforms;
    u.get('uCamPos').value.setFromMatrixPosition(cam.matrixWorld);
    u.get('uCamWorld').value.copy(cam.matrixWorld);
    u.get('uProjInv').value.copy(cam.projectionMatrixInverse);
    u.get('uViewProj').value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    u.get('uFovY').value = (cam.fov * Math.PI) / 180;

    // 屏幕上的影响范围（不在范围内的像素直接跳过）
    const camPos = u.get('uCamPos').value;
    const to = this._v.copy(this.center).sub(camPos);
    const dist = to.length();
    const R = this.influence;
    const fwd = cam.getWorldDirection(this._f);
    const along = to.dot(fwd);
    const screen = u.get('uScreen').value;
    if (dist <= R * 1.05) {
      screen.set(0.5, 0.5, 10);
    } else if (along <= -R) {
      screen.set(0.5, 0.5, 0);
    } else {
      const p = this._v.copy(this.center).project(cam);
      const ang = Math.asin(R / dist);
      const halfFov = (cam.fov * Math.PI) / 360;
      const r = (Math.tan(ang) / Math.tan(halfFov)) * 0.5 * 1.35;
      // 黑洞中心在镜头后方但影响球与视野相交（极少见）：整屏处理
      screen.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5, along > 0 ? r : 10);
    }
    u.get('uFront').value = Math.max(0, along - R);
  }
}
