// Classmates: trait-driven ambient fidgeting, reactions to the ball, in-flight accidents, P1 mini-scenes.
//
// Ambient is active when the ambient flag is on AND the phase is aim/flight (or the story explicitly
// re-enabled it during a cutscene). Every async behaviour carries a generation token so a round reset,
// setAmbient(false) or the ending phase cancels it cleanly.
import * as THREE from 'three';
import { SEAT_BY_ID, PLAYER_EYE, ROOM, BLACKBOARD } from '../core/layout.js';
import * as L from './lines.js';
import { speakable } from './teacher.js';

const PLAYER_V = new THREE.Vector3(PLAYER_EYE.x, PLAYER_EYE.y, PLAYER_EYE.z);
const MISCHIEF_TEACHER = new Set(['writing', 'drinking']);
/** chance that a student notices the turn tell (warning) and straightens up before the teacher faces the class */
const ALERTNESS = { gossip: 0.9, foodie: 0.75, gamer: 0.5, clown: 0.65, sleeper: 0.08, artsy: 0.3, chuuni: 0.55, normal: 0.7, jock: 0.6, shy: 0.8, nerd: 1, monitor: 1, disciplinarian: 1 };
/** chance to stay oblivious even after the teacher faces the class (scolding material) */
const OBLIVIOUS = { sleeper: 0.65, gamer: 0.25, artsy: 0.2, foodie: 0.12 };
export const INCIDENT_KINDS = ['stretch', 'raiseHand', 'standUp', 'sneeze', 'catch', 'witness', 'gust', 'teacherTurn'];
const NATURAL_RATE = 0.3;       // share of throws that meet an accident
const CATCH_REFLEX = 0.35;      // jock reflex when the ball passes within reach

