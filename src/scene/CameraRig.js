import gsap from 'gsap';
import { Vector2, Vector3 } from 'three';

const TAU = Math.PI * 2;
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/**
 * 自研球坐标相机：拖拽环视（带惯性）、滚轮 / 双指缩放、闲置自转、鼠标视差、GSAP 飞行，
 * 以及 viewShift（通过 setViewOffset 把注视点移出画面中心，给档案面板让位）。
 */
export class CameraRig {
  constructor(camera, dom, { onInteract } = {}) {
    this.camera = camera;
    this.dom = dom;
    this.onInteract = onInteract;
    this.target = new Vector3();
    this.goalTarget = new Vector3();
    this.theta = 0.7;
    this.phi = 1.1;
    this.radius = 100;
    this.goal = { theta: 0.7, phi: 1.1, radius: 100 };
    this.vel = { theta: 0, phi: 0 };
    this.limits = { minR: 26, maxR: 175, minPhi: 0.32, maxPhi: 1.5 };
    this.viewShift = { x: 0, y: 0 };
    this.parallax = new Vector2();
    this.pointerN = new Vector2();
    this.enabled = true;
    this.autoRotate = true;
    this.idle = 0;
    this.tween = null;
    this.dragging = false;
    this.pointers = new Map();
    this.pinchDist = 0;
    this.size = { w: 1, h: 1 };
    this._attach();
  }

  setSize(w, h) {
    this.size.w = w;
    this.size.h = h;
  }

  _attach() {
    const el = this.dom;
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture?.(e.pointerId);
      this.killTween();
      if (this.pointers.size === 1) {
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.lastT = performance.now();
        this.vel.theta = 0;
        this.vel.phi = 0;
      } else if (this.pointers.size === 2) {
        this.pinchDist = this._pinch();
      }
      this.idle = 0;
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') {
        this.pointerN.set((e.clientX / this.size.w) * 2 - 1, (e.clientY / this.size.h) * 2 - 1);
      }
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const d = this._pinch();
        if (this.pinchDist > 0 && d > 0) this.goal.radius *= this.pinchDist / d;
        this.pinchDist = d;
        this._interact();
        return;
      }
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      const now = performance.now();
      const dts = Math.max(1, now - this.lastT) / 1000;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.lastT = now;
      const k = 0.0052;
      this.goal.theta -= dx * k;
      this.goal.phi -= dy * k;
      this.vel.theta = (-dx * k) / dts;
      this.vel.phi = (-dy * k) / dts;
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        el.classList.add('is-dragging');
        this._interact();
      }
    });
    const end = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (this.pointers.size === 0) {
        this.dragging = false;
        el.classList.remove('is-dragging');
        if (performance.now() - this.lastT > 80) {
          this.vel.theta = 0;
          this.vel.phi = 0;
        }
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        this.killTween();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
        this.goal.radius *= Math.exp(e.deltaY * unit * 0.0011);
        this._interact();
      },
      { passive: false },
    );
  }

  _pinch() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  _interact() {
    this.idle = 0;
    this.onInteract?.();
  }

  killTween() {
    if (this.tween) {
      this.tween.kill();
      this.tween = null;
    }
  }

  setLimits(l) {
    Object.assign(this.limits, l);
  }

  /** 立即设置位姿 */
  set({ theta, phi, radius, target }) {
    if (theta != null) this.theta = this.goal.theta = theta;
    if (phi != null) this.phi = this.goal.phi = phi;
    if (radius != null) this.radius = this.goal.radius = radius;
    if (target) {
      this.target.copy(target);
      this.goalTarget.copy(target);
    }
  }

  pose() {
    return { theta: this.goal.theta, phi: this.goal.phi, radius: this.goal.radius, target: this.goalTarget.clone() };
  }

  /** 平滑飞行到目标位姿 */
  flyTo({ theta = this.goal.theta, phi = this.goal.phi, radius = this.goal.radius, target = this.goalTarget, shift, duration = 1.3, ease = 'power3.inOut' }) {
    this.killTween();
    this.vel.theta = 0;
    this.vel.phi = 0;
    const destTheta = this.goal.theta + wrap(theta - this.goal.theta);
    const proxy = {
      theta: this.goal.theta,
      phi: this.goal.phi,
      radius: this.goal.radius,
      tx: this.goalTarget.x,
      ty: this.goalTarget.y,
      tz: this.goalTarget.z,
      sx: this.viewShift.x,
      sy: this.viewShift.y,
    };
    const to = {
      theta: destTheta,
      phi,
      radius,
      tx: target.x,
      ty: target.y,
      tz: target.z,
      sx: shift ? shift.x : this.viewShift.x,
      sy: shift ? shift.y : this.viewShift.y,
    };
    return new Promise((resolve) => {
      this.tween = gsap.to(proxy, {
        ...to,
        duration,
        ease,
        onUpdate: () => {
          this.theta = this.goal.theta = proxy.theta;
          this.phi = this.goal.phi = proxy.phi;
          this.radius = this.goal.radius = proxy.radius;
          this.target.set(proxy.tx, proxy.ty, proxy.tz);
          this.goalTarget.copy(this.target);
          this.viewShift.x = proxy.sx;
          this.viewShift.y = proxy.sy;
        },
        onComplete: () => {
          this.tween = null;
          resolve(true);
        },
        onInterrupt: () => resolve(false),
      });
    });
  }

  update(dt, { allowAutoRotate = true, parallax = true } = {}) {
    this.idle += dt;
    if (!this.dragging && !this.tween) {
      this.goal.theta += this.vel.theta * dt;
      this.goal.phi += this.vel.phi * dt;
      const decay = Math.exp(-dt * 3.2);
      this.vel.theta *= decay;
      this.vel.phi *= decay;
      if (this.autoRotate && allowAutoRotate && this.idle > 8) this.goal.theta += dt * 0.035 * Math.min(1, (this.idle - 8) / 3);
    }
    const L = this.limits;
    this.goal.phi = Math.min(L.maxPhi, Math.max(L.minPhi, this.goal.phi));
    this.goal.radius = Math.min(L.maxR, Math.max(L.minR, this.goal.radius));

    if (!this.tween) {
      const k = 1 - Math.exp(-dt * 7);
      this.theta += (this.goal.theta - this.theta) * k;
      this.phi += (this.goal.phi - this.phi) * k;
      this.radius += (this.goal.radius - this.radius) * (1 - Math.exp(-dt * 5));
      this.target.lerp(this.goalTarget, k);
    }

    const sp = Math.sin(this.phi);
    const cam = this.camera;
    cam.position.set(
      this.target.x + this.radius * sp * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sp * Math.cos(this.theta),
    );

    // 鼠标视差：轻微平移镜头
    const pk = 1 - Math.exp(-dt * 2.5);
    if (parallax) this.parallax.lerp(this.pointerN, pk);
    else this.parallax.multiplyScalar(1 - pk);
    const amp = this.radius * 0.018;
    cam.position.x += Math.cos(this.theta) * this.parallax.x * amp;
    cam.position.z += -Math.sin(this.theta) * this.parallax.x * amp;
    cam.position.y += -this.parallax.y * amp * 0.6;
    cam.lookAt(this.target);

    const { w, h } = this.size;
    if (Math.abs(this.viewShift.x) > 1e-4 || Math.abs(this.viewShift.y) > 1e-4) {
      cam.setViewOffset(w, h, this.viewShift.x * w, this.viewShift.y * h, w, h);
    } else if (cam.view && cam.view.enabled) {
      cam.clearViewOffset();
    }
    cam.updateMatrixWorld();
  }
}
