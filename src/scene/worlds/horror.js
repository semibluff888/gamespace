import { Group, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { LIGHT, NOISE, PLANET_VERT, color, fbmDefine, sphereSegments } from './common.js';

/** RAINROT：暗青色星球 + 雨云 + 随机雷闪 + 一盏始终亮着（偶尔闪烁）的病区灯 + 游移的手电光 */
const PLANET_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHover;
uniform float uDim;
uniform float uGlitch;
uniform vec3 uLightDir;
uniform vec3 uDeep;
uniform vec3 uTeal;
uniform vec3 uLamp;
uniform vec3 uBolt;
uniform vec3 uWardDir;
uniform float uWard;
uniform vec3 uTorchDir;
uniform float uFlash;
uniform vec3 uFlashDir;
varying vec3 vObj;
varying vec3 vNw;
varying vec3 vPw;
${NOISE}
${LIGHT}
void main() {
  vec3 p = vObj;
  vec3 n = normalize(vNw);
  vec3 v = normalize(cameraPosition - vPw);
  float diff = wrapDiffuse(n, uLightDir, 0.15);

  float h = fbm(p * 2.6);
  float h2 = fbm(p * 8.0 + h * 1.5);
  vec3 base = mix(uDeep, uTeal, smoothstep(-0.35, 0.55, h)) * (0.8 + 0.35 * h2);
  // 零星的窗灯（大多数已经熄灭）
  vec3 cell = floor(p * 70.0);
  float win = step(0.996, hash12(cell.xy + cell.z * 17.0)) * smoothstep(0.1, 0.4, h);

  vec3 col = base * (0.05 + 0.6 * diff);
  float torch = smoothstep(0.972, 0.996, dot(p, uTorchDir));
  col += uLamp * torch * 0.07 * (0.35 + diff);
  col += uLamp * win * 0.6;

  float wd = distance(p, uWardDir);
  col += uLamp * (exp(-wd * wd * 1800.0) * 5.0 + exp(-wd * wd * 90.0) * 0.35) * uWard;

  float fd = distance(p, uFlashDir);
  col += uBolt * uFlash * (0.12 + 1.1 * exp(-fd * 2.4)) * (0.3 + 0.7 * diff);

  col += uTeal * 1.6 * fresnelTerm(n, v, 2.8) * (0.55 + 0.5 * uHover);
  col.r += uGlitch * 0.35 * step(0.6, hash11(floor(p.y * 40.0) + floor(uTime * 30.0)));
  col *= mix(1.0, 0.28, uDim);
  gl_FragColor = vec4(col, 1.0);
}
`;

const CLOUD_FRAG = /* glsl */ `
uniform float uTime;
uniform float uDim;
uniform float uHover;
uniform vec3 uLightDir;
uniform vec3 uCloud;
uniform vec3 uBolt;
uniform float uFlash;
uniform vec3 uFlashDir;
varying vec3 vObj;
varying vec3 vNw;
varying vec3 vPw;
${NOISE}
${LIGHT}
void main() {
  vec3 p = vObj;
  vec3 n = normalize(vNw);
  vec3 v = normalize(cameraPosition - vPw);
  float c1 = fbm(p * 2.8 + vec3(uTime * 0.025, 0.0, uTime * 0.018));
  float c2 = fbm(p * 6.5 - vec3(0.0, uTime * 0.04, 0.0));
  float clouds = smoothstep(-0.05, 0.6, c1 * 0.75 + c2 * 0.35);
  float diff = wrapDiffuse(n, uLightDir, 0.2);
  float fd = distance(p, uFlashDir);
  vec3 col = uCloud * (0.18 + 0.55 * diff);
  col += uBolt * uFlash * (exp(-fd * 3.2) * 2.4 + 0.25);
  float rim = fresnelTerm(n, v, 2.0);
  float alpha = clouds * (0.82 - rim * 0.35);
  col *= mix(1.0, 0.28, uDim);
  gl_FragColor = vec4(col, alpha);
}
`;

const randDir = () => new Vector3(Math.random() * 2 - 1, Math.random() * 1.4 - 0.7, Math.random() * 2 - 1).normalize();

export function createHorror(ctx) {
  const { radius: r, quality, shared } = ctx;
  const [deep, teal, lamp] = ctx.palette || ['#05181a', '#14423c', '#ffcf7a'];
  const group = new Group();
  const uFlash = { value: 0 };
  const uFlashDir = { value: randDir() };
  const uBolt = { value: color('#bfe6ff') };
  const uWard = { value: 1 };
  const uTorchDir = { value: new Vector3(1, 0, 0) };
  const [ws, hs] = sphereSegments(quality);

  const planet = new Mesh(
    new SphereGeometry(r, ws, hs),
    new ShaderMaterial({
      uniforms: {
        ...shared,
        uDeep: { value: color(deep) },
        uTeal: { value: color(teal) },
        uLamp: { value: color(lamp) },
        uBolt,
        uWardDir: { value: new Vector3(0.42, 0.36, 0.83).normalize() },
        uWard,
        uTorchDir,
        uFlash,
        uFlashDir,
      },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      defines: fbmDefine(quality),
    }),
  );
  group.add(planet);

  const clouds = new Mesh(
    new SphereGeometry(r * 1.045, ws, hs),
    new ShaderMaterial({
      uniforms: { ...shared, uCloud: { value: color('#22383b') }, uBolt, uFlash, uFlashDir },
      vertexShader: PLANET_VERT,
      fragmentShader: CLOUD_FRAG,
      defines: fbmDefine(quality),
      transparent: true,
      depthWrite: false,
    }),
  );
  group.add(clouds);

  let nextFlash = 2 + Math.random() * 4;
  let flashT = -1;
  let wardDipUntil = 0;
  let nextWardDip = 3 + Math.random() * 5;

  return {
    group,
    spinTarget: planet,
    update(dt, t, s) {
      clouds.rotation.y += dt * 0.035;
      uTorchDir.value.set(Math.cos(t * 0.21) * 0.85, Math.sin(t * 0.33) * 0.45, Math.sin(t * 0.21) * 0.85).normalize();

      // 雷闪：两次快速闪烁
      if (flashT < 0 && t > nextFlash) {
        flashT = 0;
        uFlashDir.value.copy(randDir());
      }
      if (flashT >= 0) {
        flashT += dt;
        const f = Math.exp(-flashT * 16) + 0.75 * Math.exp(-Math.abs(flashT - 0.14) * 28);
        uFlash.value = Math.min(1.4, f);
        if (flashT > 0.6) {
          flashT = -1;
          uFlash.value = 0;
          nextFlash = t + 3.5 + Math.random() * 6 - s.hover * 2;
        }
      }

      // 病区灯偶尔像坏掉的日光灯一样闪
      if (t > nextWardDip) {
        wardDipUntil = t + 0.06 + Math.random() * 0.12;
        nextWardDip = t + (Math.random() < 0.4 ? 0.15 : 2 + Math.random() * 6);
      }
      uWard.value = t < wardDipUntil ? 0.15 : 1;
    },
  };
}
