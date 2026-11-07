/**
 * 原创背景音乐「Orbit」：管风琴 + 钟表滴答的太空氛围曲（D 小调，60 BPM，160 秒无缝循环）。
 * 离线合成（加法合成音色 + Freeverb 混响），再用 ffmpeg 编码为 MP3：
 *
 *   npm run bgm          → public/audio/orbit.mp3（需要 ffmpeg 在 PATH 里）
 *
 * 结构（每段 32 秒 = 4 个和弦 × 8 拍）：
 *   1 柔和管风琴铺底，钟表滴答渐入 → 2 琶音进入 → 3 低音踏板加入
 *   → 4 全管风琴高潮（高八度琶音叠加）→ 5 逐层回落，结尾与开头同样安静，循环点听不出来
 * 和弦进行 Dm(add9) – B♭maj7 – Gm9 – Asus4→A，琶音为 6 音一组的循环型，与 8 拍和弦错位推进。
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'audio', 'orbit.mp3');

const SR = 44100;
const BEAT = 1; // 60 BPM
const CHORD = 8 * BEAT;
const CYCLE = 4 * CHORD;
const LENGTH = 5 * CYCLE; // 160 s
const TAIL = 8; // 释音与混响尾巴，最后折回开头，保证循环无缝
const N = (LENGTH + TAIL) * SR;

// ---------- 随机数（固定种子，每次生成结果一致） ----------
let seed = 20261107;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

// ---------- 音色：一个周期的波表 ----------
const TABLE = 4096;
function makeTable(partials) {
  const t = new Float32Array(TABLE + 1);
  partials.forEach((amp, k) => {
    if (!amp) return;
    const ph = rand() * Math.PI * 2;
    for (let i = 0; i <= TABLE; i++) t[i] += amp * Math.sin(((k + 1) * 2 * Math.PI * i) / TABLE + ph);
  });
  let peak = 0;
  for (let i = 0; i <= TABLE; i++) peak = Math.max(peak, Math.abs(t[i]));
  for (let i = 0; i <= TABLE; i++) t[i] /= peak;
  return t;
}
const STOP = {
  gedackt: makeTable([1, 0.04, 0.24, 0.02, 0.09, 0.01, 0.035]), // 有盖管：奇次泛音
  flute: makeTable([1, 0.28, 0.1, 0.04, 0.02]), // 开管长笛
  principal: makeTable([1, 0.5, 0.34, 0.24, 0.15, 0.1, 0.07, 0.05, 0.03, 0.02]), // 风琴主音栓
  string: makeTable([1, 0.62, 0.46, 0.36, 0.28, 0.22, 0.17, 0.13, 0.1, 0.07, 0.05, 0.035]), // 弦音栓（与微失谐的一组叠成天籁音栓）
  bourdon: makeTable([1, 0.03, 0.28, 0.02, 0.1]),
};

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

// ---------- 分层渲染（每层单独渲染，最后按表情曲线混合） ----------
const layer = () => ({ l: new Float32Array(N), r: new Float32Array(N) });
const L = {
  padSoft: layer(),
  padFull: layer(),
  arp: layer(),
  arpHigh: layer(),
  bass: layer(),
  tick: layer(),
};

function note(dst, { table, midi, start, dur, gain, attack = 0.08, release = 0.35, pan = 0, cents = 0, vib = 0 }) {
  const f = midiHz(midi) * 2 ** (cents / 1200);
  const i0 = Math.max(0, Math.round(start * SR));
  const i1 = Math.min(N, Math.round((start + dur + release) * SR));
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  let phase = rand();
  const vibRate = 4.8 + rand() * 0.8;
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / SR;
    let env = t < attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / attack) : 1;
    if (t > dur) {
      const k = (t - dur) / release;
      env *= k >= 1 ? 0 : (1 - k) * (1 - k);
    }
    phase += vib ? (f * (1 + vib * Math.sin(2 * Math.PI * vibRate * t))) / SR : f / SR;
    phase -= Math.floor(phase);
    const x = phase * TABLE;
    const j = x | 0;
    const s = table[j] + (table[j + 1] - table[j]) * (x - j);
    dst.l[i] += s * env * gl;
    dst.r[i] += s * env * gr;
  }
}

// ---------- 和声 ----------
// pad：和弦内音；arp：琶音用音（高一些的音区）；bass：根音
const CHORDS = [
  { pad: [50, 57, 64, 65], arp: [62, 65, 69, 76], bass: 38 }, // Dm(add9)
  { pad: [46, 53, 57, 62], arp: [58, 62, 65, 69], bass: 34 }, // B♭maj7
  { pad: [43, 50, 57, 58], arp: [55, 58, 62, 69], bass: 31 }, // Gm9
  { pad: [45, 52, 57, 62], arp: [57, 62, 64, 69], bass: 33, resolve: { pad: [45, 52, 57, 61], arp: [57, 61, 64, 69] } }, // Asus4 → A
];
const PATTERN = [0, 2, 3, 1, 2, 3];

for (let c = 0; c < LENGTH / CHORD; c++) {
  const ch = CHORDS[c % 4];
  const t0 = c * CHORD;
  const padNotes = (notes, start, dur) => {
    notes.forEach((m, k) => {
      const pan = (k / (notes.length - 1)) * 0.8 - 0.4;
      // 柔和铺底：有盖管 8' + 一对微失谐的弦音栓（天籁效果）
      note(L.padSoft, { table: STOP.gedackt, midi: m, start, dur, gain: 0.5, attack: 1.4, release: 1.8, pan });
      note(L.padSoft, { table: STOP.string, midi: m, start, dur, gain: 0.16, attack: 1.8, release: 2.0, pan: pan - 0.2, cents: -5 });
      note(L.padSoft, { table: STOP.string, midi: m, start, dur, gain: 0.16, attack: 1.8, release: 2.0, pan: pan + 0.2, cents: 5 });
      // 全管风琴：主音栓 8' + 4' + 2'
      note(L.padFull, { table: STOP.principal, midi: m, start, dur, gain: 0.5, attack: 0.25, release: 1.2, pan });
      note(L.padFull, { table: STOP.principal, midi: m + 12, start, dur, gain: 0.3, attack: 0.25, release: 1.2, pan: -pan });
      note(L.padFull, { table: STOP.flute, midi: m + 24, start, dur, gain: 0.14, attack: 0.3, release: 1.2, pan });
    });
  };
  if (ch.resolve) {
    padNotes(ch.pad, t0, 6 * BEAT);
    padNotes(ch.resolve.pad, t0 + 6 * BEAT, 2 * BEAT);
  } else {
    padNotes(ch.pad, t0, CHORD);
  }
  // 低音踏板：有盖管 + 高八度主音栓（最低到 G1 ≈ 49 Hz，避免手机外放听不到、耳机里发闷的次低频）
  note(L.bass, { table: STOP.bourdon, midi: ch.bass, start: t0, dur: CHORD, gain: 0.55, attack: 0.9, release: 1.6 });
  note(L.bass, { table: STOP.principal, midi: ch.bass + 12, start: t0, dur: CHORD, gain: 0.3, attack: 0.7, release: 1.4 });
  // 琶音：八分音符，6 音一组循环
  for (let s = 0; s < 16; s++) {
    const tones = ch.resolve && s >= 12 ? ch.resolve.arp : ch.arp;
    const m = tones[PATTERN[s % PATTERN.length]];
    const start = t0 + s * 0.5 * BEAT + (rand() - 0.5) * 0.012;
    const vel = 0.85 + rand() * 0.3 - (s % 2) * 0.12;
    const pan = Math.sin(s * 0.9) * 0.35;
    note(L.arp, { table: STOP.flute, midi: m, start, dur: 0.46, gain: 0.5 * vel, attack: 0.03, release: 0.7, pan, vib: 0.0012 });
    note(L.arpHigh, { table: STOP.flute, midi: m + 12, start, dur: 0.42, gain: 0.4 * vel, attack: 0.03, release: 0.6, pan: -pan, vib: 0.0015 });
  }
}

// ---------- 钟表滴答（每拍一下，嘀 / 嗒交替） ----------
for (let b = 0; b < LENGTH / BEAT; b++) {
  const i0 = Math.round(b * BEAT * SR);
  const hi = b % 2 === 0;
  const f = hi ? 3150 : 2350;
  const amp = hi ? 1 : 0.8;
  let lp = 0;
  for (let i = 0; i < 0.06 * SR && i0 + i < N; i++) {
    const t = i / SR;
    const ping = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.0045);
    const n = rand() * 2 - 1;
    lp += (n - lp) * 0.35;
    const click = (n - lp) * Math.exp(-t / 0.0012) * 0.5;
    const s = (ping + click) * amp;
    L.tick.l[i0 + i] += s * 0.9;
    L.tick.r[i0 + i] += s;
  }
}

// ---------- 表情曲线（各层音量随时间变化，开头与结尾衔接） ----------
const curve = (pts) => (t) => {
  for (let k = 1; k < pts.length; k++) {
    if (t <= pts[k][0]) {
      const [t0, v0] = pts[k - 1];
      const [t1, v1] = pts[k];
      const u = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    }
  }
  return pts[pts.length - 1][1];
};
const MIX = {
  padSoft: { level: 0.2, send: 0.4, at: curve([[0, 0.55], [32, 0.62], [64, 0.68], [96, 0.6], [128, 0.62], [160, 0.55], [168, 0.55]]) },
  padFull: { level: 0.15, send: 0.45, at: curve([[0, 0], [86, 0], [100, 0.55], [122, 0.8], [134, 0.35], [150, 0], [168, 0]]) },
  arp: { level: 0.16, send: 0.6, at: curve([[0, 0], [33, 0], [42, 0.55], [64, 0.7], [96, 0.8], [124, 0.85], [140, 0.4], [152, 0], [168, 0]]) },
  arpHigh: { level: 0.08, send: 0.7, at: curve([[0, 0], [98, 0], [108, 0.4], [124, 0.5], [136, 0], [168, 0]]) },
  bass: { level: 0.2, send: 0.3, at: curve([[0, 0], [64, 0], [74, 0.55], [96, 0.72], [126, 0.78], [140, 0.3], [150, 0], [168, 0]]) },
  tick: { level: 0.045, send: 0.25, at: curve([[0, 0], [5, 0], [13, 0.8], [118, 0.8], [126, 1], [146, 0.7], [154, 0], [168, 0]]) },
};

const dryL = new Float32Array(N);
const dryR = new Float32Array(N);
const sendL = new Float32Array(N);
const sendR = new Float32Array(N);
for (const [name, m] of Object.entries(MIX)) {
  const src = L[name];
  for (let i = 0; i < N; i++) {
    const g = m.level * m.at(i / SR);
    if (g === 0) continue;
    dryL[i] += src.l[i] * g;
    dryR[i] += src.r[i] * g;
    sendL[i] += src.l[i] * g * m.send;
    sendR[i] += src.r[i] * g * m.send;
  }
}

// ---------- Freeverb（大教堂式长混响） ----------
function freeverb(inL, inR, { room = 0.93, damp = 0.22, width = 1 } = {}) {
  const COMB = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const AP = [556, 441, 341, 225];
  const SPREAD = 23;
  const mk = (len) => ({ buf: new Float32Array(len), idx: 0, store: 0 });
  const cl = COMB.map((n) => mk(n));
  const cr = COMB.map((n) => mk(n + SPREAD));
  const al = AP.map((n) => mk(n));
  const ar = AP.map((n) => mk(n + SPREAD));
  const d1 = damp;
  const d2 = 1 - damp;
  const outL = new Float32Array(inL.length);
  const outR = new Float32Array(inL.length);
  const comb = (c, x) => {
    const y = c.buf[c.idx];
    c.store = y * d2 + c.store * d1;
    c.buf[c.idx] = x + c.store * room;
    if (++c.idx >= c.buf.length) c.idx = 0;
    return y;
  };
  const allpass = (a, x) => {
    const b = a.buf[a.idx];
    const y = -x + b;
    a.buf[a.idx] = x + b * 0.5;
    if (++a.idx >= a.buf.length) a.idx = 0;
    return y;
  };
  const wet1 = (width / 2 + 0.5) * 0.5;
  const wet2 = ((1 - width) / 2) * 0.5;
  for (let i = 0; i < inL.length; i++) {
    const x = (inL[i] + inR[i]) * 0.015;
    let l = 0;
    let r = 0;
    for (let k = 0; k < 8; k++) {
      l += comb(cl[k], x);
      r += comb(cr[k], x);
    }
    for (let k = 0; k < 4; k++) {
      l = allpass(al[k], l);
      r = allpass(ar[k], r);
    }
    outL[i] = l * wet1 + r * wet2;
    outR[i] = r * wet1 + l * wet2;
  }
  return [outL, outR];
}

// 预延迟 30 ms
const PRE = Math.round(0.03 * SR);
const preL = new Float32Array(N);
const preR = new Float32Array(N);
preL.set(sendL.subarray(0, N - PRE), PRE);
preR.set(sendR.subarray(0, N - PRE), PRE);
const [wetL, wetR] = freeverb(preL, preR);

// ---------- 混合、折回尾巴、归一化 ----------
const LEN = LENGTH * SR;
const outL = new Float32Array(LEN);
const outR = new Float32Array(LEN);
for (let i = 0; i < N; i++) {
  const j = i % LEN; // 超出 160 秒的释音和混响尾巴加回开头 → 循环播放时首尾连续
  outL[j] += dryL[i] * 0.85 + wetL[i] * 1.1;
  outR[j] += dryR[i] * 0.85 + wetR[i] * 1.1;
}
// 去直流（一阶高通 ~20 Hz）
for (const ch of [outL, outR]) {
  let px = 0;
  let py = 0;
  const a = Math.exp((-2 * Math.PI * 20) / SR);
  for (let i = 0; i < LEN; i++) {
    const y = a * (py + ch[i] - px);
    px = ch[i];
    py = y;
    ch[i] = y;
  }
}
let peak = 0;
for (let i = 0; i < LEN; i++) peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
const norm = 0.89 / peak;
// 首尾各 15 ms 极短淡入淡出：播放器循环时若有几十毫秒的空隙，也只是轻微的一下而不会「咔哒」
const EDGE = Math.round(0.015 * SR);

// ---------- 写 WAV → ffmpeg 编码 MP3 ----------
const wav = Buffer.alloc(44 + LEN * 4);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + LEN * 4, 4);
wav.write('WAVE', 8);
wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(SR, 24);
wav.writeUInt32LE(SR * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(LEN * 4, 40);
for (let i = 0; i < LEN; i++) {
  const edge = Math.min(1, i / EDGE, (LEN - 1 - i) / EDGE);
  const l = Math.max(-1, Math.min(1, outL[i] * norm * edge));
  const r = Math.max(-1, Math.min(1, outR[i] * norm * edge));
  wav.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
}
const tmp = join(tmpdir(), `orbit-${process.pid}.wav`);
writeFileSync(tmp, wav);
mkdirSync(dirname(OUT), { recursive: true });
const enc = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '128k', OUT], { stdio: 'inherit' });
if (process.argv.includes('--keep-wav')) console.log(`WAV：${tmp}`);
else rmSync(tmp, { force: true });
if (enc.status !== 0) {
  console.error('ffmpeg 编码失败（需要 ffmpeg 在 PATH 里）');
  process.exit(1);
}
console.log(`完成：${OUT}（${LENGTH} 秒循环，峰值归一化 ${(20 * Math.log10(0.89)).toFixed(1)} dBFS）`);
