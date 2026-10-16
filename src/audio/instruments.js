// Synthesised instruments. Every instrument has the signature
//   inst(K, out, t, f, dur, vel, o) → end time (s)
// K is a per-AudioContext kit (createKit) holding caches (noise, periodic waves, Karplus-Strong
// buffers) and the voice registrar used for polyphony limiting. Works on AudioContext and
// OfflineAudioContext alike, so the same code renders live music, pre-rendered SFX and self-tests.
import { prng, clamp } from './dsp.js';

/** Build the per-context kit. reg(gainNode, endTime, sources[]) registers a voice (may be a no-op). */
export function createKit(ac, reg = () => {}) {
  const sr = ac.sampleRate;
  const noise = ac.createBuffer(1, sr * 2, sr);
  { const R = prng(99); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1; }
  const waves = new Map();
  const ksCache = new Map();
  const K = {
    ac, sr, noise, reg, wow: null,
    wave(name) {
      if (!waves.has(name)) waves.set(name, makeWave(ac, name));
      return waves.get(name);
    },
    /** Karplus-Strong plucked string, cached per (note, kind, variant). */
    ks(f, kind = 'pluck', variant = 0) {
      const key = `${Math.round(f * 4)}|${kind}|${variant}`;
      let hit = ksCache.get(key);
      if (!hit) {
        hit = ksBuffer(ac, f, kind, variant);
        ksCache.set(key, hit);
        if (ksCache.size > 400) ksCache.delete(ksCache.keys().next().value);
      }
      return hit;
    },
  };
  return K;
}

function makeWave(ac, name) {
  const H = {
    piano: [0, 1, 0.55, 0.32, 0.22, 0.14, 0.09, 0.06, 0.04, 0.03, 0.02],
    reed: [0, 0.55, 1, 0.75, 0.55, 0.4, 0.28, 0.18, 0.12, 0.08, 0.05, 0.03],
    organ: [0, 1, 0.5, 0.0, 0.3, 0, 0.15, 0, 0.08],
    pulse25: null,
  }[name];
  let real, imag;
  if (name === 'pulse25') {
    const n = 32; real = new Float32Array(n); imag = new Float32Array(n);
    for (let k = 1; k < n; k++) { real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25) * 0; imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25); }
  } else {
    real = new Float32Array(H.length); imag = Float32Array.from(H);
  }
  return ac.createPeriodicWave(real, imag);
}

function ksBuffer(ac, f, kind, variant) {
  const sr = ac.sampleRate;
  const P = { pluck: { t60: 1.4, bright: 0.65, dur: 1.6 }, pizz: { t60: 0.32, bright: 0.45, dur: 0.6 }, harp: { t60: 2.4, bright: 0.55, dur: 2.6 } }[kind] || { t60: 1, bright: 0.6, dur: 1.2 };
  const N = Math.max(2, Math.round(sr / f - 0.5));
  const len = Math.floor(P.dur * sr);
  const out = new Float32Array(len);
  const ring = new Float32Array(N);
  const R = prng(Math.round(f * 13) + variant * 7919);
  let lp = 0;
  for (let i = 0; i < N; i++) { lp += P.bright * ((R() * 2 - 1) - lp); ring[i] = lp; }
  let mean = 0; for (let i = 0; i < N; i++) mean += ring[i]; mean /= N; for (let i = 0; i < N; i++) ring[i] -= mean;
  const rho = 10 ** ((-3 * (N / sr)) / P.t60);
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const cur = ring[idx], nxt = ring[idx + 1 === N ? 0 : idx + 1];
    out[i] = cur;
    ring[idx] = rho * 0.5 * (cur + nxt);
    idx = idx + 1 === N ? 0 : idx + 1;
  }
  // fade the tail so the buffer ends in silence
  const fl = Math.min(len, Math.floor(sr * 0.05));
  for (let i = 0; i < fl; i++) out[len - 1 - i] *= i / fl;
  const buf = ac.createBuffer(1, len, sr);
  buf.copyToChannel(out, 0);
  return { buf, rate: (f * (N + 0.5)) / sr };
}

