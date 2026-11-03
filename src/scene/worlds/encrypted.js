import { EdgesGeometry, Group, IcosahedronGeometry, LineBasicMaterial, LineSegments, Mesh, ShaderMaterial, SphereGeometry, AdditiveBlending } from 'three';
import { LIGHT, NOISE, PLANET_VERT, sphereSegments } from './common.js';

/** 加密信号（未公开新作）：静电噪点球 + 闪烁线框 */
const FRAG = /* glsl */ `
uniform float uTime;
uniform float uHover;
uniform float uDim;
uniform vec3 uLightDir;
varying vec3 vObj;
varying vec3 vNw;
varying vec3 vPw;
${NOISE}
${LIGHT}
void main() {
  vec3 n = normalize(vNw);
  vec3 v = normalize(cameraPosition - vPw);
  float diff = wrapDiffuse(n, uLightDir, 0.3);
  float frame = floor(uTime * 18.0);
  float stat = hash12(floor(gl_FragCoord.xy / 2.0) + frame * 13.1);
  float bands = step(0.5, fract(vObj.y * 10.0 - uTime * 0.6));
  float tear = step(0.965, hash11(floor(vObj.y * 34.0) + frame));
  vec3 col = vec3(0.42, 0.46, 0.52) * (0.1 + stat * 0.42) * (0.35 + 0.65 * diff);
  col *= 0.85 + 0.15 * bands;
  col += vec3(0.75, 0.8, 0.9) * tear * 0.5;
  col += vec3(0.7, 0.75, 0.85) * fresnelTerm(n, v, 2.4) * (0.5 + 0.6 * uHover);
  col *= mix(1.0, 0.3, uDim);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createEncrypted(ctx) {
  const { radius: r, quality, shared } = ctx;
  const group = new Group();
  const [ws, hs] = sphereSegments(quality);
  const planet = new Mesh(
    new SphereGeometry(r * 0.9, ws, hs),
    new ShaderMaterial({ uniforms: { ...shared }, vertexShader: PLANET_VERT, fragmentShader: FRAG }),
  );
  group.add(planet);

  const wireMat = new LineBasicMaterial({ color: 0xb9c2d0, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false });
  const wire = new LineSegments(new EdgesGeometry(new IcosahedronGeometry(r * 1.35, 1)), wireMat);
  group.add(wire);

  let flickerUntil = 0;
  let next = 0.5;
  return {
    group,
    spinTarget: planet,
    update(dt, t, s) {
      wire.rotation.y += dt * 0.12;
      wire.rotation.x += dt * 0.05;
      if (t > next) {
        flickerUntil = t + 0.05 + Math.random() * 0.15;
        next = t + 0.2 + Math.random() * 1.6;
        wire.scale.setScalar(1 + (Math.random() - 0.5) * 0.08);
      }
      const base = 0.16 + 0.3 * s.hover;
      wireMat.opacity = (t < flickerUntil ? 0.06 : base) * (1 - s.dim * 0.7);
      shared.uGlitch.value = Math.max(shared.uGlitch.value, t < flickerUntil ? 0.15 : 0);
    },
  };
}
