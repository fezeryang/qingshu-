// Node unit tests for the gameplay physics core:  node dev/gameplay/physics.test.mjs
// Uses the reference classroom in refscene.mjs (no browser).
import * as THREE from 'three';
import * as P from '../../src/gameplay/physics.js';
import { classifyLanding } from '../../src/gameplay/landing.js';
import { solveLaunch, fanZones, makeGoal } from '../../src/gameplay/solver.js';
import { staticColliders, characterColliders, fanBlades, FAN_LIST } from './refscene.mjs';
import { SEATS, SEAT_BY_ID, PLAYER_SEAT, BALL_RADIUS, TRASH, WINDOWS, TEACHER_DESK, FANS, ROOM, DESK, AISLES_X, ROWS_Z } from '../../src/core/layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R = BALL_RADIUS;
let pass = 0, fail = 0;
const results = [];
function test(name, fn) {
  try { const info = fn(); pass++; results.push(`  ok   ${name}${info ? ' — ' + info : ''}`); } catch (e) { fail++; results.push(`  FAIL ${name}: ${e.message}`); }
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };

const stat = new P.Grid().setColliders(staticColliders());
const chars = characterColliders({ empty: ['r2c5'] });
const scene = (extra = [], withChars = true) => new P.Scene(stat, new P.Grid()).setDynamic([...(withChars ? chars.colliders : []), ...extra], P.dynamicKeyFn());
const S = scene();
const SN = scene([], false);
const run = (sc, pos, vel, opts = {}) => {
  const r = P.simulate(sc, pos, vel, { env: { near: true }, ...opts });
  return { r, L: classifyLanding(r, chars.lookups) };
};
const inRoomOrOut = (p) => (p.x >= ROOM.minX - 0.02 && p.x <= ROOM.maxX && p.z >= ROOM.minZ && p.z <= ROOM.maxZ && p.y >= 0 && p.y <= ROOM.height) || p.x < ROOM.minX;