// ------------------------------------------------------------------ helpers
const T0 = (t) => Math.max(0, t);
function gainNode(ac, out) { const g = ac.createGain(); g.gain.value = 0; g.connect(out); return g; }
function osc(ac, type, f, t, end, dest, K) {
  const o = ac.createOscillator();
  if (type === 'piano' || type === 'reed' || type === 'organ' || type === 'pulse25') o.setPeriodicWave(K.wave(type)); else o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.connect(dest); o.start(t); o.stop(end);
  return o;
}
function filt(ac, type, f, q, dest) {
  const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = clamp(f, 10, ac.sampleRate * 0.45); b.Q.value = q; b.connect(dest); return b;
}
function noiseSrc(K, t, end, dest, rate = 1) {
  const s = K.ac.createBufferSource(); s.buffer = K.noise; s.loop = true; s.playbackRate.value = rate;
  s.connect(dest); s.start(t, Math.random() * 1.5); s.stop(end); return s;
}
/** attack-decay(-sustain)-release envelope on a gain param */
function adsr(p, t, end, { a = 0.005, d = 0.2, s = 0.7, r = 0.15, peak = 1 }) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (s < 1) p.setTargetAtTime(peak * s, t + a, Math.max(0.005, d / 3));
  p.setTargetAtTime(0, Math.max(end, t + a), Math.max(0.005, r / 4));
  return Math.max(end, t + a) + r * 1.2;
}
function vibrato(ac, t, end, target, rate, cents, delay = 0.2) {
  const l = ac.createOscillator(); l.frequency.value = rate * (0.95 + Math.random() * 0.1);
  const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(cents, t + delay + 0.25);
  l.connect(g); g.connect(target); l.start(t); l.stop(end);
  return l;
}

// ------------------------------------------------------------------ pitched instruments
export function piano(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = gainNode(ac, out);
  const lp = filt(ac, 'lowpass', Math.min(12000, f * (3 + 7 * v) + 700), 0.4, g);
  lp.frequency.setTargetAtTime(Math.max(f * 1.6, 500), t + 0.02, 0.35);
  const tau = clamp(1.7 - (Math.log2(f / 130)) * 0.45, 0.25, 2.2) * (o.ring ?? 1);
  const peak = 0.22 * v * (o.gain ?? 1);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.004);
  g.gain.setTargetAtTime(0, t + 0.004, tau);
  const off = t + Math.max(0.08, dur);
  g.gain.setTargetAtTime(0, off, 0.07);
  const end = off + 0.45;
  const a = osc(ac, 'piano', f, t, end, lp, K);
  const b = osc(ac, 'piano', f, t, end, lp, K); b.detune.value = 3 + Math.random() * 2;
  K.reg(g, end, [a, b]);
  return end;
}

/** Rhodes-style electric piano: 2-op FM with decaying index. o.wow connects the lo-fi tape wobble. */
export function epiano(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = gainNode(ac, out);
  const off = t + Math.max(0.1, dur), end = off + 0.5;
  const car = osc(ac, 'sine', f, t, end, g, K);
  const mod = ac.createOscillator(); mod.frequency.value = f;
  const mg = ac.createGain();
  mg.gain.setValueAtTime(f * (0.9 + 1.6 * v), t); mg.gain.setTargetAtTime(f * 0.18, t + 0.005, 0.28);
  mod.connect(mg); mg.connect(car.frequency); mod.start(t); mod.stop(end);
  const tine = osc(ac, 'sine', f * 4.02, t, t + 0.4, g, K);
  const tg = ac.createGain(); tine.disconnect(); tine.connect(tg); tg.connect(g);
  tg.gain.setValueAtTime(0.12 * v, t); tg.gain.setTargetAtTime(0, t, 0.04);
  const peak = 0.2 * v * (o.gain ?? 1);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.003);
  g.gain.setTargetAtTime(peak * 0.25, t + 0.003, 0.9);
  g.gain.setTargetAtTime(0, off, 0.09);
  const wow = o.wow || K.wow;
  if (wow) { wow.connect(car.detune); car.onended = () => { try { wow.disconnect(car.detune); } catch { /* already */ } }; }
  K.reg(g, end, [car, mod, tine]);
  return end;
}

