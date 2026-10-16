// Sound-effect recipes + the offline pre-render bank.
// Each recipe builds a node graph (and/or JS-synthesised sample buffers) inside an
// OfflineAudioContext; the bank renders every recipe to AudioBuffers (a few random variants each)
// so playback costs one BufferSource. Loops are made seamless with an equal-power crossfade.
import { createKit, INSTRUMENTS } from './instruments.js';
import { prng, biquad, onePole, renderVoice, VOWELS, makeSeamless, makeIR, clamp } from './dsp.js';
import { mtof, midi } from './theory.js';

export const SFX_SR = 44100;

// ------------------------------------------------------------------ recipe helpers
function helpers(ac, out, R) {
  const K = createKit(ac);
  const sr = ac.sampleRate;
  const X = {
    ac, out, R, sr, K,
    rr: (a, b) => a + (b - a) * R(),
    pan(p, dest = out) { if (!ac.createStereoPanner) return dest; const n = ac.createStereoPanner(); n.pan.value = clamp(p, -1, 1); n.connect(dest); return n; },
    gain(v, dest = out) { const g = ac.createGain(); g.gain.value = v; g.connect(dest); return g; },
    filter(type, f, q = 0.7, dest = out, gainDb = 0) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = clamp(f, 10, sr * 0.45); b.Q.value = q; b.gain.value = gainDb; b.connect(dest); return b; },
    /** oscillator with envelope. o: a, tau (exp decay), hold (linear sustain before decay), peak, f2, glide, dest, detune */
    tone(type, f, t, o = {}) {
      const g = ac.createGain(); g.connect(o.dest || out);
      const a = o.a ?? 0.003, peak = o.peak ?? 0.5, hold = o.hold ?? 0, tau = o.tau ?? 0.1;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
      if (hold) g.gain.setValueAtTime(peak, t + a + hold);
      g.gain.setTargetAtTime(0, t + a + hold, tau);
      const s = ac.createOscillator(); s.type = type; s.frequency.setValueAtTime(f, t);
      if (o.f2) s.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + (o.glide ?? (a + hold + tau * 2)));
      if (o.detune) s.detune.value = o.detune;
      s.connect(g); s.start(t); s.stop(t + a + hold + tau * 7 + 0.01);
      return s;
    },
    /** filtered noise burst. o: type, f, q, f2 (filter sweep), glide, a, hold, tau, peak, dest, rate */
    nz(t, o = {}) {
      const g = ac.createGain(); g.connect(o.dest || out);
      const a = o.a ?? 0.002, peak = o.peak ?? 0.5, hold = o.hold ?? 0, tau = o.tau ?? 0.05;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
      if (hold) g.gain.setValueAtTime(peak, t + a + hold);
      g.gain.setTargetAtTime(0, t + a + hold, tau);
      const b = ac.createBiquadFilter(); b.type = o.type || 'bandpass'; b.frequency.setValueAtTime(clamp(o.f ?? 1000, 10, sr * 0.45), t); b.Q.value = o.q ?? 1;
      if (o.f2) b.frequency.exponentialRampToValueAtTime(clamp(o.f2, 10, sr * 0.45), t + (o.glide ?? (a + hold + tau)));
      b.connect(g);
      const s = ac.createBufferSource(); s.buffer = K.noise; s.loop = true; s.playbackRate.value = o.rate ?? 1;
      s.connect(b); s.start(t, R() * 1.5); s.stop(t + a + hold + tau * 7 + 0.01);
      return { g, b, s };
    },
    /** play a JS-synthesised mono buffer: fill(data, sr, R) */
    js(fill, o = {}) {
      const len = Math.floor((o.dur ?? (ac.length / sr)) * sr);
      const buf = ac.createBuffer(1, len, sr);
      fill(buf.getChannelData(0), sr, R);
      const s = ac.createBufferSource(); s.buffer = buf;
      s.connect(o.dest || out); s.start(o.t ?? 0);
      return s;
    },
    inst(name, t, f, dur, v, o) { return INSTRUMENTS[name](K, o?.dest || out, t, f, dur, v, o || {}); },
    reverb(seconds = 1.2, decay = 0.25, wet = 0.3) {
      const c = ac.createConvolver(); c.buffer = makeIR(ac, seconds, decay, Math.floor(R() * 1000)); c.connect(X.gain(wet));
      const inG = ac.createGain(); inG.connect(c); inG.connect(out); return inG;
    },
  };
  return X;
}

/** add one decaying band-passed noise grain into data */
function grain(d, sr, R, at, len, amp, f, q) {
  const bq = biquad('bandpass', f, q, sr);
  const n = Math.floor(len * sr), s0 = Math.floor(at * sr);
  for (let i = 0; i < n && s0 + i < d.length; i++) d[s0 + i] += bq.run(R() * 2 - 1) * amp * Math.exp(-i / (n * 0.3)) * (i < 8 ? i / 8 : 1);
}

/** crowd of formant voices into data */
function crowd(d, sr, R, n, mk) {
  for (let k = 0; k < n; k++) { const o = mk(k); renderVoice(d, Math.floor(o.at * sr), { sr, rand: R, ...o }); }
}
const vowelLerp = (a, b, k) => VOWELS[a].map(([f, g], i) => [f + (VOWELS[b][i][0] - f) * k, g + (VOWELS[b][i][1] - g) * k]);

