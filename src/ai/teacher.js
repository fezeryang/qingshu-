// 王老师 — the teacher AI: state machine, view cone, suspicion, hearing, board writing, lectures.
//
// States (CONTRACTS §4.4): idle, writing, warning, watching, fakeout, drinking, patrol, suspicious, alert, cutscene.
// The AI only drives the teacher while enabled AND the flow phase is 'aim' or 'flight'.
// Locomotion and turning are done here (root.position / root.rotation.y) so they can be cancelled
// instantly when a round resets or a cutscene takes over; clips/gaze/emotes go through the Character API.
import * as THREE from 'three';
import { PLAYER_EYE, TEACHER_SPOTS, PLATFORM, BLACKBOARD } from '../core/layout.js';
import { clamp, lerp, smoothstep, yawTo, deg } from '../core/util.js';
import * as L from './lines.js';

export const TEACHER_STATES = ['idle', 'writing', 'warning', 'watching', 'fakeout', 'drinking', 'patrol', 'suspicious', 'alert', 'cutscene'];

export const TUNE = {
  dur: {
    writing: [3, 7], warning: [0.5, 0.9], watching: [2.5, 5], fakeout: [0.9, 1.3], drinking: [2, 2.4],
    suspicious: [3, 4.5], opening: [1.8, 2.6], sudden: [0.3, 0.45], heard: [0.45, 0.65], afterFakeout: [1.5, 3.5],
  },
  /** multipliers reached at the very end of the period (difficulty curve: shorter writing, longer watching) */
  late: { writing: 0.62, watching: 1.4 },
  pFakeout: 0.2, pPatrol: 0.1, pDrink: 0.12,
  turnSpeed: 7, walkSpeed: 1.1, patrolSpeed: 0.85,
  cone: { full: deg(38), half: deg(55), vfull: deg(55), vhalf: deg(80) },
  dist: { near: 7, far: 12, farFactor: 0.72 },
  /** suspicion per second: exposure(1) × visibility × charge; ball in view × ball; decays when unseen / studying */
  rate: { charge: 0.55, ball: 1.5, decay: 0.15, study: 0.5, suspiciousMul: 1.25, alertMul: 2 },
  suspiciousAt: 0.6,
  hearSpeed: 2,
  boardMaxLines: 5,
  chalkCps: [4.5, 7],
  /** emit a `suspicion` event only when the value moved by this much (keeps the bus log readable) */
  emitStep: 0.05,
};

/** How open the teacher's eyes are per state (0 = cannot see at all). */
const EYES = { idle: 1, writing: 0, warning: 0, watching: 1, fakeout: 1, drinking: 0.25, patrol: 1, suspicious: 1, alert: 1, cutscene: 1 };
const LOUD = new Set(['head', 'desk', 'teacherDesk', 'podium', 'book', 'windowGlass', 'windowFrame', 'blackboard', 'trashRim', 'door', 'chair']);