/** Karplus-Strong string. o.kind: 'pluck' | 'pizz' | 'harp'. */
export function pluck(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const kind = o.kind || 'pluck';
  const { buf, rate } = K.ks(f, kind, Math.floor(Math.random() * 3));
  const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
  const g = ac.createGain(); g.gain.value = 0.55 * v * (o.gain ?? 1);
  const off = t + Math.max(dur, kind === 'pizz' ? 0.3 : 0.6);
  const end = Math.min(t + buf.duration / rate, off + 0.2);
  g.gain.setValueAtTime(g.gain.value, off); g.gain.setTargetAtTime(0, off, 0.05);
  const node = s;
  if (kind === 'pizz') { const lp = filt(ac, 'lowpass', Math.min(9000, f * 5 + 1200), 0.6, g); s.connect(lp); } else s.connect(g);
  g.connect(out);
  s.start(t); s.stop(end + 0.05);
  K.reg(g, end, [node]);
  return end;
}
export const pizz = (K, out, t, f, dur, v, o = {}) => pluck(K, out, t, f, dur, v, { ...o, kind: 'pizz' });
export const harp = (K, out, t, f, dur, v, o = {}) => pluck(K, out, t, f, dur, v, { ...o, kind: 'harp' });

/** String ensemble pad: detuned saws → lowpass, slow attack. o.trem = tremolo rate (Hz). */
export function pad(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = gainNode(ac, out);
  let dest = g, lfo = null;
  if (o.trem) {
    const tg = ac.createGain(); tg.gain.value = 0.55; tg.connect(g); dest = tg;
    lfo = ac.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = o.trem * (0.95 + Math.random() * 0.1);
    const lg = ac.createGain(); lg.gain.value = 0.45; lfo.connect(lg); lg.connect(tg.gain);
  }
  const lp = filt(ac, 'lowpass', o.cutoff ?? (700 + 1500 * v + f * 1.5), 0.5, dest);
  const a = o.attack ?? 0.35, r = o.release ?? 0.7;
  const end = adsr(g.gain, t, t + dur, { a, d: 0.4, s: 0.85, r, peak: 0.05 * v * (o.gain ?? 1) });
  const srcs = [-9, 0, 8].map((c) => { const s = osc(ac, 'sawtooth', f, t, end, lp, K); s.detune.value = c + (Math.random() - 0.5) * 3; return s; });
  if (lfo) { lfo.start(t); lfo.stop(end); srcs.push(lfo); }
  K.reg(g, end, srcs);
  return end;
}

/** Solo violin / cello: saw + body formants + delayed vibrato. o.from = glide start frequency. */
export function violin(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = gainNode(ac, out);
  const lp = filt(ac, 'lowpass', o.cutoff ?? 5200, 0.5, g);
  const p2 = filt(ac, 'peaking', 2700, 1.8, lp); p2.gain.value = 5;
  const p1 = filt(ac, 'peaking', f < 300 ? 260 : 480, 1.4, p2); p1.gain.value = 6;
  const hp = filt(ac, 'highpass', Math.max(120, f * 0.6), 0.7, p1);
  const end = adsr(g.gain, t, t + dur, { a: o.attack ?? 0.07, d: 0.3, s: 0.85, r: o.release ?? 0.25, peak: 0.13 * v * (o.gain ?? 1) });
  const a = osc(ac, 'sawtooth', f, t, end, hp, K);
  const b = osc(ac, 'sawtooth', f, t, end, hp, K); b.detune.value = 7;
  if (o.from) for (const s of [a, b]) { s.frequency.setValueAtTime(o.from, t); s.frequency.exponentialRampToValueAtTime(f, t + 0.09); }
  const vib = vibrato(ac, t, end, a.detune, o.vibRate ?? 5.6, o.vib ?? 16, 0.18);
  const vib2 = vibrato(ac, t, end, b.detune, o.vibRate ?? 5.6, o.vib ?? 16, 0.18);
  K.reg(g, end, [a, b, vib, vib2]);
  return end;
}