// ------------------------------------------------------------------ recipes
// dur: render length (s); variants; loop: 'xf' (seamless crossfade) | 'cut' (exact period); level: playback gain.
export const SFX = {
  paperCrumple: { dur: 0.75, variants: 3, level: 0.8, make(X) {
    X.js((d, sr, R) => {
      const clusters = 3 + Math.floor(R() * 2);
      for (let c = 0; c < clusters; c++) {
        const c0 = 0.02 + c * (0.6 / clusters) + R() * 0.04;
        const n = 14 + Math.floor(R() * 14);
        for (let i = 0; i < n; i++) grain(d, sr, R, c0 + R() * 0.16, 0.003 + R() * 0.018, 0.25 + R() * 0.75, 1200 + R() * 6500, 0.8 + R() * 3);
      }
      const lp = biquad('bandpass', 700, 0.6, sr);
      for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] += lp.run(R() * 2 - 1) * 0.08 * Math.sin(Math.PI * Math.min(1, t / 0.7)); }
    });
  } },
  paperUnfold: { dur: 0.9, variants: 2, level: 0.75, make(X) {
    X.js((d, sr, R) => {
      for (let i = 0; i < 26; i++) grain(d, sr, R, 0.03 + R() * 0.75, 0.006 + R() * 0.03, 0.2 + R() * 0.6, 900 + R() * 4500, 0.6 + R() * 2);
      const bp = biquad('bandpass', 500, 0.5, sr);
      for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] += bp.run(R() * 2 - 1) * 0.25 * Math.exp(-((t - 0.45) ** 2) / 0.02); }
    });
  } },
  whoosh: { dur: 0.8, variants: 3, level: 0.75, make(X) {
    const p = X.ac.createStereoPanner ? X.ac.createStereoPanner() : null;
    const dest = p ? (p.connect(X.out), p) : X.out;
    if (p) { p.pan.setValueAtTime(-0.6, 0); p.pan.linearRampToValueAtTime(0.6, 0.7); }
    const f0 = X.rr(350, 500);
    const n = X.nz(0, { f: f0, f2: X.rr(1800, 2600), glide: 0.32, q: 1.6, a: 0.28, tau: 0.12, peak: 0.9, dest });
    n.b.frequency.exponentialRampToValueAtTime(500, 0.75);
    X.nz(0.05, { type: 'lowpass', f: 500, a: 0.25, tau: 0.1, peak: 0.4, dest });
  } },
  swoosh: { dur: 0.4, variants: 3, level: 0.6, make(X) {
    X.nz(0, { f: X.rr(1500, 2200), f2: X.rr(4500, 6000), glide: 0.12, q: 1.2, a: 0.08, tau: 0.06, peak: 0.8 });
  } },
  thudDesk: { dur: 0.35, variants: 3, level: 0.9, make(X) {
    X.tone('sine', X.rr(150, 180), 0, { f2: 70, glide: 0.08, tau: 0.04, peak: 0.8 });
    X.nz(0, { type: 'lowpass', f: 1400, tau: 0.012, peak: 0.6 });
    X.nz(0, { f: X.rr(330, 420), q: 5, tau: 0.04, peak: 0.6 });
    X.js((d, sr, R) => { for (let i = 0; i < 6; i++) grain(d, sr, R, 0.004 + R() * 0.05, 0.004, 0.15, 2500 + R() * 3000, 1.5); });
  } },
  thudHead: { dur: 0.6, variants: 3, level: 0.85, make(X) {
    const f = X.rr(480, 560);
    const s = X.tone('triangle', f, 0, { f2: f * 0.5, glide: 0.18, tau: 0.12, peak: 0.7 });
    const l = X.ac.createOscillator(); l.frequency.value = 22; const lg = X.ac.createGain(); lg.gain.value = 40; l.connect(lg); lg.connect(s.frequency); l.start(0); l.stop(0.5);
    X.tone('sine', f * 2.3, 0, { tau: 0.05, peak: 0.25 });
    X.nz(0, { f: 1800, q: 2, tau: 0.008, peak: 0.6 });
    X.tone('sine', 120, 0, { f2: 70, tau: 0.04, peak: 0.6 });
  } },
  bounceSoft: { dur: 0.3, variants: 3, level: 0.7, make(X) {
    X.nz(0, { type: 'lowpass', f: X.rr(700, 1000), tau: 0.025, peak: 0.8 });
    X.tone('sine', X.rr(170, 220), 0, { f2: 110, tau: 0.03, peak: 0.45 });
    X.js((d, sr, R) => { for (let i = 0; i < 5; i++) grain(d, sr, R, R() * 0.06, 0.005, 0.12, 2000 + R() * 3000, 1.2); });
  } },
  chalkScratch: { dur: 4, variants: 1, loop: 'xf', xf: 0.25, level: 0.5, make(X) {
    X.js((d, sr, R) => {
      let t = 0.05;
      while (t < 4.2) {
        const len = 0.12 + R() * 0.38, f = 2600 + R() * 2200, fl = 35 + R() * 55;
        const bq = biquad('bandpass', f, 3, sr), s0 = Math.floor(t * sr), n = Math.floor(len * sr);
        const squeak = R() < 0.3, sf = 2300 + R() * 1200;
        for (let i = 0; i < n && s0 + i < d.length; i++) {
          const tt = i / sr, env = Math.sin(Math.PI * tt / len) ** 0.6;
          const am = 0.4 + 0.6 * Math.max(0, Math.sin(2 * Math.PI * fl * tt + Math.sin(tt * 37)));
          d[s0 + i] += bq.run(R() * 2 - 1) * env * am * 0.9;
          if (squeak && tt < 0.2) d[s0 + i] += Math.sin(2 * Math.PI * (sf + 60 * Math.sin(tt * 50)) * tt) * 0.12 * Math.sin(Math.PI * tt / 0.2);
        }
        t += len + 0.05 + R() * (R() < 0.3 ? 0.5 : 0.12);
      }
    }, { dur: 4.25 });
  } },
  chalkTap: { dur: 0.25, variants: 3, level: 0.75, make(X) {
    X.nz(0, { f: X.rr(2200, 3000), q: 2, tau: 0.006, peak: 0.9 });
    X.tone('sine', X.rr(200, 240), 0, { tau: 0.025, peak: 0.4 });
    X.nz(0.001, { type: 'highpass', f: 5000, tau: 0.004, peak: 0.3 });
  } },
  bell: { dur: 5.4, variants: 1, level: 0.75, make(X) {
    // Westminster quarters on an electronic chime (the school bell)
    const seq = ['E5', 'C5', 'D5', 'G4', 'G4', 'D5', 'E5', 'C5'];
    const rv = X.reverb(1.6, 0.4, 0.25);
    seq.forEach((n, i) => X.inst('bell', i * 0.5 + (i >= 4 ? 0.25 : 0), mtof(midi(n)), 1, 0.9, { kind: 'chime', vib: 6, gain: 2.2, ring: i === 7 ? 1.4 : 0.9, dest: rv }));
  } },
  heartbeat: { dur: 1.0, variants: 2, loop: 'cut', level: 0.95, make(X) {
    for (const [t, a, f] of [[0.02, 1, 60], [0.2, 0.7, 72]]) {
      X.tone('sine', f, t, { f2: f * 0.65, glide: 0.1, a: 0.008, tau: 0.05, peak: 0.9 * a });
      X.nz(t, { type: 'lowpass', f: 160, tau: 0.03, peak: 0.6 * a });
    }
  } },
  stingDanger: { dur: 1.6, variants: 2, level: 0.75, make(X) {
    const rv = X.reverb(1.4, 0.35, 0.3);
    for (const t of [0, 0.17]) {
      for (const n of ['C2', 'C#3', 'G3']) X.inst('brass', t, mtof(midi(n)), 0.12, 1, { dest: rv, gain: 1.6 });
      X.inst('timpani', t, 65, 0.3, 0.9, { dest: rv });
    }
    for (const n of ['F#6', 'G6']) X.inst('pad', 0.3, mtof(midi(n)), 0.7, 1, { trem: 14, attack: 0.15, release: 0.4, dest: rv, gain: 2.5 });
  } },
  stingReveal: { dur: 2.0, variants: 2, level: 0.7, make(X) {
    const rv = X.reverb(1.8, 0.5, 0.35);
    ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6'].forEach((n, i) => X.inst('harp', i * 0.035, mtof(midi(n)), 1, 0.6, { dest: rv }));
    for (const n of ['C5', 'E5', 'G5', 'B5', 'D6']) X.inst('bell', 0.34, mtof(midi(n)), 1, 0.6, { kind: 'celesta', dest: rv });
    X.nz(0.3, { type: 'highpass', f: 6000, a: 0.05, tau: 0.4, peak: 0.12, dest: rv });
  } },
  sparkle: { dur: 1.1, variants: 3, level: 0.55, make(X) {
    const rv = X.reverb(1, 0.3, 0.3);
    for (let i = 0; i < 11; i++) X.tone('sine', X.rr(2200, 3000) * (1 + i * 0.12), i * 0.05 + X.rr(0, 0.03), { tau: 0.08, peak: 0.25, dest: rv });
    X.nz(0, { type: 'highpass', f: 7000, a: 0.1, tau: 0.2, peak: 0.1, dest: rv });
  } },
  recordScratch: { dur: 0.6, variants: 2, level: 0.8, make(X) {
    const curve = [[0, 120], [0.07, 1100], [0.16, 140], [0.25, 900], [0.42, 50]];
    const s = X.ac.createOscillator(); s.type = 'sawtooth';
    const bp = X.filter('bandpass', 900, 1.2);
    const g = X.gain(0, bp);
    const n = X.nz(0, { f: 900, q: 1.5, a: 0.005, hold: 0.42, tau: 0.01, peak: 0.6 });
    curve.forEach(([t, f], i) => {
      if (i === 0) { s.frequency.setValueAtTime(f, t); n.b.frequency.setValueAtTime(f * 3, t); } else { s.frequency.linearRampToValueAtTime(f, t); n.b.frequency.linearRampToValueAtTime(f * 3, t); }
    });
    g.gain.setValueAtTime(0.5, 0); g.gain.setValueAtTime(0.5, 0.4); g.gain.linearRampToValueAtTime(0, 0.43);
    s.connect(g); s.start(0); s.stop(0.45);
  } },
  gasp: { dur: 0.6, variants: 2, level: 0.7, make(X) {
    X.js((d, sr, R) => crowd(d, sr, R, 3, (k) => ({
      at: k * 0.02 + R() * 0.03, dur: 0.38, pitch: (t) => 180 + 60 * k + t * 300, scale: 1 + k * 0.1, breath: 4,
      vowel: () => VOWELS.a, amp: (t) => 0.06 * Math.min(1, t / 0.25) * (t > 0.34 ? Math.max(0, 1 - (t - 0.34) / 0.04) : 1),
    })));
  } },
  laughCrowd: { dur: 2.8, variants: 2, level: 0.75, make(X) {
    const rv = X.reverb(1, 0.25, 0.25);
    X.js((d, sr, R) => crowd(d, sr, R, 11, (k) => {
      const rate = 4.5 + R() * 2.5, f0 = (k % 2 ? 230 : 130) * (0.85 + R() * 0.4), len = 1.2 + R() * 1.3, v = R() < 0.5 ? 'a' : 'e';
      return { at: R() * 0.35, dur: len, scale: k % 2 ? 1.15 : 1, breath: 0.5, pitch: (t) => f0 * (1.25 - 0.35 * t / len) * (1 + 0.08 * Math.sin(t * rate * 6.28)),
        vowel: () => VOWELS[v], amp: (t) => { const ph = (t * rate) % 1; return 0.05 * (ph < 0.55 ? Math.sin(Math.PI * ph / 0.55) : 0) * Math.min(1, t / 0.05) * Math.max(0, 1 - t / len); } };
    }), { dest: rv });
  } },
  clapCrowd: { dur: 2.8, variants: 2, level: 0.7, make(X) {
    X.js((d, sr, R) => {
      for (let p = 0; p < 16; p++) {
        const rate = 4 + R() * 2.5, f = 900 + R() * 1600, start = R() * 0.3, stop = 1.8 + R() * 0.9;
        for (let t = start; t < stop; t += 1 / rate + (R() - 0.5) * 0.03) grain(d, sr, R, t, 0.012 + R() * 0.01, (0.4 + R() * 0.6) * Math.min(1, (stop - t) / 0.6), f * (0.9 + R() * 0.2), 1.2);
      }
    });
  } },
  ooh: { dur: 1.8, variants: 2, level: 0.7, make(X) {
    const rv = X.reverb(1, 0.25, 0.25);
    X.js((d, sr, R) => crowd(d, sr, R, 10, (k) => {
      const f0 = (k % 2 ? 260 : 150) * (0.9 + R() * 0.25), len = 1.3 + R() * 0.3;
      return { at: R() * 0.12, dur: len, scale: k % 2 ? 1.15 : 1, breath: 0.2,
        pitch: (t) => { const u = t / len; return f0 * 2 ** ((u < 0.45 ? u / 0.45 * 5 : 5 - (u - 0.45) / 0.55 * 9) / 12); },
        vowel: (t) => vowelLerp('u', 'o', Math.min(1, t / len * 1.5)), amp: (t) => 0.06 * Math.min(1, t / 0.15) * Math.max(0, 1 - Math.max(0, t - len + 0.4) / 0.4) };
    }), { dest: rv });
  } },
  murmur: { dur: 6, variants: 1, loop: 'xf', xf: 0.5, level: 0.55, make(X) {
    const lp = X.filter('lowpass', 2600, 0.5);
    X.js((d, sr, R) => {
      const vs = ['a', 'e', 'i', 'o', 'u'];
      for (let k = 0; k < 8; k++) {
        let t = R() * 0.6;
        while (t < 6.4) {
          const syl = 4 + Math.floor(R() * 9), sl = 0.11 + R() * 0.08, f0 = (k % 2 ? 210 : 125) * (0.85 + R() * 0.35);
          const seq = Array.from({ length: syl }, () => vs[Math.floor(R() * 5)]);
          renderVoice(d, Math.floor(t * sr), { sr, rand: R, dur: syl * sl, scale: k % 2 ? 1.15 : 1, breath: 0.3,
            pitch: (tt) => f0 * (1 + 0.12 * Math.sin(tt * 3 + k)) * (1 - 0.1 * tt / (syl * sl)),
            vowel: (tt) => VOWELS[seq[Math.min(syl - 1, Math.floor(tt / sl))]],
            amp: (tt) => 0.03 * Math.sin(Math.PI * ((tt / sl) % 1)) ** 0.7 });
          t += syl * sl + 0.3 + R() * 1.2;
        }
      }
    }, { dest: lp, dur: 6.5 });
  } },
  footstep: { dur: 0.55, variants: 3, loop: 'cut', level: 0.7, make(X) {
    X.nz(0.005, { type: 'lowpass', f: X.rr(700, 1000), tau: 0.018, peak: 0.9 });
    X.tone('sine', X.rr(80, 100), 0.005, { f2: 55, tau: 0.03, peak: 0.6 });
    X.nz(0.05, { f: 2500, q: 1.5, tau: 0.01, peak: 0.25 });
  } },
  chairScrape: { dur: 0.8, variants: 3, level: 0.6, make(X) {
    const s = X.ac.createOscillator(); s.type = 'sawtooth';
    const len = X.rr(0.4, 0.65);
    let f = X.rr(70, 110);
    for (let t = 0; t < len; t += 0.01) { f = clamp(f * (1 + (X.R() - 0.45) * 0.12), 55, 180); s.frequency.setValueAtTime(f, t); }
    const g = X.gain(0);
    g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.5, 0.04); g.gain.setValueAtTime(0.5, len - 0.08); g.gain.linearRampToValueAtTime(0, len);
    const b1 = X.filter('bandpass', X.rr(800, 1100), 3, g), b2 = X.filter('bandpass', X.rr(1900, 2400), 4, g);
    s.connect(b1); s.connect(b2); s.start(0); s.stop(len + 0.01);
    X.nz(0, { f: 1500, q: 0.8, a: 0.03, hold: len - 0.1, tau: 0.03, peak: 0.12 });
  } },
  sneeze: { dur: 1.2, variants: 2, level: 0.75, make(X) {
    X.js((d, sr, R) => {
      const f0 = 150 + R() * 90;
      for (const [at, len, rise] of [[0, 0.24, 1.2], [0.36, 0.26, 1.35]]) renderVoice(d, Math.floor(at * sr), { sr, rand: R, dur: len, breath: 1.5,
        pitch: (t) => f0 * (1 + (rise - 1) * t / len), vowel: () => VOWELS.a, amp: (t) => 0.1 * Math.min(1, t / len * 1.3) * (t > len - 0.03 ? (len - t) / 0.03 : 1) });
      renderVoice(d, Math.floor(0.72 * sr), { sr, rand: R, dur: 0.3, breath: 6, pitch: (t) => f0 * 1.6 * (1 - t), vowel: (t) => vowelLerp('i', 'u', Math.min(1, t * 8)),
        amp: (t) => 0.22 * Math.min(1, t / 0.006) * Math.exp(-t / 0.08) });
    });
  } },
  fanHum: { dur: 3.94, variants: 1, loop: 'xf', xf: 0.3, level: 0.45, make(X) {
    for (const [f, a] of [[100, 0.25], [200, 0.1], [300, 0.05]]) { const s = X.ac.createOscillator(); s.frequency.value = f; s.connect(X.gain(a * 0.6)); s.start(0); s.stop(4.3); }
    X.js((d, sr, R) => {
      const lp = biquad('lowpass', 700, 0.7, sr);
      for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = lp.run(R() * 2 - 1) * (0.25 + 0.2 * Math.max(0, Math.sin(2 * Math.PI * 6.6 * t))); }
    }, { dur: 4.3 });
  } },
  windGust: { dur: 2.8, variants: 2, level: 0.7, make(X) {
    const p = X.pan(X.rr(-0.5, 0.5));
    const n = X.nz(0, { f: 280, q: 0.7, a: 0.9, hold: 0.3, tau: 0.5, peak: 0.8, dest: p });
    n.b.frequency.linearRampToValueAtTime(X.rr(650, 900), 1.0); n.b.frequency.linearRampToValueAtTime(320, 2.5);
    const w = X.nz(0, { f: 600, q: 14, a: 0.9, hold: 0.3, tau: 0.45, peak: 0.25, dest: p });
    w.b.frequency.linearRampToValueAtTime(X.rr(850, 1100), 1.0); w.b.frequency.linearRampToValueAtTime(520, 2.5);
  } },
  slowmoIn: { dur: 1.1, variants: 2, level: 0.75, make(X) {
    const rv = X.reverb(1.5, 0.4, 0.4);
    const lp = X.filter('lowpass', 3000, 1, rv); lp.frequency.exponentialRampToValueAtTime(300, 0.8);
    X.tone('sawtooth', 640, 0, { f2: 55, glide: 0.75, a: 0.05, hold: 0.45, tau: 0.15, peak: 0.25, dest: lp });
    X.tone('sine', 320, 0, { f2: 40, glide: 0.8, a: 0.05, hold: 0.5, tau: 0.2, peak: 0.5, dest: rv });
    X.nz(0, { f: 4000, f2: 400, glide: 0.6, q: 0.8, a: 0.4, tau: 0.1, peak: 0.35, dest: rv });
  } },
  slowmoOut: { dur: 0.8, variants: 2, level: 0.7, make(X) {
    X.tone('sine', 70, 0, { f2: 700, glide: 0.35, a: 0.03, hold: 0.25, tau: 0.05, peak: 0.45 });
    X.nz(0, { f: 400, f2: 5000, glide: 0.35, q: 1, a: 0.3, tau: 0.04, peak: 0.45 });
  } },
  pageFlip: { dur: 0.45, variants: 3, level: 0.6, make(X) {
    X.js((d, sr, R) => {
      const bp = biquad('bandpass', 2500, 0.9, sr), len = 0.2 + R() * 0.08, fr = 30 + R() * 25;
      for (let i = 0; i < len * sr; i++) { const t = i / sr; d[i] += bp.run(R() * 2 - 1) * Math.sin(Math.PI * t / len) * (0.5 + 0.5 * Math.abs(Math.sin(2 * Math.PI * fr * t))) * 0.8; }
    });
    X.nz(X.rr(0.2, 0.26), { type: 'lowpass', f: 600, tau: 0.03, peak: 0.4 });
  } },
  pop: { dur: 0.2, variants: 3, level: 0.6, make(X) {
    X.tone('sine', X.rr(380, 460), 0, { f2: X.rr(1000, 1300), glide: 0.04, tau: 0.03, peak: 0.8 });
    X.nz(0, { f: 3000, q: 1, tau: 0.003, peak: 0.3 });
  } },
  ding: { dur: 1.4, variants: 2, level: 0.6, make(X) {
    X.inst('bell', 0, X.rr(1300, 1340), 1, 0.9, { kind: 'ding', gain: 2.5 });
  } },
  buzzer: { dur: 0.8, variants: 1, level: 0.4, make(X) {
    const lp = X.filter('lowpass', 1800, 0.8);
    for (const f of [98, 104]) X.tone('square', f, 0, { a: 0.01, hold: 0.55, tau: 0.02, peak: 0.35, dest: lp });
  } },
  swish: { dur: 0.6, variants: 2, level: 0.75, make(X) {
    X.nz(0, { type: 'highpass', f: 2500, a: 0.04, hold: 0.06, tau: 0.08, peak: 0.6 });
    X.js((d, sr, R) => { for (let i = 0; i < 18; i++) grain(d, sr, R, 0.03 + R() * 0.3, 0.006 + R() * 0.01, 0.3 + R() * 0.3, 3000 + R() * 5000, 1.2); });
    X.nz(0, { f: 900, f2: 3000, glide: 0.15, q: 1, a: 0.05, tau: 0.05, peak: 0.35 });
  } },
  clockTick: { dur: 1.0, variants: 2, loop: 'cut', level: 0.55, make(X) {
    const f = X.R() < 0.5 ? 2600 : 2100;
    X.tone('sine', f, 0.005, { tau: 0.008, peak: 0.6 });
    X.nz(0.005, { type: 'highpass', f: 3500, tau: 0.003, peak: 0.6 });
    X.nz(0.005, { f: 900, q: 4, tau: 0.01, peak: 0.3 });
  } },
  sip: { dur: 1.0, variants: 2, level: 0.65, make(X) {
    X.js((d, sr, R) => {
      const bq = biquad('bandpass', 600, 7, sr); let f = 600;
      for (let i = 0; i < 0.55 * sr; i++) {
        const t = i / sr; if ((i & 31) === 0) { f = clamp(f * (1 + (R() - 0.4) * 0.15), 350, 1600); bq.set(f, 7); }
        d[i] += bq.run(R() * 2 - 1) * Math.sin(Math.PI * t / 0.55) * (R() < 0.97 ? 1 : 2.5) * (0.6 + 0.4 * Math.sin(t * 190));
      }
      const lp = biquad('lowpass', 900, 0.5, sr);
      for (let i = Math.floor(0.62 * sr); i < 0.95 * sr; i++) { const t = i / sr - 0.62; d[i] += lp.run(R() * 2 - 1) * 0.35 * Math.sin(Math.PI * t / 0.33); }
    });
  } },
  doorSlam: { dur: 1.5, variants: 2, level: 0.85, make(X) {
    const rv = X.reverb(1.2, 0.3, 0.35);
    X.tone('sine', 70, 0, { f2: 38, glide: 0.2, tau: 0.12, peak: 1, dest: rv });
    X.nz(0, { f: 420, q: 1.5, tau: 0.04, peak: 1, dest: rv });
    X.nz(0, { type: 'lowpass', f: 2500, tau: 0.015, peak: 0.6, dest: rv });
    for (let i = 0; i < 5; i++) X.nz(0.08 + i * X.rr(0.045, 0.06), { f: X.rr(1200, 2200), q: 3, tau: 0.01, peak: 0.25 * (1 - i / 5), dest: rv });
  } },
  rain: { dur: 6, variants: 1, loop: 'xf', xf: 0.5, level: 0.5, make(X) {
    X.js((d, sr, R) => {
      const lp = biquad('lowpass', 1400, 0.5, sr), hp = biquad('highpass', 300, 0.5, sr);
      for (let i = 0; i < d.length; i++) d[i] = hp.run(lp.run(R() * 2 - 1)) * 0.25;
      for (let k = 0; k < 6.5 * 260; k++) grain(d, sr, R, R() * 6.5, 0.002 + R() * 0.004, 0.08 + R() * 0.2, 2500 + R() * 6000, 2);
      for (let k = 0; k < 6.5 * 6; k++) {
        const at = Math.floor(R() * 6.4 * sr), f = 900 + R() * 1500;
        for (let j = 0; j < 0.03 * sr; j++) d[at + j] += Math.sin(2 * Math.PI * f * (1 + j / sr * 8) * j / sr) * 0.15 * Math.exp(-j / (0.006 * sr));
      }
    }, { dur: 6.5 });
  } },
  birds: { dur: 6, variants: 1, loop: 'xf', xf: 0.4, level: 0.45, make(X) {
    const rv = X.reverb(1.2, 0.3, 0.3);
    let t = 0.1;
    while (t < 6.1) {
      const kind = Math.floor(X.R() * 3), p = X.pan(X.rr(-0.7, 0.7), rv);
      if (kind === 0) { const n = 2 + Math.floor(X.R() * 3); for (let i = 0; i < n; i++) X.tone('sine', X.rr(2800, 3300), t + i * 0.11, { f2: X.rr(4500, 5200), glide: 0.05, a: 0.005, tau: 0.02, hold: 0.03, peak: 0.25, dest: p }); t += n * 0.11; }
      else if (kind === 1) { const s = X.tone('sine', 4000, t, { a: 0.02, hold: 0.35, tau: 0.03, peak: 0.18, dest: p }); const l = X.ac.createOscillator(); l.frequency.value = X.rr(24, 34); const g = X.gain(700); g.disconnect(); l.connect(g); g.connect(s.frequency); l.start(t); l.stop(t + 0.5); t += 0.45; }
      else { X.tone('sine', X.rr(4300, 4700), t, { f2: 3700, glide: 0.18, a: 0.01, hold: 0.15, tau: 0.03, peak: 0.2, dest: p }); X.tone('sine', X.rr(3500, 3800), t + 0.28, { f2: 3200, glide: 0.2, a: 0.01, hold: 0.18, tau: 0.03, peak: 0.2, dest: p }); t += 0.55; }
      t += X.rr(0.25, 1.1);
    }
  } },
  pencil: { dur: 2.4, variants: 2, loop: 'xf', xf: 0.2, level: 0.45, make(X) {
    X.js((d, sr, R) => {
      let t = 0.03;
      while (t < 2.6) {
        const len = 0.06 + R() * 0.22, bq = biquad('bandpass', 4000 + R() * 2500, 1.4, sr), fr = 90 + R() * 120, s0 = Math.floor(t * sr);
        for (let i = 0; i < len * sr && s0 + i < d.length; i++) { const tt = i / sr; d[s0 + i] += bq.run(R() * 2 - 1) * Math.sin(Math.PI * tt / len) * (0.5 + 0.5 * Math.abs(Math.sin(Math.PI * fr * tt))) * 0.7; }
        t += len + 0.02 + R() * (R() < 0.2 ? 0.35 : 0.06);
      }
    }, { dur: 2.6 });
  } },
  cough: { dur: 0.7, variants: 3, level: 0.7, make(X) {
    X.js((d, sr, R) => {
      const f0 = 120 + R() * 80;
      for (const at of [0, 0.2 + R() * 0.06]) renderVoice(d, Math.floor(at * sr), { sr, rand: R, dur: 0.16, breath: 5, pitch: (t) => f0 * (1 - t), vowel: () => vowelLerp('a', 'e', 0.5),
        amp: (t) => 0.2 * Math.min(1, t / 0.005) * Math.exp(-t / 0.05) });
    });
  } },
  hmm: { dur: 0.8, variants: 2, level: 0.6, make(X) {
    X.js((d, sr, R) => {
      const f0 = 105 + R() * 15, len = 0.6;
      renderVoice(d, 0, { sr, rand: R, dur: len, breath: 0.05, pitch: (t) => f0 * (t < 0.25 ? 1 : 1 + 0.6 * ((t - 0.25) / 0.35) ** 1.5),
        vowel: () => VOWELS.m, amp: (t) => 0.35 * Math.min(1, t / 0.04) * (t > len - 0.08 ? (len - t) / 0.08 : 1) });
    });
  } },
  crickets: { dur: 5, variants: 1, loop: 'xf', xf: 0.3, level: 0.45, make(X) {
    X.js((d, sr, R) => {
      for (const [f, period, pulses, ph, amp] of [[4300, 0.95, 3, 0.1, 0.3], [4800, 1.25, 4, 0.5, 0.2]]) {
        for (let t = ph; t < 5.2; t += period * (0.95 + R() * 0.1)) {
          for (let p = 0; p < pulses; p++) {
            const s0 = Math.floor((t + p * 0.032) * sr);
            for (let j = 0; j < 0.02 * sr && s0 + j < d.length; j++) d[s0 + j] += Math.sin(2 * Math.PI * f * j / sr) * amp * Math.sin(Math.PI * j / (0.02 * sr));
          }
        }
      }
    }, { dur: 5.3 });
  } },
  cheer: { dur: 2.8, variants: 2, level: 0.75, make(X) {
    const rv = X.reverb(1.2, 0.3, 0.3);
    X.js((d, sr, R) => {
      crowd(d, sr, R, 12, (k) => {
        const f0 = (k % 2 ? 300 : 170) * (0.85 + R() * 0.3), len = 1.4 + R() * 1.0;
        return { at: R() * 0.25, dur: len, scale: k % 2 ? 1.15 : 1, breath: 0.9, pitch: (t) => f0 * (1 + 0.3 * Math.min(1, t / 0.3)) * (1 - 0.1 * t / len),
          vowel: (t) => vowelLerp('e', 'a', Math.min(1, t / 0.4)), amp: (t) => 0.05 * Math.min(1, t / 0.1) * Math.max(0, 1 - Math.max(0, t - len + 0.5) / 0.5) };
      });
      for (let w = 0; w < 2; w++) { const at = Math.floor((0.2 + R() * 0.8) * sr), f = 2200 + R() * 600; let ph = 0; for (let j = 0; j < 0.5 * sr; j++) { const t = j / sr; ph += 2 * Math.PI * f * (1 + 0.3 * Math.sin(Math.PI * t / 0.5)) / sr; d[at + j] += Math.sin(ph) * 0.06 * Math.sin(Math.PI * t / 0.5); } }
    }, { dest: rv });
  } },
  kiss: { dur: 0.35, variants: 2, level: 0.7, make(X) {
    X.tone('sine', 220, 0, { a: 0.02, hold: 0.04, tau: 0.01, peak: 0.15 });
    X.tone('sine', X.rr(260, 320), 0.07, { f2: X.rr(1300, 1600), glide: 0.025, tau: 0.02, peak: 0.7 });
    X.nz(0.07, { f: 2500, q: 1.5, tau: 0.006, peak: 0.5 });
  } },
  shatter: { dur: 1.4, variants: 2, level: 0.75, make(X) {
    const rv = X.reverb(1, 0.3, 0.3);
    X.nz(0, { type: 'highpass', f: 1500, tau: 0.03, peak: 1, dest: rv });
    X.tone('sine', 140, 0, { f2: 60, tau: 0.05, peak: 0.6, dest: rv });
    for (let i = 0; i < 22; i++) X.tone('sine', X.rr(3000, 8000), X.rr(0.01, 0.6) ** 1.5, { tau: X.rr(0.02, 0.07), peak: X.rr(0.08, 0.2), dest: X.pan(X.rr(-0.8, 0.8), rv) });
    X.js((d, sr, R) => { for (let i = 0; i < 40; i++) grain(d, sr, R, R() * 1.0, 0.004 + R() * 0.02, 0.2 + R() * 0.3, 1000 + R() * 5000, 1); });
  } },
  typewriter: { dur: 0.14, variants: 4, loop: 'cut', level: 0.6, make(X) {
    X.nz(0, { type: 'highpass', f: 3000, tau: 0.004, peak: 0.8 });
    X.tone('sine', X.rr(160, 200), 0, { tau: 0.015, peak: 0.6 });
    X.nz(0.004, { type: 'lowpass', f: 700, tau: 0.012, peak: 0.6 });
    X.tone('sine', X.rr(3000, 3400), 0.002, { tau: 0.01, peak: 0.15 });
  } },
};

