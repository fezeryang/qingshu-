// Cutscene director toolkit (owner: narrative-director).
//
// Every cross-module call made by a cutscene goes through a Director `d`, which
//  - uses optional chaining and try/catch, so a missing or stubbed API never throws,
//  - caps every awaited promise (dialogue, camera moves, clips…) so a cutscene can never hang,
//  - falls back to a sensible wait when another module returns a non-promise,
//  - supports cancellation (intro skip, ending hard cap): after d.cancel() the next d.* await throws
//    CANCEL, which unwinds the script; the runner swallows it.
// Only ctx.time is used for timing (rule R1). Variant picks use ctx.rng forks (rule R3).
import * as THREE from 'three';
import { SEAT_BY_ID, PLAYER_SEAT, PLAYER_EYE, TEACHER_SPOTS, PLATFORM } from '../core/layout.js';
import { yawTo } from '../core/util.js';
import { NPCS, playerAvatarSpec } from './roster.js';

export const CANCEL = Symbol('story-cancel');
const CAM_MOVES = new Set(['closeUp', 'twoShot', 'overShoulder', 'wide', 'orbit', 'crashZoom', 'track']);
const warned = new Set();
export function warnOnce(key, err) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[story] ${key}`, err?.message ?? err ?? '');
}

const isThenable = (x) => x && typeof x.then === 'function';
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * Clean a dialogue line for voicing (all ui.say text is pre-rendered by neural TTS from the exact string):
 * drop （stage directions） when there is other text (else unwrap them), drop leading ellipses, '～',
 * collapse repeated ！/？. Mid-sentence …… stays (a meant pause). Returns '' if nothing speakable is left.
 */
export function speakable(text) {
  let t = String(text ?? '').trim();
  const stripped = t.replace(/（[^）]*）/g, '').trim();
  t = /[\p{L}\p{N}]/u.test(stripped) ? stripped : t.replace(/[（）]/g, '');
  t = t.replace(/[～~]/g, '').replace(/^[…\s.。，,]+/, '').replace(/！{2,}/g, '！').replace(/？{2,}/g, '？').replace(/[!?]{2,}/g, (m) => m[0]).trim();
  return /[\p{L}\p{N}]/u.test(t) ? t : '';
}

/**
 * @param ctx    the global ctx
 * @param shared module-level state: { props: Map, debug }
 * @param label  'intro' | ending id (also the rng fork label)
 */
export function createDirector(ctx, shared, label) {
  const round = ctx.round || {};
  const rng = (ctx.rng?.fork ? ctx.rng.fork(`story/${label}`) : ctx.makeRng?.(`story/${label}`)) || null;
  const fx = (ctx.rng?.fork ? ctx.rng.fork(`story/${label}/fx`) : null) || rng;
  const T = ctx.time;
  const walking = new Set();

  const d = {
    ctx, round, label, V, THREE,
    cancelled: false,
    cancel() {
      d.cancelled = true;
      for (const ch of [...walking]) d.cancelWalk(ch);
    },
    check() { if (d.cancelled) throw CANCEL; },

    // ---------------------------------------------------------------- randomness (variants)
    rnd: () => (rng ? rng.next() : 0.5),
    pick: (arr) => (arr && arr.length ? arr[Math.floor(d.rnd() * arr.length) % arr.length] : undefined),
    chance: (p) => d.rnd() < p,
    jitter: (a, b) => a + (b - a) * (fx ? fx.next() : 0.5),

    // ---------------------------------------------------------------- bookkeeping for tests / QA
    beat(name) {
      shared.debug.beat = name;
      shared.debug.beats.push({ name, t: +T.now.toFixed(2) });
    },

    // ---------------------------------------------------------------- time + safety
    /** Call fn safely; returns its value or undefined. */
    try(key, fn) {
      try { return fn(); } catch (err) { warnOnce(key, err); return undefined; }
    },
    /** Await a value from another module with a cap and a fallback wait if it is not a promise. */
    async settle(value, { cap = 6, fallback = 0, clock = 'ui' } = {}) {
      d.check();
      if (isThenable(value)) {
        const guarded = Promise.resolve(value).catch((err) => warnOnce('rejected promise', err));
        await Promise.race([guarded, clock === 'game' ? T.wait(cap) : T.waitUI(cap)]);
      } else if (fallback > 0) {
        await (clock === 'game' ? T.wait(fallback) : T.waitUI(fallback));
      }
      d.check();
    },
    async wait(sec) { d.check(); await T.wait(sec); d.check(); },
    async waitUI(sec) { d.check(); await T.waitUI(sec); d.check(); },
    async until(pred, timeout = 10, clock = 'game') { d.check(); await T.until(() => d.cancelled || pred(), timeout, clock); d.check(); },
    /** Run an async branch in parallel. The returned promise never rejects. */
    run(fn) {
      return Promise.resolve().then(fn).catch((err) => { if (err !== CANCEL) reportError(err); });
    },
    /** Fire and forget. */
    bg(p) { if (isThenable(p)) p.catch((err) => { if (err !== CANCEL) reportError(err); }); return p; },
    /** Start `fn` after `sec` game seconds (parallel). */
    after(sec, fn) { return d.run(async () => { await d.wait(sec); await fn(); }); },

    // ---------------------------------------------------------------- characters
    get: (id) => (id ? ctx.cast?.get?.(id) || null : null),
    get teacher() { return ctx.cast?.teacher || ctx.cast?.get?.('teacher') || null; },
    get crush() { return d.get(round.crushId); },
    students() { return (ctx.cast?.students?.() || []).filter((c) => c?.root?.visible); },
    byTrait(trait, { exclude = [] } = {}) {
      return d.students().filter((c) => c.spec?.trait === trait && !exclude.includes(c) && !exclude.includes(c.id));
    },
    avatar() {
      const ch = d.try('cast.extra(player)', () => ctx.cast.extra(playerAvatarSpec(round.playerGender)));
      if (ch) { d.try('avatar.reset', () => ch.reset?.()); ch.root.visible = true; }
      return ch || null;
    },
    npc(key) {
      const ch = d.try(`cast.extra(${key})`, () => ctx.cast.extra(NPCS[key]));
      if (ch) { d.try('npc.reset', () => ch.reset?.()); ch.root.visible = true; }
      return ch || null;
    },
    name: (ch) => ch?.spec?.name || '同学',
    headPos(ch, out = V()) {
      if (!ch) return out.set(0, 1.2, 0);
      const ok = d.try('headWorld', () => { ch.headWorld?.(out); return true; });
      if (!ok || !Number.isFinite(out.y) || out.lengthSq() === 0) {
        out.copy(ch.root.position);
        out.y += ch.posture === 'sit' ? 1.08 : 1.45;
      }
      return out;
    },
    handPos(ch, hand = 'R', out = V()) {
      const ok = ch && d.try('handWorld', () => { ch.handWorld?.(hand, out); return true; });
      if (!ok || !Number.isFinite(out.y) || out.lengthSq() === 0) d.headPos(ch, out).y -= 0.35;
      return out;
    },
    /** One-shot clip, awaited (capped). Loops resolve immediately. */
    async play(ch, clip, opts = {}) {
      if (!ch) return;
      const r = d.try(`play(${clip})`, () => ch.play?.(clip, opts));
      if (opts.loop) { d.check(); return; }
      await d.settle(r, { cap: opts.cap ?? 3.2, fallback: 0, clock: 'game' });
    },
    /** Clip without waiting. */
    anim(ch, clip, opts = {}) { if (ch) d.bg(Promise.resolve(d.try(`play(${clip})`, () => ch.play?.(clip, opts)))); },
    stop(ch, clip) { if (ch) d.try('stop', () => ch.stop?.(clip)); },
    expr(ch, name) { if (ch) d.try('setExpression', () => ch.setExpression?.(name)); },
    emote(ch, kind, dur = 1.5) { if (ch) d.bg(Promise.resolve(d.try(`emote(${kind})`, () => ch.emote?.(kind, dur)))); },
    /** target: Vector3 | Object3D | Character | null */
    look(ch, target, weight = 1) {
      if (!ch) return;
      let t = target;
      if (t && t.root && t.spec) t = t.parts?.head || d.headPos(t);
      d.try('lookAt', () => ch.lookAt?.(t ?? null, weight));
    },
    async face(ch, target, dur = 0.3) {
      if (!ch) return;
      let t = target;
      if (t && t.root && t.spec) t = t.root.position.clone();
      const r = d.try('faceTo', () => ch.faceTo?.(t, dur));
      if (!isThenable(r)) {
        const yaw = typeof t === 'number' ? t : yawTo(ch.root.position, t);
        ch.root.rotation.y = yaw;
      }
      await d.settle(r, { cap: dur + 1, fallback: dur, clock: 'game' });
    },
    async walk(ch, pos, { speed = 1.1, cap } = {}) {
      if (!ch) return;
      const dist = ch.root.position.distanceTo(pos);
      walking.add(ch);
      const r = d.try('walkTo', () => ch.walkTo?.(pos.clone(), { speed }));
      // A capped await does not stop the character's walkTo tween. Invalidate it before
      // releasing ownership, so a later scene placement cannot be overwritten by that tween.
      try { await d.settle(r, { cap: cap ?? dist / speed + 2, clock: 'game' }); } finally { d.cancelWalk(ch); }
      if (!isThenable(r)) ch.root.position.copy(pos);
    },
    /** Stop a walkTo that is still moving the root (walkTo to the current spot bumps the walk token). */
    cancelWalk(ch) {
      if (!ch || !walking.has(ch)) return;
      walking.delete(ch);
      if (ch.posture !== 'sit') d.try('walkTo(cancel)', () => ch.walkTo?.(ch.root.position.clone(), { speed: 1 }));
      d.stop(ch, 'walk');
      d.stop(ch, 'run');
    },
    hold(ch, prop, hand = 'R') { if (ch) d.try('hold', () => ch.hold?.(prop ?? null, hand)); },
    posture(ch, p) { if (ch) d.try('setPosture', () => ch.setPosture?.(p)); },
    async standUp(ch) { if (!ch) return; await d.play(ch, 'standUp', { cap: 1.6 }); d.posture(ch, 'stand'); },
    async sitDown(ch) { if (!ch) return; await d.play(ch, 'sitDown', { cap: 1.6 }); d.posture(ch, 'sit'); },
    /** Put a character at an anchor ({pos, yaw}) or a Vector3. */
    place(ch, where, { yaw, posture = 'stand', y } = {}) {
      if (!ch || !where) return ch;
      d.cancelWalk(ch);
      const pos = where.isVector3 ? where : where.pos;
      if (pos) ch.root.position.copy(pos);
      if (y != null) ch.root.position.y = y;
      const ry = yaw ?? where.yaw;
      ch.root.rotation.set(0, Number.isFinite(ry) ? ry : 0, 0);
      d.posture(ch, posture);
      ch.root.visible = true;
      return ch;
    },
    /** Sit a character in a classroom chair facing the board. */
    seat(ch, seatId) {
      const s = SEAT_BY_ID[seatId];
      if (!ch || !s) return ch;
      d.cancelWalk(ch);
      ch.root.position.set(s.x, 0, s.chairZ);
      ch.root.rotation.set(0, 0, 0);
      d.posture(ch, 'sit');
      ch.root.visible = true;
      return ch;
    },
    /** The player's avatar, seated in the protagonist seat (for third-person shots of "you"). */
    seatPlayer() { const p = d.avatar(); d.seat(p, PLAYER_SEAT); return p; },
    /** Teacher at the board, facing the class (yaw π) or the board (yaw 0). */
    teacherAtBoard(facing = 'class', spot = 1) {
      const t = d.teacher;
      if (!t) return t;
      const p = TEACHER_SPOTS.board[spot] || TEACHER_SPOTS.board[1];
      t.root.position.set(p.x, PLATFORM.h, p.z);
      t.root.rotation.set(0, facing === 'class' ? Math.PI : 0, 0);
      d.posture(t, 'stand');
      t.root.visible = true;
      return t;
    },
    /** Run fn(ch, i) for the visible students with a small staggered delay (parallel). */
    crowd(fn, { exclude = [], stagger = 0.3, only } = {}) {
      const ex = new Set(exclude.filter(Boolean).map((c) => (typeof c === 'string' ? c : c.id)));
      const list = (only || d.students()).filter((c) => c && !ex.has(c.id));
      return Promise.all(list.map((ch, i) => d.run(async () => {
        const delay = stagger > 0 ? d.jitter(0, stagger) : 0;
        if (delay > 0) await d.wait(delay);
        await fn(ch, i);
      })));
    },

    // ---------------------------------------------------------------- camera
    get cam() { return ctx.cam || {}; },
    async shot(o) {
      const dur = o.dur ?? 0;
      shared.debug.shots = (shared.debug.shots || 0) + 1;
      const r = d.try('cam.shot', () => ctx.cam?.shot?.({ fov: 50, ...o, dur }));
      await d.settle(r, { cap: dur + 1, fallback: dur, clock: 'game' });
    },
    cut(o) { shared.debug.shots = (shared.debug.shots || 0) + 1; d.try('cam.cut', () => (ctx.cam?.cut ? ctx.cam.cut({ fov: 50, ...o }) : ctx.cam?.shot?.({ fov: 50, ...o, dur: 0 }))); },
    /** Camera at `dist` from target along a direction (yaw in radians around Y, 0 = looking toward -Z from +Z side). */
    frame(target, { yaw = 0, dist = 1.2, height = 0.1, fov = 40, dur = 0, lookOffset, ease } = {}) {
      const t = target?.isVector3 ? target.clone() : d.headPos(target);
      const pos = V(t.x + Math.sin(yaw) * dist, t.y + height, t.z + Math.cos(yaw) * dist);
      const look = lookOffset ? t.clone().add(lookOffset) : t;
      return dur > 0 ? d.shot({ pos, look, fov, dur, ease }) : (d.cut({ pos, look, fov }), d.settle(null));
    },
    camAt(anchor, { fov = 45, dur = 0, ease } = {}) {
      if (!anchor?.pos) return d.settle(null);
      const look = anchor.look || anchor.pos.clone().add(V(-Math.sin(anchor.yaw || 0), -0.1, -Math.cos(anchor.yaw || 0)));
      return dur > 0 ? d.shot({ pos: anchor.pos.clone(), look: look.clone(), fov, dur, ease }) : (d.cut({ pos: anchor.pos.clone(), look: look.clone(), fov }), d.settle(null));
    },
    async preset(name, args, dur = 0.6) {
      if (CAM_MOVES.has(name)) shared.debug.shots = (shared.debug.shots || 0) + 1;
      const r = d.try(`cam.${name}`, () => ctx.cam?.[name]?.(...args));
      await d.settle(r, { cap: dur + 1.2, fallback: 0, clock: 'game' });
    },
    closeUp: (ch, o = {}) => d.preset('closeUp', [ch, o], o.dur ?? 0.6),
    twoShot: (a, b, o = {}) => d.preset('twoShot', [a, b, o], o.dur ?? 0.6),
    overShoulder: (a, b, o = {}) => d.preset('overShoulder', [a, b, o], o.dur ?? 0.6),
    wide: (anchor, o = {}) => d.preset('wide', [anchor, o], o.dur ?? 0),
    orbit: (target, o = {}) => d.preset('orbit', [target, o], o.dur ?? 2),
    crashZoom: (target, o = {}) => d.preset('crashZoom', [target, o], o.dur ?? 0.25),
    dutch: (deg, dur = 0.4) => d.preset('dutch', [deg, dur], dur),
    track: (obj, o = {}) => d.preset('track', [obj, o], o.dur ?? 1),
    shake(amp = 0.3, dur = 0.4) { d.try('cam.shake', () => ctx.cam?.shake?.(amp, dur)); },
    kick(amp = 0.3) { d.try('cam.kick', () => ctx.cam?.kick?.(amp)); },
    slowMo(scale, dur) { return d.bg(Promise.resolve(d.try('cam.slowMo', () => ctx.cam?.slowMo?.(scale, dur)))); },
    letterbox(on, dur = 0.4) { return d.preset('letterbox', [on, dur], dur); },
    fade(op, dur = 0.5, color = '#000') { return d.preset('fade', [op, dur, color], dur); },
    flash(color = '#fff', dur = 0.3) { return d.preset('flash', [color, dur], dur); },
    iris(dir, dur = 0.8, screenPos) { return d.preset('irisHeart', [dir, dur, screenPos], dur); },

    // ---------------------------------------------------------------- UI
    async say(who, text, { expr, emote, mood, cap, voice, charId } = {}) {
      d.check();
      const ch = who && typeof who === 'object' ? who : null;
      const speaker = ch ? d.name(ch) : String(who ?? '');
      if (ch && expr) d.expr(ch, expr);
      if (ch && emote) d.emote(ch, emote);
      text = speakable(text);
      if (!text) { await d.wait(0.8); return; } // a silent beat (e.g. a pure '……')
      const len = [...text].length;
      const r = d.try('ui.say', () => ctx.ui?.say?.(speaker, text, { charId: ch?.id ?? charId, voice: voice || ch?.spec?.voice, mood }));
      await d.settle(r, { cap: cap ?? 3 + len * 0.15, fallback: 1 + len * 0.08 });
    },
    bubble(who, text, dur = 1.6) {
      const target = who && typeof who === 'object' && !who.isVector3 ? who.id : who;
      d.bg(Promise.resolve(d.try('ui.bubble', () => ctx.ui?.bubble?.(target, text, { dur }))));
    },
    async caption(text, style = 'impact', dur = 1.8) {
      const r = d.try('ui.caption', () => ctx.ui?.caption?.(text, { style, dur }));
      await d.settle(r, { cap: dur + 1.5, fallback: dur });
    },
    captionBg(text, style = 'impact', dur = 1.8) { return d.run(() => d.caption(text, style, dur)); },
    async reveal(text, opts = {}) {
      const len = [...String(text)].length;
      const r = d.try('ui.letterReveal', () => ctx.ui?.letterReveal?.(text, opts));
      await d.settle(r, { cap: opts.cap ?? 4 + len * 0.22, fallback: 2 + len * 0.06 });
    },
    closeReveal() { d.try('ui.closeReveal', () => ctx.ui?.closeReveal?.()); },
    hud(show) { d.try('hud.show', () => ctx.ui?.hud?.show?.(show)); },
    objective(text) { d.try('hud.setObjective', () => ctx.ui?.hud?.setObjective?.(text)); },

    // ---------------------------------------------------------------- audio
    music(track, fade = 1) { d.try('audio.music', () => ctx.audio?.music?.(track, { fade })); },
    sfx(name, opts = {}) { d.try('audio.sfx', () => ctx.audio?.sfx?.(name, opts)); },
    loop(name, opts = {}) {
      const h = d.try('audio.loop', () => ctx.audio?.loop?.(name, opts));
      const handle = { stop: (f) => d.try('loop.stop', () => h?.stop?.(f)), set: (o) => d.try('loop.set', () => h?.set?.(o)) };
      shared.loops.push(handle);
      return handle;
    },
    async speak(text, opts = {}) {
      const len = [...String(text)].length;
      const r = d.try('audio.speak', () => ctx.audio?.speak?.(text, opts));
      await d.settle(r, { cap: opts.cap ?? 3 + len * 0.3, fallback: 0 });
    },
    duck(amount = 0.5, dur = 1) { d.try('audio.duck', () => ctx.audio?.duck?.(amount, dur)); },

    // ---------------------------------------------------------------- stage, world, props
    stage(name) {
      const set = d.try(`stage.show(${name})`, () => ctx.stage?.show?.(name));
      return set || { name, anchors: {}, group: null };
    },
    anchor(set, key, fallbackPos = V(), fallbackYaw = 0) {
      const a = d.try('anchor', () => set?.anchors?.[key]);
      if (a && a.pos) return a;
      return { pos: fallbackPos.clone(), yaw: fallbackYaw, look: key.startsWith('cam') ? V(0, 1, 0) : undefined };
    },
    showOnly(chars) { d.try('cast.showOnly', () => ctx.cast?.showOnly?.(chars.filter(Boolean).map((c) => (typeof c === 'string' ? c : c.id)))); },
    get classroom() { return ctx.world?.classroom || null; },
    mood(m) { d.try('setMood', () => ctx.world?.classroom?.setMood?.(m)); },
    board: {
      write: (t) => d.try('blackboard.write', () => ctx.world?.classroom?.blackboard?.write?.(t)),
      append: (t) => d.try('blackboard.append', () => ctx.world?.classroom?.blackboard?.append?.(t)),
      clear: () => d.try('blackboard.clear', () => ctx.world?.classroom?.blackboard?.clear?.()),
      get text() { return ctx.world?.classroom?.blackboard?.text ?? ''; },
    },
    /** Cached prop (one Object3D per key for the whole session, so memory stays flat across rounds). */
    prop(name, key = name) {
      if (!shared.props.has(key)) {
        const obj = d.try(`createProp(${name})`, () => ctx.characters?.createProp?.(name)) || new THREE.Group();
        obj.name = `story:${key}`;
        shared.props.set(key, obj);
      }
      const p = shared.props.get(key);
      p.visible = true;
      return p;
    },
    /** Put a prop loose in the world. */
    putProp(p, pos, { rotY = 0, scale } = {}) {
      if (!p) return p;
      if (p.parent !== ctx.engine.scene) ctx.engine.scene.add(p);
      p.position.copy(pos);
      p.rotation.set(0, rotY, 0);
      if (scale != null) p.scale.setScalar(scale);
      p.visible = true;
      return p;
    },
    hideProp(p) { if (p) { p.visible = false; p.removeFromParent(); } },
    get ball() { return ctx.gameplay?.ball || null; },
    hideBall() { const b = ctx.gameplay?.ball; if (b?.mesh) b.mesh.visible = false; },
    /** Where the ball came to rest (or a sensible fallback). */
    ballPos() {
      const L = round.landing;
      const p = L?.pos;
      if (p && Number.isFinite(p.x)) return V(p.x, p.y, p.z);
      const b = ctx.gameplay?.ball?.pos;
      return b && Number.isFinite(b.x) ? b.clone() : V(PLAYER_EYE.x, 0.05, PLAYER_EYE.z - 1);
    },
    async throwProp(mesh, from, to, { height = 0.6, duration = 0.8 } = {}) {
      if (!mesh) return;
      if (!mesh.parent) ctx.engine.scene.add(mesh);
      mesh.visible = true;
      mesh.position.copy(from);
      let r = d.try('gameplay.scriptedThrow', () => ctx.gameplay?.scriptedThrow?.({ mesh, from: from.clone(), to: to.clone(), height, duration }));
      if (!isThenable(r)) {
        r = T.tween({ duration, onUpdate: (k) => { mesh.position.lerpVectors(from, to, k); mesh.position.y += Math.sin(Math.PI * k) * height; } });
      }
      await d.settle(r, { cap: duration + 1.5, clock: 'game' });
      mesh.position.copy(to);
    },
    /** Tween any value in game time. */
    async tween(duration, onUpdate, ease) {
      await d.settle(T.tween({ duration, ease, onUpdate }), { cap: duration + 1, clock: 'game' });
    },
  };

  function reportError(err) {
    console.error(`[story] ${label}:`, err);
  }
  // Fire-and-forget safety: every async helper's promise gets a no-op handler attached, so an un-awaited
  // call that is cancelled (CANCEL) never becomes an unhandled rejection. Awaiting callers still see it.
  for (const k of Object.keys(d)) {
    const desc = Object.getOwnPropertyDescriptor(d, k);
    if (!desc || !('value' in desc) || typeof desc.value !== 'function') continue;
    const f = desc.value;
    d[k] = function wrapped(...args) {
      const r = f.apply(d, args);
      if (isThenable(r)) r.then(undefined, (err) => { if (err !== CANCEL) warnOnce(`${label}.${k} rejected`, err); });
      return r;
    };
  }
  return d;
}
