import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Vector3 } from 'three';

// 亮星衍射芒：点精灵放大 SPIKE_SCALE 倍，星核在精灵里保持原来的像素大小，多出来的面积画芒线。
// 只给全天最亮的少数几颗（配色里的 spikeCount），并且它们不闪烁：太空望远镜拍到的星星不会「眨眼」
const SPIKE_SCALE = 5.5;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
attribute float aSpike;
uniform float uTime;
uniform float uPixelRatio;
uniform float uSpikes;
uniform float uTwinkle;
varying vec3 vColor;
varying float vTw;
varying float vScale;
varying float vPx;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float spiked = uSpikes > 0.5 ? aSpike : 0.0;
  float tw = 0.62 + 0.38 * sin(uTime * (0.5 + aPhase * 1.8) + aPhase * 40.0);
  vTw = mix(1.0, tw, uTwinkle * (1.0 - spiked));
  vColor = aColor;
  vScale = 1.0 + spiked * (${SPIKE_SCALE.toFixed(1)} - 1.0);
  vPx = aSize * uPixelRatio * vScale;
  gl_PointSize = vPx;
}
`;

const STAR_FRAG = /* glsl */ `
uniform float uFade;
uniform float uSpikes;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vTw;
varying float vScale;
varying float vPx;
// 一条穿过中心的芒线：横向高斯、纵向向外衰减
float spike(vec2 p, vec2 dir, float w, float len) {
  float along = abs(dot(p, dir));
  float across = abs(p.x * dir.y - p.y * dir.x);
  float fall = max(0.0, 1.0 - along / len);
  return exp(-across * across / (w * w)) * fall * fall * fall;
}
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * vScale;
  float core = smoothstep(0.5, 0.0, d);
  float a = core * core * core;
  if (vScale > 1.5) {
    float w = 0.62 * uPixelRatio / vPx;
    float s;
    if (uSpikes > 5.0) {
      // 六芒（竖直一对 + 两对斜向）+ 一对较短较暗的水平芒
      s = spike(p, vec2(0.0, 1.0), w, 0.5) + spike(p, vec2(0.866, 0.5), w, 0.5) + spike(p, vec2(0.866, -0.5), w, 0.5)
        + 0.45 * spike(p, vec2(1.0, 0.0), w * 0.8, 0.3);
    } else {
      // 十字芒
      s = spike(p, vec2(0.0, 1.0), w, 0.5) + spike(p, vec2(1.0, 0.0), w, 0.5);
    }
    a += s * 0.36;
  }
  gl_FragColor = vec4(vColor * a * vTw * uFade, 1.0);
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
uniform float uFade;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(uColor * a * a * vA * uFade, 1.0);
}
`;

const BAND_NORMAL = new Vector3(0.25, 1, 0.18).normalize();

function gaussian() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

/** 远景星空：40% 的星星集中在一条倾斜的「银河带」上；颜色与衍射芒随配色切换 */
export function createStarfield(quality, pixelRatio, theme) {
  const count = quality === 'low' ? 3400 : 7200;
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const col = new Float32Array(count * 3);
  const spikeFlag = new Float32Array(count);
  // 每颗星的随机数：pick 决定星色，intensity 决定亮度；切换配色时只重新映射颜色
  const pick = new Float32Array(count);
  const intensity = new Float32Array(count);
  const tangentA = new Vector3(1, 0, 0).cross(BAND_NORMAL).normalize();
  const tangentB = BAND_NORMAL.clone().cross(tangentA).normalize();
  const v = new Vector3();
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
    pick[i] = Math.random();
    intensity[i] = bright ? 2.2 + Math.random() * 1.5 : 0.55 + Math.random() * 0.75;
  }
  // 按大小排序：衍射芒只给最亮的那几颗
  const bySize = Array.from({ length: count }, (_, i) => i).sort((a, b) => size[b] - size[a]);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new BufferAttribute(phase, 1));
  geo.setAttribute('aColor', new BufferAttribute(col, 3));
  geo.setAttribute('aSpike', new BufferAttribute(spikeFlag, 1));
  const mat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio }, uFade: { value: 1 }, uSpikes: { value: 0 }, uTwinkle: { value: 1 } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -2;

  const palette = [];
  function setTheme(t) {
    const tints = t.stars.tints;
    const total = tints.reduce((s, [, w]) => s + w, 0) || 1;
    palette.length = 0;
    let acc = 0;
    for (const [hex, w] of tints) {
      acc += w / total;
      palette.push({ c: new Color(hex), upTo: acc });
    }
    for (let i = 0; i < count; i++) {
      const tint = (palette.find((p) => pick[i] < p.upTo) || palette[palette.length - 1]).c;
      col[i * 3] = tint.r * intensity[i];
      col[i * 3 + 1] = tint.g * intensity[i];
      col[i * 3 + 2] = tint.b * intensity[i];
    }
    geo.attributes.aColor.needsUpdate = true;
    const spikes = t.stars.spikes || 0;
    const spikeCount = spikes ? (t.stars.spikeCount ?? 12) : 0;
    spikeFlag.fill(0);
    for (let k = 0; k < spikeCount && k < count; k++) spikeFlag[bySize[k]] = 1;
    geo.attributes.aSpike.needsUpdate = true;
    mat.uniforms.uSpikes.value = spikes;
    mat.uniforms.uTwinkle.value = t.stars.twinkle ?? 1;
  }
  setTheme(theme);

  return {
    object: points,
    setTheme,
    update(t, fade = 1) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uFade.value = fade;
    },
    setPixelRatio(pr) {
      mat.uniforms.uPixelRatio.value = pr;
    },
  };
}

/** 近景星尘：转动镜头时提供视差 */
export function createDust(quality, pixelRatio, theme) {
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
    uniforms: { uPixelRatio: { value: pixelRatio }, uTime: { value: 0 }, uFade: { value: 1 }, uColor: { value: new Color() } },
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  function setTheme(t) {
    mat.uniforms.uColor.value.set(t.dust).multiplyScalar(0.55);
  }
  setTheme(theme);
  return {
    object: points,
    setTheme,
    update(dt, t, fade = 1) {
      points.rotation.y += dt * 0.004;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uFade.value = fade;
    },
    setPixelRatio(pr) {
      mat.uniforms.uPixelRatio.value = pr;
    },
  };
}
