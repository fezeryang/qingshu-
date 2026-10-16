// Audio module (owner: qs-audio-composer). Contract: docs/CONTRACTS.md §4.8. Notes: docs/modules/audio.md
//
// Fully procedural: music is sequenced live from synthesised instruments (lookahead scheduling
// against AudioContext.currentTime, driven from engine.onUpdate — no timers); SFX are rendered
// once into AudioBuffers with OfflineAudioContext. Every API is safe before unlock / when the
// browser has no audio; ctx.audio.debug records cues regardless, for QA.
import { ORDER } from '../core/engine.js';
import { createMixer, buildGraph } from './mixer.js';
import { TrackPlayer, compile } from './sequencer.js';
import { TRACKS } from './tracks.js';
import { SFX, SFX_NAMES, createBank, renderSfx } from './sfx.js';
import { createVoice } from './voice.js';
import { installAuto } from './auto.js';
import { createKit } from './instruments.js';
import { bufferStats, prng, clamp } from './dsp.js';

export async function install(ctx) {
  const { time, engine, config } = ctx;
  const M = createMixer(config);
  const bank = createBank();
  const warned = new Set();
  const warnOnce = (msg) => { if (!warned.has(msg)) { warned.add(msg); console.warn(`[audio] ${msg}`); } };

  // ------------------------------------------------------------------ debug log
  const recent = [];
  const lastName = {}; // name → uiNow of the last request (dedupe for auto cues)
  const rec = (kind, name, extra) => {
    recent.push({ t: +time.now.toFixed(3), kind, name, ...(extra || {}) });
    if (recent.length > 50) recent.shift();
  };

  // ------------------------------------------------------------------ music state
  let cur = null;            // TrackPlayer
  const fading = [];
  let desired = { id: null, fade: 1 };
  let pendingMusic = [];     // deferred automatic music changes
  let extMusicAt = -1;       // uiNow of the last external music() call
  let manualTension = 0, tension = 0, slowScale = 1, lpNow = 20000;
  const E = () => ({ ac: M.ac, K: M.K, reverbIn: M.bus.reverbIn, silent: () => M.silent('music') });

  function startDesired(fade) {
    if (!M.ac) return;
    const now = M.ac.currentTime;
    if (cur && (cur.id !== desired.id || cur.state !== 'playing')) { cur.stop(now, desired.id ? fade : Math.max(0.05, fade)); fading.push(cur); cur = null; }
    if (desired.id && !cur) {
      cur = new TrackPlayer(E(), desired.id, TRACKS[desired.id], M.bus.musicIn);
      cur.start(now + 0.03, Math.max(0.05, fade));
      cur.setTension(tension);
    }
  }
  function setMusic(id, fade = 1, src = 'ext') {
    if (id != null && !TRACKS[id]) { warnOnce(`unknown track "${id}"`); return; }
    fade = Number.isFinite(+fade) ? Math.max(0, +fade) : 1;
    const same = audio.debug.music === id && (!M.ac || (cur && cur.id === id && cur.state === 'playing') || (!id && !cur));
    if (same) return;
    audio.debug.music = id ?? null;
    rec('music', id ?? 'off', src === 'auto' ? { auto: true } : undefined);
    desired = { id: id ?? null, fade };
    if (M.running || M.ac) startDesired(fade);
  }

  // ------------------------------------------------------------------ sfx playback
  const pendingSfx = [];
  const cam = () => ctx.cam?.camera || engine.camera;
  const tmp = new ctx.THREE.Vector3();
  function spatial(pos) {
    if (!pos || !Number.isFinite(pos.x)) return { pan: 0, gain: 1 };
    try {
      const c = cam(); c.updateMatrixWorld?.();
      tmp.set(pos.x, pos.y, pos.z); c.worldToLocal(tmp);
      const d = tmp.length();
      return { pan: clamp(tmp.x / Math.max(0.8, Math.hypot(tmp.x, tmp.z)), -1, 1) * 0.75, gain: 1 / (1 + 0.14 * Math.max(0, d - 1.5)) };
    } catch { return { pan: 0, gain: 1 }; }
  }
  function playBuffer(name, buf, o = {}) {
    const ac = M.ac, def = SFX[name], now = ac.currentTime;
    const t = now + Math.max(0, +o.delay || 0);
    const s = ac.createBufferSource(); s.buffer = buf; s.loop = false;
    const slowK = ctx.flow?.phase === 'flight' && engine.timeScale < 0.75 && !/^slowmo/.test(name) ? 0.82 + 0.18 * engine.timeScale : 1;
    const rate = clamp((+o.rate || 1) * slowK * (1 + (Math.random() * 2 - 1) * 0.035), 0.25, 4);
    s.playbackRate.value = rate;
    const sp = spatial(o.pos);
    const g = ac.createGain();
    const vol = clamp(o.volume ?? 1, 0, 2) * (def.level ?? 0.8) * sp.gain * (0.92 + Math.random() * 0.16);
    const len = buf.duration / rate;
    g.gain.setValueAtTime(vol, t);
    if (o.fadeOut) { g.gain.setValueAtTime(vol, t + Math.max(0, len - o.fadeOut)); g.gain.linearRampToValueAtTime(0.0001, t + len); }
    s.connect(g);
    let head = g;
    if (sp.pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = sp.pan; g.connect(p); head = p; }
    head.connect(M.bus.sfxIn);
    s.start(t); s.stop(t + len + 0.02);
    M.register('sfx', g, t + len, [s]);
    return { stop(f = 0.1) { try { const n = ac.currentTime; g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0, n, Math.max(0.01, f / 4)); s.stop(n + f + 0.05); } catch { /* ended */ } } };
  }
  function play(name, o = {}) {
    if (!SFX[name]) { warnOnce(`unknown sfx "${name}"`); return null; }
    if (!M.running || M.silent('sfx')) return null;
    const buf = bank.get(name);
    if (buf) return playBuffer(name, buf, o);
    bank.want(name);
    if (pendingSfx.length < 16) pendingSfx.push({ name, o, at: time.uiNow });
    return null;
  }

  // ------------------------------------------------------------------ loops
  const loops = new Set();
  function makeLoop(name, o = {}, owner = 'ext') {
    const known = !!SFX[name];
    if (!known) warnOnce(`unknown loop "${name}"`);
    const h = {
      name, owner, alive: known, volume: clamp(+(o.volume ?? 1) || 0, 0, 2), rate: clamp(+(o.rate ?? 1) || 1, 0.25, 4), pos: o.pos || null,
      src: null, g: null, p: null, applied: null,
      set(p = {}) {
        if (p.volume != null && Number.isFinite(+p.volume)) h.volume = clamp(+p.volume, 0, 2);
        if (p.rate != null && Number.isFinite(+p.rate)) h.rate = clamp(+p.rate, 0.25, 4);
        if (p.pos !== undefined) h.pos = p.pos;
        h.sync();
      },
      stop(fade = 0.3) {
        if (!h.alive && !h.src) return;
        h.alive = false; loops.delete(h);
        if (h.src && M.ac) {
          const n = M.ac.currentTime, f = Math.max(0.02, +fade || 0);
          try { h.g.gain.cancelScheduledValues(n); h.g.gain.setValueAtTime(h.g.gain.value, n); h.g.gain.linearRampToValueAtTime(0, n + f); h.src.stop(n + f + 0.05); } catch { /* ok */ }
        }
        h.src = null;
      },
      sync() {
        if (!h.alive) return;
        if (!h.src) {
          if (!M.running || M.silent('sfx')) return;
          const buf = bank.get(name); if (!buf) { bank.want(name); return; }
          const ac = M.ac;
          h.src = ac.createBufferSource(); h.src.buffer = buf; h.src.loop = true; h.src.playbackRate.value = h.rate;
          h.g = ac.createGain(); h.g.gain.value = 0;
          h.src.connect(h.g);
          if (ac.createStereoPanner) { h.p = ac.createStereoPanner(); h.g.connect(h.p); h.p.connect(M.bus.sfxIn); } else h.g.connect(M.bus.sfxIn);
          h.src.start(ac.currentTime, Math.random() * buf.duration * 0.9);
          h.applied = null;
        }
        const sp = spatial(h.pos);
        const vol = h.volume * (SFX[name].level ?? 0.8) * sp.gain;
        const a = h.applied;
        const n = M.ac.currentTime;
        if (!a || Math.abs(a.vol - vol) > 0.004) h.g.gain.setTargetAtTime(vol, n, a ? 0.08 : 0.15);
        if (!a || Math.abs(a.rate - h.rate) > 0.004) h.src.playbackRate.setTargetAtTime(h.rate, n, 0.05);
        if (h.p && (!a || Math.abs(a.pan - sp.pan) > 0.01)) h.p.pan.setTargetAtTime(sp.pan, n, 0.05);
        h.applied = { vol, rate: h.rate, pan: sp.pan };
      },
    };
    if (known) { loops.add(h); rec('loop', name, owner === 'auto' ? { auto: true } : undefined); }
    return h;
  }
  const beds = new Map(); // key → handle (owner 'auto')
  function setBeds(want) {
    for (const [k, h] of beds) {
      const w = want[k];
      if (!w || w.name !== h.name || !h.alive) { h.stop(0.4); beds.delete(k); }
    }
    for (const [k, w] of Object.entries(want)) {
      // never double a loop another module is already running
      if ([...loops].some((l) => l.owner !== 'auto' && l.name === w.name && l.alive)) { if (beds.has(k)) { beds.get(k).stop(0.3); beds.delete(k); } continue; }
      const h = beds.get(k);
      if (h) h.set({ volume: w.volume, rate: w.rate ?? 1, pos: w.pos ?? null });
      else beds.set(k, makeLoop(w.name, w, 'auto'));
    }
  }

  // ------------------------------------------------------------------ auto cues (deferred 1 frame, deduped)
  const cueQ = [];
  const voice = createVoice(M, ctx, rec);
  const A = {
    cue(name, o = {}, noDedupe = false) { cueQ.push({ name, o, at: time.uiNow, frame: time.frame, noDedupe }); },
    autoMusic(id, fade = 1, delay = 0) { if (!delay) pendingMusic = pendingMusic.filter((p) => p.due > time.uiNow); pendingMusic.push({ id, fade, due: time.uiNow + delay, at: time.uiNow, frame: time.frame }); },
    music: () => audio.debug.music,
    manualTension: () => manualTension,
    applyTension(t) { tension = t; cur?.setTension(t); },
    applySlow(s) { slowScale = s; },
    beds: setBeds,
    duck: (a, d) => { if (M.ac) M.duck(a, d, time.uiNow); },
    finishMusic() { if (cur && (cur.id === 'victory' || cur.id === 'tragedy')) cur.finish(); },
    resetRound() {
      for (const h of [...loops]) h.stop(0.25);
      beds.clear();
      manualTension = 0; tension = 0; cur?.setTension(0);
      voice.cancelAll();
      M.ducks = [];
      cueQ.length = 0; pendingSfx.length = 0;
    },
  };
  const auto = installAuto(ctx, A);

  // ------------------------------------------------------------------ public API
  const audio = {
    unlock() {
      const first = !M.ac;
      if (!M.unlock()) return;
      if (first) { audio.debug.unlocked = true; M.setVolumes(ctx.settings || {}); startDesired(0.6); }
    },
    music(id, { fade = 1 } = {}) {
      extMusicAt = time.uiNow; pendingMusic = [];
      setMusic(id ?? null, fade, 'ext');
    },
    setTension(v) { manualTension = clamp(+v || 0, 0, 1); },
    sfx(name, o = {}) {
      rec('sfx', String(name));
      lastName[name] = time.uiNow;
      return play(name, o || {});
    },
    loop(name, o = {}) { lastName[name] = time.uiNow; return makeLoop(String(name), o || {}, 'ext'); },
    blip(v, ch) { voice.blip(v, ch); },
    speak(text, o = {}) { return voice.speak(text, o || {}); },
    duck(amount = 0.5, dur = 1) { if (M.ac) M.duck(amount, dur, time.uiNow); },
    applySettings(s) { if (s) M.setVolumes(s); },
    debug: {
      music: null, recent, unlocked: false,
      get state() { return M.ac ? M.ac.state : 'none'; },
      get tension() { return +tension.toFixed(3); },
      get loops() { return [...loops].map((l) => l.name); },
      get sfxReady() { return bank.count(); },
      get voices() { return { music: M.activeVoices('music'), sfx: M.activeVoices('sfx') }; },
      get blips() { return voice.stats.blips; },
      get gain() { return { ...M.vol, mute: M.mute }; },
      get player() { return cur ? { id: cur.id, state: cur.state, mode: cur.mode, beat: +cur.timeBeat(cur.horizon ?? 0).toFixed(2), ctxTime: +M.now.toFixed(2) } : null; },
      meter: () => M.meter(),
    },
    dev: { renderTrack, renderSfxStats, tracks: TRACKS, sfxNames: SFX_NAMES },
  };
  ctx.audio = audio;

  // settings: apply now, then poll ctx.settings for changes made without applySettings()
  // (compared only against its own previous value, so an explicit applySettings() is never overridden)
  const snap = (s) => `${s?.masterVolume}|${s?.musicVolume}|${s?.sfxVolume}`;
  let lastSettings = snap(ctx.settings);
  M.setVolumes(ctx.settings || {});

  // unlock on the first gesture anywhere (UI also calls unlock on its buttons)
  if (typeof window !== 'undefined') {
    const onGesture = () => { audio.unlock(); if (M.running) for (const ev of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(ev, onGesture, true); };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, onGesture, true);
  }
  if (!config.mute) bank.start();

  // ------------------------------------------------------------------ per-frame
  engine.onUpdate(() => {
    const uiDt = time.uiDt;
    const s = snap(ctx.settings);
    if (s !== lastSettings) { lastSettings = s; M.setVolumes(ctx.settings); }
    if (M.ac && !M.silent('sfx')) bank.start();
    bank.pump();
    voice.update(uiDt);
    auto.update(uiDt);

    // deferred automatic music
    for (let i = 0; i < pendingMusic.length; i++) {
      const p = pendingMusic[i];
      if (time.frame <= p.frame || time.uiNow < p.due) continue;
      pendingMusic.splice(i--, 1);
      if (extMusicAt < p.at) setMusic(p.id, p.fade, 'auto');
    }
    // deferred automatic cues
    for (let i = 0; i < cueQ.length; i++) {
      const q = cueQ[i];
      if (time.frame <= q.frame) continue;
      cueQ.splice(i--, 1);
      if (!q.noDedupe && (lastName[q.name] ?? -9) >= q.at - 0.3) continue;
      rec('sfx', q.name, { auto: true });
      lastName[q.name] = time.uiNow;
      play(q.name, q.o);
    }
    if (!M.ac) return;
    M.tick(time.uiNow);
    if (!M.running) return;
    const now = M.ac.currentTime;
    for (let i = pendingSfx.length - 1; i >= 0; i--) {
      const p = pendingSfx[i];
      const buf = bank.get(p.name);
      if (buf) { pendingSfx.splice(i, 1); if (time.uiNow - p.at < 0.5) playBuffer(p.name, buf, p.o); } else if (time.uiNow - p.at > 0.5) pendingSfx.splice(i, 1);
    }
    // bullet-time treatment of the music: low-pass + slower tempo (flight only)
    const lp = slowScale < 1 ? 700 + 3500 * slowScale : 20000;
    if (Math.abs(lp - lpNow) / lpNow > 0.04) { M.bus.slowLP.frequency.setTargetAtTime(lp, now, lp < lpNow ? 0.06 : 0.25); lpNow = lp; }
    if (cur) cur.setRate(slowScale < 1 && cur.id === 'flight' ? 0.6 + 0.4 * slowScale : 1);
    cur?.update(now);
    for (let i = fading.length - 1; i >= 0; i--) { fading[i].update(now); if (fading[i].state === 'done') fading.splice(i, 1); }
    for (const h of loops) h.sync();
  }, ORDER.AUDIO);

  // ------------------------------------------------------------------ self-test helpers (dev/audio/render.js)
  async function renderTrack(id, seconds = 8, { tension: tt = 0, sr = 44100 } = {}) {
    const def = TRACKS[id];
    const oac = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
    const B = buildGraph(oac);
    B.master.gain.value = 0.8 ** 1.5 * 0.9; B.musicVol.gain.value = 0.7 ** 1.5 * 0.62;
    const p = new TrackPlayer({ ac: oac, K: createKit(oac), reverbIn: B.reverbIn, silent: () => false }, id, def, B.musicIn);
    p.rand = prng(42);
    p.start(0, 0.02);
    p.setTension(tt);
    for (const [ln, fn] of Object.entries(p.layerFn)) { const g = p.layers.get(ln); if (g) g.gain.value = Math.max(0, fn(tt)); }
    p.update(0, seconds);
    const buf = await oac.startRendering();
    const c = compile(def);
    return { buf, stats: bufferStats(buf), events: c.events.length, bpm: def.bpm, meter: def.meter || 4, bars: def.bars, key: def.key };
  }
  async function renderSfxStats(name, variant = 0) {
    const buf = await renderSfx(name, variant);
    return { buf, stats: bufferStats(buf), level: SFX[name].level, loop: SFX[name].loop || false, variants: SFX[name].variants || 1 };
  }
}