const LANE_Z = TEACHER_SPOTS.board[0].z + 0.05;         // walkway behind the teacher's desk
const MOUTH_Z = PLATFORM.maxZ + 0.3;                     // aisle mouth, just below the platform
const CLASS_CENTER = new THREE.Vector3(0, 1, -0.7);
const PLAYER_V = new THREE.Vector3(PLAYER_EYE.x, PLAYER_EYE.y, PLAYER_EYE.z);
const wrap = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function createTeacher(ctx, hooks) {
  const { bus, time } = ctx;
  const T = {
    state: 'idle', enabled: true, forced: null,
    timer: Infinity, stateTime: 0, opts: {}, sub: {},
    desiredYaw: Math.PI,
    nav: { path: [], speed: TUNE.walkSpeed, onDone: null, walking: false },
    gazeT: 0, sayT: 0, sayBusyUntil: 0, lastLine: '',
    lastEmitted: -1, caughtEmitted: false, seeingBall: false, lookingBall: false,
    rng: ctx.rng.fork('teacher'), rngG: ctx.rng.fork('teacherGaze'), rngL: ctx.rng.fork('teacherLines'),
    board: { lesson: null, queue: [], line: null, idx: 0, charT: 0, pause: 0, eggs: 0, usedEggs: new Set(), lessonOrder: [] },
    props: { chalk: null, thermos: null },
    timeline: [],
  };
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

  const ch = () => ctx.cast?.teacher ?? null;
  const phase = () => ctx.flow?.phase;
  const driving = () => T.enabled && (phase() === 'aim' || phase() === 'flight') && !!ch();
  const progress = () => { const r = ctx.round; return r && r.duration > 0 ? clamp(1 - r.timeLeft / r.duration, 0, 1) : 0; };
  const call = (fn) => { try { const p = fn(); if (p && typeof p.catch === 'function') p.catch(() => {}); return p; } catch (e) { console.warn('[ai] teacher call failed', e); return undefined; } };
  const play = (clip, o) => call(() => ch()?.play?.(clip, o));
  const loop = (clip) => play(clip, { loop: true });
  const expr = (name) => call(() => ch()?.setExpression?.(name));
  const emote = (kind, dur) => call(() => ch()?.emote?.(kind, dur));
  const look = (target, w) => call(() => ch()?.lookAt?.(target, w));
  const pickLine = (arr) => { let s = T.rngL.pick(arr); if (s === T.lastLine && arr.length > 1) s = T.rngL.pick(arr); T.lastLine = s; return s; };

  function durOf(key) {
    const [a, b] = TUNE.dur[key];
    let d = T.rng.range(a, b);
    if (key === 'writing') d *= lerp(1, TUNE.late.writing, progress());
    if (key === 'watching') d *= lerp(1, TUNE.late.watching, progress());
    return d;
  }

  // ───────────────────────── speech ─────────────────────────
  function say(text, opts = {}) {
    if (!text) return Promise.resolve();
    const dur = opts.dur ?? clamp(1.2 + text.length * 0.12, 1.6, 3.2);
    T.sayBusyUntil = time.now + dur;
    const id = ch()?.id ?? 'teacher';
    const p = call(() => ctx.ui?.bubble?.(id, text, { dur }));
    return Promise.resolve(p).catch(() => {});
  }
  const canSpeak = () => time.now >= T.sayBusyUntil;

  // ───────────────────────── vision ─────────────────────────
  /** 0..1: how well the teacher can see `pos` right now (eyes × cone × distance × occlusion). */
  function visibility(pos, { occlusion = true } = {}) {
    const c = ch();
    if (!c || !pos) return 0;
    const eyes = EYES[T.state] ?? 0;
    if (eyes <= 0) return 0;
    const head = c.headWorld ? c.headWorld(tmpA) : tmpA.copy(c.root.position).setY(1.75);
    const dx = pos.x - head.x, dy = pos.y - head.y, dz = pos.z - head.z;
    const horiz = Math.hypot(dx, dz);
    const dist = Math.hypot(horiz, dy);
    if (dist < 0.05) return eyes;
    const yaw = c.root.rotation.y;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const ang = horiz < 1e-4 ? 0 : Math.acos(clamp((fx * dx + fz * dz) / horiz, -1, 1));
    const cone = 1 - smoothstep(TUNE.cone.full, TUNE.cone.half, ang);
    if (cone <= 0) return 0;
    const vang = Math.abs(Math.atan2(dy, Math.max(horiz, 1e-4)));
    const vcone = 1 - smoothstep(TUNE.cone.vfull, TUNE.cone.vhalf, vang);
    const df = dist <= TUNE.dist.near ? 1 : lerp(1, TUNE.dist.farFactor, clamp((dist - TUNE.dist.near) / (TUNE.dist.far - TUNE.dist.near), 0, 1));
    const occ = occlusion ? occlusionFactor(head, pos) : 1;
    return clamp(eyes * cone * vcone * df * occ, 0, 1);
  }

  /** Classmates' heads between the teacher and the target hide it partially (never fully). */
  function occlusionFactor(from, to) {
    let f = 1;
    const studs = ctx.cast?.students?.() ?? [];
    tmpB.subVectors(to, from);
    const len2 = tmpB.lengthSq();
    if (len2 < 1e-6) return 1;
    for (const s of studs) {
      if (!s.root?.visible || !s.headWorld) continue;
      s.headWorld(tmpC);
      if (tmpC.distanceToSquared(to) < 0.4 * 0.4) continue;            // the target's own head
      const t = ((tmpC.x - from.x) * tmpB.x + (tmpC.y - from.y) * tmpB.y + (tmpC.z - from.z) * tmpB.z) / len2;
      if (t <= 0.05 || t >= 0.97) continue;
      const px = from.x + tmpB.x * t - tmpC.x, py = from.y + tmpB.y * t - tmpC.y, pz = from.z + tmpB.z * t - tmpC.z;
      if (px * px + py * py + pz * pz < 0.16 * 0.16) f *= 0.55;
    }
    return Math.max(0.3, f);
  }

  function playerPoint(charging) {
    // a raised throwing arm pokes above the heads in front: no occlusion, aim point higher
    return charging ? tmpC.set(PLAYER_EYE.x + 0.15, PLAYER_EYE.y + 0.3, PLAYER_EYE.z - 0.1).clone() : PLAYER_V.clone();
  }
  function playerVisibility() {
    const charging = !!ctx.gameplay?.aim?.charging;
    return visibility(playerPoint(charging), { occlusion: !charging });
  }

  // ───────────────────────── locomotion ─────────────────────────
  function floorY(x, z) {
    if (x < PLATFORM.minX - 0.05 || x > PLATFORM.maxX + 0.05) return 0;
    return PLATFORM.h * (1 - smoothstep(PLATFORM.maxZ - 0.1, PLATFORM.maxZ + 0.12, z));
  }
  const onPlatform = (p) => p.z < PLATFORM.maxZ - 0.05;
  /** Waypoints from the current position to `to`, via the lane behind the desk and the aisle mouths. */
  function route(to) {
    const c = ch();
    const from = c.root.position;
    const pts = [];
    if (!onPlatform(from) && !onPlatform(to) && Math.abs(from.x - to.x) < 0.1) return [V(to.x, 0, to.z)];   // same aisle
    if (!onPlatform(from)) {
      pts.push(V(from.x, 0, MOUTH_Z), V(from.x, 0, LANE_Z));
    } else if (Math.abs(from.z - LANE_Z) > 0.08 && (Math.abs(from.x - to.x) > 0.1 || !onPlatform(to))) {
      pts.push(V(from.x, 0, LANE_Z));
    }
    if (!onPlatform(to)) {
      pts.push(V(to.x, 0, LANE_Z), V(to.x, 0, MOUTH_Z), V(to.x, 0, to.z));
    } else {
      if (Math.abs(to.z - LANE_Z) > 0.08 && pts.length) pts.push(V(to.x, 0, LANE_Z));
      pts.push(V(to.x, 0, to.z));
    }
    // drop zero-length legs
    const out = [];
    let prev = from;
    for (const p of pts) { if (Math.hypot(p.x - prev.x, p.z - prev.z) > 0.04) { out.push(p); prev = p; } }
    return out;
  }
  function walk(points, { speed = TUNE.walkSpeed, onDone = null } = {}) {
    T.nav.path = points;
    T.nav.speed = speed;
    T.nav.onDone = onDone;
    if (!points.length) { T.nav.walking = false; onDone?.(); return; }
    if (!T.nav.walking) { T.nav.walking = true; play('walk', { loop: true, speed: speed / 1.1 }); }
  }
  function stopWalking() { T.nav.path = []; T.nav.onDone = null; T.nav.walking = false; }
  function updateNav(dt) {
    const c = ch();
    const p = c.root.position;
    if (T.nav.path.length) {
      let step = T.nav.speed * dt;
      while (step > 0 && T.nav.path.length) {
        const tgt = T.nav.path[0];
        const dx = tgt.x - p.x, dz = tgt.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-4) T.desiredYaw = Math.atan2(-dx, -dz);
        if (d <= step) {
          p.x = tgt.x; p.z = tgt.z; step -= d; T.nav.path.shift();
        } else { p.x += (dx / d) * step; p.z += (dz / d) * step; step = 0; }
      }
      if (!T.nav.path.length) {
        T.nav.walking = false;
        const cb = T.nav.onDone; T.nav.onDone = null;
        cb?.();
      }
    }
    p.y = floorY(p.x, p.z);
  }
  function updateTurn(dt) {
    const r = ch().root.rotation;
    const d = wrap(T.desiredYaw - r.y);
    const m = TUNE.turnSpeed * dt;
    r.y = wrap(r.y + clamp(d, -m, m));
  }
  function snapYaw(y) { T.desiredYaw = y; const c = ch(); if (c) c.root.rotation.y = wrap(y); }
  function teleport(spot) {
    const c = ch(); if (!c) return;
    stopWalking();
    c.root.position.set(spot.x, floorY(spot.x, spot.z), spot.z);
  }
  const classYaw = (bias) => {
    const p = ch().root.position;
    const tgt = bias ? tmpB.copy(CLASS_CENTER).lerp(bias, 0.25) : CLASS_CENTER;
    return yawTo(p, tgt);
  };

  // ───────────────────────── blackboard ─────────────────────────
  const bb = () => ctx.world?.classroom?.blackboard ?? null;
  function boardReset() {
    const b = T.board;
    b.lessonOrder = T.rngL.shuffle(L.LESSONS);
    b.lesson = null; b.queue = []; b.line = null; b.idx = 0; b.charT = 0; b.pause = 0; b.eggs = 0; b.usedEggs = new Set();
  }
  function nextBoardLine() {
    const b = T.board;
    if (!b.queue.length) {
      b.lesson = b.lessonOrder.shift() ?? T.rngL.pick(L.LESSONS);
      if (!b.lessonOrder.length) b.lessonOrder = T.rngL.shuffle(L.LESSONS);
      b.queue = [b.lesson.title, ...b.lesson.lines];
      return b.queue.shift();
    }
    if (b.eggs < 2 && T.rngL.chance(0.12)) {
      const eggs = L.BOARD_EGGS.filter((e) => !b.usedEggs.has(e));
      if (eggs.length) { const e = T.rngL.pick(eggs); b.usedEggs.add(e); b.eggs++; return e; }
    }
    return b.queue.shift();
  }
  const boardLineCount = () => { const t = bb()?.text ?? ''; return t ? t.split('\n').length : 0; };
  /** Spot index for the line being written: the first lines on the left, later lines toward the middle. */
  const writeSpot = () => TEACHER_SPOTS.board[boardLineCount() <= 3 ? 0 : 1];
  function boardTick(dt) {
    const board = bb(), b = T.board;
    if (!board) return;
    if (b.pause > 0) { b.pause -= dt; return; }
    if (!b.line) {
      if (boardLineCount() >= TUNE.boardMaxLines) {           // board full: wipe it
        call(() => board.clear?.());
        b.pause = 0.9;
        return;
      }
      b.line = nextBoardLine();
      b.idx = 0;
      if ((board.text ?? '').length) call(() => board.append?.('\n'));
      const spot = writeSpot();
      const p = ch().root.position;
      if (Math.hypot(spot.x - p.x, spot.z - p.z) > 0.3) {       // sidestep to keep writing in front of the text
        walk(route(spot), { onDone: () => { if (T.state === 'writing') { T.desiredYaw = 0; loop('teacherWrite'); } } });
      }
      return;
    }
    if (T.nav.walking) return;
    b.charT -= dt;
    let guard = 8;
    while (b.charT <= 0 && b.line && guard--) {
      const c = b.line[b.idx++];
      call(() => board.append?.(c));
      b.charT += c === ' ' ? 0.05 : 1 / T.rngL.range(...TUNE.chalkCps);
      if (b.idx >= b.line.length) { b.line = null; b.pause = T.rngL.range(0.35, 0.7); }
    }
  }

  // ───────────────────────── gaze ─────────────────────────
  function studentHead(c) { return c?.headWorld ? c.headWorld(new THREE.Vector3()) : null; }
  function pickClassGaze() {
    const s = ctx.round?.suspicion ?? 0;
    if (T.rngG.chance(0.12 + s * 0.6)) return PLAYER_V.clone();
    const studs = (ctx.cast?.students?.() ?? []).filter((c) => c.root.visible);
    const c = studs.length ? T.rngG.pick(studs) : null;
    return studentHead(c) ?? CLASS_CENTER.clone();
  }
  function nearbyGaze() {
    const p = ch().root.position;
    const studs = (ctx.cast?.students?.() ?? []).filter((c) => c.root.visible && Math.hypot(c.root.position.x - p.x, c.root.position.z - p.z) < 2.6);
    if (!studs.length) return pickClassGaze();
    return studentHead(T.rngG.pick(studs));
  }

  // ───────────────────────── states ─────────────────────────
  const H = {
    idle: {
      enter() { stopWalking(); loop('idle'); expr('neutral'); look(null); T.desiredYaw = classYaw(); },
      next: () => 'writing',
    },

    writing: {
      enter(o) {
        expr('neutral');
        holdChalk();
        T.timer = o.dur ?? durOf('writing');
        T.sub.mutterAt = T.rng.chance(0.25) ? T.rng.range(1, 2.5) : Infinity;
        const spot = writeSpot();
        const atBoard = () => { if (T.state !== 'writing') return; T.desiredYaw = 0; loop('teacherWrite'); look(V(spot.x + 0.4, BLACKBOARD.y + 0.2, BLACKBOARD.z), 0.8); };
        if (o.snap) { teleport(spot); snapYaw(0); atBoard(); return; }
        const pts = route(spot);
        if (pts.length) walk(pts, { onDone: atBoard }); else { stopWalking(); atBoard(); }
      },
      update(dt) {
        if (!T.nav.walking) { T.desiredYaw = 0; boardTick(dt); }
        if (T.stateTime > T.sub.mutterAt && canSpeak()) { T.sub.mutterAt = Infinity; say(pickLine(L.WRITING_MUTTER)); }
      },
      next: () => (T.rng.chance(TUNE.pFakeout) ? 'fakeout' : 'warning'),
    },

    warning: {
      enter(o) {
        stopWalking();
        loop('idle');
        T.timer = o.dur ?? durOf('warning');
        const side = T.rng.chance(0.5) ? 1 : -1;
        T.sub.side = side;
        if (o.snap) { const p = ch().root.position; if (onPlatform(p) === false) teleport(TEACHER_SPOTS.board[1]); snapYaw(side * 0.3); }
        T.desiredYaw = side * 0.3;                                          // torso starts to turn: visible tell
        const p = ch().root.position;
        look(V(p.x + side * 1.4, 1.5, p.z + 2.5), 0.7);                      // head peeks over the shoulder
        const variant = o.heard ? 'heard' : T.rng.pick(['tilt', 'hmm', 'glasses']);
        T.sub.variant = variant;
        if (variant === 'glasses') play('teacherAdjustGlasses');
        emote('?', Math.max(0.6, T.timer));
        if (variant === 'heard') say(pickLine(L.HEARD_TELL), { dur: 1.2 });
        else if (variant === 'hmm' || T.rng.chance(0.4)) say(pickLine(L.WARNING_TELL) || '嗯？', { dur: 1 });
      },
      update() { T.desiredYaw = T.sub.side * 0.3; },
      next() {
        if ((ctx.round?.suspicion ?? 0) > TUNE.suspiciousAt) return 'suspicious';
        if (T.opts.heard || T.opts.sudden) return 'watching';
        const r = T.rng.next();
        if (r < TUNE.pPatrol * lerp(1, 1.6, progress())) return 'patrol';
        if (r < TUNE.pPatrol * 1.6 + TUNE.pDrink) return 'drinking';
        return 'watching';
      },
      nextOpts: () => (T.opts.heard ? { focus: T.opts.heardPos } : {}),
    },

    watching: {
      enter(o) {
        stopWalking();
        holdChalk();
        play('teacherTurn');
        loop('teacherLecture');
        expr('neutral');
        T.timer = o.dur ?? durOf(o.opening ? 'opening' : 'watching');
        T.sub.gaze = o.focus ? o.focus.clone() : pickClassGaze();
        T.gazeT = o.focus ? 1.2 : T.rngG.range(0.8, 1.6);
        look(T.sub.gaze, 1);
        T.desiredYaw = classYaw(T.sub.gaze);
        if (o.snap) snapYaw(T.desiredYaw);
        T.sayT = o.opening ? 0.2 : T.rngL.range(0.4, 1.4);
        T.sub.opening = !!o.opening;
        T.sub.callTried = false;
        hooks.onWatching?.(o);
      },
      update(dt) {
        T.gazeT -= dt;
        if (T.gazeT <= 0 && !T.lookingBall) {
          T.sub.gaze = pickClassGaze();
          T.gazeT = T.rngG.range(0.8, 1.8);
          look(T.sub.gaze, 1);
        }
        T.desiredYaw = classYaw(T.sub.gaze);
        T.sayT -= dt;
        if (T.sayT <= 0 && canSpeak()) {
          say(pickLine(T.sub.opening ? L.OPENING : L.LECTURE));
          T.sub.opening = false;
          T.sayT = T.rngL.range(2.6, 4.2);
        }
        if (!T.sub.callTried && T.stateTime > 1 && T.timer > 3 && canSpeak()) {
          T.sub.callTried = true;
          if (T.rngL.chance(0.22)) hooks.callOn?.();
        }
        escalate();
      },
      next() {
        const r = T.rng.next();
        if (r < TUNE.pPatrol * lerp(1, 1.6, progress())) return 'patrol';
        if (r < TUNE.pPatrol * 1.6 + TUNE.pDrink * 0.8) return 'drinking';
        return 'writing';
      },
    },

    fakeout: {
      enter(o) {
        stopWalking();
        T.timer = o.dur ?? durOf('fakeout');
        T.sub.total = T.timer;
        T.sub.side = T.rng.chance(0.5) ? 1 : -1;
        const half = T.sub.side * deg(T.rng.range(70, 85));
        T.sub.half = half;
        T.desiredYaw = half;
        if (o.snap) { const p = ch().root.position; if (!onPlatform(p)) teleport(TEACHER_SPOTS.board[1]); snapYaw(half); }
        loop('idle');
        const p = ch().root.position;
        look(V(p.x + T.sub.side * 2, 1.4, p.z + 1.5), 0.8);
        if (T.rng.chance(0.5)) say(pickLine(L.FAKEOUT_TELL) || '嗯……', { dur: 1 });
      },
      update() {
        // hold the half turn, then go back to the board (a forced fakeout holds forever)
        T.desiredYaw = !T.forced && T.timer < 0.4 ? 0 : T.sub.half;
      },
      next: () => 'writing',
      nextOpts: () => ({ dur: durOf('afterFakeout') }),
    },

    drinking: {
      enter(o) {
        stopWalking();
        T.timer = o.dur ?? durOf('drinking');
        T.desiredYaw = classYaw();
        if (o.snap) snapYaw(T.desiredYaw);
        holdProp('thermos');
        loop('teacherDrink');
        expr('happy');
        look(null);
        if (T.rng.chance(0.5)) say(pickLine(L.DRINK_TELL) || '（吸溜——）', { dur: 1.4 });
      },
      update() { T.desiredYaw = classYaw(); escalate(); },
      exit() { holdChalk(); expr('neutral'); },
      next: () => (T.rng.chance(0.5) ? 'watching' : 'writing'),
      nextOpts: (n) => (n === 'watching' ? { dur: T.rng.range(1.5, 3) } : {}),
    },

    patrol: {
      enter(o) {
        T.timer = Infinity;
        holdChalk();
        expr('neutral');
        const ax = T.rng.pick(TEACHER_SPOTS.patrolAisles);
        const zEnd = T.rng.pick([0, 0.8, 1.4]);
        T.sub.ax = ax;
        T.sub.leg = 'out';
        T.gazeT = 0.6;
        if (T.rng.chance(0.6)) say(pickLine(L.PATROL_LINES));
        const out = () => walk(route(V(ax, 0, zEnd)), { speed: TUNE.patrolSpeed, onDone: pause });
        const pause = () => {
          if (T.state !== 'patrol') return;
          T.sub.leg = 'pause';
          loop('idle');
          T.desiredYaw = Math.PI;                                       // look over the back rows
          T.sub.pauseUntil = T.stateTime + T.rng.range(0.8, 1.4);
        };
        T.sub.back = () => {
          T.sub.leg = 'back';
          walk(route(TEACHER_SPOTS.board[T.rng.int(0, 1)]), { speed: TUNE.patrolSpeed, onDone: () => {
            if (T.state !== 'patrol') return;
            if (T.forced) { T.sub.leg = 'out'; out(); return; }          // a forced patrol loops
            go(T.rng.chance(0.55) ? 'writing' : 'watching', T.rng.chance(0.55) ? {} : { dur: T.rng.range(1.5, 2.5) });
          } });
        };
        if (o.snap) snapYaw(classYaw());
        out();
      },
      update(dt) {
        if (T.sub.leg === 'pause' && T.stateTime >= T.sub.pauseUntil) T.sub.back();
        T.gazeT -= dt;
        if (T.gazeT <= 0 && !T.lookingBall) { T.gazeT = T.rngG.range(0.7, 1.3); look(nearbyGaze(), 1); }
        escalate();
      },
      next: () => 'watching',
    },

    suspicious: {
      enter(o) {
        T.timer = o.dur ?? durOf('suspicious');
        T.sub.stage = 0;
        holdChalk();
        expr('suspicious');
        emote('?', 1.5);
        play('teacherAdjustGlasses');
        look(PLAYER_V, 1);
        T.desiredYaw = yawTo(ch().root.position, PLAYER_V);
        if (o.snap) snapYaw(T.desiredYaw);
        say(pickLine(L.SUSPICIOUS_LINES));
        approach(V(TEACHER_SPOTS.patrolAisles[0], 0, MOUTH_Z + 0.25));
      },
      update() {
        look(PLAYER_V, 1);
        if (!T.nav.walking) T.desiredYaw = yawTo(ch().root.position, PLAYER_V);
        const s = ctx.round?.suspicion ?? 0;
        if (T.sub.stage === 1 && s > 0.8) {                               // getting closer…
          T.sub.stage = 2;
          T.timer = Math.max(T.timer, 2);
          approach(V(TEACHER_SPOTS.patrolAisles[0], 0, -2.55));
          if (canSpeak()) say(pickLine(L.SUSPICIOUS_LINES));
        }
        if (!T.forced && T.timer <= 0 && s >= TUNE.suspiciousAt) T.timer = 1;   // keep staring while still suspicious
      },
      exit() { expr('neutral'); },
      next() {
        if ((ctx.round?.suspicion ?? 0) >= TUNE.suspiciousAt) return 'watching';
        if (canSpeak()) say(pickLine(L.SUSPICIOUS_CLEAR));
        return 'writing';
      },
    },

    alert: {
      enter(o) {
        T.timer = Infinity;
        stopWalking();
        expr('angry');
        emote('!', 2);
        play('teacherPointAt');
        const ball = o.ball && ctx.gameplay?.ball;
        const tgt = ball?.mesh ?? (ball?.pos ? ball.pos : PLAYER_V);
        look(tgt, 1);
        T.desiredYaw = yawTo(ch().root.position, o.ball && ball?.pos ? ball.pos : PLAYER_V);
        if (o.snap) snapYaw(T.desiredYaw);
        say(pickLine(o.ball ? L.ALERT_BALL : L.ALERT_AIM), { dur: 2.4 });
      },
      update() {
        const ball = T.opts.ball && ctx.gameplay?.ball;
        T.desiredYaw = yawTo(ch().root.position, ball?.pos ?? PLAYER_V);
      },
      next: () => 'alert',
    },

    cutscene: { enter() { stopWalking(); }, next: () => 'cutscene' },
  };

  function approach(dest) {
    T.sub.stage = (T.sub.stage ?? 0) + 1;
    const p = ch().root.position;
    if (!onPlatform(p) && p.z >= dest.z - 0.05) { stopWalking(); loop('idle'); return; }   // already this close: just stare
    walk(route(dest), { speed: 0.9, onDone: () => { if (T.state === 'suspicious') { loop('idle'); T.desiredYaw = yawTo(ch().root.position, PLAYER_V); } } });
  }

  /** Natural escalation to `suspicious` while facing the class. */
  function escalate() {
    if (T.forced || T.state === 'suspicious' || T.state === 'alert') return;
    if ((ctx.round?.suspicion ?? 0) > TUNE.suspiciousAt) go('suspicious');
  }

  function holdProp(name) {
    const c = ch(); if (!c?.hold) return;
    if (!T.props[name]) T.props[name] = call(() => ctx.characters?.createProp?.(name)) ?? null;
    if (T.props[name]) call(() => c.hold(T.props[name], 'R'));
  }
  const holdChalk = () => { if (T.sub.heldChalk && T.state !== 'drinking') return; holdProp('chalk'); };

  // ───────────────────────── transitions ─────────────────────────
  function go(state, opts = {}) {
    if (!ch()) { T.state = state; return; }
    const prev = T.state;
    const prevOpts = T.opts;
    try { H[prev]?.exit?.(prevOpts); } catch (e) { console.warn('[ai] teacher exit', e); }
    T.state = state;
    T.opts = opts;
    T.sub = {};
    T.stateTime = 0;
    T.timer = Infinity;
    T.lookingBall = false;
    try { H[state]?.enter?.(opts); } catch (e) { console.warn('[ai] teacher enter', state, e); }
    if (state !== prev) {
      T.timeline.push({ t: +time.now.toFixed(3), state, prev, forced: !!opts.forced, dur: Number.isFinite(T.timer) ? +T.timer.toFixed(2) : null });
      if (T.timeline.length > 300) T.timeline.shift();
      bus.emit('teacher:state', { state, prev });
    }
  }
  function advanceState() {
    const h = H[T.state];
    const n = h?.next ? h.next() : 'writing';
    const o = h?.nextOpts ? h.nextOpts(n) : {};
    go(n, o || {});
  }

  // ───────────────────────── suspicion ─────────────────────────
  function writeSuspicion(v, force = false) {
    const r = ctx.round;
    if (!r) return;
    v = clamp(v, 0, 1);
    r.suspicion = v;
    if (force || Math.abs(v - T.lastEmitted) >= TUNE.emitStep || ((v === 0 || v === 1) && v !== T.lastEmitted)) {
      T.lastEmitted = v;
      bus.emit('suspicion', { value: v });
    }
  }
  function updateSuspicion(dt) {
    const r = ctx.round;
    if (!r || T.caughtEmitted && phase() === 'aim') return;
    const ph = phase();
    let s = r.suspicion ?? 0;
    const mul = T.state === 'suspicious' ? TUNE.rate.suspiciousMul : T.state === 'alert' ? TUNE.rate.alertMul : 1;
    T.seeingBall = false;
    if (ph === 'aim') {
      const aim = ctx.gameplay?.aim;
      const exp = hooks.playerExposure();
      if (aim?.studying) s -= TUNE.rate.study * dt;
      else if (exp > 0) {
        const v = playerVisibility();
        s += v > 0.02 ? exp * v * TUNE.rate.charge * mul * dt : -TUNE.rate.decay * dt;
      } else s -= TUNE.rate.decay * dt;
    } else if (ph === 'flight') {
      const b = ctx.gameplay?.ball;
      if (b?.state === 'flying' && b.pos) {
        const v = visibility(b.pos, { occlusion: false });
        if (v > 0.02) {
          T.seeingBall = true;
          const near = b.pos.distanceTo(ch().root.position) < 3 ? 1.4 : 1;
          s += TUNE.rate.ball * v * near * dt;
        }
      }
    }
    writeSuspicion(s);
    s = r.suspicion;
    if (ph === 'aim' && s >= 1 && !T.caughtEmitted) {
      T.caughtEmitted = true;
      r.caughtDuring = 'aim';
      if (!T.forced) go('alert', {});
      hooks.onCaught?.('aim');
      bus.emit('teacher:caught', { reason: 'aim' });
    } else if (ph === 'flight' && s >= 1 && !r.teacherSawBall) {
      r.teacherSawBall = true;
      r.caughtDuring = 'flight';
      T.caughtEmitted = true;
      if (!T.forced) go('alert', { ball: true });
      hooks.onCaught?.('ball');
      bus.emit('teacher:caught', { reason: 'ball' });
    }
  }

  /** Teacher's eyes follow the ball while it is visible (great for the PiP). */
  function trackBall() {
    const b = ctx.gameplay?.ball;
    if (phase() !== 'flight' || b?.state !== 'flying') { if (T.lookingBall) { T.lookingBall = false; T.gazeT = 0; } return; }
    if (T.seeingBall && !T.lookingBall && (EYES[T.state] ?? 0) >= 0.5) {
      T.lookingBall = true;
      look(b.mesh ?? b.pos, 1);
      if (T.state !== 'alert') expr('shock');
    }
  }

  // ───────────────────────── main update ─────────────────────────
  function update(dt) {
    if (!driving()) return;
    if (T.state === 'idle' || T.state === 'cutscene') { if (!T.forced) go('watching', { opening: true }); }
    T.stateTime += dt;
    if (T.forced && time.now >= T.forced.until) { T.forced = null; advanceState(); }
    const h = H[T.state];
    try { h?.update?.(dt); } catch (e) { console.warn('[ai] teacher update', T.state, e); }
    if (!T.forced) {
      T.timer -= dt;
      if (T.timer <= 0) advanceState();
    }
    updateNav(dt);
    updateTurn(dt);
    updateSuspicion(dt);
    trackBall();
  }

  // ───────────────────────── round lifecycle ─────────────────────────
  function resetRound() {
    T.rng = ctx.rng.fork('teacher');
    T.rngG = ctx.rng.fork('teacherGaze');
    T.rngL = ctx.rng.fork('teacherLines');
    T.forced = null;
    T.enabled = true;
    T.caughtEmitted = false;
    T.lastEmitted = -1;
    T.sayBusyUntil = 0;
    T.timeline = [];
    stopWalking();
    boardReset();
    const c = ch();
    T.desiredYaw = c ? c.root.rotation.y : Math.PI;
    T.sub = {};
    T.opts = {};
    const prev = T.state;
    T.state = 'idle';
    T.timeline.push({ t: +time.now.toFixed(3), state: 'idle', prev, forced: false, dur: null });
    if (prev !== 'idle') bus.emit('teacher:state', { state: 'idle', prev });
    if (ctx.round) { ctx.round.suspicion = 0; writeSuspicion(0, true); }
    if (c) { holdProp('chalk'); call(() => c.lookAt?.(null)); }
  }
  /** Leaving aim/flight: stop moving so a cutscene inherits a calm teacher. */
  function settle() {
    if (T.nav.walking) { stopWalking(); loop('idle'); }
    T.lookingBall = false;
  }

  // ───────────────────────── public API ─────────────────────────
  const api = {
    get character() { return ch(); },
    get state() { return T.state; },
    get facingClass() {
      const c = ch();
      if (!c || (EYES[T.state] ?? 0) < 0.5 || T.state === 'cutscene') return false;
      return -Math.cos(c.root.rotation.y) > 0.35;       // forward z component toward the class (+Z)
    },
    get suspicion() { return ctx.round?.suspicion ?? 0; },
    get enabled() { return T.enabled; },
    get forced() { return T.forced ? { state: T.forced.state, remaining: Math.max(0, T.forced.until - time.now) } : null; },
    get timeLeft() { return T.timer; },
    get timeline() { return T.timeline; },
    canSee(pos) { return visibility(pos) > 0.25; },
    visibility,
    playerVisibility,
    force(state, dur = 999) {
      if (!TEACHER_STATES.includes(state)) { console.warn(`[ai] unknown teacher state "${state}"`); return; }
      T.forced = { state, until: time.now + Math.max(0, dur) };
      if (state === 'cutscene') { stopWalking(); go('cutscene', { forced: true }); return; }
      go(state, { forced: true, snap: true });
    },
    setSuspicion(v) { if (ctx.round) { if (v < 1) T.caughtEmitted = false; writeSuspicion(+v || 0, true); } },
    addSuspicion(dv) { if (ctx.round) writeSuspicion((ctx.round.suspicion ?? 0) + dv); },
    setEnabled(on) {
      on = !!on;
      if (on === T.enabled) return;
      T.enabled = on;
      if (!on) { T.forced = null; settle(); stopWalking(); go('cutscene', {}); }
      else if (T.state === 'cutscene') go('idle', {});
    },
    say,
    /** Hearing: a loud noise while writing makes the teacher turn early. Returns true if it reacted. */
    hear(pos) {
      if (!driving() || T.forced || T.state !== 'writing') return false;
      go('warning', { heard: true, heardPos: pos?.clone?.() ?? null, dur: T.rng.range(...TUNE.dur.heard) });
      return true;
    },
    /** In-flight accident: the teacher turns around early. `explicit` (tests/trigger) overrides a forced state. */
    turnEarly({ explicit = false } = {}) {
      if (!ch() || !T.enabled) return false;
      if (T.forced && !explicit) return false;
      if (explicit) T.forced = null;
      if (['watching', 'suspicious', 'alert', 'patrol', 'idle'].includes(T.state) && api.facingClass) return false;
      go('warning', { sudden: true, dur: T.rng.range(...TUNE.dur.sudden) });
      return true;
    },
    /** Make the teacher look at someone for a moment (used by call-on / scolding). */
    lookAtChar(c, dur = 2) {
      if (!c) return;
      const p = studentHead(c);
      if (!p) return;
      look(c.parts?.head ?? p, 1);
      T.gazeT = dur;
      if (T.state === 'watching') T.sub.gaze = p;
    },
    canSpeak,
    debug() {
      const c = ch();
      return {
        state: T.state, timer: Number.isFinite(T.timer) ? +T.timer.toFixed(2) : null, forced: api.forced, enabled: T.enabled,
        facingClass: api.facingClass, yaw: c ? +c.root.rotation.y.toFixed(3) : null, pos: c ? c.root.position.toArray().map((v) => +v.toFixed(2)) : null,
        playerVis: +playerVisibility().toFixed(3), walking: T.nav.walking, board: bb()?.text ?? null,
      };
    },
    // internal (used by index.js)
    _update: update,
    _resetRound: resetRound,
    _settle: settle,
    _go: go,
    _driving: driving,
    _hearLoud: (tag, speed) => LOUD.has(tag) && speed > TUNE.hearSpeed,
    _T: T,
  };
  return api;
}
