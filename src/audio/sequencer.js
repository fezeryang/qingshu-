// Lookahead sequencer. A TrackPlayer turns a compiled song (sorted note events in beats) into
// WebAudio calls scheduled against AudioContext.currentTime. update(now) is called once per
// engine tick (ORDER.AUDIO) and schedules everything up to now + LOOKAHEAD — there are no timers.
// The same player renders offline (OfflineAudioContext) for the self-test by calling update once.
import { INSTRUMENTS } from './instruments.js';
import { mtof, midi, parseMel, parsePattern, chord } from './theory.js';
import { driveCurve, prng } from './dsp.js';

export const LOOKAHEAD = 0.2;

/** Compile a song definition once: run build()/outro() through the builder, sort, apply swing. */
export function compile(def) {
  if (def._c) return def._c;
  const meter = def.meter || 4;
  const mk = () => {
    const events = [];
    const S = {
      meter,
      bar: (i) => i * meter,
      note(part, b, d, m, v = 0.8, o) { events.push({ b, d, m: m == null ? null : midi(m), v, p: part, o }); },
      mel(part, b, str, v = 0.8, o) { const r = parseMel(str, b, v); for (const e of r.events) events.push({ ...e, p: part, o }); return r.beats; },
      pat(part, b, pat, step, m, v = 1, o) { for (const h of parsePattern(pat, step)) events.push({ b: b + h.b, d: step, m: m == null ? null : midi(m), v: h.v * v, p: part, o }); },
      chord,
      prog(list) { return list.map((s) => s.split(/\s+/).map(chord)); },
    };
    return { S, events };
  };
  const swing = (b) => {
    if (!def.swing) return b;
    const u = def.swingUnit || 0.5, k = Math.round(b / u);
    return Math.abs(b / u - k) < 1e-4 && k % 2 === 1 ? b + def.swing * u : b;
  };
  const main = mk(); def.build(main.S);
  const events = main.events.map((e) => ({ ...e, b: swing(e.b) })).sort((a, b) => a.b - b.b);
  let outro = null, outroBeats = 0;
  if (def.outro) { const o = mk(); outroBeats = def.outro(o.S) || 2 * meter; outro = o.events.sort((a, b) => a.b - b.b); }
  const loopStart = (def.loopFrom || 0) * meter, end = def.bars * meter;
  const loopIdx = Math.max(0, events.findIndex((e) => e.b >= loopStart - 1e-6));
  def._c = { events, loopStart, end, loopIdx, outro, outroBeats, meter };
  return def._c;
}

/**
 * @param {{ac, K, reverbIn, silent: () => boolean}} E  shared audio environment
 */
