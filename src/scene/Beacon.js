import { Group, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';

/*
 * 中心黑洞（信标核心）：
 *  - 未解锁时是一个「沉睡」的黑洞，吸积盘暗淡；每解码一个信号，吸积盘亮一点
 *  - 全部解码时吸积盘闪亮一下并保持全亮 —— 开发者通讯解锁
 * 黑洞本体（光线弯折、吸积盘、阴影）由后期效果 BlackHoleFx 逐像素计算；这里负责状态动画和点击判定。
 */

const SCALE = 0.6; // 世界单位 / 史瓦西半径
const LOCKED = '#6ef2ff';
const UNLOCKED = '#ffd479';
const DEFAULT_COLORS = { hot: '#fff4e2', cool: '#ff8c42' };

export function createBeacon({ fx }) {
  const group = new Group();
  fx.center.set(0, 0, 0);
  fx.uniforms.get('uScale').value = SCALE;

  const hit = new Mesh(new SphereGeometry(4.6, 16, 12), new MeshBasicMaterial({ visible: false }));
  group.add(hit);

  let prog = 0;
  let progTarget = 0;
  let unlocked = false;
  let hover = 0;
  let dim = 0;
  let pulse = 0;
  let flicker = 0;
  const node = {
    id: 'core',
    kind: 'core',
    group,
    hit,
    radius: 3,
    position: new Vector3(0, 0, 0),
    accentHex: LOCKED,
    hovered: false,
    focused: false,
    get unlocked() {
      return unlocked;
    },
    setUnlocked(on, animate = true) {
      unlocked = !!on;
      if (on && animate) pulse = 1;
      node.accentHex = on ? UNLOCKED : LOCKED;
    },
    /** 解码进度 0..1：吸积盘随之变亮 */
    setProgress(frac, animate = true) {
      progTarget = Math.max(0, Math.min(1, frac));
      if (!animate) prog = progTarget;
      else pulse = Math.max(pulse, 0.45);
    },
    setTheme(theme) {
      fx.setColors(theme.hole || DEFAULT_COLORS);
    },
    deny() {
      flicker = 1;
    },
    update(dt, t, camera, { dimOthers }) {
      prog += (progTarget - prog) * (1 - Math.exp(-dt * 1.2));
      hover += ((node.hovered ? 1 : 0) - hover) * (1 - Math.exp(-dt * 7));
      dim += ((dimOthers && !node.focused ? 1 : 0) - dim) * (1 - Math.exp(-dt * 3.5));
      pulse = Math.max(0, pulse - dt * 0.6);
      flicker = Math.max(0, flicker - dt * 1.6);
      const flick = flicker > 0 ? 1 - flicker * 0.55 * (0.5 + 0.5 * Math.sin(t * 60)) : 1;
      const disk = (0.2 + 0.8 * Math.pow(prog, 0.85)) * (1 + hover * 0.25 + pulse * 1.1) * (1 - dim * 0.55) * flick;
      fx.setState({ disk, time: t });
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
