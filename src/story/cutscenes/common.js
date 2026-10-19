// Shared beats for ending cutscenes (owner: narrative-director).
import { PLAYER_EYE, PLAYER_SEAT, SEAT_BY_ID, DESK, TEACHER_DESK, AISLES_X } from '../../core/layout.js';
import { V } from '../direct.js';

export const EYE = () => V(PLAYER_EYE.x, PLAYER_EYE.y, PLAYER_EYE.z);
export const PLAYER_DESK_TOP = () => { const s = SEAT_BY_ID[PLAYER_SEAT]; return V(s.x + 0.05, DESK.topY + 0.03, s.deskZ + 0.05); };
export const TEACHER_DESK_TOP = () => V(TEACHER_DESK.x, TEACHER_DESK.topY + 0.03, TEACHER_DESK.z);

/** Every ending starts here: AI off, HUD off, cinema bars on, PiP closed, optional music cue. */
export function begin(d, { music, letterbox = true } = {}) {
  const { ctx } = d;
  d.try('ai.teacher.setEnabled', () => ctx.ai?.teacher?.setEnabled?.(false));
  d.try('ai.students.setAmbient', () => ctx.ai?.students?.setAmbient?.(false));
  d.try('cam.pip', () => ctx.cam?.pip?.(false));
  d.hud(false);
  if (letterbox) d.bg(d.letterbox(true, 0.5));
  if (music !== undefined) d.music(music);
}

/**
 * Put the class back into a clean seated state (ambient clips/props cleared), the teacher at the board.
 * Sleepers keep sleeping through everything — a running gag.
 */
export function settleClass(d, { except = [], teacher = 'board' } = {}) {
  const { ctx } = d;
  const ex = new Set(except.filter(Boolean).map((c) => c.id));
  for (const ch of ctx.cast?.students?.() || []) {
    const seatId = ctx.cast.seatOf?.(ch.id);
    if (!seatId) continue;
    d.try('reset', () => ch.reset?.());
    d.seat(ch, seatId);
    if (ch.spec?.trait === 'sleeper' && !ex.has(ch.id)) { d.anim(ch, 'sleep', { loop: true }); d.expr(ch, 'sleepy'); }
    else d.anim(ch, 'sitIdle', { loop: true });
  }
  const t = d.teacher;
  if (t && teacher) {
    d.try('teacher.reset', () => t.reset?.());
    d.teacherAtBoard(teacher === 'class' ? 'class' : 'board', 1);
    if (teacher === 'board') d.anim(t, 'teacherWrite', { loop: true });
    else d.anim(t, 'idle', { loop: true });
  }
}

/**
 * Camera in front of a character's face (angle in radians off-axis, + = toward their left).
 * Occlusion-aware: tries nearby angles/heights until the line of sight to the face misses every other
 * visible character (head spheres + torso boxes).
 */
export function front(d, ch, { angle = 0.35, dist = 1.45, height = 0.06, fov = 36, dur = 0, ease } = {}) {
  if (!ch) return d.settle(null);
  fov = Math.max(fov, 42); // chibi heads are big: keep shoulders in frame
  const head = d.headPos(ch);
  const base = ch.root.rotation.y + Math.PI;
  const blockers = [];
  for (const o of d.ctx.cast?.all?.() || []) {
    if (o === ch || !o.root?.visible) continue;
    for (const c of d.try('getColliders', () => o.getColliders?.()) || []) blockers.push(c);
  }
  const clear = (pos) => blockers.every((c) => !segHits(pos, head, c));
  let best = null;
  outer: for (const da of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8]) {
    for (const dh of [0, 0.25, -0.12, 0.5]) {
      for (const dk of [1, 0.75]) {
        const yaw = base + angle + da;
        const pos = V(head.x + Math.sin(yaw) * dist * dk, head.y + height + dh, head.z + Math.cos(yaw) * dist * dk);
        if (clear(pos)) { best = pos; break outer; }
      }
    }
  }
  if (!best) best = V(head.x + Math.sin(base + angle) * dist, head.y + height, head.z + Math.cos(base + angle) * dist);
  const look = head.clone().add(V(0, -0.06, 0));
  return dur > 0 ? d.shot({ pos: best, look, fov, dur, ease }) : (d.cut({ pos: best, look, fov }), d.settle(null));
}

