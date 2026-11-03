import { storage } from './storage.js';

const KEY = 'sound:v1';

/**
 * 程序化合成的环境音与 UI 音效（WebAudio，无需任何音频文件）。
 * 默认静音；浏览器要求在用户手势中启动 AudioContext。
 */
export function createAudio() {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let droneBus = null;
  let drone = null;
  let pink = null;
  let white = null;
  let scanOsc = null;
  let scanGain = null;
  let enabled = !!storage.get(KEY, false);
  const listeners = new Set();

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    master.connect(comp);
    comp.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
    droneBus = ctx.createGain();
    droneBus.gain.value = 0;
    droneBus.connect(master);
    return ctx;
  }

  function makePink(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return buf;
  }

  function makeWhite(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function ramp(param, value, time) {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + time);
  }

  function startDrone() {
    if (drone) return;
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 360;
    filter.Q.value = 0.8;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.055;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 150;
    lfo.connect(lfoGain).connect(filter.frequency);

    const body = ctx.createGain();
    body.gain.value = 0.5;
    const voices = [
      [55, 'sine', 0.5, -5],
      [82.41, 'triangle', 0.2, 6],
      [110.2, 'sine', 0.16, -3],
      [164.8, 'sine', 0.05, 4],
    ].map(([f, type, g, detune]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(filter);
      o.start(t);
      return o;
    });
    filter.connect(body).connect(droneBus);

    pink = pink || makePink(4);
    const wind = ctx.createBufferSource();
    wind.buffer = pink;
    wind.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.8;
    const wg = ctx.createGain();
    wg.gain.value = 0.1;
    const wlfo = ctx.createOscillator();
    wlfo.frequency.value = 0.045;
    const wlg = ctx.createGain();
    wlg.gain.value = 0.07;
    wlfo.connect(wlg).connect(wg.gain);
    const blfo = ctx.createOscillator();
    blfo.frequency.value = 0.031;
    const blg = ctx.createGain();
    blg.gain.value = 240;
    blfo.connect(blg).connect(bp.frequency);
    wind.connect(bp).connect(wg).connect(droneBus);
    [wind, lfo, wlfo, blfo].forEach((n) => n.start(t));

    drone = {
      stop() {
        [...voices, wind, lfo, wlfo, blfo].forEach((n) => {
          try {
            n.stop();
          } catch {
            /* ignore */
          }
        });
      },
    };
  }

  function tone({ type = 'sine', f0, f1, dur = 0.1, gain = 0.1, attack = 0.006, delay = 0 }) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function burst({ dur = 0.2, gain = 0.08, type = 'bandpass', f0 = 800, f1, q = 1, delay = 0 }) {
    const t = ctx.currentTime + delay;
    white = white || makeWhite(1.5);
    const src = ctx.createBufferSource();
    src.buffer = white;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f0, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl).connect(g).connect(sfxBus);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.05);
  }

  const SOUNDS = {
    hover() {
      tone({ f0: 1400, f1: 1900, dur: 0.07, gain: 0.045 });
    },
    decode() {
      [880, 1174.66, 1567.98].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.18, gain: 0.07, delay: i * 0.07 }));
      burst({ type: 'highpass', f0: 5000, dur: 0.25, gain: 0.02, delay: 0.05 });
    },
    lock() {
      tone({ type: 'triangle', f0: 660, dur: 0.09, gain: 0.08 });
      tone({ type: 'triangle', f0: 990, dur: 0.16, gain: 0.07, delay: 0.08 });
      tone({ f0: 130, f1: 45, dur: 0.32, gain: 0.18 });
    },
    open() {
      burst({ f0: 500, f1: 2600, dur: 0.24, gain: 0.05, q: 0.8 });
    },
    close() {
      burst({ f0: 2400, f1: 420, dur: 0.22, gain: 0.04, q: 0.8 });
    },
    deny() {
      tone({ type: 'sawtooth', f0: 150, dur: 0.09, gain: 0.05 });
      tone({ type: 'sawtooth', f0: 120, dur: 0.12, gain: 0.05, delay: 0.12 });
    },
    glitch() {
      burst({ type: 'highpass', f0: 2800, dur: 0.14, gain: 0.07 });
      tone({ type: 'square', f0: 92, dur: 0.1, gain: 0.025 });
    },
    warp() {
      burst({ f0: 160, f1: 3400, dur: 1.05, gain: 0.16, q: 1.4 });
      tone({ f0: 72, f1: 30, dur: 1.15, gain: 0.24, attack: 0.08 });
      tone({ type: 'sawtooth', f0: 200, f1: 1500, dur: 0.95, gain: 0.025, attack: 0.3 });
    },
    unlock() {
      [440, 554.37, 659.25, 830.61].forEach((f, i) => tone({ f0: f, dur: 1.8, gain: 0.05, attack: 0.35, delay: i * 0.06 }));
      burst({ type: 'highpass', f0: 6000, dur: 1.2, gain: 0.015 });
    },
    key() {
      burst({ type: 'highpass', f0: 4200, dur: 0.018, gain: 0.025 });
    },
  };

  function emit() {
    listeners.forEach((fn) => fn(enabled));
  }

  function setEnabled(on) {
    enabled = !!on;
    storage.set(KEY, enabled);
    if (enabled) {
      if (!ensure()) {
        enabled = false;
        emit();
        return;
      }
      ctx.resume?.();
      startDrone();
      ramp(master.gain, 0.6, 0.6);
      ramp(droneBus.gain, 0.35, 2.2);
    } else if (ctx) {
      ramp(master.gain, 0, 0.35);
      api.scan(null);
    }
    emit();
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend?.();
    else if (enabled) ctx.resume?.();
  });

  const api = {
    get enabled() {
      return enabled;
    },
    setEnabled,
    toggle() {
      setEnabled(!enabled);
      return enabled;
    },
    /** 在第一次用户手势时调用：恢复上次开启的音效 */
    resumeIfEnabled() {
      if (enabled && (!ctx || ctx.state !== 'running')) setEnabled(true);
    },
    play(name) {
      if (!enabled || !ctx || ctx.state !== 'running') return;
      try {
        SOUNDS[name]?.();
      } catch {
        /* ignore */
      }
    },
    /** 扫描音：p ∈ [0,1] 持续升调；null 停止 */
    scan(p) {
      if (!ctx) return;
      if (p == null || !enabled) {
        if (scanOsc) {
          const t = ctx.currentTime;
          scanGain.gain.setTargetAtTime(0.0001, t, 0.03);
          scanOsc.stop(t + 0.25);
          scanOsc = null;
        }
        return;
      }
      if (ctx.state !== 'running') return;
      if (!scanOsc) {
        scanOsc = ctx.createOscillator();
        scanOsc.type = 'sine';
        scanGain = ctx.createGain();
        scanGain.gain.value = 0.0001;
        scanOsc.connect(scanGain).connect(sfxBus);
        scanOsc.start();
        scanGain.gain.setTargetAtTime(0.03, ctx.currentTime, 0.05);
      }
      scanOsc.frequency.setTargetAtTime(480 + p * 960, ctx.currentTime, 0.04);
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return api;
}