/** Bass. o.type: 'round' (sine/tri, lo-fi), 'pick' (saw + filter env), 'sub'. */
export function bass(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = gainNode(ac, out);
  const type = o.type || 'round';
  const off = t + Math.max(0.08, dur);
  let srcs;
  if (type === 'pick') {
    const lp = filt(ac, 'lowpass', 300, 2, g);
    lp.frequency.setValueAtTime(f * 8 * v + 300, t); lp.frequency.setTargetAtTime(f * 2 + 120, t + 0.01, 0.09);
    srcs = [osc(ac, 'sawtooth', f, t, off + 0.3, lp, K), osc(ac, 'square', f / 2, t, off + 0.3, lp, K)];
    srcs[1].detune.value = 4;
  } else {
    const lp = filt(ac, 'lowpass', type === 'sub' ? 260 : 900, 0.5, g);
    srcs = [osc(ac, 'sine', f, t, off + 0.3, lp, K), osc(ac, 'triangle', f * 2, t, off + 0.3, lp, K)];
    const hg = ac.createGain(); hg.gain.value = type === 'sub' ? 0.05 : 0.22; srcs[1].disconnect(); srcs[1].connect(hg); hg.connect(lp);
  }
  const end = adsr(g.gain, t, off, { a: 0.006, d: 0.5, s: type === 'pick' ? 0.55 : 0.75, r: 0.09, peak: (type === 'pick' ? 0.2 : 0.42) * v * (o.gain ?? 1) });
  K.reg(g, end, srcs);
  return end;
}

const BELLS = {
  glock: { r: [1, 2.76, 5.4, 8.93], a: [1, 0.32, 0.12, 0.05], tau: [0.9, 0.3, 0.1, 0.05] },
  celesta: { r: [1, 2, 3, 4.1], a: [1, 0.25, 0.08, 0.04], tau: [0.7, 0.25, 0.12, 0.06] },
  musicbox: { r: [1, 2, 6.27], a: [1, 0.1, 0.3], tau: [1.3, 0.5, 0.15] },
  chime: { r: [1, 2.0, 3.0, 4.2, 5.4], a: [1, 0.5, 0.25, 0.12, 0.06], tau: [1.6, 0.9, 0.45, 0.25, 0.12] },
  ding: { r: [1, 2.0, 2.98, 4.07], a: [1, 0.3, 0.12, 0.05], tau: [1.1, 0.5, 0.25, 0.1] },
};
/** Struck idiophones. o.kind: glock | celesta | musicbox | chime | ding */
export function bell(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const B = BELLS[o.kind || 'glock'];
  const g = ac.createGain(); g.gain.value = 0.16 * v * (o.gain ?? 1); g.connect(out);
  const srcs = [];
  let end = t;
  B.r.forEach((r, i) => {
    const fr = f * r; if (fr > ac.sampleRate * 0.45) return;
    const pg = ac.createGain(); pg.connect(g);
    const tau = B.tau[i] * (o.ring ?? 1);
    pg.gain.setValueAtTime(0, t); pg.gain.linearRampToValueAtTime(B.a[i], t + 0.002); pg.gain.setTargetAtTime(0, t + 0.002, tau);
    const e = t + tau * 5;
    srcs.push(osc(ac, 'sine', fr, t, e, pg, K));
    if (o.vib) vibrato(ac, t, e, srcs[srcs.length - 1].detune, 5, o.vib, 0.05);
    end = Math.max(end, e);
  });
  K.reg(g, end, srcs);
  return end;
}
export const glock = (K, out, t, f, d, v, o = {}) => bell(K, out, t, f, d, v, { ...o, kind: 'glock' });
export const celesta = (K, out, t, f, d, v, o = {}) => bell(K, out, t, f, d, v, { ...o, kind: 'celesta' });
export const musicbox = (K, out, t, f, d, v, o = {}) => bell(K, out, t, f, d, v, { ...o, kind: 'musicbox' });

