import { Color, Vector3 } from 'three';

/** 3D simplex noise（Ashima Arts / Ian McEwan, MIT）+ fbm + cellular + hash */
export const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
#ifndef FBM_OCTAVES
#define FBM_OCTAVES 5
#endif
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < FBM_OCTAVES; i++) {
    s += a * snoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
vec2 cellular(vec3 p) {
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 r = g + hash33(ip + g) - fp;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return sqrt(vec2(f1, f2));
}
`;

export const LIGHT = /* glsl */ `
float wrapDiffuse(vec3 n, vec3 l, float w) { return max((dot(n, l) + w) / (1.0 + w), 0.0); }
float fresnelTerm(vec3 n, vec3 v, float p) { return pow(1.0 - clamp(dot(n, v), 0.0, 1.0), p); }
`;

/** 星球通用顶点着色器（可选切片故障位移） */
export const PLANET_VERT = /* glsl */ `
uniform float uTime;
uniform float uGlitch;
varying vec3 vObj;
varying vec3 vNw;
varying vec3 vPw;
float vhash(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
void main() {
  vObj = normalize(position);
  vec3 pos = position;
  if (uGlitch > 0.001) {
    float band = floor(vObj.y * 9.0 + floor(uTime * 28.0) * 3.0);
    float on = step(0.55, vhash(band + 7.0));
    pos.x += (vhash(band) - 0.5) * uGlitch * length(position) * 0.35 * on;
  }
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vPw = wp.xyz;
  vNw = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/** 平面（光环 / 赛道）顶点着色器：输出环面内的局部坐标 */
export const RING_VERT = /* glsl */ `
varying vec2 vLocal;
varying vec3 vNw;
varying vec3 vPw;
void main() {
  vLocal = position.xy;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPw = wp.xyz;
  vNw = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/** 每个世界共享的 uniform（同一对象被该世界所有材质引用，更新一次即可） */
export function sharedUniforms() {
  return {
    uTime: { value: 0 },
    uHover: { value: 0 },
    uFocus: { value: 0 },
    uDim: { value: 0 },
    uGlitch: { value: 0 },
    uScan: { value: 0 },
    uLightDir: { value: new Vector3(0, 0.4, 1).normalize() },
  };
}

export const color = (hex) => new Color(hex);

export function sphereSegments(quality) {
  return quality === 'low' ? [64, 40] : [112, 72];
}

export function fbmDefine(quality) {
  return { FBM_OCTAVES: quality === 'low' ? 3 : 5 };
}
