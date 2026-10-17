// BUG-001 repro: solveLaunch for seat r0c1 returns null (seed 11) or a solution whose live throw misses (seed 23).
// Run: node tools/shot.mjs --script qa/repro/BUG-001-r0c1.js --out qa/repro/shots
// Uses only the normal flow + contract APIs (no QA sandbox).
const out = [];
for (const seed of [11, 23]) {
  qs.manual(true);
  await qs.start({ seed, playerGender: 'm', skipIntro: true, roundSeconds: 300 });
  qs.ctx.ai.students.setAmbient(false);
  qs.forceTeacher('writing', 999);
  const g = qs.ctx.gameplay;
  const t0 = performance.now();
  const sol = g.solveLaunch(qs.target('r0c1'));
  const ms = Math.round(performance.now() - t0);
  const row = { seed, occupant: qs.ctx.cast.occupant('r0c1'), solveMs: ms, sol: sol && { yaw: +sol.yaw.toFixed(4), pitchDeg: +(sol.pitch * 57.2958).toFixed(1), power: +sol.power.toFixed(3), robust: sol.robust, expect: sol.expect && { type: sol.expect.type, seatId: sol.expect.seatId } } };
  if (sol) {
    g.launch(sol);
    await qs.advanceUntil(() => qs.ctx.flow.phase !== 'flight' && qs.ctx.flow.phase !== 'aim', 20);
    const L = qs.ctx.round.landing;
    row.live = { type: L.type, seatId: L.seatId, hits: L.hits.map((h) => `${h.tag}:${h.ownerId ?? ''}`) };
    await shot(`bug001-seed${seed}-landing`);
    await qs.runToEnding(120);
  } else {
    qs.ctx.round.timeLeft = 0.01; // end this round (coward) so the next start() applies
    await qs.runToEnding(120);
  }
  out.push(row);
}
return out;