/** Does the segment a→b (stopping 0.25 m short of b) touch collider c? */
function segHits(a, b, c) {
  const dir = b.clone().sub(a);
  const len = dir.length() - 0.25;
  if (len <= 0) return false;
  dir.normalize();
  for (let t = 0.1; t < len; t += 0.06) {
    const p = a.clone().addScaledVector(dir, t);
    if (c.kind === 'sphere' && p.distanceTo(c.center) < c.radius + 0.04) return true;
    if (c.kind === 'box' && p.x > c.min.x - 0.03 && p.x < c.max.x + 0.03 && p.y > c.min.y - 0.03 && p.y < c.max.y + 0.03 && p.z > c.min.z - 0.03 && p.z < c.max.z + 0.03) return true;
  }
  return false;
}

/** Camera behind a character's head looking where they face (POV-ish). */
export function behind(d, ch, { angle = 0.25, dist = 0.9, height = 0.25, fov = 45, dur = 0, look } = {}) {
  if (!ch) return d.settle(null);
  const head = d.headPos(ch);
  const yaw = ch.root.rotation.y + angle;
  const pos = V(head.x + Math.sin(yaw) * dist, head.y + height, head.z + Math.cos(yaw) * dist);
  const fwd = V(-Math.sin(ch.root.rotation.y), -0.25, -Math.cos(ch.root.rotation.y));
  const tgt = look || head.clone().addScaledVector(fwd, 2.5);
  return dur > 0 ? d.shot({ pos, look: tgt, fov, dur }) : (d.cut({ pos, look: tgt, fov }), d.settle(null));
}

/** The classmate who got the letter (round.recipientId from resolve(); falls back to the landing / crush). */
export function recipient(d) {
  const L = d.round.landing || {};
  let id = d.round.recipientId;
  if (!id) id = L.ownerId;
  if (!id && L.seatId) id = d.ctx.cast?.occupant?.(L.seatId) || d.round.roster?.seatMap?.[L.seatId];
  const ch = id && id !== 'teacher' ? d.get(id) : null;
  return ch || d.crush || d.students()[0] || null;
}

/** 'desk' | 'bonk' | 'pickup' (default 'desk'). */
export const deliveryOf = (d) => d.round.delivery || 'desk';

/**
 * Stage how the recipient got the letter (GDD §7 recipient rule), ending with them reading it.
 *   desk   — notice it on the desk, pick it up, unfold
 *   bonk   — clutch their head, glare around, spot the ball on the floor, pick it up and peek
 *   pickup — glance at the teacher, slide down off the chair, sneak it up, read it under the desk
 * Multi-shot: a reaction close-up, a low floor shot of the ball (bonk/pickup), a teacher cut-away (pickup).
 */
/** Knee-height shot from the nearest aisle: the ball on the floor in the foreground, `ch` behind it. */
function floorShot(d, ball, ch) {
  const ax = AISLES_X.reduce((a, b) => (Math.abs(b - ball.x) < Math.abs(a - ball.x) ? b : a));
  const pos = d.V(ax, 0.55, ball.z + 0.7);
  const look = ball.clone().lerp(d.headPos(ch), 0.4);
  d.cut({ pos, look, fov: 50 });
}

