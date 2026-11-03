import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { PRESETS } from './worlds/index.js';
import { sharedUniforms } from './worlds/common.js';
import { hashString, BASE_RADIUS } from './layout.js';

const ATMO_VERT = /* glsl */ `
varying vec3 vNw;
varying vec3 vPw;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPw = wp.xyz;
  vNw = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ATMO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform float uHover;
uniform float uDim;
uniform float uFlash;
varying vec3 vNw;
varying vec3 vPw;
void main() {
  vec3 v = normalize(vPw - cameraPosition);
  vec3 n = normalize(vNw);
  float d = dot(n, v);
  float rim = pow(clamp(smoothstep(0.0, 0.53, d), 0.0, 1.0), 2.6);
  vec3 limb = normalize(n - v * d + 1e-5);
  float lit = 0.3 + 0.7 * max(dot(limb, uLightDir), 0.0);
  float k = rim * lit * (0.9 + uHover * 0.9 + uFlash * 2.5);
  gl_FragColor = vec4(uColor * k * mix(1.0, 0.22, uDim), 1.0);
}
`;

const PING_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uPhase;
uniform float uStrength;
uniform float uDim;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float r = mix(0.4, 0.98, uPhase);
  float ring = exp(-abs(d - r) * 70.0) * (1.0 - uPhase) * (1.0 - uPhase);
  gl_FragColor = vec4(uColor * ring * uStrength * mix(1.0, 0.15, uDim), 1.0);
}
`;

const tmpA = new Vector3();
const tmpB = new Vector3();
const UP = new Vector3(0, 1, 0);

export class WorldNode {
  constructor(game, index, position, { quality, pixelRatio }) {
    this.game = game;
    this.id = game.id;
    this.index = index;
    this.kind = 'world';
    this.encrypted = game.status === 'encrypted';
    const style = PRESETS[game.world?.style] ? game.world.style : 'gas';
    const preset = PRESETS[style];
    this.radius = BASE_RADIUS * (game.world?.size || 1);
    this.accentHex = game.world?.accent || preset.accent;
    this.accent = new Color(this.accentHex);
    this.position = position.clone();

    this.group = new Group();
    this.group.position.copy(position);
    this.shared = sharedUniforms();

    this.preset = preset.create({
      radius: this.radius,
      quality,
      pixelRatio,
      shared: this.shared,
      palette: game.world?.palette,
      accent: this.accentHex,
      ring: !!game.world?.ring,
    });
    this.group.add(this.preset.group);

    // 大气辉光
    this.atmoUniforms = {
      uColor: { value: new Color(this.preset.atmosphere?.color || this.accentHex).multiplyScalar(this.preset.atmosphere?.intensity ?? 1.25) },
      uLightDir: this.shared.uLightDir,
      uHover: this.shared.uHover,
      uDim: this.shared.uDim,
      uFlash: { value: 0 },
    };
    const atmo = new Mesh(
      new SphereGeometry(this.radius * 1.18, 64, 40),
      new ShaderMaterial({
        uniforms: this.atmoUniforms,
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        side: BackSide,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.group.add(atmo);

    // 信号脉冲（面向镜头的扩散圆环）
    this.pingUniforms = {
      uColor: { value: this.accent.clone() },
      uPhase: { value: 0 },
      uStrength: { value: 1 },
      uDim: this.shared.uDim,
    };
    const pingSize = this.radius * 2 * 2.7;
    this.ping = new Mesh(
      new PlaneGeometry(pingSize, pingSize),
      new ShaderMaterial({
        uniforms: this.pingUniforms,
        vertexShader: PING_VERT,
        fragmentShader: PING_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.group.add(this.ping);
    this.pingOffset = hashString(this.id);
    this.pingT = 0;

    // 拾取用的隐形碰撞球（比星球大，更容易点中）
    this.hit = new Mesh(new SphereGeometry(this.radius * 1.75, 16, 12), new MeshBasicMaterial({ visible: false }));
    this.hit.userData.node = this;
    this.group.add(this.hit);

    this.hovered = false;
    this.focused = false;
    this.decoded = false;
    this.hover = 0;
    this.dim = 0;
    this.glitch = 0;
    this.flash = 0;
    this.focusK = 0;
    this.scan = 0;
    this.spin = 0.05 + hashString(`${this.id}spin`) * 0.05;
  }

  triggerGlitch(amount = 1) {
    this.glitch = Math.max(this.glitch, amount);
  }

  triggerFlash() {
    this.flash = 1;
  }

  setPixelRatio(pr) {
    this.preset.setPixelRatio?.(pr);
  }

  update(dt, t, camera, { dimOthers }) {
    const k = 1 - Math.exp(-dt * 7);
    this.hover += ((this.hovered ? 1 : 0) - this.hover) * k;
    const dimTarget = dimOthers && !this.focused ? 1 : 0;
    this.dim += (dimTarget - this.dim) * (1 - Math.exp(-dt * 3.5));
    this.glitch = Math.max(0, this.glitch - dt * 3);
    this.focusK += ((this.focused ? 1 : 0) - this.focusK) * (1 - Math.exp(-dt * 4));
    this.flash = Math.max(0, this.flash - dt * 1.2);

    // 光照方向：混合「来自中心信标」与「来自镜头」，保证任何角度都能看清
    tmpA.copy(this.position).negate().normalize().multiplyScalar(0.55);
    tmpB.copy(camera.position).sub(this.position).normalize().multiplyScalar(0.5);
    this.shared.uLightDir.value.copy(tmpA).add(tmpB).addScaledVector(UP, 0.3).normalize();

    const sh = this.shared;
    sh.uTime.value = t;
    sh.uHover.value = this.hover;
    sh.uDim.value = this.dim;
    sh.uGlitch.value = this.glitch;
    sh.uScan.value = this.scan;
    this.atmoUniforms.uFlash.value = this.flash;

    this.preset.update(dt, t, this);
    if (this.preset.spinTarget) this.preset.spinTarget.rotation.y += dt * this.spin;

    // 未解码的信号脉冲更频繁、更亮
    const unknown = !this.decoded;
    const period = unknown ? 2.2 : 4.6;
    this.pingT += dt;
    this.pingUniforms.uPhase.value = (this.pingT / period + this.pingOffset) % 1;
    this.pingUniforms.uStrength.value = ((unknown ? 1.1 : 0.45) + this.hover * 0.6 + this.flash * 2) * (1 - this.focusK * 0.75);
    this.ping.quaternion.copy(camera.quaternion);
  }

  /** 屏幕投影：中心点与像素半径 */
  project(camera, w, h, out) {
    tmpA.copy(this.position).applyMatrix4(camera.matrixWorldInverse);
    const dist = -tmpA.z;
    if (dist < 0.5) {
      out.visible = false;
      return out;
    }
    tmpB.copy(this.position).project(camera);
    out.visible = true;
    out.x = (tmpB.x * 0.5 + 0.5) * w;
    out.y = (-tmpB.y * 0.5 + 0.5) * h;
    out.r = ((this.radius * camera.projectionMatrix.elements[5]) / dist) * h * 0.5;
    out.dist = dist;
    return out;
  }
}
