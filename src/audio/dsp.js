// Small DSP toolkit shared by the instruments, the SFX bank and the self-test renderer.
// Everything here is cosmetic randomness (audio only), so seeded PRNGs are used for
// reproducible renders rather than for gameplay determinism.

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const TAU = Math.PI * 2;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** mulberry32 → () => [0,1) */
export function prng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** RBJ biquad running in JS (for sample-level synthesis of grains / voices). */
export function biquad(type, f, q, sr, gainDb = 0) {
  const st = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0 };
  st.set = (freq, Q = q) => {
    const w = TAU * clamp(freq, 10, sr * 0.45) / sr;
    const cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * Math.max(0.05, Q));
    const A = 10 ** (gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'lowpass': b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'highpass': b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'peaking': b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; break;
      default: b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; // bandpass (0 dB peak)
    }
    st.b0 = b0 / a0; st.b1 = b1 / a0; st.b2 = b2 / a0; st.a1 = a1 / a0; st.a2 = a2 / a0;
  };
  st.set(f, q);
  st.run = (x) => {
    const y = st.b0 * x + st.b1 * st.x1 + st.b2 * st.x2 - st.a1 * st.y1 - st.a2 * st.y2;
    st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y;
    return y;
  };
  return st;
}

/** One-pole lowpass state: y += a (x - y). */
export function onePole(f, sr) {
  const st = { y: 0, a: 0 };
  st.set = (freq) => { st.a = 1 - Math.exp(-TAU * clamp(freq, 1, sr * 0.49) / sr); };
  st.set(f);
  st.run = (x) => (st.y += st.a * (x - st.y));
  return st;
}

/** Band-limited sawtooth oscillator (polyBLEP). next(freq) → sample. */
export function blepSaw(sr, phase = 0) {
  let p = phase;
  return (f) => {
    const dt = f / sr;
    p += dt; if (p >= 1) p -= 1;
    let v = 2 * p - 1;
    if (p < dt) { const t = p / dt; v -= t + t - t * t - 1; } else if (p > 1 - dt) { const t = (p - 1) / dt; v -= t * t + t + t + 1; }
    return v;
  };
}

/** Vowel formants (adult male) F1, F2, F3 in Hz with relative gains. */
export const VOWELS = {
  a: [[730, 1], [1090, 0.5], [2440, 0.25]],
  e: [[530, 1], [1840, 0.45], [2480, 0.25]],
  i: [[300, 1], [2290, 0.35], [3010, 0.2]],
  o: [[570, 1], [840, 0.6], [2410, 0.15]],
  u: [[320, 1], [870, 0.4], [2240, 0.1]],
  m: [[250, 1], [1100, 0.08], [2300, 0.04]],
};

/**
 * Formant voice synthesiser for crowds / grunts. Renders into `out` (Float32Array) starting at sample `at`.
 * @param {object} o {sr, dur, pitch:(t)=>Hz, vowel:(t)=>[[f,g],...], amp:(t)=>0..1, breath, scale (formant scale)}
 */
export function renderVoice(out, at, o) {
  const { sr, dur } = o;
  const n = Math.floor(dur * sr);
  const saw = blepSaw(sr, o.phase ?? 0);
  const R = o.rand || Math.random;
  const fs = [0, 1, 2].map(() => biquad('bandpass', 500, 6, sr));
  const hp = biquad('highpass', 80, 0.7, sr);
  const breath = o.breath ?? 0.15;
  const scale = o.scale ?? 1;
  let vow = null, jitter = 0;
  for (let i = 0; i < n && at + i < out.length; i++) {
    const t = i / sr;
    if ((i & 63) === 0) {
      vow = o.vowel(t);
      for (let k = 0; k < 3; k++) fs[k].set(vow[k][0] * scale, 5 + k * 2);
      jitter = (R() - 0.5) * 0.02;
    }
    const a = o.amp(t);
    if (a <= 0.0005) { saw(o.pitch(t)); continue; }
    const src = saw(o.pitch(t) * (1 + jitter)) * 0.7 + (R() * 2 - 1) * breath;
    let y = 0;
    for (let k = 0; k < 3; k++) y += fs[k].run(src) * vow[k][1];
    out[at + i] += hp.run(y) * a;
  }
}

/** Equal-power crossfade of the last `xf` seconds into the head; returns a buffer of length `len` samples. */
export function makeSeamless(data, len, xfSamples) {
  const out = new Float32Array(len);
  out.set(data.subarray(0, len));
  for (let i = 0; i < xfSamples && len + i < data.length; i++) {
    const k = i / xfSamples;
    out[i] = out[i] * Math.sin(k * Math.PI / 2) + data[len + i] * Math.cos(k * Math.PI / 2);
  }
  return out;
}

/** Stereo reverb impulse response with early reflections and frequency-dependent decay. */
export function makeIR(ac, seconds = 2.2, decay = 0.45, seed = 7) {
  const sr = ac.sampleRate;
  const len = Math.floor(seconds * sr);
  const buf = ac.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const R = prng(seed + ch * 101);
    const d = buf.getChannelData(ch);
    const lp = onePole(9000, sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      if ((i & 255) === 0) lp.set(9000 * Math.exp(-t * 1.6) + 600);
      d[i] = lp.run((R() * 2 - 1)) * Math.exp(-t / decay) * (t < 0.008 ? t / 0.008 : 1);
    }
    for (let k = 0; k < 7; k++) { const at = Math.floor((0.009 + R() * 0.05) * sr); d[at] += (R() - 0.5) * 0.9; }
  }
  return buf;
}

/** Soft clipper curve: linear to 0.7, then tanh knee; |out| < 0.93 for any input. */
export function softClipCurve(n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x);
    c[i] = Math.sign(x) * (ax < 0.7 ? ax : 0.7 + 0.3 * Math.tanh((ax - 0.7) / 0.3));
  }
  return c;
}
/** Gentle saturation curve (tape / radio). */
export function driveCurve(drive = 2, n = 1024) {
  const c = new Float32Array(n);
  const k = Math.tanh(drive);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / k; }
  return c;
}

/** Stats of an AudioBuffer: peak, rms (dBFS), active duration, spectral centroid estimate. */
export function bufferStats(buf) {
  const chs = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
  const n = buf.length, sr = buf.sampleRate;
  let peak = 0, sum = 0, zc = 0, prev = 0, last = 0, first = -1;
  let clipped = 0;
  const win = Math.floor(sr * 0.05); let wSum = 0, wN = 0, active = 0, wins = 0;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (const d of chs) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (a >= 0.999) clipped++; m += d[i]; }
    m /= chs.length;
    sum += m * m; wSum += m * m; wN++;
    if ((m >= 0) !== (prev >= 0)) zc++;
    prev = m;
    if (Math.abs(m) > 0.0015) { last = i; if (first < 0) first = i; }
    if (wN === win) { wins++; if (Math.sqrt(wSum / wN) > 0.003) active++; wSum = 0; wN = 0; }
  }
  const rms = Math.sqrt(sum / Math.max(1, n));
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
  return {
    dur: +(n / sr).toFixed(2), audible: first < 0 ? 0 : +((last - first) / sr).toFixed(2),
    peakDb: +db(peak).toFixed(1), rmsDb: +db(rms).toFixed(1), clipped,
    active: +(active / Math.max(1, wins)).toFixed(2), zcr: Math.round((zc / Math.max(1, n)) * sr / 2),
  };
}