export const SFX_NAMES = Object.keys(SFX);
const PRIORITY = ['pop', 'swoosh', 'ding', 'pageFlip', 'paperCrumple', 'pencil', 'bell', 'whoosh', 'thudDesk', 'heartbeat', 'stingDanger', 'chalkScratch', 'murmur', 'bounceSoft', 'thudHead'];

/** Render one recipe variant to an AudioBuffer (async, OfflineAudioContext). */
export async function renderSfx(name, variant = 0, sr = SFX_SR) {
  const def = SFX[name];
  const xf = def.loop === 'xf' ? (def.xf ?? 0.3) : 0;
  const len = Math.ceil((def.dur + xf) * sr);
  const oac = new OfflineAudioContext(2, len, sr);
  const out = oac.createGain(); out.connect(oac.destination);
  const R = prng(1000 + variant * 7919 + name.length * 31);
  def.make(helpers(oac, out, R));
  let buf = await oac.startRendering();
  const chans = [buf.getChannelData(0), buf.getChannelData(1)];
  let peak = 0; for (const c of chans) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > peak) peak = a; }
  const target = def.peak ?? 0.89;
  const k = peak > 1e-6 ? target / peak : 1;
  const finalLen = Math.ceil(def.dur * sr);
  const outBuf = new AudioBuffer({ numberOfChannels: 2, length: finalLen, sampleRate: sr });
  chans.forEach((c, ch) => {
    let d = xf ? makeSeamless(c, finalLen, Math.floor(xf * sr)) : c.subarray(0, finalLen);
    if (!xf && def.loop !== 'cut') { // short fade at the very end
      d = Float32Array.from(d); const fl = Math.min(256, d.length); for (let i = 0; i < fl; i++) d[d.length - 1 - i] *= i / fl;
    }
    const o = new Float32Array(finalLen); for (let i = 0; i < finalLen; i++) o[i] = d[i] * k;
    outBuf.copyToChannel(o, ch);
  });
  return outBuf;
}