/** Mallets: o.kind 'marimba' | 'xylo' */
export function mallet(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const xylo = o.kind === 'xylo';
  const parts = xylo ? [[1, 1, 0.28], [3, 0.35, 0.06], [6.2, 0.1, 0.02]] : [[1, 1, 0.45], [4, 0.22, 0.06], [9.8, 0.05, 0.015]];
  const g = ac.createGain(); g.gain.value = 0.22 * v * (o.gain ?? 1); g.connect(out);
  const srcs = []; let end = t;
  for (const [r, a, tau] of parts) {
    const pg = ac.createGain(); pg.connect(g);
    pg.gain.setValueAtTime(0, t); pg.gain.linearRampToValueAtTime(a, t + 0.0015); pg.gain.setTargetAtTime(0, t + 0.0015, tau);
    srcs.push(osc(ac, 'sine', f * r, t, t + tau * 6, pg, K)); end = Math.max(end, t + tau * 6);
  }
  K.reg(g, end, srcs);
  return end;
}
export const marimba = (K, out, t, f, d, v, o = {}) => mallet(K, out, t, f, d, v, { ...o, kind: 'marimba' });
export const xylo = (K, out, t, f, d, v, o = {}) => mallet(K, out, t, f, d, v, { ...o, kind: 'xylo' });

/** Comedy low brass. o.slide (target Hz), o.wobble (cents), o.wah (filter LFO rate). */
export function tuba(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = gainNode(ac, out);
  const lp = filt(ac, 'lowpass', 200 + f, 2.2, g);
  const off = t + Math.max(0.08, dur);
  lp.frequency.setValueAtTime(150 + f, t);
  lp.frequency.linearRampToValueAtTime((450 + f * 3.5) * (0.6 + 0.6 * v), t + 0.05);
  lp.frequency.setTargetAtTime(280 + f * 2.2, t + 0.06, 0.15);
  const end = adsr(g.gain, t, off, { a: 0.03, d: 0.2, s: 0.8, r: 0.1, peak: 0.24 * v * (o.gain ?? 1) });
  const a = osc(ac, 'sawtooth', f * 0.94, t, end, lp, K);
  a.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  if (o.slide) a.frequency.exponentialRampToValueAtTime(o.slide, off);
  const srcs = [a];
  if (o.wobble) srcs.push(vibrato(ac, t, end, a.detune, 5.5, o.wobble, 0.1));
  if (o.wah) {
    const l = ac.createOscillator(); l.frequency.value = o.wah; const lg = ac.createGain(); lg.gain.value = 260 + f;
    l.connect(lg); lg.connect(lp.frequency); l.start(t); l.stop(end); srcs.push(l);
  }
  K.reg(g, end, srcs);
  return end;
}

/** Bassoon: reedy periodic wave through a nasal formant, light vibrato. */
export function bassoon(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = gainNode(ac, out);
  const lp = filt(ac, 'lowpass', 2600, 0.6, g);
  const bp = filt(ac, 'peaking', 520, 1.4, lp); bp.gain.value = 8;
  const pk = filt(ac, 'peaking', 1200, 2, bp); pk.gain.value = 4;
  const end = adsr(g.gain, t, t + Math.max(0.06, dur), { a: 0.025, d: 0.15, s: 0.75, r: 0.06, peak: 0.2 * v * (o.gain ?? 1) });
  const a = osc(ac, 'reed', f, t, end, pk, K);
  const vb = vibrato(ac, t, end, a.detune, 5, 9, 0.12);
  K.reg(g, end, [a, vb]);
  return end;
}

