// Teacher timeline + D2/D3/D4 timings (no screenshots: fast).
//   node tools/shot.mjs --script dev/ai/timeline.js --out dev/ai/shots
qs.manual(true);
const ctx = qs.ctx;
const out = {};
const tryThrow = async (list) => { for (const t of list) { try { await qs.throwAt(t); return t; } catch { /* next */ } } return null; };

// ── 1. natural cycle over 60 s (player idle, looking at the board) ──
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true, roundSeconds: 90 });
const samples = [];
for (let i = 0; i < 120; i++) {
  await qs.advance(0.5);
  samples.push([+(i * 0.5 + 0.5).toFixed(1), ctx.ai.teacher.state, +ctx.round.suspicion.toFixed(3)]);
}
const tl = ctx.ai.debug.timeline.map((e) => ({ t: e.t, state: e.state }));
const durs = {};
for (let i = 0; i < tl.length - 1; i++) (durs[tl[i].state] ||= []).push(+(tl[i + 1].t - tl[i].t).toFixed(2));
const stats = Object.fromEntries(Object.entries(durs).map(([k, v]) => [k, { n: v.length, min: Math.min(...v), max: Math.max(...v), avg: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) }]));
out.cycle = { sequence: tl.map((e) => `${e.t.toFixed(1)}:${e.state}`).join(' '), stats, board: ctx.world.classroom.blackboard.text, phase: ctx.flow.phase };
out.ambient = ctx.ai.students.list().slice(0, 8);

// ── 2. D2: watching + charging → caught ──
await qs.start({ seed: 4, playerGender: 'm', skipIntro: true });
qs.forceTeacher('watching', 30);
qs.setSuspicion(0);
ctx.input.simulate({ down: 'Mouse0' });
let t0 = ctx.time.now, caughtAt = null;
const off = ctx.bus.on('teacher:caught', (p) => { caughtAt = { t: +(ctx.time.now - t0).toFixed(3), ...p }; });
await qs.advanceUntil(() => caughtAt || ctx.flow.phase !== 'aim', 6);
off();
out.D2 = { caughtAfterSec: caughtAt?.t ?? null, reason: caughtAt?.reason, charging: ctx.gameplay.aim.charging, playerVis: ctx.ai.teacher.playerVisibility?.() };
ctx.input.simulate({ up: 'Mouse0' });
await qs.runToEnding(80);

// ── 3. D3: studying lowers; charging with the back turned doesn't raise ──
await qs.start({ seed: 5, playerGender: 'f', skipIntro: true });
qs.forceTeacher('watching', 30);
qs.setSuspicion(0.8);
ctx.input.simulate({ down: 'Space' });
await qs.advance(1);
const studied = ctx.round.suspicion;
ctx.input.simulate({ up: 'Space' });
await qs.advance(0.1);
qs.forceTeacher('writing', 30);
qs.setSuspicion(0.3);
ctx.input.simulate({ down: 'Mouse0' });
await qs.advance(1);
const backTurned = ctx.round.suspicion;
const chargingD3 = ctx.gameplay.aim.charging;
ctx.input.simulate({ up: 'Mouse0' });
await qs.advance(0.1);
out.D3 = { study1s_from08: +studied.toFixed(3), charge1s_backTurned_from03: +backTurned.toFixed(3), charging: chargingD3 };
await qs.runToEnding(80);

// ── 4. D4: ball inside the cone → teacherSawBall ──
await qs.start({ seed: 6, playerGender: 'm', skipIntro: true });
ctx.ai.students.setAmbient(false);
qs.forceTeacher('watching', 30);
qs.setSuspicion(0);
const t1 = ctx.time.now;
let sawAt = null;
const off2 = ctx.bus.on('teacher:caught', (p) => { if (p.reason === 'ball') sawAt = +(ctx.time.now - t1).toFixed(3); });
out.D4target = await tryThrow(['r0c3', 'r0c2', 'r1c3', 'r1c2', 'crush']);
await qs.advanceUntil(() => ctx.flow.phase !== 'flight', 10);
off2();
out.D4 = { teacherSawBall: ctx.round.teacherSawBall, caughtDuring: ctx.round.caughtDuring, sawAfterSec: sawAt, flightTime: ctx.round.landing?.flightTime, landing: qs.state().landing };
await qs.runToEnding(80);

// ── 5. natural incident rate over N throws (writing teacher, ambient on) ──
let withIncident = 0, n = 0;
const kinds = {};
for (let s = 0; s < 10; s++) {
  await qs.start({ seed: 100 + s, playerGender: s % 2 ? 'f' : 'm', skipIntro: true });
  qs.forceTeacher('writing', 30);
  await qs.advance(0.3);
  if (!(await tryThrow(['crush']))) continue;
  await qs.advanceUntil(() => ctx.flow.phase !== 'flight', 10);
  n++;
  const inc = ctx.round.incidents.filter((i) => i.natural);
  if (inc.length) withIncident++;
  for (const i of inc) kinds[i.action] = (kinds[i.action] || 0) + 1;
  await qs.runToEnding(80);
}
out.incidentRate = { throws: n, withIncident, kinds };
out.errors = qs.errors;
return out;