/**
 * Lazily renders every SFX variant, one recipe per pump() call (called once per frame) so the main
 * thread never stalls. get(name) → random ready variant or null; want(name) bumps priority.
 */
export function createBank() {
  const bank = new Map(); // name → AudioBuffer[]
  const queue = [];
  for (const n of [...PRIORITY, ...SFX_NAMES]) if (SFX[n] && !queue.some((q) => q.n === n)) for (let v = 0; v < (SFX[n].variants || 1); v++) queue.push({ n, v });
  let busy = false, started = false;
  const api = {
    ready: () => queue.length === 0 && !busy,
    count: () => [...bank.values()].reduce((a, b) => a + b.length, 0),
    get(name) { const l = bank.get(name); return l && l.length ? l[Math.floor(Math.random() * l.length)] : null; },
    want(name) { const i = queue.findIndex((q) => q.n === name); if (i > 0) queue.unshift(...queue.splice(i, 1)); },
    start() { started = true; },
    pump() {
      if (!started || busy || !queue.length || typeof OfflineAudioContext === 'undefined') return;
      const { n, v } = queue.shift();
      busy = true;
      renderSfx(n, v).then((buf) => { if (!bank.has(n)) bank.set(n, []); bank.get(n).push(buf); })
        .catch((e) => console.warn(`[audio] render ${n} failed`, e))
        .finally(() => { busy = false; });
    },
  };
  return api;
}