export async function receive(d, ch, { prop = 'letterOpen' } = {}) {
  if (!ch) return;
  const kind = deliveryOf(d);
  const t = d.teacher;
  const ball = d.ballPos();
  if (kind === 'bonk') {
    d.expr(ch, 'dizzy');
    d.emote(ch, 'anger', 1.4);
    d.anim(ch, 'facepalm');
    d.sfx('thudHead', { volume: 0.6 });
    await front(d, ch, { angle: 0.4, dist: 1.4, fov: 44 });
    await d.say(ch, d.pick(['哎哟！', '痛……', '谁啊？！']), { mood: 'angry' });
    // glare around
    d.expr(ch, 'angry');
    d.look(ch, d.V(ch.root.position.x - 2, 1.2, ch.root.position.z + 1));
    await d.wait(0.5);
    d.look(ch, d.V(ch.root.position.x + 2, 1.2, ch.root.position.z + 1));
    await d.wait(0.5);
    // ...and spot the culprit on the floor
    d.look(ch, ball);
    d.emote(ch, '?', 1.0);
    floorShot(d, ball, ch);
    await d.wait(0.7);
    d.expr(ch, 'suspicious');
    await d.play(ch, 'pickUp', { cap: 1.2 });
  } else if (kind === 'pickup') {
    d.emote(ch, '!', 0.9);
    d.look(ch, ball);
    await front(d, ch, { angle: -0.35, dist: 1.4, fov: 44 });
    await d.wait(0.5);
    // is the teacher looking?
    d.look(ch, t);
    d.expr(ch, 'suspicious');
    if (t) {
      d.cut({ pos: d.headPos(ch).add(d.V(0.15, 0.1, 0.3)), look: d.headPos(t), fov: 34 });
      d.anim(t, 'teacherWrite', { loop: true });
      await d.wait(0.8);
    }
    // sneak it up off the floor
    floorShot(d, ball, ch);
    d.emote(ch, 'sweat', 1.4);
    d.sfx('chairScrape', { volume: 0.3 });
    await d.play(ch, 'pickUp', { cap: 1.3 });
    d.bubble(ch, d.pick(['嘘……', '（偷偷捡起来）', '（这是什么……）']), 1.4);
  } else {
    d.emote(ch, '!', 1.0);
    d.sfx('pop');
    d.look(ch, ball);
    await d.wait(0.5);
    await d.play(ch, 'pickUp', { cap: 1.2 });
  }
  const L = d.round.landing || {};
  if (L.type === 'intercept' && L.ownerId === ch.id) d.bubble(ch, d.pick(['接住了！……诶？', '好球！……这是？']), 1.4);
  d.hideBall();
  d.sfx('paperUnfold');
  d.hold(ch, d.prop('letterBall', 'ballInHand'));
  await d.play(ch, 'unfold', { cap: 1.3 });
  d.hold(ch, d.prop(prop));
  d.anim(ch, 'read', { loop: true });
  d.look(ch, null);
  if (kind === 'pickup') d.expr(ch, 'suspicious');
}

/** A quick reaction cut-away: close-up on someone, optional bubble / emote / clip / expression. */
export async function cutaway(d, ch, { line, emote, expr, clip, hold = 1.1, angle = 0.35, look } = {}) {
  if (!ch) return;
  // never cut to a head-down pose (write/sleep loops show only hair): sit up, look at the action
  if (ch !== d.teacher) d.anim(ch, 'sitIdle', { loop: true });
  d.look(ch, look !== undefined ? look : d.ballPos());
  if (expr) d.expr(ch, expr);
  if (clip) d.anim(ch, clip);
  if (emote) d.emote(ch, emote, hold + 0.3);
  await front(d, ch, { angle, dist: 1.35, fov: 44 });
  if (line) d.bubble(ch, line, hold + 0.5);
  await d.wait(hold);
}

/** Cut-away to the teacher at the board, back turned and oblivious (comic contrast). */
export async function teacherOblivious(d, line, hold = 1.2) {
  const t = d.teacher;
  if (!t) return;
  d.anim(t, 'teacherWrite', { loop: true });
  d.sfx('chalkScratch', { volume: 0.5 });
  const h = d.headPos(t);
  d.cut({ pos: h.clone().add(d.V(1.3, 0.1, 2.0)), look: h.clone().add(d.V(0, -0.2, 0)), fov: 40 });
  if (line) d.bubble(t, line, hold + 0.4);
  await d.wait(hold);
}

/** Whoever got bonked on the way reacts (variant by landing.hits). Non-blocking. */
export function hitPrelude(d, exclude = []) {
  const hits = d.round.landing?.hits || [];
  const ex = new Set(exclude.filter(Boolean).map((c) => c.id));
  const seen = new Set();
  let n = 0;
  for (const h of hits) {
    if (h?.tag !== 'head' || !h.ownerId || ex.has(h.ownerId) || seen.has(h.ownerId)) continue;
    seen.add(h.ownerId);
    const ch = d.get(h.ownerId);
    if (!ch) continue;
    const line = d.pick(['哎哟！', '谁啊？！', '我的头……', '痛痛痛……']);
    d.after(0.2 + n * 0.5, () => { d.emote(ch, 'anger', 1.2); d.expr(ch, 'angry'); d.bubble(ch, line, 1.4); d.anim(ch, 'gasp'); });
    if (++n >= 2) break;
  }
  return n;
}

