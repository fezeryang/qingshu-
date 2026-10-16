// Seat sweep (ACCEPTANCE C1), run with:
//   node tools/shot.mjs --script dev/gameplay/sweep.js --out dev/gameplay/shots
// For every non-player seat: fresh round, teacher frozen writing, ambient off, wind off →
// solveLaunch(seat desk) → launch → wait for ball:landed → compare.
qs.manual(true);
const ctx = qs.ctx;
const seats = ctx.layout.SEATS.filter((s) => !s.isPlayer);
const rows = [];
let solvable = 0, hit = 0, solveMs = 0, solveMax = 0;
const t0 = performance.now();
for (let i = 0; i < seats.length; i++) {
  const s = seats[i];
  await qs.start({ seed: 100 + i, playerGender: i % 2 ? 'f' : 'm', skipIntro: true, roundSeconds: 20 });
  qs.forceTeacher('writing', 999);
  ctx.ai?.students?.setAmbient?.(false);
  if (ctx.world.classroom.wind) ctx.world.classroom.wind.strength = 0;
  await qs.advance(0.3);
  const g = ctx.gameplay;
  const sol = g.solveLaunch(qs.target(s.id));
  if (!sol) { rows.push(`${s.id}: no solution`); await qs.runToEnding(120); continue; }
  solvable++; solveMs += sol.ms; solveMax = Math.max(solveMax, sol.ms);
  g.launch(sol);
  const landed = ctx.bus.next('ball:landed');
  await qs.advanceUntil(() => g.ball.state !== 'flying', 10);
  const L = await Promise.race([landed, new Promise((r) => setTimeout(() => r(null), 50))]) || g.ball.landing;
  const ok = L && L.seatId === s.id && ['desk', 'chair'].includes(L.type);
  if (ok) hit++;
  rows.push(`${s.id}: ${ok ? 'HIT ' : 'MISS'} ${L?.type}/${L?.seatId} pitch ${(sol.pitch * 57.3).toFixed(0)} pow ${sol.power.toFixed(2)} robust ${sol.robust} ${sol.ms}ms t=${L?.flightTime}s hits=[${(L?.hits || []).map((h) => h.tag).join(',')}]`);
  await qs.runToEnding(120);
}
return {
  summary: `C1 sweep: ${hit}/${solvable} solvable seats hit (${(100 * hit / Math.max(1, solvable)).toFixed(1)}%), ${seats.length - solvable} unsolvable; solve avg ${(solveMs / Math.max(1, solvable)).toFixed(1)} ms, max ${solveMax.toFixed(0)} ms; wall ${((performance.now() - t0) / 1000).toFixed(0)} s`,
  rows, errors: qs.errors.slice(0, 10),
};