// ------------------------------------------------------------------ basic contacts
test('drop onto a desk → rests on that desk', () => {
  const s = SEAT_BY_ID.r2c2;
  const { r, L } = run(SN, V(s.x + 0.1, 1.6, s.deskZ), V(0, 0, 0));
  assert(r.reason === 'rest', `reason ${r.reason}`);
  assert(L.type === 'desk' && L.seatId === 'r2c2', `landing ${L.type}/${L.seatId}`);
  assert(Math.abs(r.pos.y - (DESK.topY + R)) < 0.005, `rest height ${r.pos.y}`);
  return `t=${r.t.toFixed(2)}s bounces=${r.bounces}`;
});
test('rest detection fires ~0.25 s after settling', () => {
  const s = SEAT_BY_ID.r1c3;
  const { r } = run(SN, V(s.x, DESK.topY + R + 0.001, s.deskZ), V(0, 0, 0));
  assert(r.reason === 'rest' && r.t > 0.24 && r.t < 0.3, `t=${r.t}`);
});
test('drop onto the floor in an aisle → floor', () => {
  const { r, L } = run(SN, V(AISLES_X[1], 1.5, 0), V(0, 0, 0));
  assert(L.type === 'floor' && Math.abs(r.pos.y - R) < 0.005, `${L.type} y=${r.pos.y}`);
});
test('bounce: restitution off the floor is low (paper)', () => {
  const b = P.resetBall(P.newBall(), V(AISLES_X[1], 1.0, 0), V(0, 0, 0));
  let peak = 0, bounced = false;
  for (let i = 0; i < 600 && !b.done; i++) { P.stepBall(b, SN); if (b.bounces) { bounced = true; peak = Math.max(peak, b.py); } }
  assert(bounced && peak < 0.2, `rebound peak ${peak}`);
  return `rebound peak ${peak.toFixed(3)} m`;
});
test('throw into the back wall bounces back, never passes', () => {
  const { r } = run(SN, V(0, 1.5, 3.8), V(0, 0.5, 9));
  assert(r.pos.z < ROOM.maxZ - R + 0.001 && r.hits.some((h) => h.tag === 'wall'), `z=${r.pos.z}`);
});
test('closed window glass stops the ball', () => {
  const w = WINDOWS.find((x) => !x.open);
  const { r, L } = run(SN, V(-4.5, w.sillY + 0.6, w.z), V(-9, 0.5, 0));
  assert(L.type !== 'outside' && r.pos.x > ROOM.minX - 0.06, `${L.type} x=${r.pos.x}`);
  assert(r.hits[0].tag === 'windowGlass', `first hit ${r.hits[0]?.tag}`);
});
test('open window → outside trigger', () => {
  const w = WINDOWS.find((x) => x.open);
  const { L } = run(SN, V(-4.3, w.sillY + 0.5, w.z), V(-5, 1.5, 0));
  assert(L.type === 'outside', L.type);
});
test('drop into the trash bin → trash', () => {
  const { L } = run(SN, V(TRASH.x, 1.2, TRASH.z), V(0, 0, 0));
  assert(L.type === 'trash', L.type);
});
test('bin rim deflects a grazing ball', () => {
  const { r } = run(SN, V(TRASH.x + TRASH.r + 0.02, 1.0, TRASH.z), V(0, 0, 0));
  assert(r.hits.some((h) => h.tag === 'trashRim'), 'no rim hit');
});
test('head hit bounces off and is recorded with ownerId', () => {
  const s = SEAT_BY_ID.r2c3;
  const head = V(s.x, 1.08, s.chairZ);
  const { r, L } = run(S, V(s.x, 1.1, s.chairZ + 1.2), V(0, 0.2, -5));
  const h = r.hits[0];
  assert(h && h.tag === 'head' && h.ownerId === 's_r2c3', `first hit ${h?.tag}/${h?.ownerId}`);
  assert(h.speed > 3, `speed ${h.speed}`);
  return `then ${L.type}`;
});
test('teacher hit → landing type teacher', () => {
  const { L } = run(S, V(0, 1.75, -4.0), V(0, 0.4, -6));
  assert(L.type === 'teacher' && L.ownerId === 'teacher', `${L.type}/${L.ownerId}`);
});
test('ball resting on the platform → podium', () => {
  const { L } = run(SN, V(2.5, 1.0, -5.2), V(0, 0, 0));
  assert(L.type === 'podium', L.type);
});
test('teacher desk top → podium', () => {
  const { L } = run(SN, V(TEACHER_DESK.x + 0.3, 1.6, TEACHER_DESK.z), V(0, 0, 0));
  assert(L.type === 'podium', L.type);
});
test('own desk → self', () => {
  const s = SEAT_BY_ID[PLAYER_SEAT];
  const { L } = run(SN, V(s.x, 1.3, s.deskZ), V(0, 0, 0));
  assert(L.type === 'self' && L.seatId === PLAYER_SEAT, L.type);
});
test('chair → chair with occupant as owner', () => {
  const s = SEAT_BY_ID.r2c5; // empty seat in this scene
  const { L } = run(S, V(s.x, 1.2, s.chairZ - 0.05), V(0, 0, 0));
  assert(L.type === 'chair' && L.seatId === 'r2c5' && L.ownerId === null, `${L.type}/${L.seatId}/${L.ownerId}`);
});
test('book pile on a desk counts as that desk', () => {
  const s = SEATS.find((x) => (x.row + x.col) % 3 === 0 && x.id !== PLAYER_SEAT);
  const { r, L } = run(SN, V(s.x - DESK.w / 2 + 0.11, 1.3, s.deskZ), V(0, 0, 0));
  assert(L.type === 'desk' && L.seatId === s.id && L.support.tag === 'book', `${L.type}/${L.seatId}/${L.support?.tag}`);
  return `rest y=${r.pos.y.toFixed(3)}`;
});
test('desk corner: no NaN, ends on desk or floor', () => {
  const s = SEAT_BY_ID.r1c1;
  const { r, L } = run(SN, V(s.x + DESK.w / 2 + 0.01, 1.2, s.deskZ + DESK.d / 2 + 0.01), V(0, 0, 0));
  assert(Number.isFinite(r.pos.x + r.pos.y + r.pos.z) && r.nanFix === 0, 'NaN');
  assert(['desk', 'floor', 'chair'].includes(L.type), L.type);
  return `${L.type}`;
});
test('fan blade → fan (shredded)', () => {
  const f = FANS[0];
  const sc = scene(fanBlades(0));
  const { r, L } = run(sc, V(f.x + 0.3, f.bladeY + 0.3, f.z), V(0, -1, 0));
  assert(L.type === 'fan' && r.reason === 'fan', L.type);
});
test('moving collider pushes the ball (impulse from velocity)', () => {
  const pusher = { kind: 'box', min: V(-0.3, 0.8, -0.3), max: V(0.3, 1.2, 0.3), tag: 'body', ownerId: 'x', velocity: V(3, 0, 0) };
  const sc = scene([pusher], false);
  const b = P.resetBall(P.newBall(), V(0.3 + R - 0.005, 1.0, 0), V(0, 0, 0));
  P.stepBall(b, sc);
  assert(b.vx > 2.5, `vx ${b.vx}`);
});
test('wedge between two boxes settles without NaN', () => {
  const a = { kind: 'box', min: V(-1, 0, -1), max: V(-0.03, 1, 1), tag: 'prop' };
  const c = { kind: 'box', min: V(0.03, 0, -1), max: V(1, 1, 1), tag: 'prop' };
  const sc = new P.Scene(new P.Grid().setColliders([a, c]), new P.Grid());
  const { r } = run(sc, V(0, 1.5, 0), V(0, -2, 0), { env: { bounds: false } });
  assert(r.reason === 'rest' && r.nanFix === 0 && r.pos.y > 0.9, `${r.reason} y=${r.pos.y}`);
});
test('thin rotated OBB is not tunnelled at max speed', () => {
  const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), 0.6);
  const plate = { kind: 'obb', center: V(0, 1.5, 0), halfSize: V(1, 1, 0.005), quaternion: q, tag: 'prop' };
  const sc = new P.Scene(new P.Grid().setColliders([plate]), new P.Grid());
  for (const sp of [5, 10.5, 14]) {
    const b = P.resetBall(P.newBall(), V(0, 1.5, 1.5), V(0, 0, -sp));
    for (let i = 0; i < 120; i++) P.stepBall(b, sc, { bounds: false });
    const local = V(b.px, b.py, b.pz).applyQuaternion(q.clone().invert());
    assert(local.z > 0, `tunnelled at ${sp} m/s`);
  }
});
test('apex event fires once at the top', () => {
  let n = 0, y = 0;
  P.simulate(SN, V(0, 1, 2), V(0, 4, -1), { ev: { apex: (b) => { n++; y = b.py; } } });
  assert(n === 1 && Math.abs(y - (1 + 16 / (2 * 9.8))) < 0.08, `n=${n} y=${y}`);
});
test('near miss: passing just above a head', () => {
  const s = SEAT_BY_ID.r1c2;
  const seen = [];
  const { r } = run(S, V(s.x, 1.48, s.chairZ + 1.5), V(0, 0.6, -6), { ev: { nearMiss: (b, i) => seen.push(i) } });
  assert(seen.some((i) => i.ownerId === 's_r1c2') && !r.hits.some((h) => h.ownerId === 's_r1c2'), JSON.stringify(seen.map((x) => x.ownerId)));
  return `dist ${seen.find((i) => i.ownerId === 's_r1c2').dist}`;
});
test('wind pushes the ball near the windows only', () => {
  const wind = { x: 1, y: 0, z: 0, strength: 1 };
  const a = P.simulate(SN, V(-4.2, 1.2, 1), V(0, 3, -4), { env: { wind } });
  const b = P.simulate(SN, V(-4.2, 1.2, 1), V(0, 3, -4));
  const c = P.simulate(SN, V(1, 1.2, 1), V(0, 3, -4), { env: { wind } });
  const d = P.simulate(SN, V(1, 1.2, 1), V(0, 3, -4));
  assert(a.pos.x - b.pos.x > 0.1, `window drift ${a.pos.x - b.pos.x}`);
  assert(Math.abs(c.pos.x - d.pos.x) < 1e-9, 'wind acted away from the window');
  return `drift ${(a.pos.x - b.pos.x).toFixed(2)} m, windDrift ${a.windDrift.toFixed(2)}`;
});
test('nudge acceleration shifts the landing point', () => {
  const a = P.simulate(SN, V(0, 1.2, 3), V(0, 4, -4), { env: { nudge: { x: 2.5, y: 0, z: 0 } } });
  const b = P.simulate(SN, V(0, 1.2, 3), V(0, 4, -4));
  assert(a.pos.x - b.pos.x > 0.3, `shift ${a.pos.x - b.pos.x}`);
  return `shift ${(a.pos.x - b.pos.x).toFixed(2)} m`;
});
test('determinism: identical inputs → identical results', () => {
  const a = P.simulate(S, V(-3, 1, 2), V(1.3, 5.2, -6.1));
  const b = P.simulate(S, V(-3, 1, 2), V(1.3, 5.2, -6.1));
  assert(a.pos.x === b.pos.x && a.pos.y === b.pos.y && a.pos.z === b.pos.z && a.t === b.t && a.hits.length === b.hits.length, 'mismatch');
});
test('malformed colliders are ignored, not fatal', () => {
  const g = new P.Grid().setColliders([{ kind: 'box', min: V(NaN, 0, 0), max: V(1, 1, 1) }, { kind: 'weird' }, null, { kind: 'sphere', center: V(0, 1, 0), radius: -1 }]);
  assert(g.all.length === 0, `${g.all.length}`);
});
test('safety net: with no colliders at all the ball still stays inside the room', () => {
  const sc = new P.Scene(new P.Grid(), new P.Grid());
  const r = P.simulate(sc, V(0, 1.5, 0), V(9, 3, 6));
  assert(r.pos.y >= R * 0.25 && r.pos.x <= ROOM.maxX && r.pos.z <= ROOM.maxZ && r.guard > 0, JSON.stringify(r.pos));
});
test('launch origin depends only on yaw/pitch and is above the own desk', () => {
  const a = P.launchOriginFor(0, 0), b = P.launchOriginFor(0, 0);
  assert(a.equals(b), 'not pure');
  for (const pd of [-35, 0, 25]) {
    const o = P.launchOriginFor(0, (pd * Math.PI) / 180);
    assert(o.y > DESK.topY + R + 0.03, `origin y ${o.y} at pitch ${pd}`);
  }
});