/** Notice the ball, pick it up, unfold it, start reading. */
export async function pickUpAndRead(d, ch, { prop = 'letterOpen', notice = true } = {}) {
  if (!ch) return;
  const L = d.round.landing || {};
  const caught = L.type === 'intercept' && L.ownerId === ch.id;
  if (notice) {
    d.emote(ch, caught ? 'sparkle' : '!', 1.0);
    d.sfx('pop');
    if (caught) d.bubble(ch, d.pick(['接住了！……诶？', '好球！……嗯？这是？']), 1.4);
    d.look(ch, d.ballPos());
    await d.wait(0.5);
  }
  if (!caught) await d.play(ch, 'pickUp', { cap: 1.2 });
  d.hideBall();
  d.sfx('paperUnfold');
  d.hold(ch, d.prop('letterBall', 'ballInHand'));
  await d.play(ch, 'unfold', { cap: 1.3 });
  d.hold(ch, d.prop(prop));
  d.anim(ch, 'read', { loop: true });
  d.look(ch, null);
}

/** Step a face through expressions while something else plays (e.g. letterReveal). */
export function expressionRamp(d, ch, steps) {
  return d.run(async () => {
    let t0 = 0;
    for (const [at, name, emote] of steps) {
      await d.wait(Math.max(0, at - t0));
      t0 = at;
      d.expr(ch, name);
      if (emote) d.emote(ch, emote, 1.4);
    }
  });
}

/** Hide ending-only extras (NPCs and the player avatar) except the given ones. */
export function hideExtras(d, keep = []) {
  const k = new Set(keep.filter(Boolean).map((c) => c.id));
  for (const ch of d.ctx.cast?.all?.() || []) {
    const role = ch.spec?.role;
    if ((role === 'npc') && !k.has(ch.id)) ch.root.visible = false;
  }
}

/** Return to the classroom set with the class visible (after a scene change). */
export function backToClassroom(d, keep = []) {
  d.stage('classroom');
  d.try('cast.showAll', () => d.ctx.cast?.showAll?.());
  hideExtras(d, keep);
  for (const c of keep) if (c) c.root.visible = true;
}

/** A trait-specific line with a generic fallback pool. */
export function traitLine(d, ch, table, generic) {
  const t = ch?.spec?.trait;
  const v = t && table[t];
  if (Array.isArray(v)) return d.pick(v);
  if (typeof v === 'string') return v;
  return d.pick(generic);
}

/** Nearest seated classmate to `ch` (deskmate first) — for "someone else" roles. */
export function neighbour(d, ch, { exclude = [] } = {}) {
  const ex = new Set([ch?.id, ...exclude.filter(Boolean).map((c) => c.id)]);
  const seatId = d.ctx.cast?.seatOf?.(ch?.id);
  const s = seatId && SEAT_BY_ID[seatId];
  if (s) {
    const mate = d.get(d.ctx.cast.occupant?.(s.deskmate));
    if (mate && !ex.has(mate.id)) return mate;
  }
  const p = ch?.root?.position || V();
  return d.students().filter((c) => !ex.has(c.id)).sort((a, b) => a.root.position.distanceTo(p) - b.root.position.distanceTo(p))[0] || null;
}

/** Wrap text into lines of at most n characters (keeps explicit newlines). */
export function wrap(text, n = 14, maxLines = 4) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    const chars = [...raw];
    for (let i = 0; i < chars.length || i === 0; i += n) { out.push(chars.slice(i, i + n).join('')); if (!chars.length) break; }
  }
  const lines = out.filter((l) => l.trim().length);
  return lines.length > maxLines ? [...lines.slice(0, maxLines - 1), lines[maxLines - 1].slice(0, n - 1) + '…'] : lines;
}

/**
 * BUG-006: the reveal sheet covers the reader while the letter is on screen. Close it and cut to a clean
 * face close-up for the emotional beat (expression + emote), held for `hold` seconds.
 */
export async function reactionCloseUp(d, ch, { expr, emote, hold = 1.4, angle = 0.4, sfx, beat } = {}) {
  d.closeReveal();
  d.hold(ch, null);
  d.stop(ch, 'read');
  if (expr) d.expr(ch, expr);
  await front(d, ch, { angle, dist: 1.25, height: 0.04, fov: 44 });
  if (beat) d.beat(beat);
  if (emote) d.emote(ch, emote, hold + 0.4);
  if (sfx) d.sfx(sfx);
  await d.wait(hold);
}

export async function finalHold(d, sec = 2) {
  d.beat('final');
  await d.wait(sec);
}
