/* QA harness — injected into every test page with page.addInitScript() (owner: qs-qa-lead).
 *
 * Runs at document start, before the game boots, so it can instrument AudioContext and
 * speechSynthesis. Everything else is lazy and only touches the contract surface
 * (window.__qs and the ctx.* APIs from docs/CONTRACTS.md), plus a few documented module
 * additions read with optional chaining. Exposed as window.__qa.
 *
 * Time is always driven by the test (manual mode): __qa.tick/step/stepUntil call engine.tick()
 * with 1/60 s and yield a macrotask between ticks (same as __qs.advance), and run "samplers"
 * after every tick so metrics can be collected frame by frame.
 */
(() => {
  if (window.__qa) return;
  const qa = (window.__qa = { v: 2, events: [], calls: [], audioLog: [], samplers: new Map(), samplerErrors: [], frame: 0, blips: 0 });
  const Q = () => window.__qs;
  const C = () => window.__qs && window.__qs.ctx;
  const r3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v);
  qa.r3 = r3;

  // ------------------------------------------------------------------ 1. audio instrumentation
  qa.audioContexts = [];
  qa.speech = [];
  const taps = new Map();
  try {
    const Orig = window.AudioContext || window.webkitAudioContext;
    if (Orig) {
      const Tracked = function AudioContext(...a) {
        const c = Reflect.construct(Orig, a, new.target || Tracked);
        qa.audioContexts.push(c);
        return c;
      };
      Tracked.prototype = Orig.prototype;
      Object.setPrototypeOf(Tracked, Orig);
      window.AudioContext = Tracked;
      if ('webkitAudioContext' in window) window.webkitAudioContext = Tracked;
    }
    const ADN = window.AudioDestinationNode;
    const OAC = window.OfflineAudioContext;
    const origConnect = AudioNode.prototype.connect;
    const origDisconnect = AudioNode.prototype.disconnect;
    const tapOf = (actx) => {
      let t = taps.get(actx);
      if (!t) {
        const an = actx.createAnalyser();
        an.fftSize = 2048;
        origConnect.call(an, actx.destination);
        t = { analyser: an };
        taps.set(actx, t);
      }
      return t;
    };
    AudioNode.prototype.connect = function (dest, ...rest) {
      if (ADN && dest instanceof ADN && !(OAC && dest.context instanceof OAC)) {
        const t = tapOf(dest.context);
        if (this !== t.analyser) { origConnect.call(this, t.analyser, ...rest); return dest; }
      }
      return origConnect.call(this, dest, ...rest);
    };
    AudioNode.prototype.disconnect = function (...args) {
      if (ADN && args[0] instanceof ADN) { const t = taps.get(args[0].context); if (t && this !== t.analyser) args[0] = t.analyser; }
      return origDisconnect.apply(this, args);
    };
    if (window.speechSynthesis) {
      const ss = window.speechSynthesis;
      const orig = ss.speak.bind(ss);
      ss.speak = (u) => {
        qa.speech.push({ text: String((u && u.text) || ''), volume: u && u.volume, rate: u && u.rate, lang: u && u.lang, t: C() ? r3(C().time.now) : null });
        return orig(u);
      };
    }
  } catch (e) { qa.instrumentError = String((e && e.stack) || e); }

  /** Peak / RMS at the AudioContext destination(s) over `ms` real milliseconds. */
  qa.audioLevel = (ms = 400) => new Promise((resolve) => {
    const ans = [...taps.values()].map((t) => t.analyser);
    const info = { contexts: qa.audioContexts.length, states: qa.audioContexts.map((c) => c.state), analysers: ans.length };
    if (!ans.length) { resolve({ ...info, peak: null, rms: null }); return; }
    const buf = new Float32Array(2048);
    let peak = 0, sum = 0, n = 0;
    const id = setInterval(() => {
      for (const an of ans) { an.getFloatTimeDomainData(buf); for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; sum += buf[i] * buf[i]; n++; } }
    }, 20);
    setTimeout(() => { clearInterval(id); resolve({ ...info, peak, rms: Math.sqrt(sum / Math.max(1, n)) }); }, ms);
  });

  // ------------------------------------------------------------------ 2. summaries, spies, init
  qa.summ = (p, depth = 0) => {
    if (p == null) return p;
    if (typeof p === 'string') return p.length > 300 ? p.slice(0, 300) + '…' : p;
    if (typeof p === 'number') return r3(p);
    if (typeof p !== 'object') return typeof p === 'function' ? '[fn]' : p;
    if (p.isVector3) return [r3(p.x), r3(p.y), r3(p.z)];
    if (p.isObject3D || p.isMaterial || p.isTexture) return `[${p.type || 'three'}${p.name ? ':' + p.name : ''}]`;
    if (p.root && p.root.isObject3D && p.id) return `[char:${p.id}]`;
    if (Array.isArray(p)) return depth > 1 ? `[${p.length}]` : p.slice(0, 16).map((x) => qa.summ(x, depth + 1));
    if (depth > 1) return '{…}';
    const o = {};
    for (const k of Object.keys(p).slice(0, 24)) o[k] = qa.summ(p[k], depth + 1);
    return o;
  };
  qa.str = (e) => { try { return typeof e === 'string' ? e : JSON.stringify(qa.summ(e)); } catch { return String(e); } };

  function spy(obj, label, names, { quiet = [] } = {}) {
    if (!obj) return;
    for (const n of names) {
      const f = obj[n];
      if (typeof f !== 'function' || f.__qaSpy) continue;
      const w = function (...args) {
        if (quiet.includes(n)) qa.blips++;
        else {
          qa.calls.push({ api: `${label}.${n}`, t: C() ? r3(C().time.now) : 0, args: args.slice(0, 3).map((a) => qa.summ(a, 1)) });
          if (qa.calls.length > 30000) qa.calls.splice(0, 10000);
        }
        return f.apply(this ?? obj, args);
      };
      w.__qaSpy = true;
      try { obj[n] = w; } catch { /* read-only */ }
    }
  }

  qa.init = () => {
    const ctx = C();
    if (!ctx) throw new Error('__qs not ready');
    if (qa._inited) return true;
    qa._inited = true;
    ctx.bus.on('*', (type, p) => {
      if (type === 'input') return;
      const e = { type, t: r3(ctx.time.now), u: r3(ctx.time.uiNow), p: qa.summ(p) };
      qa.events.push(e);
      if (qa.events.length > 40000) qa.events.splice(0, 10000);
      if (type === 'ball:landed') qa.lastLanded = { t: ctx.time.now, payload: p, sandbox: false };
    });
    spy(ctx.audio, 'audio', ['sfx', 'music', 'loop', 'speak', 'blip', 'unlock', 'duck', 'applySettings'], { quiet: ['blip'] });
    spy(ctx.cam, 'cam', ['pip', 'slowMo', 'letterbox', 'fade', 'flash', 'irisHeart', 'followBall', 'cycleFollowStyle', 'toFP', 'shot', 'cut', 'closeUp', 'twoShot', 'overShoulder', 'wide', 'orbit', 'crashZoom', 'dutch', 'track', 'shake', 'kick', 'sequence']);
    spy(ctx.ui, 'ui', ['say', 'caption', 'letterReveal', 'bubble', 'toast', 'endingCard', 'gallery']);
    spy(ctx.story, 'story', ['playIntro', 'playEnding']);
    spy(ctx.ai && ctx.ai.students, 'students', ['trigger', 'react', 'setAmbient']);
    spy(ctx.ai && ctx.ai.teacher, 'teacher', ['say']);
    const r = ctx.engine.renderer;
    const origRender = r.render;
    qa.renderCalls = 0;
    r.render = function (s, c) { qa.renderCalls++; return origRender.call(this, s, c); };
    return true;
  };

  // ------------------------------------------------------------------ 3. stepping
  const mc = new MessageChannel();
  const yq = [];
  mc.port1.onmessage = () => { const r = yq.shift(); if (r) r(); };
  const yieldTask = () => new Promise((r) => { yq.push(r); mc.port2.postMessage(0); });
  qa.yield = yieldTask;
  qa.runSamplers = () => {
    for (const [k, s] of qa.samplers) {
      try { s(qa.frame); } catch (e) { if (qa.samplerErrors.length < 50) qa.samplerErrors.push(k + ': ' + String((e && e.stack) || e).slice(0, 300)); }
    }
    qa.pollAudio();
  };
  qa.tick = async (n = 1, step = 1 / 60) => {
    const eng = C().engine;
    for (let i = 0; i < n; i++) { eng.tick(step); qa.frame++; qa.runSamplers(); await yieldTask(); }
  };
  qa.step = (sec, step = 1 / 60) => qa.tick(Math.max(1, Math.round(sec / step)), step);
  /** Tick until pred() is truthy; timeout is in ui (unscaled) seconds. */
  qa.stepUntil = async (pred, timeoutSec = 60, step = 1 / 60) => {
    const n = Math.round(timeoutSec / step);
    for (let i = 0; i < n; i++) { if (pred()) return true; await qa.tick(1, step); }
    return !!pred();
  };
  /** Real-time ticking without rendering (for DOM-driven UI phases). */
  qa.pump = (on = true, render = false) => {
    if (qa._pump) { clearInterval(qa._pump); qa._pump = null; }
    if (!on) return;
    Q().manual(true);
    let last = performance.now();
    qa._pump = setInterval(() => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 1 / 15);
      last = now;
      try { C().engine.tick(dt); qa.frame++; qa.runSamplers(); if (render) Q().render(); } catch (e) { qa.samplerErrors.push('pump: ' + String(e)); }
    }, 16);
  };

  // audio debug tap: diff ctx.audio.debug.recent every tick
  let lastRef, lastLen = 0;
  qa.pollAudio = () => {
    const ctx = C();
    const rec = ctx && ctx.audio && ctx.audio.debug && ctx.audio.debug.recent;
    if (!Array.isArray(rec) || !rec.length) return;
    const last = rec[rec.length - 1];
    if (last === lastRef && rec.length === lastLen) return;
    let start = 0;
    if (lastRef !== undefined) { const i = rec.lastIndexOf(lastRef); start = i >= 0 ? i + 1 : Math.max(0, rec.length - 1); }
    for (let i = start; i < rec.length; i++) qa.audioLog.push({ t: r3(ctx.time.now), e: qa.str(rec[i]).slice(0, 200) });
    if (qa.audioLog.length > 20000) qa.audioLog.splice(0, 5000);
    lastRef = last; lastLen = rec.length;
  };

  // ------------------------------------------------------------------ 4. camera, projection, occlusion
  qa.camObj = () => { const ctx = C(); return (ctx.cam && ctx.cam.camera) || ctx.engine.camera; };
  qa.camPose = () => {
    const T = C().THREE;
    const cam = qa.camObj();
    cam.updateMatrixWorld(true);
    const p = cam.getWorldPosition(new T.Vector3());
    const d = cam.getWorldDirection(new T.Vector3());
    return { pos: [p.x, p.y, p.z], dir: [d.x, d.y, d.z], yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(Math.max(-1, Math.min(1, d.y))), fov: cam.fov };
  };
  qa.project = (v) => {
    const T = C().THREE;
    const cam = qa.camObj();
    cam.updateMatrixWorld(true);
    const p = v.isVector3 ? v.clone() : new T.Vector3(v[0], v[1], v[2]);
    const view = p.clone().applyMatrix4(cam.matrixWorldInverse);
    const ndc = p.clone().project(cam);
    return { x: ndc.x, y: ndc.y, front: view.z < 0, depth: -view.z };
  };
  qa.nameOf = (o) => { const parts = []; for (let x = o; x && parts.length < 4; x = x.parent) if (x.name) parts.push(x.name); return parts.join('<') || o.type; };
  qa.occluders = () => {
    const ctx = C();
    const skip = new Set();
    const ball = ctx.gameplay && ctx.gameplay.ball;
    if (ball && ball.mesh) ball.mesh.traverse((o) => skip.add(o));
    qa.camObj().traverse((o) => skip.add(o));
    const out = [];
    ctx.engine.scene.traverseVisible((o) => {
      if (skip.has(o) || !o.isMesh || o.isInstancedMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.every((m) => !m || m.visible === false || (m.transparent && (m.opacity ?? 1) < 0.6) || m.depthWrite === false || m.colorWrite === false)) return;
      out.push(o);
    });
    return out;
  };
  qa.occlusion = (objs) => {
    const ctx = C();
    const T = ctx.THREE;
    const cam = qa.camObj();
    const ball = ctx.gameplay.ball;
    cam.updateMatrixWorld(true);
    const o = cam.getWorldPosition(new T.Vector3());
    const q = cam.getWorldQuaternion(new T.Quaternion());
    const R = ctx.layout.BALL_RADIUS;
    const right = new T.Vector3(1, 0, 0).applyQuaternion(q), up = new T.Vector3(0, 1, 0).applyQuaternion(q);
    const c = ball.pos.clone();
    const pts = [c, c.clone().addScaledVector(right, R * 0.9), c.clone().addScaledVector(right, -R * 0.9), c.clone().addScaledVector(up, R * 0.9), c.clone().addScaledVector(up, -R * 0.9)];
    const rc = qa._rc || (qa._rc = new T.Raycaster());
    let blocked = 0, nearest = Infinity, nearestName = null;
    for (const p of pts) {
      const dir = p.clone().sub(o);
      const dist = dir.length();
      if (dist < 1e-4) continue;
      rc.set(o, dir.normalize());
      rc.near = 0;
      rc.far = Math.max(0, dist - R);
      let hit;
      try { hit = rc.intersectObjects(objs || qa.occluders(), false)[0]; } catch { hit = null; }
      if (hit) { blocked++; if (hit.distance < nearest) { nearest = hit.distance; nearestName = qa.nameOf(hit.object); } }
    }
    return { blocked, of: pts.length, nearest, nearestName, dist: ball.pos.distanceTo(o) };
  };
  qa.camInsideCollider = () => {
    const ctx = C();
    if (ctx.stage.current !== 'classroom') return null;
    const p = qa.camObj().getWorldPosition(new ctx.THREE.Vector3());
    const m = 0.01;
    for (const c of (ctx.world.classroom.colliders || [])) {
      if (c.kind !== 'box' || !c.min || !c.max) continue;
      if (p.x > c.min.x + m && p.x < c.max.x - m && p.y > c.min.y + m && p.y < c.max.y - m && p.z > c.min.z + m && p.z < c.max.z - m) return c.tag + (c.ownerId ? ':' + c.ownerId : '');
    }
    return null;
  };

  // ------------------------------------------------------------------ 5. images
  qa.grab = (src, w, h) => {
    const c = qa._tc || (qa._tc = document.createElement('canvas'));
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, w, h);
    g.drawImage(src, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const px = new Array(w * h * 3);
    let lum = 0;
    for (let i = 0, j = 0; i < d.length; i += 4) { px[j++] = d[i]; px[j++] = d[i + 1]; px[j++] = d[i + 2]; lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; }
    return { w, h, px, lum: r3(lum / (w * h)) };
  };
  /** Render one frame and grab a tiny thumbnail of the WebGL canvas only (no DOM). */
  qa.thumb = (w = 32, h = 18) => { Q().render(); return qa.grab(C().engine.canvas, w, h); };
  qa.diff = (a, b) => { if (!a || !b || a.px.length !== b.px.length) return null; let s = 0; for (let i = 0; i < a.px.length; i++) s += Math.abs(a.px[i] - b.px[i]); return r3(s / a.px.length); };
  qa.uniformity = (t) => { const n = t.px.length / 3; let m = 0; for (let i = 0; i < n; i++) m += t.px[i * 3 + 1]; m /= n; let v = 0; for (let i = 0; i < n; i++) v += (t.px[i * 3 + 1] - m) ** 2; return r3(Math.sqrt(v / n)); };
  /** Stats of a composited screenshot (PNG base64 from page.screenshot). */
  qa.analyzePng = async (b64) => {
    const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
    const t = qa.grab(bmp, 96, 54);
    const { w, h, px } = t;
    const L = (i) => 0.2126 * px[i * 3] + 0.7152 * px[i * 3 + 1] + 0.0722 * px[i * 3 + 2];
    const band = (y0, y1) => { let s = 0, n = 0, dark = 0, bright = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) { const l = L(y * w + x); s += l; n++; if (l < 12) dark++; if (l > 245) bright++; } return { lum: r3(s / n), dark: r3(dark / n), bright: r3(bright / n) }; };
    return { lum: band(0, h).lum, all: band(0, h), top: band(0, 6), bottom: band(h - 6, h), mid: band(16, 38), stdev: qa.uniformity(t), thumb: qa.grab(bmp, 32, 18) };
  };
  qa.shot = async (name) => { Q().render(); await new Promise((r) => requestAnimationFrame(() => r())); return window.__qaShot ? window.__qaShot(name) : null; };
  /** Render with a temporary QA camera (does not touch ctx.cam). */
  qa.renderWith = ({ pos, look, fov = 60 }) => {
    const ctx = C();
    const T = ctx.THREE;
    const cv = ctx.engine.canvas;
    const cam = new T.PerspectiveCamera(fov, (cv.clientWidth || cv.width) / (cv.clientHeight || cv.height), 0.03, 300);
    cam.position.set(...pos);
    cam.lookAt(new T.Vector3(...look));
    cam.updateMatrixWorld(true);
    ctx.engine.renderer.render(ctx.engine.scene, cam);
  };
  qa.thumbWith = (view, w = 32, h = 18) => { qa.renderWith(view); return qa.grab(C().engine.canvas, w, h); };
  qa.shotWith = async (view, name) => { qa.renderWith(view); await new Promise((r) => requestAnimationFrame(() => r())); const p = window.__qaShot ? await window.__qaShot(name) : null; return p; };

  // ------------------------------------------------------------------ 6. DOM
  qa.uiText = () => (document.body && document.body.innerText) || '';
  qa.norm = (s) => String(s || '').replace(/[\s​-‍﻿]/g, '');
  qa.prefixMatch = (needle, hay) => { let lo = 0, hi = needle.length; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (hay.includes(needle.slice(0, mid))) lo = mid; else hi = mid - 1; } return lo; };
  qa.overlays = () => {
    const vw = innerWidth, vh = innerHeight, out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (el.id === 'game') continue;
      const r = el.getBoundingClientRect();
      if (r.width < vw * 0.5 || r.height < vh * 0.04) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      let op = 1;
      for (let x = el; x && x !== document.body; x = x.parentElement) { const s = getComputedStyle(x); op *= +s.opacity; if (s.display === 'none' || s.visibility === 'hidden') op = 0; }
      if (op < 0.05) continue;
      const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
      let a = 0, rgb = [0, 0, 0];
      if (m) { const p = m[1].split(',').map(Number); rgb = p.slice(0, 3); a = p.length > 3 ? p[3] : 1; }
      const img = cs.backgroundImage && cs.backgroundImage !== 'none';
      if (a * op < 0.08 && !img && el.tagName !== 'CANVAS') continue;
      const area = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / (vw * vh);
      if (area <= 0.02) continue;
      out.push({ tag: el.tagName.toLowerCase(), id: el.id || null, cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').slice(0, 60), area: r3(area), alpha: r3(a * op), rgb, top: Math.round(r.top), bottom: Math.round(r.bottom), text: (el.innerText || '').slice(0, 40) });
    }
    return out;
  };

  // ------------------------------------------------------------------ 7. world helpers
  qa.freezeWind = (on = true) => {
    const ctx = C();
    const cr = ctx.world && ctx.world.classroom;
    if (!cr) return false;
    if (on && !qa._windOff) {
      qa._origGust = cr.gust;
      cr.gust = () => Promise.resolve();
      const zero = () => { if (cr.wind) cr.wind.strength = 0; };
      qa._windOff = [ctx.engine.onUpdate(zero, 11), ctx.engine.onUpdate(zero, 29)];
      zero();
    } else if (!on && qa._windOff) { cr.gust = qa._origGust; qa._windOff.forEach((f) => f()); qa._windOff = null; }
    return true;
  };
  /** Physics sandbox: swallow ball:launched / ball:landed so the flow stays in `aim` and many throws fit in one round. */
  qa.sandbox = (on = true) => {
    const bus = C().bus;
    if (on && !qa._origEmit) {
      qa._origEmit = bus.emit;
      bus.emit = function (type, payload) {
        if (type === 'ball:launched' || type === 'ball:landed') {
          if (type === 'ball:landed') qa.lastLanded = { t: C().time.now, payload, sandbox: true };
          return undefined;
        }
        return qa._origEmit.call(bus, type, payload);
      };
    } else if (!on && qa._origEmit) { bus.emit = qa._origEmit; qa._origEmit = null; }
  };

  qa.roster = () => {
    const ctx = C();
    const r = ctx.round;
    if (!r) return [];
    const L = ctx.layout;
    const ps = L.SEAT_BY_ID[L.PLAYER_SEAT];
    return ((r.roster && r.roster.students) || []).map((s) => {
      const seatId = ctx.cast.seatOf(s.id);
      const seat = seatId && L.SEAT_BY_ID[seatId];
      return { id: s.id, name: s.name, gender: s.gender, trait: s.trait, seatId, isCrush: s.id === r.crushId, dist: seat ? r3(Math.hypot(seat.x - ps.x, seat.deskZ - ps.deskZ)) : null };
    });
  };
  const SNITCH = new Set(['monitor', 'disciplinarian']);
  qa.pick = (kind, index = 0) => {
    const ctx = C();
    const r = ctx.round;
    const pg = r.playerGender;
    let c = qa.roster().filter((s) => s.seatId && s.seatId !== ctx.layout.PLAYER_SEAT);
    if (kind === 'crush') c = c.filter((s) => s.isCrush);
    else if (kind === 'sameGender') c = c.filter((s) => s.gender === pg && !s.isCrush);
    else if (kind === 'oppSnitch') c = c.filter((s) => s.gender !== pg && !s.isCrush && SNITCH.has(s.trait));
    else if (kind === 'oppNormal') c = c.filter((s) => s.gender !== pg && !s.isCrush && !SNITCH.has(s.trait) && s.trait !== 'jock');
    c.sort((a, b) => Math.abs(a.dist - 2.6) - Math.abs(b.dist - 2.6));
    return c[index] || null;
  };
  /** Vacuum ballistic solution with a given elevation (fallback when solveLaunch has no answer). */
  qa.ballistic = (t, pitchDeg) => {
    const g = C().gameplay;
    const o = g.launchOrigin();
    const smax = (g.PHYS && g.PHYS.SPEED_MAX) || 10.5, smin = (g.PHYS && g.PHYS.SPEED_MIN) || 2.2;
    const dx = t.x - o.x, dz = t.z - o.z, dy = t.y - o.y, d = Math.hypot(dx, dz);
    const th = (pitchDeg * Math.PI) / 180;
    const denom = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - dy);
    if (denom <= 0) return null;
    const v = Math.sqrt((9.8 * d * d) / denom);
    const power = (v - smin) / (smax - smin);
    if (!(power >= 0 && power <= 1)) return null;
    return { yaw: Math.atan2(-dx, -dz), pitch: th, power };
  };
  qa.resolveTarget = (tg) => {
    if (!tg) return null;
    const L = C().layout;
    if (tg.pick) { const s = qa.pick(tg.pick, tg.index || 0); return s ? { name: s.seatId, label: `${tg.pick}#${tg.index || 0}:${s.id}@${s.seatId}`, student: s } : null; }
    if (tg.name) return { name: tg.name, label: String(tg.name) };
    if (tg.fan != null) { const f = L.FANS[tg.fan]; const a = ((tg.angle || 0) * Math.PI) / 180; const rr = f.r * (tg.radius ?? 0.6); return { name: { x: f.x + Math.cos(a) * rr, y: f.bladeY, z: f.z + Math.sin(a) * rr }, label: `fan${tg.fan}@${tg.angle || 0}` }; }
    if (tg.teacherHead) { const p = C().cast.teacher.headWorld(new (C().THREE.Vector3)()); return { name: { x: p.x, y: p.y + (tg.dy || 0), z: p.z }, label: 'teacherHead' }; }
    if (tg.point) return { name: { x: tg.point[0], y: tg.point[1], z: tg.point[2] }, label: `point(${tg.point.join(',')})` };
    return null;
  };
  qa.solve = (tg, opts = {}) => {
    const ctx = C();
    const res = qa.resolveTarget(tg);
    if (!res) return { error: 'no target candidate' };
    let p;
    try { p = Q().target(res.name); } catch (e) { return { error: 'target(): ' + e.message, label: res.label }; }
    const t0 = performance.now();
    let sol = null, via = 'solveLaunch', err = null;
    try { sol = ctx.gameplay.solveLaunch(p, opts); } catch (e) { err = String(e); }
    const ms = performance.now() - t0;
    if (!sol && opts.fallbackPitch != null) { sol = qa.ballistic(p, opts.fallbackPitch); via = 'ballistic'; }
    const out = { label: res.label, student: res.student, target: [r3(p.x), r3(p.y), r3(p.z)], via, ms: r3(ms) };
    if (!sol) return { ...out, error: 'no launch solution' + (err ? ' (' + err + ')' : '') };
    return { ...out, sol: { yaw: sol.yaw, pitch: sol.pitch, power: sol.power }, expect: sol.expect ? qa.summ(sol.expect) : null };
  };
  qa.landing = () => {
    const ctx = C();
    const r = ctx.round;
    const L = r && r.landing;
    if (!L) return null;
    return qa.landingOf(L);
  };
  qa.landingOf = (L) => {
    const ctx = C();
    const r = ctx.round;
    const st = L.ownerId && ctx.cast.get(L.ownerId) && ctx.cast.get(L.ownerId).spec;
    return {
      type: L.type, seatId: L.seatId ?? null, ownerId: L.ownerId ?? null, reason: L.reason, nearSeatId: L.nearSeatId,
      pos: L.pos ? [r3(L.pos.x), r3(L.pos.y), r3(L.pos.z)] : null,
      hits: (L.hits || []).slice(0, 12).map((h) => ({ tag: h.tag, ownerId: h.ownerId ?? null })),
      flightTime: r3(L.flightTime), bounces: L.bounces,
      owner: st ? { gender: st.gender, trait: st.trait, role: st.role, isCrush: st.id === (r && r.crushId) } : null,
    };
  };

  // ------------------------------------------------------------------ 9. physics (C1/C2/C3)
  qa.physSetup = async (o = {}) => {
    await qa.begin({ seed: o.seed ?? 11, gender: o.gender || 'm', ambient: false, roundSeconds: 900, teacher: 'writing', suspicion: 0 });
    Q().forceTeacher('writing', 9999);
    qa.sandbox(true);
    const ctx = C();
    const thin = (ctx.world.classroom.colliders || []).filter((c) => c.kind === 'box' && c.min && c.max && c.max.y - c.min.y < 0.1 && c.max.y > 0.3 && c.max.y < 2.6 && ['desk', 'chair', 'podium', 'teacherDesk', 'book'].includes(c.tag))
      .map((c) => ({ tag: c.tag, ownerId: c.ownerId, min: [c.min.x, c.min.y, c.min.z], max: [c.max.x, c.max.y, c.max.z] }));
    qa._thin = thin;
    return { thin: thin.length, colliders: (ctx.world.classroom.colliders || []).length };
  };
  /** Launch `sol` in the sandbox and step until it lands. Checks NaN, room containment and thin-slab tunnelling per tick. */
  qa.physThrow = async (sol, o = {}) => {
    const ctx = C();
    const g = ctx.gameplay;
    const ball = g.ball;
    const L = ctx.layout;
    const room = L.ROOM, R = L.BALL_RADIUS;
    const win = L.WINDOWS.find((w) => w.open);
    qa.lastLanded = null;
    g.launch(sol);
    const t0 = ctx.time.now;
    const p0 = ball.pos.clone();
    let prev = ball.pos.clone();
    let nan = false, exitedWindow = false, moved = false;
    const tunnels = [], track = o.track ? [] : null;
    const maxT = o.maxT ?? 10;
    const u0 = ctx.time.uiNow;
    while (!qa.lastLanded && ctx.time.now - t0 < maxT && ctx.time.uiNow - u0 < maxT * 4) {
      await qa.tick(1);
      const p = ball.pos, v = ball.vel;
      if (![p.x, p.y, p.z, v.x, v.y, v.z].every(Number.isFinite)) { nan = true; break; }
      if (p.distanceTo(p0) > 0.05) moved = true;
      if (track) track.push([r3(ctx.time.now - t0), r3(p.x), r3(p.y), r3(p.z), r3(v.length())]);
      if (ball.state === 'flying' || !qa.lastLanded) {
        // room containment (except through the open window)
        if (prev.x >= room.minX && p.x < room.minX) {
          const k = (room.minX - prev.x) / (p.x - prev.x);
          const y = prev.y + (p.y - prev.y) * k, z = prev.z + (p.z - prev.z) * k;
          if (z > win.z - win.w / 2 - 0.02 && z < win.z + win.w / 2 + 0.02 && y > win.sillY - 0.02 && y < win.sillY + win.h + 0.02) exitedWindow = true;
          else tunnels.push(`left wall at y ${r3(y)} z ${r3(z)}`);
        }
        if (!exitedWindow && (p.x < room.minX - R - 0.12 || p.x > room.maxX + R + 0.02 || p.z < room.minZ - R - 0.02 || p.z > room.maxZ + R + 0.02 || p.y < -R - 0.02 || p.y > room.height + R + 0.02)) tunnels.push(`outside the room at ${[p.x, p.y, p.z].map(r3).join(',')}`);
        for (const c of qa._thin || []) {
          if (prev.y > c.max[1] + 1e-3 && p.y < c.min[1] - 1e-3) {
            const k = (c.max[1] - prev.y) / (p.y - prev.y);
            const x = prev.x + (p.x - prev.x) * k, z = prev.z + (p.z - prev.z) * k;
            if (x > c.min[0] + 0.05 && x < c.max[0] - 0.05 && z > c.min[2] + 0.05 && z < c.max[2] - 0.05) tunnels.push(`through ${c.tag}:${c.ownerId ?? ''}`);
          }
        }
      }
      prev.copy(p);
      if (tunnels.length > 3) break;
    }
    const landed = qa.lastLanded;
    const lt = landed ? landed.t - t0 : null;
    // settle check: the ball must stay put after landing
    let drift = null;
    if (landed && o.settle) { const a = ball.pos.clone(); await qa.step(o.settle); drift = r3(ball.pos.distanceTo(a)); }
    return { landing: landed ? qa.landingOf(landed.payload) : null, landedAfter: r3(lt), nan, tunnels: [...new Set(tunnels)], exitedWindow, moved, end: [r3(ball.pos.x), r3(ball.pos.y), r3(ball.pos.z)], drift, track };
  };

  // ------------------------------------------------------------------ 8. scenarios
  qa.begin = async (o = {}) => {
    const qs = Q();
    const ctx = C();
    qa.init();
    qs.manual(true);
    await qs.start({ seed: o.seed ?? 1, playerGender: o.gender || 'm', letter: o.letter ?? '其实……我注意你很久了。', skipIntro: o.skipIntro !== false, roundSeconds: o.roundSeconds, crushId: o.crushId, seatMap: o.seatMap });
    if (o.ambient === false) ctx.ai && ctx.ai.students && ctx.ai.students.setAmbient && ctx.ai.students.setAmbient(false);
    if (o.freezeWind !== false) qa.freezeWind(true);
    if (o.teacher) qs.forceTeacher(o.teacher, o.teacherDur ?? 999);
    if (o.suspicion != null) qs.setSuspicion(o.suspicion);
    return { state: qs.state(), crushId: ctx.round.crushId, playerGender: ctx.round.playerGender, roster: qa.roster() };
  };

  qa.newFlightMetrics = () => ({ frames: 0, follow: 0, inCenter: 0, inFrame: 0, behind: 0, occChecks: 0, hiddenNear: 0, hiddenFar: 0, partial: 0, hiddenNearWhat: null, camInside: 0, camInsideWhat: null, minScale: 1, camModes: {}, maxAbsNdc: 0, track: [] });
  qa.startFlightSampler = (m) => {
    let occ = null, occAge = 99;
    qa.samplers.set('flight', () => {
      const ctx = C();
      const ball = ctx.gameplay.ball;
      if (ctx.flow.phase !== 'flight' || ball.state !== 'flying') return;
      m.frames++;
      m.minScale = Math.min(m.minScale, ctx.engine.timeScale);
      const mode = ctx.cam && ctx.cam.mode;
      m.camModes[mode] = (m.camModes[mode] || 0) + 1;
      if (mode !== 'follow') return;
      m.follow++;
      const f = qa.project(ball.pos);
      const ax = Math.abs(f.x), ay = Math.abs(f.y);
      if (!f.front) m.behind++;
      else { if (ax <= 0.7 && ay <= 0.7) m.inCenter++; if (ax <= 1 && ay <= 1) m.inFrame++; m.maxAbsNdc = Math.max(m.maxAbsNdc, ax, ay); }
      if (m.follow % 3 === 1) {
        if (occAge++ > 20 || !occ) { occ = qa.occluders(); occAge = 0; }
        const o = qa.occlusion(occ);
        m.occChecks++;
        if (o.blocked === o.of) { if (o.nearest < 1.0) { m.hiddenNear++; m.hiddenNearWhat = o.nearestName; } else m.hiddenFar++; } else if (o.blocked > 0) m.partial++;
        const inside = qa.camInsideCollider();
        if (inside) { m.camInside++; m.camInsideWhat = inside; }
      }
      if (m.follow % 6 === 1 && m.track.length < 60) m.track.push([r3(f.x), r3(f.y), r3(ctx.engine.timeScale)]);
    });
  };

  /** Perform the scenario action and run until the ending phase. */
  qa.act = async (o = {}) => {
    const qs = Q();
    const ctx = C();
    const out = { action: o.action };
    const m = qa.newFlightMetrics();
    qa.startFlightSampler(m);
    const err0 = qs.errors.length;
    let launchT = null;
    try {
      if (o.action === 'throw') {
        const s = qa.solve(o.target, o.throwOpts || {});
        Object.assign(out, { label: s.label, via: s.via, solveMs: s.ms, target: s.target, sol: s.sol && { yaw: r3(s.sol.yaw), pitch: r3(s.sol.pitch), power: r3(s.sol.power) }, expect: s.expect });
        if (s.error) { out.error = s.error; return out; }
        ctx.gameplay.launch(s.sol);
        launchT = ctx.time.now;
      } else if (o.action === 'charge') {
        ctx.input.simulate({ down: 'Mouse0' });
      }
      let turned = false;
      const limit = o.timeout ?? ((ctx.round.timeLeft || 90) + 25);
      const done = () => ['ending', 'card', 'title'].includes(ctx.flow.phase);
      const u0 = ctx.time.uiNow;
      while (!done() && ctx.time.uiNow - u0 < limit) {
        await qa.tick(1);
        if (o.seenFlight && launchT != null && ctx.flow.phase === 'flight') ctx.round.teacherSawBall = true;
        if (o.turnAt != null && !turned && launchT != null && ctx.time.now - launchT >= o.turnAt) {
          turned = true;
          if (o.turnVia === 'trigger') out.turnTrigger = ctx.ai.students.trigger('teacherTurn');
          else qs.forceTeacher(o.turnTo || 'watching', 999);
          out.turnedAt = r3(ctx.time.now - launchT);
        }
      }
      out.timedOut = !done();
    } finally {
      qa.samplers.delete('flight');
      if (o.action === 'charge') ctx.input.simulate({ up: 'Mouse0' });
    }
    const r = ctx.round;
    Object.assign(out, {
      phase: ctx.flow.phase, launched: !!r.launched, landing: qa.landing(), teacherSawBall: !!r.teacherSawBall, caughtDuring: r.caughtDuring,
      endingId: r.endingId, crushId: r.crushId, playerGender: r.playerGender, suspicion: r3(r.suspicion ?? 0), flight: m,
      errors: qs.errors.slice(err0), incidents: (r.incidents || []).slice(0, 10).map((i) => qa.summ(i)),
      camFlight: ctx.cam && ctx.cam.metrics && ctx.cam.metrics.last ? qa.summ(ctx.cam.metrics.last) : null,
    });
    return out;
  };

  /** Record an ending from now until the card is up. */
  qa.recordEnding = async (o = {}) => {
    const ctx = C();
    const qs = Q();
    const time = ctx.time;
    const res = { startPhase: ctx.flow.phase, endingId: ctx.round && ctx.round.endingId };
    const t0 = time.now, u0 = time.uiNow, ev0 = qa.events.length, call0 = qa.calls.length, err0 = qs.errors.length, sp0 = qa.speech.length, au0 = qa.audioLog.length, bl0 = qa.blips;
    let prev = null, cuts = 0, moving = 0, frames = 0, minScale = 1;
    const music = new Set(), lines = new Set(), stages = new Set([ctx.stage.current]);
    const letter = o.letter ? qa.norm(o.letter) : null;
    let letterBest = 0, letterFull = false;
    const shotAt = [...(o.shotAt || [])].sort((a, b) => a - b);
    const shots = [], thumbs = [];
    let climaxShot = null;
    let nextThumb = o.thumbEvery ? 0.5 : Infinity;
    qa.samplers.set('ending', () => {
      frames++;
      const pose = qa.camPose();
      if (prev) {
        const dp = Math.hypot(pose.pos[0] - prev.pos[0], pose.pos[1] - prev.pos[1], pose.pos[2] - prev.pos[2]);
        const dd = (Math.acos(Math.max(-1, Math.min(1, pose.dir[0] * prev.dir[0] + pose.dir[1] * prev.dir[1] + pose.dir[2] * prev.dir[2]))) * 180) / Math.PI;
        if (dp > 0.6 || dd > 25) cuts++;
        else if (dp > 0.002 || dd > 0.15 || Math.abs(pose.fov - prev.fov) > 0.05) moving++;
      }
      prev = pose;
      minScale = Math.min(minScale, ctx.engine.timeScale);
      stages.add(ctx.stage.current);
      if (frames % 6 === 0) {
        const mu = ctx.audio && ctx.audio.debug && ctx.audio.debug.music;
        if (mu) music.add(String(mu));
        const txt = qa.uiText();
        for (const l of txt.split('\n')) { const s = l.trim(); if (s && lines.size < 400) lines.add(s.slice(0, 200)); }
        if (letter) { const n = qa.norm(txt); const k = qa.prefixMatch(letter, n); if (k > letterBest) letterBest = k; if (k >= letter.length) letterFull = true; }
      }
    });
    try {
      while (ctx.flow.phase !== 'card' && time.uiNow - u0 < (o.timeout || 150)) {
        await qa.tick(1);
        const el = time.now - t0;
        while (shotAt.length && el >= shotAt[0] && ctx.flow.phase !== 'card') {
          const at = shotAt.shift();
          if (o.prefix) shots.push(await qa.shot(`${o.prefix}-${String(at).replace('.', '_')}s`));
          thumbs.push({ at, ...qa.thumb() });
        }
        if (o.thumbEvery && el >= nextThumb) { thumbs.push({ at: r3(el), ...qa.thumb() }); nextThumb += o.thumbEvery; }
        const beat = ctx.story && ctx.story.debug && ctx.story.debug.beat;
        if (o.prefix && beat === 'climax' && !climaxShot && ctx.flow.phase === 'ending') { await qa.step(0.8); climaxShot = await qa.shot(`${o.prefix}-climax`); shots.push(climaxShot); thumbs.push({ at: r3(time.now - t0), climax: true, ...qa.thumb() }); }
      }
    } finally { qa.samplers.delete('ending'); }
    const evs = qa.events.slice(ev0);
    const calls = qa.calls.slice(call0);
    Object.assign(res, {
      reachedCard: ctx.flow.phase === 'card', durGame: r3(time.now - t0), durUi: r3(time.uiNow - u0), cuts, movingFrames: moving, frames,
      music: [...music], stages: [...stages], minScale: r3(minScale), timeScaleAtCard: ctx.engine.timeScale,
      says: evs.filter((e) => e.type === 'say').map((e) => ({ speaker: e.p && e.p.speaker, text: e.p && e.p.text })),
      captions: calls.filter((c) => c.api === 'ui.caption').map((c) => c.args[0]),
      reveals: calls.filter((c) => c.api === 'ui.letterReveal').map((c) => ({ text: c.args[0], opts: c.args[1] })),
      camCalls: calls.filter((c) => c.api.startsWith('cam.')).map((c) => c.api.slice(4)),
      musicCalls: calls.filter((c) => c.api === 'audio.music').map((c) => c.args[0]),
      sfxCalls: calls.filter((c) => c.api === 'audio.sfx').map((c) => c.args[0]),
      audioRecent: qa.audioLog.slice(au0).map((a) => a.e).slice(0, 200),
      blips: qa.blips - bl0,
      eventsCount: evs.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {}),
      lines: [...lines], errors: qs.errors.slice(err0),
      endingShown: (evs.find((e) => e.type === 'ending:shown') || {}).p || null,
      storyDuration: ctx.story && ctx.story.debug && ctx.story.debug.durations ? qa.summ(ctx.story.debug.durations[res.endingId]) : null,
      shots,
    });
    if (letter) {
      res.letter = { best: letterBest, len: letter.length, full: letterFull,
        speech: qa.speech.slice(sp0).map((s) => s.text),
        speak: calls.filter((c) => c.api === 'audio.speak').map((c) => c.args[0]),
        sayFull: res.says.some((s) => qa.norm(s.text).includes(letter)),
        revealFull: res.reveals.some((r) => qa.norm(r.text).includes(letter)) };
    }
    if (res.reachedCard) {
      await qa.step(0.6);
      await new Promise((r) => setTimeout(r, 1300)); // let the card's CSS fade-in finish (real time)
      res.cardText = qa.uiText();
      res.finalThumb = qa.thumb();
      if (o.prefix) res.cardShot = await qa.shot(`${o.prefix}-card`);
    }
    res.thumbs = thumbs;
    return res;
  };

  qa.aimSnapshot = () => {
    const ctx = C();
    const r = ctx.round || {};
    return {
      phase: ctx.flow.phase, timeScale: ctx.engine.timeScale, paused: !!ctx.engine.paused, cam: ctx.cam && ctx.cam.mode, stage: ctx.stage.current,
      input: ctx.input.enabled, ball: ctx.gameplay && ctx.gameplay.ball && ctx.gameplay.ball.state, suspicion: r3(r.suspicion), teacher: ctx.ai && ctx.ai.teacher && ctx.ai.teacher.state,
      mood: ctx.world && ctx.world.classroom && ctx.world.classroom.mood, overlays: qa.overlays(), hud: qa.uiText(),
      camDebug: ctx.cam && ctx.cam.debug ? qa.summ(ctx.cam.debug()) : null, renderCallsPerFrame: (() => { const a = qa.renderCalls; Q().render(); return qa.renderCalls - a; })(),
      lum: qa.thumb().lum, names: ((r.roster && r.roster.students) || []).map((s) => s.name),
    };
  };
})();