// ------------------------------------------------------------------ random throws (C2-style)
test('2000 random throws: no NaN, no tunnelling, all land within 7 s', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const types = {};
  let maxT = 0, guards = 0;
  const sc = scene(fanBlades(0.13));
  for (let i = 0; i < 2000; i++) {
    const o = P.launchOriginFor(rnd() * 2.6 - 1.3, rnd() * 1.0 - 0.6);
    const v = P.launchVelocity({ yaw: rnd() * 3 - 1.5, pitch: rnd() * 2 - 0.6, power: rnd() });
    const { r, L } = run(sc, o, v);
    assert(r.nanFix === 0 && Number.isFinite(r.pos.x + r.pos.y + r.pos.z), `NaN at throw ${i}`);
    assert(inRoomOrOut(r.pos), `out of room at throw ${i}: ${JSON.stringify(r.pos)}`);
    if (r.pos.x < ROOM.minX) assert(L.type === 'outside', `outside but ${L.type}`);
    assert(r.reason !== 'stopped' && r.t <= P.PHYS.TIMEOUT + 0.01, `t=${r.t}`);
    types[L.type] = (types[L.type] || 0) + 1; maxT = Math.max(maxT, r.t); guards += r.guard;
  }
  assert(guards === 0, `room safety net fired ${guards} times (colliders let the ball through)`);
  return `max flight ${maxT.toFixed(2)} s, ${JSON.stringify(types)}`;
});
test('random throws from inside the room (anywhere, any direction, up to 14 m/s)', () => {
  let seed = 999;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let guards = 0;
  for (let i = 0; i < 800; i++) {
    const p = V(ROOM.minX + 0.2 + rnd() * 9.6, 0.1 + rnd() * 2.9, ROOM.minZ + 0.2 + rnd() * 10.1);
    const v = V(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize().multiplyScalar(rnd() * 14);
    const { r } = run(S, p, v);
    assert(r.nanFix === 0 && inRoomOrOut(r.pos), `throw ${i}: ${JSON.stringify(r.pos)}`);
    guards += r.guard;
  }
  return `safety-net interventions ${guards} (starts may be inside furniture)`;
});

// ------------------------------------------------------------------ solver
test('solver: every non-player seat is solved, verified, ≤ 150 ms', () => {
  const origin = P.launchOriginFor(0, 0);
  let ms = 0, mx = 0, n = 0;
  for (const s of SEATS) {
    if (s.id === PLAYER_SEAT) continue;
    const t = V(s.x, s.deskTopY + R, s.deskZ);
    const sol = solveLaunch({ origin, target: t, scene: S, fans: fanZones(FAN_LIST), lookups: chars.lookups });
    assert(sol, `no solution for ${s.id}`);
    const { L } = run(S, origin, P.launchVelocity(sol));
    assert(L.seatId === s.id && ['desk', 'chair'].includes(L.type), `${s.id}: landed ${L.type}/${L.seatId}`);
    ms += sol.ms; mx = Math.max(mx, sol.ms); n++;
  }
  assert(mx <= 150, `slowest solve ${mx} ms`);
  return `avg ${(ms / n).toFixed(1)} ms, max ${mx.toFixed(0)} ms`;
});
test('solver: special targets (trash, window, podium, teacher, fan, floor, self)', () => {
  const origin = P.launchOriginFor(0, 0);
  const w = WINDOWS.find((x) => x.open), f = FANS[0];
  const cases = {
    trash: [V(TRASH.x, TRASH.h * 0.6, TRASH.z), 'trash'], window: [V(w.x - 0.6, w.sillY + 0.5, w.z), 'outside'],
    podium: [V(TEACHER_DESK.x, TEACHER_DESK.topY + R, TEACHER_DESK.z), 'podium'], teacher: [V(0, 1.72, -5.45), 'teacher'],
    floor: [V(AISLES_X[1], R, (ROWS_Z[2] + ROWS_Z[3]) / 2), 'floor'], self: [V(SEAT_BY_ID[PLAYER_SEAT].x, DESK.topY + R, SEAT_BY_ID[PLAYER_SEAT].deskZ), 'self'],
    fan: [V(f.x + f.r * 0.6, f.bladeY, f.z), 'fan'],
  };
  const out = [];
  for (const [k, [t, type]] of Object.entries(cases)) {
    const sol = solveLaunch({ origin, target: t, scene: S, fans: fanZones(FAN_LIST), lookups: chars.lookups });
    assert(sol, `no solution for ${k}`);
    if (k === 'fan') {
      // verify against real spinning blades at several phases
      let hits = 0;
      for (let ph = 0; ph < 6; ph++) {
        const blades = (t0) => fanBlades(t0);
        const b = P.resetBall(P.newBall(), origin, P.launchVelocity(sol));
        while (!b.done) { const sc = scene(blades(ph * 0.07 + b.t)); P.stepBall(b, sc, {}, P.PHYS.H); }
        if (b.reason === 'fan') hits++;
      }
      assert(hits >= 5, `fan hit in ${hits}/6 blade phases`);
      out.push(`fan ${hits}/6`);
      continue;
    }
    const { L } = run(S, origin, P.launchVelocity(sol));
    assert(L.type === type, `${k}: landed ${L.type}`);
    out.push(`${k} ${(sol.pitch * 57.3).toFixed(0)}°/${sol.power.toFixed(2)}`);
  }
  return out.join(', ');
});
test('solver: pitchDeg preference is honoured when feasible', () => {
  const origin = P.launchOriginFor(0, 0);
  const s = SEAT_BY_ID.r2c3;
  const sol = solveLaunch({ origin, target: V(s.x, DESK.topY + R, s.deskZ), scene: S, fans: fanZones(FAN_LIST), lookups: chars.lookups, opts: { pitchDeg: 40 } });
  assert(sol && Math.abs(sol.pitch * 57.3 - 40) <= 16, `pitch ${sol && sol.pitch * 57.3}`);
  return `${(sol.pitch * 57.3).toFixed(0)}°`;
});
test('solver: goal detection', () => {
  const g1 = makeGoal(V(TRASH.x, 0.25, TRASH.z), S, fanZones(FAN_LIST));
  const s = SEAT_BY_ID.r1c1;
  const g2 = makeGoal(V(s.x, DESK.topY + R, s.deskZ), S, []);
  assert(g1.kind === 'trigger' && g1.tag === 'trash', g1.kind);
  assert(g2.kind === 'seat' && g2.seatId === 'r1c1', g2.kind);
});

console.log(results.join('\n'));
console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
