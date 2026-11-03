import { Raycaster, Vector2 } from 'three';

/** 鼠标悬停 / 点击拾取（区分点击与拖拽；触屏只有点击） */
export class Picker {
  constructor(camera, dom, { getTargets, onSelect, onEmpty }) {
    this.camera = camera;
    this.dom = dom;
    this.getTargets = getTargets;
    this.onSelect = onSelect;
    this.onEmpty = onEmpty;
    this.raycaster = new Raycaster();
    this.ndc = new Vector2();
    this.hasPointer = false;
    this.down = null;
    this.enabled = true;

    dom.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.hasPointer = true;
      this._setNdc(e);
    });
    dom.addEventListener('pointerleave', () => {
      this.hasPointer = false;
    });
    dom.addEventListener('pointerdown', (e) => {
      this.down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, type: e.pointerType };
    });
    dom.addEventListener('pointerup', (e) => {
      const d = this.down;
      this.down = null;
      if (!d || d.id !== e.pointerId || !this.enabled) return;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (moved > 7 || performance.now() - d.t > 650) return;
      this._setNdc(e);
      const hit = this.pick();
      if (hit) this.onSelect(hit, { pointerType: e.pointerType });
      else this.onEmpty?.();
    });
  }

  _setNdc(e) {
    const rect = this.dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }

  /** 返回当前指针下的节点（或 null） */
  pick() {
    const targets = this.getTargets();
    if (!targets.length) return null;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(targets, false);
    return hits.length ? hits[0].object.userData.node : null;
  }

  hoverPick() {
    if (!this.hasPointer || !this.enabled || this.down) return null;
    return this.pick();
  }
}
