// Every in-flight accident via ai.students.trigger, one screenshot each.
//   node tools/shot.mjs --script dev/ai/incidents.js --out dev/ai/shots
qs.manual(true);
const ctx = qs.ctx, V = (x, y, z) => new ctx.THREE.Vector3(x, y, z);
const res = {};
await qs.start({ seed: 11, playerGender: 'm', skipIntro: true });
qs.forceTeacher('writing', 60);
const studs = ctx.ai.students.list();
const used = new Set();
const pick = (seat) => {
  const L = ctx.layout.SEAT_BY_ID, want = L[seat];
  const c = studs.filter((s) => !used.has(s.id) && s.trait !== 'jock').map((s) => ({ s, d: Math.hypot(L[s.seat].row - want.row, L[s.seat].col - want.col) })).sort((a, b) => a.d - b.d)[0].s;
  used.add(c.id); return c.id;
};
const faceCam = (id, dist = 1.9) => {
  const ch = ctx.cast.get(id); const h = ch.headWorld(V());
  ctx.cam.cut({ pos: V(h.x + 0.6, h.y + 0.5, h.z - dist), look: V(h.x, h.y + 0.1, h.z), fov: 55 });
};
const one = async (kind, seat, wait, name) => {
  const id = pick(seat);
  res[kind] = ctx.ai.students.trigger(kind, id);
  await qs.advance(wait);
  faceCam(id);
  await shot(name);
};
await one('stretch', 'r2c2', 1.0, 'i1_stretch');
await one('raiseHand', 'r2c4', 1.0, 'i2_raiseHand');
await one('standUp', 'r1c2', 1.4, 'i3_standUp');
await one('sneeze', 'r2c3', 0.9, 'i4_sneeze');
await one('witness', 'r1c3', 0.8, 'i5_witness');
res.gust = ctx.ai.students.trigger('gust');
await qs.advance(0.6);
res.wind = ctx.world.classroom.wind?.strength;
ctx.cam.cut({ pos: V(-2.2, 2.0, 0.6), look: V(-5, 1.6, -1.2), fov: 60 });
await shot('i6_gust');
// catch: throw past the jock, then trigger
const jock = studs.find((s) => s.trait === 'jock');
res.jock = jock;
await qs.advance(2);
const js = ctx.layout.SEAT_BY_ID[jock.seat];
for (const t of [jock.seat, js.deskmate, `r${js.row + 1}c${js.col}`, `r${js.row}c${js.col ^ 1}`, 'crush']) { try { await qs.throwAt(t); res.catchTarget = t; break; } catch { /* next */ } }
await qs.advance(0.15);
res.catch = ctx.ai.students.trigger('catch', jock.id);
await qs.advanceUntil(() => ctx.gameplay.ball.state !== 'flying', 3);
await qs.advance(0.3);
res.catchLanding = ctx.round.landing && { type: ctx.round.landing.type, ownerId: ctx.round.landing.ownerId };
faceCam(jock.id, 1.5);
await shot('i7_catch');
await qs.runToEnding(80);
// teacherTurn mid-flight
await qs.start({ seed: 12, playerGender: 'f', skipIntro: true });
qs.forceTeacher('writing', 30);
await qs.advance(0.3);
await qs.throwAt('r0c4');
await qs.advance(0.25);
res.teacherTurn = ctx.ai.students.trigger('teacherTurn');
await qs.advance(0.5);
res.stateAfterTurn = ctx.ai.teacher.state;
await shot('i8_teacherTurn_follow');
await qs.advanceUntil(() => ctx.flow.phase !== 'flight', 6);
res.incidents = ctx.round.incidents.map((i) => `${i.kind}/${i.action}`);
res.sawBall = ctx.round.teacherSawBall;
res.errors = qs.errors;
return res;
