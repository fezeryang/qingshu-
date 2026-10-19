// AudioContext + bus graph (created lazily on unlock), gain staging, settings, ducking,
// polyphony limiting.
//
//   players ─► musicIn ─► slowLP ─► duck ─► musicVol ─┐
//   reverbIn ─► convolver ───┘                         ├─► master ─► compressor ─► softclip ─► analyser ─► out
//   sfx / loops ─► sfxIn ─► sfxVol ────────────────────┤
//   blips ─► voiceIn ─► voiceVol ──────────────────────┘
import { createKit } from './instruments.js';
import { makeIR, softClipCurve, clamp } from './dsp.js';

export const LIMITS = { music: 40, sfx: 24 };
const NOMINAL = { master: 0.9, music: 0.62, sfx: 0.9, voice: 0.8 };
const curve = (v) => clamp(+v || 0, 0, 1) ** 1.5;

/** Build the master chain on any BaseAudioContext (live or offline). Returns the bus nodes. */
export function buildGraph(ac, { analyser = false } = {}) {
  const g = (v = 1) => { const n = ac.createGain(); n.gain.value = v; return n; };
  const master = g(NOMINAL.master);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.22;
  const clip = ac.createWaveShaper(); clip.curve = softClipCurve();
  master.connect(comp); comp.connect(clip);
  let tail = clip;
  let meter = null;
  if (analyser) { meter = ac.createAnalyser(); meter.fftSize = 2048; clip.connect(meter); tail = meter; }
  tail.connect(ac.destination);
  const musicVol = g(NOMINAL.music), duck = g(1), slowLP = ac.createBiquadFilter();
  slowLP.type = 'lowpass'; slowLP.frequency.value = 20000; slowLP.Q.value = 0.6;
  const musicIn = g(1);
  musicIn.connect(slowLP); slowLP.connect(duck); duck.connect(musicVol); musicVol.connect(master);
  const reverbIn = g(1), conv = ac.createConvolver();
  conv.buffer = makeIR(ac, 2.4, 0.5, 11);
  reverbIn.connect(conv); conv.connect(slowLP);
  const sfxIn = g(1), sfxVol = g(NOMINAL.sfx); sfxIn.connect(sfxVol); sfxVol.connect(master);
  const voiceIn = g(1), voiceVol = g(NOMINAL.voice); voiceIn.connect(voiceVol); voiceVol.connect(master);
  return { master, comp, clip, meter, musicIn, slowLP, duck, musicVol, reverbIn, sfxIn, sfxVol, voiceIn, voiceVol };
}

export function createMixer(config) {
  const M = {
    ac: null, K: null, bus: null, failed: false,
    vol: { master: 0.8, music: 0.7, sfx: 0.9 },
    mute: !!config?.mute,
    voices: { music: [], sfx: [] },
    ducks: [], duckLevel: 1,
    get now() { return M.ac ? M.ac.currentTime : 0; },
    get running() { return !!M.ac && M.ac.state === 'running'; },

    /** create / resume the AudioContext. Safe to call any number of times. */
    unlock() {
      if (M.failed) return false;
      if (!M.ac) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) { M.failed = true; return false; }
        try { M.ac = new AC({ latencyHint: 'interactive' }); } catch (e) { M.failed = true; console.warn('[audio] AudioContext unavailable', e); return false; }
        M.bus = buildGraph(M.ac, { analyser: true });
        M.K = createKit(M.ac, (g, end, srcs) => M.register('music', g, end, srcs));
        M.apply();
      }
      if (M.ac.state === 'suspended') M.ac.resume().catch(() => {});
      return true;
    },

    /** True when nothing on `bus` could be heard → callers skip creating nodes. */
    silent(bus = 'sfx') {
      if (!M.ac || M.mute || M.vol.master <= 0) return true;
      if (bus === 'music') return M.vol.music <= 0;
      if (bus === 'sfx' || bus === 'voice') return M.vol.sfx <= 0;
      return false;
    },

    setVolumes(s = {}) {
      for (const k of ['master', 'music', 'sfx']) { const v = s[`${k}Volume`]; if (typeof v === 'number' && isFinite(v)) M.vol[k] = clamp(v, 0, 1); }
      M.apply();
    },
    apply() {
      if (!M.bus) return;
      const t = M.ac.currentTime, B = M.bus;
      const master = M.mute ? 0 : curve(M.vol.master) * NOMINAL.master;
      B.master.gain.cancelScheduledValues(t); B.master.gain.setValueAtTime(B.master.gain.value, t);
      B.master.gain.setTargetAtTime(master, t, 0.03);
      if (master === 0) B.master.gain.setValueAtTime(0, t + 0.15); // hard zero, not just "approaching"
      B.musicVol.gain.setTargetAtTime(curve(M.vol.music) * NOMINAL.music, t, 0.03);
      B.sfxVol.gain.setTargetAtTime(curve(M.vol.sfx) * NOMINAL.sfx, t, 0.03);
      B.voiceVol.gain.setTargetAtTime(curve(M.vol.sfx) * NOMINAL.voice, t, 0.03);
    },

    /** Register a voice for polyphony limiting; steals (fades) the oldest when over the cap. */
    register(kind, g, end, srcs) {
      const list = M.voices[kind];
      list.push({ g, end, srcs });
      if (list.length > LIMITS[kind]) {
        const now = M.ac.currentTime;
        // drop finished ones first
        for (let i = list.length - 1; i >= 0; i--) if (list[i].end < now) list.splice(i, 1);
        while (list.length > LIMITS[kind]) {
          const v = list.shift();
          try { v.g.gain.cancelScheduledValues(now); v.g.gain.setValueAtTime(v.g.gain.value, now); v.g.gain.linearRampToValueAtTime(0, now + 0.04); } catch { /* ok */ }
          for (const s of v.srcs) { try { s.stop(now + 0.05); } catch { /* already stopped */ } }
        }
      }
    },
    activeVoices(kind) { const now = M.now; return M.voices[kind].filter((v) => v.end > now).length; },

    /** returns the duck entry; set entry.until = 0 to release it early */
    duck(amount, dur, uiNow) {
      const d = { amount: clamp(+amount || 0, 0, 1), until: uiNow + Math.max(0.05, +dur || 0) };
      M.ducks.push(d);
      return d;
    },

    /** per-frame: clean voices, apply duck level */
    tick(uiNow) {
      if (!M.ac) return;
      const now = M.ac.currentTime;
      for (const k of ['music', 'sfx']) { const l = M.voices[k]; if (l.length > 64) M.voices[k] = l.filter((v) => v.end > now); }
      M.ducks = M.ducks.filter((d) => d.until > uiNow);
      const level = 1 - M.ducks.reduce((a, d) => Math.max(a, d.amount), 0);
      if (Math.abs(level - M.duckLevel) > 0.005) {
        M.bus.duck.gain.setTargetAtTime(level, now, level < M.duckLevel ? 0.06 : 0.3);
        M.duckLevel = level;
      }
    },

    /** current output peak / rms (dBFS) from the analyser — QA/self-test meter */
    meter() {
      const a = M.bus?.meter; if (!a) return null;
      const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d);
      let p = 0, s = 0; for (const x of d) { const ax = Math.abs(x); if (ax > p) p = ax; s += x * x; }
      const db = (x) => (x > 0 ? +(20 * Math.log10(x)).toFixed(1) : -120);
      return { peakDb: db(p), rmsDb: db(Math.sqrt(s / d.length)) };
    },
  };
  return M;
}