export class TrackPlayer {
  constructor(E, id, def, out) {
    const { ac } = E;
    this.E = E; this.id = id; this.def = def; this.c = compile(def);
    this.ac = ac;
    this.gain = ac.createGain(); this.gain.gain.value = 0;
    this.nodes = [this.gain];
    this.sources = [];
    let head = this.gain;
    const fx = def.fx || {};
    const chainTo = (n) => { head.connect(n); head = n; this.nodes.push(n); return n; };
    if (fx.lowpass) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fx.lowpass; f.Q.value = 0.5; chainTo(f); }
    if (fx.radio) {
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 420; hp.Q.value = 0.8; chainTo(hp);
      const pk = ac.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1700; pk.gain.value = 7; pk.Q.value = 1; chainTo(pk);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600; lp.Q.value = 1.2; chainTo(lp);
      const ws = ac.createWaveShaper(); ws.curve = driveCurve(2.6); chainTo(ws);
      const g = ac.createGain(); g.gain.value = 0.55; chainTo(g);
    }
    // echo (parallel)
    const post = ac.createGain(); chainTo(post);
    post.connect(out);
    if (fx.echo) {
      const d = ac.createDelay(2); d.delayTime.value = fx.echo.time;
      const fb = ac.createGain(); fb.gain.value = fx.echo.fb;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = fx.echo.lp || 2500;
      const wet = ac.createGain(); wet.gain.value = fx.echo.mix;
      post.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); wet.connect(out);
      this.nodes.push(d, fb, lp, wet);
    }
    if (E.reverbIn && def.reverb) {
      const send = ac.createGain(); send.gain.value = def.reverb; post.connect(send); send.connect(E.reverbIn); this.nodes.push(send);
    }
    // lo-fi tape wow (pitch LFO) shared by this player's electric piano notes
    this.wow = null;
    if (fx.wow) {
      const l = ac.createOscillator(); l.frequency.value = 0.55; const g = ac.createGain(); g.gain.value = fx.wow;
      l.connect(g); l.start(); this.sources.push(l); this.wow = g; this.nodes.push(g);
    }
    // layers
    this.layers = new Map();
    this.layerVal = new Map();
    this.layerFn = def.layers || {};
    const parts = def.parts;
    this.partOut = {};
    for (const [name, p] of Object.entries(parts)) {
      const ln = p.layer || 'main';
      if (!this.layers.has(ln)) {
        const g = ac.createGain(); g.gain.value = this.layerFn[ln] ? this.layerFn[ln](0) : 1; g.connect(this.gain);
        this.layers.set(ln, g); this.layerVal.set(ln, g.gain.value); this.nodes.push(g);
      }
      let dest = this.layers.get(ln);
      if (p.pan && ac.createStereoPanner) { const pn = ac.createStereoPanner(); pn.pan.value = p.pan; pn.connect(dest); dest = pn; this.nodes.push(pn); }
      this.partOut[name] = dest;
    }
    this.beds = def.beds || [];
    this.rate = 1;
    this.state = 'idle';
    this.rand = Math.random;
  }

  get spb() { return 60 / (this.def.bpm * this.rate); }
  beatTime(b) { return this.anchorT + (b - this.anchorB) * this.spb; }
  timeBeat(t) { return this.anchorB + (t - this.anchorT) / this.spb; }

  start(when, fade = 0.5) {
    const g = this.gain.gain;
    g.cancelScheduledValues(when); g.setValueAtTime(0.0001, when);
    if (fade > 0.02) g.linearRampToValueAtTime(this.def.gain ?? 1, when + fade); else g.setValueAtTime(this.def.gain ?? 1, when);
    this.anchorT = when + 0.03; this.anchorB = 0; this.idx = 0; this.offset = 0; this.horizon = when; this.mode = 'main';
    this.state = 'playing';
    for (const bed of this.beds) this._startBed(bed, when);
  }

  _startBed(bed, when) {
    const { ac } = this;
    const sr = ac.sampleRate, len = Math.floor(sr * (bed.len || 3));
    const buf = ac.createBuffer(1, len, sr), d = buf.getChannelData(0), R = prng(5);
    if (bed.kind === 'crackle') {
      for (let i = 0; i < len; i++) d[i] = (R() * 2 - 1) * 0.004;
      for (let k = 0; k < (bed.len || 3) * 14; k++) { const at = Math.floor(R() * (len - 40)); const a = (R() * 0.6 + 0.2) * (R() < 0.15 ? 1 : 0.35); for (let j = 0; j < 30; j++) d[at + j] += a * (R() * 2 - 1) * Math.exp(-j / 5); }
    } else if (bed.kind === 'hiss') {
      let lp = 0; for (let i = 0; i < len; i++) { const x = R() * 2 - 1; lp += 0.5 * (x - lp); d[i] = (x - lp) * 0.6; }
    }
    const s = ac.createBufferSource(); s.buffer = buf; s.loop = true;
    const g = ac.createGain(); g.gain.value = bed.gain ?? 0.3;
    s.connect(g); g.connect(this.layers.get(bed.layer || 'main') || this.gain);
    s.start(when); this.sources.push(s); this.nodes.push(g);
  }

  /** Fade out and stop scheduling. */
  stop(now, fade = 1) {
    if (this.state === 'stopping' || this.state === 'done') return;
    const g = this.gain.gain;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.0001, now + Math.max(0.03, fade));
    this.state = 'stopping';
    this.stopAt = now + Math.max(0.03, fade);
    this.disposeAt = this.stopAt + 2.5;
  }

  /** Play the outro cadence at the next bar line, then end (ending card). */
  finish() {
    if (!this.c.outro || this.state !== 'playing' || this.mode !== 'main') return false;
    const m = this.c.meter;
    this.cutBeat = Math.ceil((this.timeBeat(this.horizon) + 0.01) / m) * m;
    return true;
  }

  setRate(r) {
    if (Math.abs(r - this.rate) < 0.005 || this.state === 'idle') return;
    const b = this.timeBeat(this.horizon);
    this.rate = r; this.anchorB = b; this.anchorT = this.horizon;
  }

  setTension(t) {
    for (const [ln, fn] of Object.entries(this.layerFn)) {
      const g = this.layers.get(ln); if (!g) continue;
      const v = Math.max(0, fn(t));
      if (Math.abs(v - (this.layerVal.get(ln) ?? 1)) < 0.005) continue;
      this.layerVal.set(ln, v);
      g.gain.setTargetAtTime(v, this.ac.currentTime, 0.25);
    }
  }

  /** Schedule all events up to `until` (absolute context time). */
  update(now, until = now + LOOKAHEAD) {
    if (this.state === 'done' || this.state === 'idle') return;
    if (this.state === 'stopping' && now > this.disposeAt) { this.dispose(); return; }
    if (this.state === 'stopping' && this.horizon >= this.stopAt) return;
    const c = this.c;
    let guard = 0;
    for (;;) {
      if (++guard > 2000 || this.mode === 'end') break;
      const list = this.mode === 'main' ? c.events : c.outro;
      if (this.idx >= list.length) {
        if (this.mode === 'outro') { this.mode = 'end'; this.stop(Math.max(now, this.beatTime(this.offset + c.outroBeats)), 2.5); break; }
        // wrap the loop
        this.offset += c.end - c.loopStart; this.idx = c.loopIdx;
        if (c.loopIdx >= c.events.length) break;
        continue;
      }
      const ev = list[this.idx];
      const ab = ev.b + this.offset;
      if (this.mode === 'main' && this.cutBeat != null && ab >= this.cutBeat - 1e-6) {
        this.mode = 'outro'; this.offset = this.cutBeat; this.idx = 0; continue;
      }
      let t = this.beatTime(ab);
      if (t < now - 0.5) { this.anchorB = ab; this.anchorT = now + 0.05; t = now + 0.05; }  // resync after a stall
      if (t >= until) break;
      this.idx++;
      if (t < now - 0.03) continue;
      this._play(ev, t);
    }
    this.horizon = Math.max(this.horizon, until);
  }

  _play(ev, t) {
    if (this.E.silent?.()) return;
    const p = this.def.parts[ev.p];
    if (!p) return;
    const ln = p.layer || 'main';
    if ((this.layerVal.get(ln) ?? 1) < 0.01) return;
    const inst = INSTRUMENTS[p.inst];
    if (!inst) return;
    const R = this.rand;
    const hum = p.human ?? 0.006;
    const tt = Math.max(0, t + (p.late || 0) + (R() * 2 - 1) * hum);
    const f = ev.m == null ? (p.f || 0) : mtof(ev.m + (this.def.transpose || 0) + (p.oct || 0) * 12);
    const vel = Math.min(1, ev.v * (p.gain ?? 1) * (1 + (R() * 2 - 1) * (p.velJ ?? 0.06)));
    const o = this.wow ? { wow: this.wow, ...p.o, ...ev.o } : (ev.o ? { ...p.o, ...ev.o } : p.o || {});
    try { inst(this.E.K, this.partOut[ev.p], tt, f, ev.d * this.spb * (p.legato ?? 1), vel, o); } catch (e) { /* never break the music loop */ }
  }

  dispose() {
    this.state = 'done';
    for (const s of this.sources) { try { s.stop(); } catch { /* ok */ } }
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* ok */ } }
    this.sources = []; this.nodes = [];
  }
}
