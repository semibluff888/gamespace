import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';

const CORE_VERT = /* glsl */ `
varying vec3 vNw;
varying vec3 vPw;
varying vec3 vObj;
void main() {
  vObj = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPw = wp.xyz;
  vNw = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const CORE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uHover;
uniform float uDim;
uniform float uPulse;
varying vec3 vNw;
varying vec3 vPw;
varying vec3 vObj;
void main() {
  vec3 n = normalize(vNw);
  vec3 v = normalize(cameraPosition - vPw);
  float f = pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 1.5);
  float beat = 0.78 + 0.22 * sin(uTime * 2.2);
  float swirl = 0.5 + 0.5 * sin(vObj.y * 14.0 + uTime * 2.6 + vObj.x * 7.0);
  vec3 col = uColor * (0.45 + 2.4 * f) * beat * (0.85 + 0.3 * swirl) * (1.0 + uHover * 0.7 + uPulse * 2.0);
  gl_FragColor = vec4(col * mix(1.0, 0.4, uDim), 1.0);
}
`;

const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uDim;
uniform float uTime;
uniform float uSpeed;
varying vec2 vUv;
void main() {
  float dash = step(0.35, fract(vUv.x * 36.0 - uTime * uSpeed));
  vec3 col = uColor * (0.7 + 1.6 * dash);
  gl_FragColor = vec4(col * mix(1.0, 0.35, uDim), 1.0);
}
`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uDim;
uniform float uTime;
uniform float uFade;
varying vec2 vUv;
void main() {
  float y = abs(vUv.y - 0.5) * 2.0;
  float a = pow(clamp(1.0 - y, 0.0, 1.0), 3.0) * 0.55;
  float flow = 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 4.0);
  gl_FragColor = vec4(uColor * a * flow * uFade * mix(1.0, 0.3, uDim), 1.0);
}
`;

const LOCKED = new Color('#6ef2ff');
const UNLOCKED = new Color('#ffd479');

/** 中心信标：未解锁时是普通的阵列核心；全部信号解码后变为「开发者通讯」 */
export function createBeacon() {
  const group = new Group();
  const color = new Color().copy(LOCKED);
  const uniforms = {
    uColor: { value: color },
    uTime: { value: 0 },
    uHover: { value: 0 },
    uDim: { value: 0 },
    uPulse: { value: 0 },
  };
  const core = new Mesh(new SphereGeometry(1.05, 48, 32), new ShaderMaterial({ uniforms, vertexShader: CORE_VERT, fragmentShader: CORE_FRAG }));
  group.add(core);

  const rings = [
    [2.3, [1.2, 0.2, 0], 0.9],
    [3.1, [-0.5, 0.6, 0.3], -0.6],
    [3.9, [0.2, -0.3, 1.1], 0.4],
  ].map(([radius, rot, speed]) => {
    const mat = new ShaderMaterial({
      uniforms: { uColor: { value: color }, uDim: uniforms.uDim, uTime: uniforms.uTime, uSpeed: { value: speed } },
      vertexShader: GLOW_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const mesh = new Mesh(new TorusGeometry(radius, 0.022, 6, 180), mat);
    mesh.rotation.set(rot[0], rot[1], rot[2]);
    group.add(mesh);
    return { mesh, speed };
  });

  const beam = new Mesh(
    new CylinderGeometry(0.03, 0.16, 40, 20, 1, true),
    new ShaderMaterial({
      uniforms: { uColor: { value: color }, uDim: uniforms.uDim, uTime: uniforms.uTime, uFade: { value: 1 } },
      vertexShader: GLOW_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  group.add(beam);

  const hit = new Mesh(new SphereGeometry(4.6, 16, 12), new MeshBasicMaterial({ visible: false }));
  group.add(hit);

  let unlock = 0;
  let unlockTarget = 0;
  let hover = 0;
  let dim = 0;
  let pulse = 0;
  const node = {
    id: 'core',
    kind: 'core',
    group,
    hit,
    radius: 2.2,
    position: new Vector3(0, 0, 0),
    accentHex: '#6ef2ff',
    hovered: false,
    focused: false,
    get unlocked() {
      return unlockTarget > 0.5;
    },
    setUnlocked(on, animate = true) {
      unlockTarget = on ? 1 : 0;
      if (!animate) unlock = unlockTarget;
      if (on && animate) pulse = 1;
      node.accentHex = on ? '#ffd479' : '#6ef2ff';
    },
    deny() {
      pulse = 0.6;
    },
    update(dt, t, camera, { dimOthers }) {
      unlock += (unlockTarget - unlock) * (1 - Math.exp(-dt * 1.5));
      hover += ((node.hovered ? 1 : 0) - hover) * (1 - Math.exp(-dt * 7));
      dim += ((dimOthers && !node.focused ? 1 : 0) - dim) * (1 - Math.exp(-dt * 3.5));
      pulse = Math.max(0, pulse - dt * 0.8);
      color.copy(LOCKED).lerp(UNLOCKED, unlock);
      uniforms.uTime.value = t;
      uniforms.uHover.value = hover;
      uniforms.uDim.value = dim;
      uniforms.uPulse.value = pulse;
      const camDist = camera.position.length();
      beam.material.uniforms.uFade.value = Math.min(1, Math.max(0, (camDist - 16) / 40));
      const s = 1 + unlock * 0.25 + pulse * 0.4;
      core.scale.setScalar(s);
      rings.forEach((r, i) => {
        r.mesh.rotation.z += dt * r.speed * (1 + unlock * 1.5 + hover);
        r.mesh.rotation.x += dt * 0.05 * (i + 1);
      });
    },
    project(cam, w, h, out) {
      const tmp = node._tmp || (node._tmp = new Vector3());
      tmp.copy(node.position).applyMatrix4(cam.matrixWorldInverse);
      const dist = -tmp.z;
      if (dist < 0.5) {
        out.visible = false;
        return out;
      }
      tmp.copy(node.position).project(cam);
      out.visible = true;
      out.x = (tmp.x * 0.5 + 0.5) * w;
      out.y = (-tmp.y * 0.5 + 0.5) * h;
      out.r = ((node.radius * cam.projectionMatrix.elements[5]) / dist) * h * 0.5;
      out.dist = dist;
      return out;
    },
  };
  hit.userData.node = node;
  return node;
}