/** Brass section / trumpet: two saws, opening filter "bwah", slight scoop. */
export function brass(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = gainNode(ac, out);
  const lp = filt(ac, 'lowpass', f * 1.5, 1.2, g);
  const off = t + Math.max(0.06, dur);
  lp.frequency.setValueAtTime(f * 1.2, t);
  lp.frequency.linearRampToValueAtTime(Math.min(9000, f * (3 + 6 * v)), t + 0.05);
  lp.frequency.setTargetAtTime(Math.min(7000, f * 2.6 + 400), t + 0.06, 0.2);
  const end = adsr(g.gain, t, off, { a: 0.035, d: 0.25, s: 0.75, r: 0.12, peak: 0.11 * v * (o.gain ?? 1) });
  const srcs = [-6, 6].map((c) => { const s = osc(ac, 'sawtooth', f * 0.97, t, end, lp, K); s.detune.value = c; s.frequency.exponentialRampToValueAtTime(f, t + 0.04); return s; });
  if (dur > 0.5) srcs.push(vibrato(ac, t, end, srcs[0].detune, 5.2, 10, 0.3));
  K.reg(g, end, srcs);
  return end;
}

/** 8-bit square lead (25 % pulse). o.arp = semitone offsets cycled every 1/30 s. */
export function chip(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = gainNode(ac, out);
  const end = adsr(g.gain, t, t + dur, { a: 0.002, d: 0.08, s: 0.6, r: 0.03, peak: 0.09 * v * (o.gain ?? 1) });
  const a = osc(ac, 'pulse25', f, t, end, g, K);
  if (o.arp) { let i = 0; for (let tt = t; tt < end; tt += 1 / 30) a.frequency.setValueAtTime(f * 2 ** (o.arp[i++ % o.arp.length] / 12), tt); }
  if (o.slide) a.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
  K.reg(g, end, [a]);
  return end;
}

/** Theremin-ish sine lead with wide vibrato and portamento (mystery). */
export function theremin(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = gainNode(ac, out);
  const lp = filt(ac, 'lowpass', 2400, 0.5, g);
  const end = adsr(g.gain, t, t + dur, { a: 0.14, d: 0.3, s: 0.9, r: 0.35, peak: 0.12 * v * (o.gain ?? 1) });
  const a = osc(ac, 'sine', o.from || f, t, end, lp, K);
  if (o.from) a.frequency.exponentialRampToValueAtTime(f, t + 0.16);
  const b = osc(ac, 'triangle', o.from || f, t, end, lp, K); b.detune.value = 1200;
  const bg = ac.createGain(); bg.gain.value = 0.08; b.disconnect(); b.connect(bg); bg.connect(lp);
  if (o.from) b.frequency.exponentialRampToValueAtTime(f, t + 0.16);
  const v1 = vibrato(ac, t, end, a.detune, 6.2, 28, 0.1);
  const v2 = vibrato(ac, t, end, b.detune, 6.2, 28, 0.1);
  K.reg(g, end, [a, b, v1, v2]);
  return end;
}

