import { HalfFloatType, Timer, NoToneMapping, PerspectiveCamera, SRGBColorSpace, Scene, UnsignedByteType, Vector2, WebGLRenderer } from 'three';
import {
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { TransitionFx } from './TransitionFx.js';

const TIERS = {
  high: { dpr: 2, msaa: 4, ca: true, bloomScale: 1 },
  medium: { dpr: 1.5, msaa: 0, ca: false, bloomScale: 0.75 },
  low: { dpr: 1.25, msaa: 0, ca: false, bloomScale: 0.5 },
};
const NEXT = { high: 'medium', medium: 'low', low: null };

/** 渲染器 + 后期管线 + 渲染循环 + 自适应画质 */
export class Stage {
  constructor(canvas, { quality = 'high', onQualityChange, onPoorPerformance } = {}) {
    this.canvas = canvas;
    this.onQualityChange = onQualityChange;
    this.onPoorPerformance = onPoorPerformance;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x03050b, 1);
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.outputColorSpace = SRGBColorSpace;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(50, 1, 0.1, 4000);

    // 部分设备不能渲染到浮点纹理：退回 8 位缓冲（辉光略弱，但不会黑屏）
    const gl = this.renderer.getContext();
    this.floatOk = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    this.composer = new EffectComposer(this.renderer, { frameBufferType: this.floatOk ? HalfFloatType : UnsignedByteType, multisampling: 0 });
    this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.48, luminanceSmoothing: 0.3, intensity: 1.3, radius: 0.72 });
    this.toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.7 });
    this.noise = new NoiseEffect({ premultiply: true });
    this.noise.blendMode.opacity.value = 0.4;
    this.fx = new TransitionFx();
    this.ca = new ChromaticAberrationEffect({ offset: new Vector2(0.0007, 0.0005), radialModulation: true, modulationOffset: 0.22 });

    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.passMain = new EffectPass(this.camera, this.bloom, this.toneMapping, this.vignette, this.noise);
    this.passFx = new EffectPass(this.camera, this.fx);
    this.passCa = new EffectPass(this.camera, this.ca);
    this.composer.addPass(this.passMain);
    this.composer.addPass(this.passFx);
    this.composer.addPass(this.passCa);
    this.passFx.enabled = false;

    this.width = 1;
    this.height = 1;
    this.elapsed = 0;
    this.running = false;
    this.timer = new Timer();
    this.resizeListeners = new Set();
    this.mon = { warm: 0, frames: 0, time: 0, checks: 0, done: false };

    this.applyQuality(quality, { silent: true });
    window.addEventListener('resize', () => this.resize());
  }

  get pixelRatio() {
    return this.renderer.getPixelRatio();
  }

  applyQuality(quality, { silent = false } = {}) {
    const tier = TIERS[quality] || TIERS.high;
    this.quality = quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.dpr));
    this.composer.multisampling = tier.msaa;
    this.bloom.resolution.scale = tier.bloomScale;
    this.passCa.enabled = tier.ca;
    this.updateChain();
    this.resize();
    if (!silent) this.onQualityChange?.(quality);
  }

  /** postprocessing 不会在运行时自动转移 renderToScreen，需手动指定最后一个启用的 pass */
  updateChain() {
    let last = null;
    for (const p of this.composer.passes) {
      p.renderToScreen = false;
      if (p.enabled) last = p;
    }
    if (last) last.renderToScreen = true;
  }

  onResize(fn) {
    this.resizeListeners.add(fn);
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 竖屏加大视角，让整张星图装进窄屏
    this.baseFov = w / h < 0.85 ? 62 : 50;
    if (!this.fovLocked) this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.resizeListeners.forEach((fn) => fn(w, h, this.pixelRatio));
  }

  start(frame) {
    this.frame = frame;
    if (this.running) return;
    this.running = true;
    this.timer.reset();
    this.raf = requestAnimationFrame(this.tick);
  }

  tick = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    this.timer.update();
    const raw = this.timer.getDelta();
    const dt = Math.min(raw, 1 / 20);
    this.elapsed += dt;
    this.frame?.(dt, this.elapsed);
    const fxOn = this.fx.active;
    if (fxOn !== this.passFx.enabled) {
      this.passFx.enabled = fxOn;
      this.updateChain();
    }
    this.composer.render(dt);
    this.monitor(raw);
  };

  /** 开场前预热：渲染一帧，并临时启用跃迁 / 故障 pass，让后期 shader 提前编译 */
  warmup() {
    this.passFx.enabled = true;
    this.updateChain();
    this.frame?.(0, this.elapsed);
    this.composer.render(0);
    this.passFx.enabled = this.fx.active;
    this.updateChain();
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  resume() {
    if (this.running || !this.frame) return;
    this.running = true;
    this.timer.reset();
    this.raf = requestAnimationFrame(this.tick);
  }

  monitor(raw) {
    const m = this.mon;
    if (m.done || document.hidden || raw > 0.5) return;
    m.warm += raw;
    if (m.warm < 2.5) return;
    m.frames++;
    m.time += raw;
    if (m.frames < 90) return;
    const avg = m.time / m.frames;
    m.frames = 0;
    m.time = 0;
    if (avg > 1 / 40) {
      const next = NEXT[this.quality];
      if (next) {
        this.applyQuality(next);
        m.warm = 1.5;
      } else {
        m.done = true;
        if (avg > 1 / 22) this.onPoorPerformance?.(avg);
      }
    } else if (++m.checks >= 3) {
      m.done = true;
    }
  }
}
