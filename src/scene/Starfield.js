import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Vector3 } from 'three';

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vTw;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vTw = 0.62 + 0.38 * sin(uTime * (0.5 + aPhase * 1.8) + aPhase * 40.0);
  vColor = aColor;
  gl_PointSize = aSize * uPixelRatio;
}
`;

const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vTw;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.0, d);
  float a = core * core * core;
  gl_FragColor = vec4(vColor * a * vTw, 1.0);
}
`;

const DUST_VERT = /* glsl */ `
attribute float aSize;
uniform float uPixelRatio;
uniform float uTime;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = aSize * uPixelRatio * (260.0 / -mv.z);
  gl_PointSize = clamp(s, 0.0, 7.0 * uPixelRatio);
  vA = smoothstep(4.0, 30.0, -mv.z) * (0.6 + 0.4 * sin(uTime * 0.7 + position.x));
}
`;

const DUST_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(uColor * a * a * vA, 1.0);
}
`;

const BAND_NORMAL = new Vector3(0.25, 1, 0.18).normalize();

function gaussian() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

/** 远景星空：40% 的星星集中在一条倾斜的「银河带」上 */
export function createStarfield(quality, pixelRatio) {
  const count = quality === 'low' ? 3400 : 7200;
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const col = new Float32Array(count * 3);
  const tangentA = new Vector3(1, 0, 0).cross(BAND_NORMAL).normalize();
  const tangentB = BAND_NORMAL.clone().cross(tangentA).normalize();
  const v = new Vector3();
  const tints = [new Color('#b9d2ff'), new Color('#ffffff'), new Color('#ffe2c4'), new Color('#9fc4ff'), new Color('#ffd0e8')];
  for (let i = 0; i < count; i++) {
    if (Math.random() < 0.42) {
      const a = Math.random() * Math.PI * 2;
      v.copy(tangentA).multiplyScalar(Math.cos(a)).addScaledVector(tangentB, Math.sin(a)).addScaledVector(BAND_NORMAL, gaussian() * 0.22).normalize();
    } else {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (v.lengthSq() > 1 || v.lengthSq() < 0.01) {
        i--;
        continue;
      }
      v.normalize();
    }
    const r = 700 + Math.random() * 600;
    pos[i * 3] = v.x * r;
    pos[i * 3 + 1] = v.y * r;
    pos[i * 3 + 2] = v.z * r;
    const bright = Math.random() < 0.035;
    size[i] = bright ? 3.2 + Math.random() * 2.6 : 0.9 + Math.pow(Math.random(), 2.5) * 2.0;
    phase[i] = Math.random();
    const tint = tints[(Math.random() * tints.length) | 0];
    const intensity = bright ? 2.2 + Math.random() * 1.5 : 0.55 + Math.random() * 0.75;
    col[i * 3] = tint.r * intensity;
    col[i * 3 + 1] = tint.g * intensity;
    col[i * 3 + 2] = tint.b * intensity;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new BufferAttribute(phase, 1));
  geo.setAttribute('aColor', new BufferAttribute(col, 3));
  const mat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -2;
  return {
    object: points,
    update(t) {
      mat.uniforms.uTime.value = t;
    },
    setPixelRatio(pr) {
      mat.uniforms.uPixelRatio.value = pr;
    },
  };
}

/** 近景星尘：转动镜头时提供视差 */
export function createDust(quality, pixelRatio) {
  const count = quality === 'low' ? 380 : 900;
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.pow(Math.random(), 0.7) * 150;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 50;
    pos[i * 3 + 2] = Math.sin(a) * r;
    size[i] = 0.25 + Math.random() * 0.6;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new BufferAttribute(size, 1));
  const mat = new ShaderMaterial({
    uniforms: { uPixelRatio: { value: pixelRatio }, uTime: { value: 0 }, uColor: { value: new Color('#7fb8ff').multiplyScalar(0.55) } },
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  return {
    object: points,
    update(dt, t) {
      points.rotation.y += dt * 0.004;
      mat.uniforms.uTime.value = t;
    },
    setPixelRatio(pr) {
      mat.uniforms.uPixelRatio.value = pr;
    },
  };
}