export function createStudents(ctx, teacher) {
  const { bus, time } = ctx;
  const S = new Map();
  let ambientFlag = true, sticky = false, cutsceneEnable = false;
  let gen = 0;
  let rngA = ctx.rng.fork('ambient'), rngI = ctx.rng.fork('incidents'), rngT = ctx.rng.fork('trigger');
  const flight = { active: false, t: 0, plan: null, catchArm: null, lookDelay: new Map(), launchPos: null };
  const scene = { noteAt: 0, callAt: 0, murmur: null, murmurT: 0, murmurVol: -1 };
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  const phase = () => ctx.flow?.phase;
  const active = () => ambientFlag && (phase() === 'aim' || phase() === 'flight' || cutsceneEnable);
  const ball = () => ctx.gameplay?.ball ?? null;
  const flying = () => ball()?.state === 'flying';
  const call = (fn) => { try { const p = fn(); if (p && typeof p.catch === 'function') p.catch(() => {}); return p; } catch (e) { console.warn('[ai] student call failed', e); return undefined; } };
  const bubble = (st, text, dur, voiced = false) => {
    if (!text) return;
    const v = voiced && phase() !== 'flight' && speakable(text);   // only call-on answers are voiced
    return call(() => ctx.ui?.bubble?.(st.id, text, v ? { dur: dur ?? 1.8, voiced: true } : { dur: dur ?? 1.8 }));
  };
  const fill = (s, st) => s.replace('{name}', st?.ch?.spec?.name ?? '同学').replace('{pron}', st?.ch?.spec?.gender === 'f' ? '她' : '他');

  // ───────────────────────── roster ─────────────────────────
  function rebuild() {
    S.clear();
    for (const ch of ctx.cast?.students?.() ?? []) {
      const seatId = ctx.cast.seatOf(ch.id);
      const seat = seatId && SEAT_BY_ID[seatId];
      if (!seat) continue;
      S.set(ch.id, {
        id: ch.id, ch, seat, trait: ch.spec?.trait || 'normal',
        mode: 'behave', act: null, nextAt: 0, switchAt: Infinity, switchTo: null,
        busyUntil: 0, token: 0, touched: false, emoteAt: 0, lookingBall: false, standing: false,
      });
    }
  }
  const list = () => [...S.values()];
  const byId = (id) => S.get(id) ?? null;
  const deskmateOf = (st) => { const id = ctx.cast.occupant(st.seat.deskmate); return id ? byId(id) : null; };
  const behindOf = (st) => { const id = ctx.cast.occupant(`r${st.seat.row + 1}c${st.seat.col}`); return id ? byId(id) : null; };
  const headOf = (st, out = new THREE.Vector3()) => (st.ch.headWorld ? st.ch.headWorld(out) : out.set(st.seat.x, 1.08, st.seat.chairZ));
  const busy = (st) => time.now < st.busyUntil;

  // ───────────────────────── character helpers ─────────────────────────
  const play = (st, clip, o) => { st.touched = true; return call(() => st.ch.play?.(clip, o)); };
  const loop = (st, clip) => play(st, clip, { loop: true });
  const look = (st, target, w = 1) => { st.touched = true; call(() => st.ch.lookAt?.(target, w)); };
  const expr = (st, e) => { st.touched = true; call(() => st.ch.setExpression?.(e)); };
  const emote = (st, kind, dur) => { st.touched = true; st.emoteAt = time.now; return call(() => st.ch.emote?.(kind, dur)); };
  const teacherHead = () => ctx.cast?.teacher?.parts?.head ?? null;
  const pt = (x, y, z) => new THREE.Vector3(x, y, z);

  /** one-shot overlay, resolves when done (or after maxDur); false if cancelled meanwhile */
  async function oneShot(st, clip, maxDur = 3, o) {
    const tok = st.token, g = gen;
    await Promise.race([Promise.resolve(play(st, clip, o)).catch(() => {}), time.wait(maxDur)]);
    return tok === st.token && g === gen;
  }
  const stillValid = (st, tok, g) => st.token === tok && g === gen;

  function restore(st) {
    st.token++;
    st.act = null;
    st.busyUntil = 0;
    st.lookingBall = false;
    if (!st.touched) return;
    call(() => st.ch.stop?.());
    if (st.ch.posture === 'stand') call(() => st.ch.setPosture?.('sit'));
    st.standing = false;
    call(() => st.ch.play?.('sitIdle', { loop: true }));
    call(() => st.ch.lookAt?.(null));
    call(() => st.ch.setExpression?.('neutral'));
    call(() => st.ch.hold?.(null, 'R'));
    call(() => st.ch.hold?.(null, 'L'));
    st.touched = false;
  }
  function restoreAll() { for (const st of S.values()) restore(st); }

  // ───────────────────────── activities ─────────────────────────
  const ACTS = {
    attentive(st) { loop(st, 'sitIdle'); look(st, teacherHead() ?? pt(0, 1.7, -5.5), 0.8); expr(st, 'neutral'); },
    notes(st) { loop(st, 'write'); look(st, null); expr(st, 'neutral'); },
    sleep(st) { loop(st, 'sleep'); look(st, null); expr(st, 'sleepy'); },
    drowsy(st) { loop(st, 'sitIdle'); look(st, teacherHead(), 0.5); expr(st, 'sleepy'); },
    eat(st) { loop(st, 'eat'); look(st, null); expr(st, 'happy'); },
    phone(st) { loop(st, 'phone'); look(st, null); expr(st, 'smile'); },
    chat(st) {
      const mate = deskmateOf(st);
      const right = st.seat.col % 2 === 0;          // left member of the pair chats to the right
      loop(st, right ? 'chatRight' : 'chatLeft');
      look(st, mate?.ch?.parts?.head ?? pt(st.seat.x + (right ? 0.64 : -0.64), 1.08, st.seat.chairZ), 1);
      expr(st, 'happy');
    },
    daydream(st) { loop(st, 'sitIdle'); look(st, pt(ROOM.minX, 1.8, st.seat.chairZ - 1.2), 0.9); expr(st, 'smile'); },
    faces(st) {
      loop(st, 'sitIdle');
      const b = behindOf(st);
      look(st, b?.ch?.parts?.head ?? PLAYER_V, 1);
      expr(st, st.ch.spec?.trait === 'clown' ? 'smug' : 'happy');
      oneShot(st, 'turnBack', 3);
    },
    glare(st) { loop(st, 'sitIdle'); expr(st, 'angry'); oneShot(st, 'turnBack', 3); emote(st, 'anger', 1.2); },
    chuuni(st) { loop(st, 'sitIdle'); expr(st, 'smug'); oneShot(st, 'facepalm', 3); },
    shy(st) {
      loop(st, 'sitIdle');
      const others = list().filter((o) => o !== st);
      const o = others.length ? rngA.pick(others) : null;
      look(st, o?.ch?.parts?.head ?? PLAYER_V, 0.7);
      expr(st, 'blush');
    },
  };
  const MISCHIEF = {
    sleeper: [['sleep', 6], ['drowsy', 1]],
    foodie: [['eat', 5], ['daydream', 1]],
    gamer: [['phone', 6], ['chat', 1]],
    gossip: [['chat', 6], ['faces', 1]],
    nerd: [['notes', 6]],
    clown: [['faces', 4], ['chat', 2]],
    artsy: [['daydream', 5], ['notes', 1]],
    monitor: [['notes', 4], ['attentive', 3]],
    disciplinarian: [['attentive', 4], ['glare', 1], ['notes', 2]],
    chuuni: [['chuuni', 3], ['daydream', 2]],
    shy: [['shy', 3], ['notes', 3]],
    jock: [['daydream', 2], ['chat', 2], ['attentive', 1]],
    normal: [['notes', 3], ['attentive', 2], ['chat', 2], ['daydream', 2], ['phone', 0.5], ['sleep', 0.4]],
  };
  const pickWeighted = (rng, items) => {
    const tot = items.reduce((a, [, w]) => a + w, 0);
    let r = rng.next() * tot;
    for (const [k, w] of items) { r -= w; if (r <= 0) return k; }
    return items[items.length - 1][0];
  };
  function chooseAct(st) {
    if (st.mode === 'behave') {
      if (st.trait === 'nerd' || st.trait === 'monitor') return 'notes';
      if (st.act === 'sleep' && st.oblivious) return 'sleep';
      return rngA.chance(0.55) ? 'attentive' : 'notes';
    }
    return pickWeighted(rngA, MISCHIEF[st.trait] ?? MISCHIEF.normal);
  }
  function setAct(st, name) {
    st.act = name;
    try { ACTS[name]?.(st); } catch (e) { console.warn('[ai] act', name, e); }
    st.nextAt = time.now + rngA.range(st.mode === 'behave' ? 3 : 4, st.mode === 'behave' ? 7 : 10);
  }

  /** Short fidgets layered over the current activity (aim phase only). */
  function fidget(st) {
    const r = rngA.next();
    if (st.trait === 'nerd' && r < 0.35) { oneShot(st, 'raiseHand', 3); emitEvent('raiseHand', st); return; }
    if (st.trait === 'sleeper' && st.act === 'sleep') { emote(st, 'zzz', 2.4); return; }
    if (st.trait === 'artsy' && r < 0.4) { emote(st, rngA.chance(0.5) ? 'music' : 'sparkle', 1.8); return; }
    if (st.trait === 'chuuni' && r < 0.3) { bubble(st, rngA.pick(L.STUDENT.chuuni)); return; }
    if (st.trait === 'gossip' && r < 0.25) { bubble(st, rngA.pick(L.STUDENT.gossip), 1.4); return; }
    if (st.trait === 'clown' && r < 0.3) { oneShot(st, 'laugh', 3); return; }
    if (r < 0.3) { oneShot(st, 'yawn', 3); emitEvent('yawn', st); return; }
    if (r < 0.42 && st.mode === 'mischief') { oneShot(st, 'stretch', 3); emitEvent('stretch', st); return; }
    if (r < 0.5) oneShot(st, 'nod', 2);
  }

  // ───────────────────────── reacting to the teacher ─────────────────────────
  function onTeacherState(state) {
    if (!active()) return;
    const now = time.now;
    for (const st of S.values()) {
      if (busy(st)) continue;
      if (MISCHIEF_TEACHER.has(state)) {
        st.oblivious = false;
        if (st.mode !== 'mischief') { st.switchTo = 'mischief'; st.switchAt = now + rngA.range(0.6, 3.2); }
      } else if (state === 'warning' || state === 'fakeout') {
        if (st.mode === 'mischief' && rngA.chance(ALERTNESS[st.trait] ?? 0.6)) { st.switchTo = 'behave'; st.switchAt = now + rngA.range(0.08, 0.4); }
      } else if (state === 'idle' || state === 'cutscene') {
        // nothing
      } else {
        if (st.mode === 'mischief' && st.switchTo !== 'behave') {
          st.oblivious = rngA.chance(OBLIVIOUS[st.trait] ?? 0);
          if (!st.oblivious) { st.switchTo = 'behave'; st.switchAt = now + rngA.range(0.12, 0.9); }
        } else if (st.switchTo === 'mischief') { st.switchTo = null; st.switchAt = Infinity; }
      }
    }
    if (state === 'suspicious') {
      // neighbours sense the tension and glance at the player
      for (const st of S.values()) if (Math.hypot(st.seat.x - PLAYER_EYE.x, st.seat.chairZ - PLAYER_EYE.z) < 2.4 && !busy(st)) look(st, PLAYER_V, 0.8);
    }
    if (state === 'alert') {
      for (const st of S.values()) { look(st, PLAYER_V, 1); if (rngA.chance(0.4)) emote(st, '!', 1.2); }
    }
  }

  /** Teacher just turned to the class: maybe scold someone still slacking (P1). */
  function onWatching() {
    if (!active() || flying() || !teacher.canSpeak()) return;
    const slackers = list().filter((st) => st.mode === 'mischief' && st.oblivious && !busy(st));
    if (!slackers.length || !rngA.chance(0.55)) return;
    const st = rngA.pick(slackers);
    const key = L.SCOLD[st.trait] ? st.trait : 'default';
    const g = gen, tok = ++st.token;
    st.busyUntil = time.now + 3;
    teacher.lookAtChar(st.ch, 2.2);
    teacher.say(fill(rngA.pick(L.SCOLD[key]), st), { dur: 2, voiced: true });
    (async () => {
      await time.wait(0.7);
      if (!stillValid(st, tok, g)) return;
      emote(st, '!', 1);
      expr(st, 'shock');
      await oneShot(st, 'gasp', 2);
      if (!stillValid(st, tok, g)) return;
      bubble(st, L.SCOLD_REPLY[key], 1.5);
      st.mode = 'behave'; st.oblivious = false; st.switchTo = null; st.switchAt = Infinity;
      setAct(st, 'attentive');
      expr(st, 'sweat');
    })();
  }

  /** Teacher calls on a student to answer (P1). Returns true if it started. */
  function callOn(id) {
    if (!id && (!active() || flying())) return false;
    const pool = list().filter((st) => !busy(st) && !st.standing);
    const st = id ? byId(id) : pool.length ? rngA.pick(pool) : null;
    if (!st) return false;
    const g = gen, tok = ++st.token;
    st.busyUntil = time.now + 16;
    teacher.lookAtChar(st.ch, 4);
    const question = teacher.say(fill(rngA.pick(L.CALL_ON), st), { dur: 1.8, voiced: true, hold: 12 });
    const good = st.trait === 'nerd' || st.trait === 'monitor' || rngA.chance(0.3);
    emitEvent('calledOn', st);
    (async () => {
      if (st.act === 'sleep') { emote(st, '!', 0.8); expr(st, 'shock'); }
      await time.wait(0.6);
      if (!stillValid(st, tok, g)) return;
      look(st, teacherHead(), 1);
      await oneShot(st, 'standUp', 1.6);
      if (!stillValid(st, tok, g)) return;
      if (st.ch.posture !== 'stand') call(() => st.ch.setPosture?.('stand'));
      st.standing = true;
      expr(st, good ? 'determined' : 'sweat');
      await question;
      if (!stillValid(st, tok, g)) return;
      await bubble(st, rngA.pick(good ? L.ANSWER_GOOD : L.ANSWER_BAD), 1.8, true);
      if (!stillValid(st, tok, g)) return;
      await teacher.say(fill(rngA.pick(good ? L.REPLY_GOOD : L.REPLY_BAD), st), { dur: 1.6, voiced: true });
      if (!stillValid(st, tok, g)) return;
      await oneShot(st, 'sitDown', 1.6);
      if (!stillValid(st, tok, g)) return;
      if (st.ch.posture !== 'sit') call(() => st.ch.setPosture?.('sit'));
      st.standing = false;
      expr(st, good ? 'smug' : 'embarrassed');
      st.busyUntil = 0;
      setAct(st, 'attentive');
    })();
    return true;
  }

  /** Deskmates pass a note while the teacher writes (P1). */
  let noteProp = null;
  function passNote() {
    const pairs = list().filter((st) => (st.trait === 'gossip' || st.trait === 'clown' || st.trait === 'normal') && deskmateOf(st) && !busy(st) && !busy(deskmateOf(st)));
    if (!pairs.length) return false;
    const a = rngA.pick(pairs), b = deskmateOf(a);
    if (!noteProp) noteProp = call(() => ctx.characters?.createProp?.('replyNote')) ?? null;
    if (!noteProp || !a.ch.handWorld || !b.ch.handWorld) return false;
    const g = gen, ta = ++a.token, tb = ++b.token;
    a.busyUntil = b.busyUntil = time.now + 5;
    emitEvent('passNote', a);
    (async () => {
      const handA = a.seat.col % 2 === 0 ? 'R' : 'L', handB = handA === 'R' ? 'L' : 'R';
      look(a, b.ch.parts?.head, 1); look(b, a.ch.parts?.head, 1);
      call(() => a.ch.hold?.(noteProp, handA));
      expr(a, 'smug');
      await time.wait(0.8);
      if (!stillValid(a, ta, g) || !stillValid(b, tb, g)) { noteProp.removeFromParent(); return; }
      const from = a.ch.handWorld(handA, new THREE.Vector3());
      call(() => a.ch.hold?.(null, handA));
      ctx.engine.scene.add(noteProp);
      noteProp.visible = true;
      await time.tween({ duration: 0.55, onUpdate: (k) => {
        const to = b.ch.handWorld(handB, tmp2);
        noteProp.position.lerpVectors(from, to, k);
        noteProp.position.y += Math.sin(Math.PI * k) * 0.08;
        noteProp.rotation.y = k * 3;
      } });
      if (!stillValid(b, tb, g)) { noteProp.removeFromParent(); return; }
      call(() => b.ch.hold?.(noteProp, handB));
      expr(b, 'happy');
      if (rngA.chance(0.5)) bubble(b, rngA.pick(L.STUDENT.note), 1.4);
      await time.wait(1.8);
      call(() => b.ch.hold?.(null, handB));
      noteProp.removeFromParent();
      if (stillValid(a, ta, g)) { a.busyUntil = 0; setAct(a, chooseAct(a)); }
      if (stillValid(b, tb, g)) { b.busyUntil = 0; setAct(b, chooseAct(b)); }
    })();
    return true;
  }

  // ───────────────────────── events / incidents ─────────────────────────
  function emitEvent(kind, st) { bus.emit('student:event', { kind, id: st?.id ?? null }); }
  function emitIncident(kind, action, st, pos, natural) {
    const p = pos ? pos.clone() : st ? headOf(st) : null;
    const rec = { kind, action, id: st?.id ?? null, pos: p, t: +time.now.toFixed(3), flightT: flight.active ? +flight.t.toFixed(3) : null, natural: !!natural };
    ctx.round?.incidents?.push(rec);
    bus.emit('incident', { kind, action, id: rec.id, pos: p, natural: !!natural });
  }

  /** Common shell for a body accident: busy, token, restore afterwards. */
  function bodyAccident(st, holdFor, run) {
    const g = gen, tok = ++st.token;
    st.busyUntil = time.now + holdFor;
    (async () => {
      await run(tok, g);
      if (!stillValid(st, tok, g)) return;
      st.busyUntil = 0;
      if (active() && !flight.active) setAct(st, chooseAct(st));
    })().catch((e) => console.warn('[ai] accident', e));
  }

  const ACC = {
    stretch(st, natural) {
      emitEvent('stretch', st);
      emitIncident('block', 'stretch', st, null, natural);
      expr(st, 'sleepy');
      bubble(st, rngT.pick(L.STUDENT.stretch), 1.4);
      bodyAccident(st, 2.6, async () => { await oneShot(st, 'stretch', 2.9); });
      return true;
    },
    raiseHand(st, natural) {
      emitEvent('raiseHand', st);
      emitIncident('block', 'raiseHand', st, null, natural);
      expr(st, 'determined');
      bubble(st, rngT.pick(L.STUDENT.raiseHand), 1.4);
      bodyAccident(st, 2.4, async () => { await oneShot(st, 'raiseHand', 2.7); });
      return true;
    },
    standUp(st, natural) {
      emitEvent('standUp', st);
      emitIncident('block', 'standUp', st, null, natural);
      bubble(st, rngT.pick(L.STUDENT.standUp), 1.6);
      bodyAccident(st, 3.6, async (tok, g) => {
        await oneShot(st, 'standUp', 1.4);
        if (!stillValid(st, tok, g)) return;
        if (st.ch.posture !== 'stand') call(() => st.ch.setPosture?.('stand'));
        st.standing = true;
        await time.wait(1.6);
        if (!stillValid(st, tok, g)) return;
        await oneShot(st, 'sitDown', 1.4);
        if (st.ch.posture !== 'sit') call(() => st.ch.setPosture?.('sit'));
        st.standing = false;
      });
      return true;
    },
    sneeze(st, natural) {
      emitEvent('sneeze', st);
      emitIncident('block', 'sneeze', st, null, natural);
      bodyAccident(st, 2, async (tok, g) => {
        await time.wait(0.5);
        if (stillValid(st, tok, g)) bubble(st, rngT.pick(L.STUDENT.sneeze), 1.2);
        await time.wait(0.4);
        if (stillValid(st, tok, g)) emote(st, 'sweat', 1);
      });
      play(st, 'sneeze');
      return true;
    },
    witness(st, natural, explicit) {
      emitEvent('witness', st);
      emitIncident('witness', 'witness', st, null, natural);
      react('witness', st.id, explicit);
      if (teacher.facingClass) teacher.addSuspicion(0.2);
      return true;
    },
    catch(st, natural, explicit) {
      emitEvent('catch', st);
      const b = ball();
      if (!flying()) {
        bodyAccident(st, 1.6, async () => { await oneShot(st, 'catch', 1.6); });
        expr(st, 'determined');
        emitIncident('catch', 'catch', st, null, natural);
        return true;
      }
      // arm a reflex catch: hands go up when the ball comes close, intercept within reach
      flight.catchArm = { st, reach: explicit ? 0.75 : 0.5, raised: false, natural, explicit };
      if (explicit) {
        flight.catchArm.raised = true;
        play(st, 'catch');
        look(st, b.mesh ?? b.pos, 1);
        st.busyUntil = time.now + 2;
        expr(st, 'determined');
      }
      if (explicit && headOf(st, tmp).distanceTo(b.pos) < 2.2) doCatch(flight.catchArm);
      return true;
    },
    gust(st, natural) {
      const strength = 0.85 + rngT.next() * 0.15;
      call(() => ctx.world?.classroom?.gust?.(strength, 1.5));
      emitIncident('wind', 'gust', null, new THREE.Vector3(ROOM.minX, 1.7, -0.7), natural);
      for (const s of S.values()) if (s.seat.col <= 1 && !busy(s)) { look(s, pt(ROOM.minX, 1.7, s.seat.chairZ - 0.5), 0.8); if (s.trait === 'artsy') emote(s, 'sparkle', 1.5); }
      return true;
    },
    teacherTurn(st, natural, explicit) {
      const ok = teacher.turnEarly({ explicit });
      if (ok) emitIncident('teacherTurn', 'teacherTurn', null, ctx.cast?.teacher?.headWorld?.(new THREE.Vector3()) ?? null, natural);
      return ok;
    },
  };
  ACC.wind = ACC.gust;

  function doCatch(arm) {
    const { st } = arm;
    const b = ball();
    if (!flying()) return;
    if (!arm.raised) { arm.raised = true; play(st, 'catch'); look(st, b.mesh ?? b.pos, 1); }
    flight.catchArm = null;
    emitIncident('catch', 'catch', st, b.pos, arm.natural);
    const ok = call(() => ctx.gameplay?.intercept?.(st.id));
    st.busyUntil = time.now + 3;
    expr(st, 'smug');
    bubble(st, rngT.pick(L.STUDENT.catch), 1.6);
    emote(st, 'sparkle', 1.4);
    return ok;
  }

  /** Extra triggerable student events (not in-flight accidents). */
  const EXTRA = {
    yawn(st) { emitEvent('yawn', st); oneShot(st, 'yawn', 3); return true; },
    turnAround(st) { emitEvent('turnAround', st); oneShot(st, 'turnBack', 3); look(st, PLAYER_V, 1); return true; },
    flinch(st) { react('nearMiss', st.id); return true; },
    hit(st) { react('hit', st.id); return true; },
    passNote() { return passNote(); },
    callOn(st) { return callOn(st?.id); },
  };
  EXTRA.turnBack = EXTRA.turnAround;

  // ───────────────────────── reactions ─────────────────────────
  function react(kind, id, explicit = false) {
    const st = byId(id);
    if (!st) return false;
    const full = active() || explicit;                     // quiet class: faces/gaze only, no body clips
    const b = ball();
    const g = gen, tok = ++st.token;
    st.busyUntil = Math.max(st.busyUntil, time.now + 2);
    switch (kind) {
      case 'nearMiss': case 'flinch': {
        emitEvent('flinch', st);
        expr(st, 'shock');
        emote(st, '!', 1);
        if (b?.mesh) look(st, b.mesh, 1);
        if (full) { play(st, 'gasp'); if (rngT.chance(0.3)) bubble(st, rngT.pick(L.STUDENT.nearMiss), 1.1); }
        break;
      }
      case 'hit': case 'head': {
        emitEvent('hit', st);
        expr(st, 'dizzy');
        emote(st, '?', 1.2);
        if (full) bubble(st, rngT.pick(L.STUDENT.hit), 1.3);
        (async () => {
          await time.wait(0.8);
          if (!stillValid(st, tok, g)) return;
          expr(st, 'angry');
          look(st, PLAYER_V, 1);                 // looking for the culprit
          emote(st, 'anger', 1.4);
          if (full) await oneShot(st, 'turnBack', 3);
        })();
        break;
      }
      case 'witness': {
        expr(st, 'shock');
        emote(st, '!', 1.4);
        if (b?.mesh && flying()) look(st, b.mesh, 1); else look(st, PLAYER_V, 1);
        if (full) { play(st, 'turnBack'); bubble(st, rngT.pick(L.STUDENT.witness), 1.2); }
        break;
      }
      case 'landed': case 'desk': {
        expr(st, 'shock');
        emote(st, '!', 1.2);
        look(st, b?.mesh ?? pt(st.seat.x, 0.8, st.seat.deskZ), 1);
        if (full) play(st, 'gasp');
        break;
      }
      case 'catch': return ACC.catch(st, false, true);
      default:
        emote(st, '!', 1);
        break;
    }
    return true;
  }

  // ───────────────────────── in-flight planning ─────────────────────────
  function predictedPath(pos, vel) {
    let pts = null;
    try { pts = ctx.gameplay?.predict?.({ origin: pos.clone(), vel: vel.clone() }, 3); } catch { pts = null; }
    if (pts && pts.length > 4) return pts.map((p, i) => ({ x: p.x, y: p.y, z: p.z, t: (i + 1) / 60 }));
    // fallback: plain ballistic arc until it drops below desk height
    const out = [];
    for (let i = 1; i <= 180; i++) {
      const t = i / 60;
      const y = pos.y + vel.y * t - 4.9 * t * t;
      out.push({ x: pos.x + vel.x * t, y, z: pos.z + vel.z * t, t });
      if (y < 0.75 && vel.y - 9.8 * t < 0) break;
    }
    return out;
  }
  function planIncident(path) {
    if (!path.length) return null;
    const T = path[path.length - 1].t;
    const cands = [];
    const studs = list();
    // jock reflex catch
    for (const st of studs) {
      if (st.trait !== 'jock') continue;
      let best = Infinity, bt = 0;
      for (const p of path) { const d = Math.hypot(p.x - st.seat.x, p.y - 1.35, p.z - (st.seat.chairZ - 0.25)); if (d < best) { best = d; bt = p.t; } }
      if (best < 0.65 && bt > 0.3) return rngI.chance(CATCH_REFLEX) ? { kind: 'catch', st, at: 0 } : null;
    }
    if (!rngI.chance(NATURAL_RATE)) return null;
    for (const st of studs) {
      let bd = Infinity, bt = 0, hd = Infinity, ht = 0, wd = Infinity, wt = 0;
      for (const p of path) {
        const dxz = Math.hypot(p.x - st.seat.x, p.z - (st.seat.chairZ - 0.05));
        if (p.y > 0.95 && p.y < 2.2 && dxz < bd) { bd = dxz; bt = p.t; }
        const dh = Math.hypot(dxz, p.y - 1.08);
        if (dh < hd) { hd = dh; ht = p.t; }
        if (dxz < wd) { wd = dxz; wt = p.t; }
      }
      if (bd < 0.7 && bt > 0.35) {
        const action = st.trait === 'nerd' || st.trait === 'monitor' ? 'raiseHand' : st.trait === 'sleeper' || st.trait === 'jock' ? 'stretch' : rngI.pick(['stretch', 'raiseHand', 'standUp']);
        cands.push({ kind: action, st, at: Math.max(0.02, bt - 0.45), w: 3 * (1 - bd / 0.7) + 0.5 });
      }
      if (hd < 0.6 && ht > 0.2) cands.push({ kind: 'sneeze', st, at: Math.max(0.02, ht - 0.9), w: 1 });
      if (wd < 2.2 && wt > 0.25 && wt < T - 0.1) cands.push({ kind: 'witness', st, at: wt + 0.05, w: 0.6 });
    }
    if (path.some((p) => p.x < -2.4 && p.t < T * 0.7)) cands.push({ kind: 'gust', st: null, at: 0.1, w: 1.5 });
    if (teacher.state === 'writing' && !teacher.forced && T > 0.7) cands.push({ kind: 'teacherTurn', st: null, at: T * 0.3, w: 1.5 });
    if (!cands.length) return null;
    const tot = cands.reduce((a, c) => a + c.w, 0);
    let r = rngI.next() * tot;
    for (const c of cands) { r -= c.w; if (r <= 0) return c; }
    return cands[cands.length - 1];
  }

  function onLaunched(p) {
    flight.active = true;
    flight.t = 0;
    flight.plan = null;
    flight.catchArm = null;
    flight.lookDelay = new Map();
    for (const st of S.values()) st.lookingBall = false;
    if (!active() || !p?.pos || !p?.vel) return;
    const plan = planIncident(predictedPath(p.pos, p.vel));
    if (!plan) return;
    if (plan.kind === 'catch') flight.catchArm = { st: plan.st, reach: 0.5, raised: false, natural: true };
    else flight.plan = plan;
  }

  function updateFlight(dt) {
    const b = ball();
    if (!flight.active) return;
    if (!flying()) { flight.active = false; flight.catchArm = null; flight.plan = null; return; }
    flight.t = Number.isFinite(b.t) ? b.t : flight.t + dt;
    // scheduled natural accident
    const plan = flight.plan;
    if (plan && flight.t >= plan.at) {
      flight.plan = null;
      if (active() && (!plan.st || !busy(plan.st))) ACC[plan.kind]?.(plan.st, true, false);
    }
    // reflex catch
    const arm = flight.catchArm;
    if (arm && (active() || arm.explicit)) {
      const st = arm.st;
      const hand = st.ch.handWorld ? st.ch.handWorld('R', tmp) : headOf(st, tmp);
      let d = hand.distanceTo(b.pos);
      headOf(st, tmp2).y += 0.3;
      d = Math.min(d, tmp2.distanceTo(b.pos));
      if (!arm.raised && d < 1.4) { arm.raised = true; play(st, 'catch'); look(st, b.mesh ?? b.pos, 1); st.busyUntil = time.now + 2; }
      if (d < arm.reach) doCatch(arm);
    }
    // heads follow the ball (cosmetic delays)
    for (const st of S.values()) {
      if (st.lookingBall) continue;
      const h = headOf(st, tmp);
      const dx = b.pos.x - h.x, dy = b.pos.y - h.y, dz = b.pos.z - h.z;
      const d = Math.hypot(dx, dy, dz);
      const horiz = Math.hypot(dx, dz);
      const ang = horiz > 1e-3 ? Math.acos(Math.max(-1, Math.min(1, -dz / horiz))) : 0;  // forward is -Z
      if (d < 1.0 || (ang < 1.3 && d < 8)) {
        if (!flight.lookDelay.has(st.id)) flight.lookDelay.set(st.id, time.now + 0.05 + Math.random() * 0.3); // cosmetic
        if (time.now >= flight.lookDelay.get(st.id)) {
          st.lookingBall = true;
          look(st, b.mesh ?? b.pos, 1);
          if (d < 1.6 && Math.random() < 0.35) expr(st, 'shock'); // cosmetic
        }
      }
    }
  }

  // ───────────────────────── per-frame ambient ─────────────────────────
  function update(dt) {
    if (flight.active) updateFlight(dt);
    if (!active()) { updateMurmur(dt, 0); return; }
    const now = time.now;
    let mischief = 0;
    for (const st of S.values()) {
      if (st.mode === 'mischief') mischief++;
      if (busy(st)) continue;
      if (now >= st.switchAt && st.switchTo) {
        st.mode = st.switchTo;
        st.switchTo = null;
        st.switchAt = Infinity;
        setAct(st, chooseAct(st));
        continue;
      }
      if (flight.active || phase() !== 'aim') continue;          // no new random fidgets mid-flight
      if (now >= st.nextAt) {
        if (st.act && rngA.chance(0.45)) { fidget(st); st.nextAt = now + rngA.range(2.5, 6); } else setAct(st, chooseAct(st));
      }
      if (st.act === 'sleep' && now - st.emoteAt > 4.5 && rngA.chance(dt * 0.4)) emote(st, 'zzz', 2.2);
    }
    if (phase() === 'aim' && !flight.active && teacher.state === 'writing') {
      if (now >= scene.noteAt) { scene.noteAt = now + rngA.range(14, 26); if (rngA.chance(0.6)) passNote(); }
    }
    updateMurmur(dt, S.size ? mischief / S.size : 0);
  }

  /** Classroom murmur loop: louder while the teacher's back is turned (P1). */
  function updateMurmur(dt, frac) {
    const ph = phase();
    const want = ambientFlag && (ph === 'aim' || ph === 'flight');
    if (!want) { if (scene.murmur) { call(() => scene.murmur.stop?.(0.6)); scene.murmur = null; scene.murmurVol = -1; } return; }
    if (!scene.murmur && ctx.audio?.loop) scene.murmur = call(() => ctx.audio.loop('murmur', { volume: 0.05 })) ?? null;
    scene.murmurT -= dt;
    if (!scene.murmur || scene.murmurT > 0) return;
    scene.murmurT = 0.25;
    let vol = 0.04 + 0.32 * frac;
    if (ph === 'flight') vol *= 0.6;
    if (Math.abs(vol - scene.murmurVol) > 0.02) { scene.murmurVol = vol; call(() => scene.murmur.set?.({ volume: vol })); }
  }

  // ───────────────────────── lifecycle ─────────────────────────
  function resetRound() {
    gen++;
    if (scene.murmur) call(() => scene.murmur.stop?.(0.1));
    scene.murmur = null; scene.murmurVol = -1; scene.murmurT = 0;
    rngA = ctx.rng.fork('ambient'); rngI = ctx.rng.fork('incidents'); rngT = ctx.rng.fork('trigger');
    flight.active = false; flight.plan = null; flight.catchArm = null;
    cutsceneEnable = false;
    if (!sticky) ambientFlag = true;
    noteProp?.removeFromParent();
    rebuild();
    for (const st of S.values()) { st.touched = true; }        // seatAll() reset them; make sure our state matches
    scene.noteAt = time.now + 10;
  }
  function startAim() {
    const now = time.now;
    cutsceneEnable = false;
    for (const st of S.values()) {
      st.mode = 'behave'; st.switchTo = null; st.switchAt = Infinity;
      if (active()) { setAct(st, chooseAct(st)); st.nextAt = now + rngA.range(1, 6); }
    }
  }
  function endScene() {
    gen++;
    if (scene.murmur) call(() => scene.murmur.stop?.(0.1));
    scene.murmur = null; scene.murmurVol = -1;
    flight.active = false; flight.plan = null; flight.catchArm = null;
    noteProp?.removeFromParent();
    restoreAll();
  }

  const api = {
    setAmbient(on) {
      on = !!on;
      const ph = phase();
      const cut = ph === 'intro' || ph === 'ending';
      sticky = !on && !cut;
      if (on && cut) cutsceneEnable = true;
      if (!on) cutsceneEnable = false;
      if (on === ambientFlag) return;
      ambientFlag = on;
      if (!on) { gen++; flight.plan = null; if (!flight.catchArm?.explicit) flight.catchArm = null; restoreAll(); }
      else if (active()) startAim();
    },
    get ambient() { return active(); },
    trigger(kind, id) {
      const fn = ACC[kind] || EXTRA[kind];
      if (!fn) { console.warn(`[ai] unknown student event "${kind}"`); return false; }
      if (kind === 'gust' || kind === 'wind' || kind === 'teacherTurn') return !!fn(null, false, true);
      if (kind === 'passNote') return !!fn();
      const st = id ? byId(id) : pickTarget(kind);
      if (!st) return false;
      if (id && !st) return false;
      if (kind !== 'callOn') { st.token++; st.busyUntil = 0; }
      return !!fn(st, false, true);
    },
    react,
    callOn,
    passNote,
    list: () => list().map((st) => ({ id: st.id, trait: st.trait, seat: st.seat.id, mode: st.mode, act: st.act, busy: busy(st) })),
    // internal
    _flight: flight,
    _update: update,
    _resetRound: resetRound,
    _startAim: startAim,
    _endScene: endScene,
    _onLaunched: onLaunched,
    _onTeacherState: onTeacherState,
    _onWatching: onWatching,
  };

  /** Default target for trigger(kind) without an id. */
  function pickTarget(kind) {
    const studs = list();
    if (!studs.length) return null;
    const b = ball();
    if (kind === 'catch') {
      const jock = studs.filter((s) => s.trait === 'jock');
      if (!flying()) return jock[0] ?? studs[0];
      const ranked = (jock.length ? jock : studs).map((s) => ({ s, d: headOf(s, tmp).distanceTo(b.pos) })).sort((x, y) => x.d - y.d);
      return ranked[0].s;
    }
    if (flying()) {
      // the classmate closest to the ball's path ahead
      const path = predictedPath(b.pos, b.vel);
      let best = null, bd = Infinity;
      for (const s of studs) {
        for (const p of path) {
          const d = Math.hypot(p.x - s.seat.x, p.y - 1.2, p.z - s.seat.chairZ);
          if (d < bd) { bd = d; best = s; }
        }
      }
      return best;
    }
    const pref = { raiseHand: ['nerd', 'monitor'], stretch: ['sleeper', 'jock'], sneeze: [], standUp: ['clown', 'normal'], witness: [] }[kind] || [];
    const matches = studs.filter((s) => pref.includes(s.trait));
    return rngT.pick(matches.length ? matches : studs);
  }

  return api;
}
