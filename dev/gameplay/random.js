// Random-throw stress test (ACCEPTANCE C2) + named targets, run with:
//   node tools/shot.mjs --script dev/gameplay/random.js --out dev/gameplay/shots
qs.manual(true);
const ctx = qs.ctx;
const out = {};
// 1) the gray-box solver's known failure: seed 7, crush, pitch 60
await qs.start({ seed: 7, playerGender: 'm', skipIntro: true });
qs.forceTeacher('writing', 999);
const sol = await qs.throwAt('crush', { pitchDeg: 60 });
await qs.advanceUntil(() => ctx.gameplay.ball.state !== 'flying', 10);
const L0 = ctx.gameplay.ball.landing;
out.seed7crush = { pitch: +(sol.pitch * 57.3).toFixed(1), power: +sol.power.toFixed(3), crushSeat: ctx.cast.seatOf(ctx.round.crushId), landed: `${L0.type}/${L0.seatId}/${L0.ownerId}`, ending: await qs.runToEnding(120) };

// 2) named targets (each in a fresh round)
out.named = {};
for (const name of ['trash', 'window', 'podium', 'teacher', 'fan', 'floor', 'self']) {
  await qs.start({ seed: 21, playerGender: 'f', skipIntro: true });
  qs.forceTeacher('writing', 999);
  ctx.ai?.students?.setAmbient?.(false);
  let s;
  try { s = await qs.throwAt(name); } catch (e) { out.named[name] = 'NO SOLUTION'; await qs.runToEnding(120); continue; }
  await qs.advanceUntil(() => ctx.gameplay.ball.state !== 'flying', 10);
  const L = ctx.gameplay.ball.landing;
  out.named[name] = `${L.type} (pitch ${(s.pitch * 57.3).toFixed(0)}, power ${s.power.toFixed(2)}, ${s.ms} ms)`;
  out.named[name] += ' → ' + await qs.runToEnding(120);
}

// 3) 200 random throws in one round (the flow moves on after the first landing; physics keeps working)
await qs.start({ seed: 5, playerGender: 'm', skipIntro: true });
qs.forceTeacher('writing', 999);
const R = ctx.layout.ROOM;
let seed = 4242;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const stats = { n: 0, nan: 0, outOfRoom: 0, late: 0, types: {}, maxT: 0 };
for (let i = 0; i < 200; i++) {
  const spec = { yaw: rnd() * 2.6 - 1.3, pitch: rnd() * 1.4 - 0.5, power: rnd() };
  const landed = ctx.bus.next('ball:landed');
  const tl = ctx.time.now;
  qs.throwRaw(spec);
  let L = null;
  landed.then((x) => { L = x; });
  await qs.advanceUntil(() => L, 9);
  const g = ctx.gameplay.ball;
  const p = g.pos;
  stats.n++;
  stats.guard = (stats.guard || 0) + ctx.gameplay.debug.sim.guard;
  if (!L) { stats.late++; continue; }
  if (!Number.isFinite(p.x + p.y + p.z)) stats.nan++;
  const inside = p.x >= R.minX - 0.02 && p.x <= R.maxX && p.z >= R.minZ && p.z <= R.maxZ && p.y >= 0 && p.y <= R.height;
  if (!inside && L.type !== 'outside') stats.outOfRoom++;
  stats.types[L.type] = (stats.types[L.type] || 0) + 1;
  stats.maxT = Math.max(stats.maxT, ctx.time.now - tl);
}
stats.maxT = +stats.maxT.toFixed(2);
out.random = stats;
out.errors = qs.errors.slice(0, 10);
return out;