// ------------------------------------------------------------------ percussion
export function kick(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = ac.createGain(); g.connect(out);
  const pk = 0.7 * v * (o.gain ?? 1);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, o.soft ? 0.08 : 0.11);
  const a = osc(ac, 'sine', 150, t, t + 0.5, g, K);
  a.frequency.setValueAtTime(o.soft ? 110 : 155, t); a.frequency.exponentialRampToValueAtTime(o.soft ? 45 : 48, t + 0.12);
  const cg = ac.createGain(); cg.connect(out);
  cg.gain.setValueAtTime(0.25 * v * (o.soft ? 0.3 : 1), t); cg.gain.setTargetAtTime(0, t, 0.004);
  const n = noiseSrc(K, t, t + 0.03, filt(ac, 'highpass', 1500, 0.7, cg));
  K.reg(g, t + 0.5, [a, n]);
  return t + 0.5;
}
export function snare(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = ac.createGain(); g.connect(out);
  const pk = 0.32 * v * (o.gain ?? 1), tau = o.tau ?? (o.soft ? 0.05 : 0.07);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.0015); g.gain.setTargetAtTime(0, t + 0.0015, tau);
  const lp = filt(ac, 'lowpass', o.soft ? 4500 : 9000, 0.5, g);
  const bp = filt(ac, 'highpass', 900, 0.6, lp);
  const n = noiseSrc(K, t, t + tau * 6, bp);
  const bg = ac.createGain(); bg.connect(out);
  bg.gain.setValueAtTime(0.3 * v * (o.gain ?? 1), t); bg.gain.setTargetAtTime(0, t, 0.035);
  const b = osc(ac, 'triangle', 190, t, t + 0.2, bg, K); b.frequency.exponentialRampToValueAtTime(150, t + 0.05);
  K.reg(g, t + tau * 6, [n, b]);
  return t + tau * 6;
}
export function hat(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = ac.createGain(); g.connect(out);
  const tau = o.open ? 0.12 : 0.018;
  g.gain.setValueAtTime(0.18 * v * (o.gain ?? 1), t); g.gain.setTargetAtTime(0, t, tau);
  const bp = filt(ac, 'bandpass', 10000, 0.9, g);
  const hp = filt(ac, 'highpass', 7000, 0.7, bp);
  const n = noiseSrc(K, t, t + tau * 7, hp);
  K.reg(g, t + tau * 7, [n]);
  return t + tau * 7;
}
export const ohat = (K, out, t, f, d, v, o = {}) => hat(K, out, t, f, d, v, { ...o, open: true });
export function shaker(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = ac.createGain(); g.connect(out);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09 * v * (o.gain ?? 1), t + 0.012); g.gain.setTargetAtTime(0, t + 0.012, 0.025);
  const n = noiseSrc(K, t, t + 0.2, filt(ac, 'bandpass', 6500, 1.2, g));
  K.reg(g, t + 0.2, [n]);
  return t + 0.2;
}
export function clap(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = ac.createGain(); g.connect(out);
  const pk = 0.3 * v * (o.gain ?? 1);
  g.gain.setValueAtTime(0, t);
  for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(pk, t + i * 0.011); g.gain.setTargetAtTime(0, t + i * 0.011 + 0.001, 0.004); }
  g.gain.setValueAtTime(pk * 0.8, t + 0.034); g.gain.setTargetAtTime(0, t + 0.035, 0.06);
  const n = noiseSrc(K, t, t + 0.4, filt(ac, 'bandpass', 1300, 1.1, g));
  K.reg(g, t + 0.4, [n]);
  return t + 0.4;
}
/** Woodblock / rim / clock tick. f = pitch. */
export function wood(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = ac.createGain(); g.connect(out);
  g.gain.setValueAtTime(0.25 * v * (o.gain ?? 1), t); g.gain.setTargetAtTime(0, t, o.tau ?? 0.018);
  const a = osc(ac, 'sine', f || 1200, t, t + 0.15, g, K);
  const ng = ac.createGain(); ng.connect(out);
  ng.gain.setValueAtTime(0.12 * v * (o.gain ?? 1), t); ng.gain.setTargetAtTime(0, t, 0.003);
  const n = noiseSrc(K, t, t + 0.03, filt(ac, 'bandpass', (f || 1200) * 2, 1.5, ng));
  K.reg(g, t + 0.15, [a, n]);
  return t + 0.15;
}
export const tick = (K, out, t, f, d, v, o = {}) => wood(K, out, t, f || 2600, d, v, { tau: 0.01, ...o });
export function tom(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = ac.createGain(); g.connect(out);
  g.gain.setValueAtTime(0.5 * v * (o.gain ?? 1), t); g.gain.setTargetAtTime(0, t, 0.12);
  const a = osc(ac, 'sine', f * 1.6, t, t + 0.7, g, K); a.frequency.exponentialRampToValueAtTime(f, t + 0.08);
  K.reg(g, t + 0.7, [a]);
  return t + 0.7;
}
export function timpani(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = ac.createGain(); g.connect(out);
  const tau = o.tau ?? 0.6;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * v * (o.gain ?? 1), t + 0.004); g.gain.setTargetAtTime(0, t + 0.004, tau);
  const srcs = [[1, 1], [1.5, 0.35], [1.99, 0.22], [2.44, 0.1]].map(([r, a]) => {
    const pg = ac.createGain(); pg.gain.value = a; pg.connect(g);
    const s = osc(ac, 'sine', f * r * 1.03, t, t + tau * 5, pg, K); s.frequency.exponentialRampToValueAtTime(f * r, t + 0.06); return s;
  });
  const ng = ac.createGain(); ng.connect(out); ng.gain.setValueAtTime(0.25 * v, t); ng.gain.setTargetAtTime(0, t, 0.02);
  srcs.push(noiseSrc(K, t, t + 0.1, filt(ac, 'lowpass', 500, 0.7, ng)));
  K.reg(g, t + tau * 5, srcs);
  return t + tau * 5;
}
export function crash(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = ac.createGain(); g.connect(out);
  const tau = o.tau ?? 0.7;
  if (o.swell) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2 * v, t + dur); g.gain.setTargetAtTime(0, t + dur, 0.05); }
  else { g.gain.setValueAtTime(0.2 * v * (o.gain ?? 1), t); g.gain.setTargetAtTime(0, t, tau); }
  const end = t + (o.swell ? dur + 0.3 : tau * 5);
  const n = noiseSrc(K, t, end, filt(ac, 'highpass', 4500, 0.6, filt(ac, 'peaking', 8000, 1, g)));
  K.reg(g, end, [n]);
  return end;
}
/** Heartbeat "lub-dub" (dub 0.17 s later). */
export function heart(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = ac.createGain(); g.gain.value = (o.gain ?? 1) * v; g.connect(out);
  const srcs = [];
  for (const [dt, a, f0] of [[0, 1, 62], [0.17, 0.7, 70]]) {
    const pg = ac.createGain(); pg.connect(g);
    pg.gain.setValueAtTime(0, t + dt); pg.gain.linearRampToValueAtTime(0.6 * a, t + dt + 0.008); pg.gain.setTargetAtTime(0, t + dt + 0.01, 0.05);
    const s = osc(ac, 'sine', f0, t + dt, t + dt + 0.3, pg, K); s.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + dt + 0.1);
    srcs.push(s);
  }
  K.reg(g, t + 0.5, srcs);
  return t + 0.5;
}
/** Cricket chirp: 3–4 rapid sine pulses. */
export function cricket(K, out, t, f, dur, v, o = {}) {
  const { ac } = K; t = T0(t);
  const g = ac.createGain(); g.gain.value = 0; g.connect(out);
  const pulses = o.pulses ?? 3, pk = 0.08 * v * (o.gain ?? 1);
  for (let i = 0; i < pulses; i++) {
    const tt = t + i * 0.032;
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(pk, tt + 0.004); g.gain.linearRampToValueAtTime(pk * 0.7, tt + 0.014); g.gain.linearRampToValueAtTime(0, tt + 0.02);
  }
  const end = t + pulses * 0.032 + 0.03;
  const a = osc(ac, 'sine', f || 4400, t, end, g, K);
  K.reg(g, end, [a]);
  return end;
}

export const INSTRUMENTS = {
  piano, epiano, pluck, pizz, harp, pad, violin, bass, bell, glock, celesta, musicbox, marimba, xylo,
  tuba, bassoon, brass, chip, theremin, kick, snare, hat, ohat, shaker, clap, wood, tick, tom, timpani, crash, heart, cricket,
};
