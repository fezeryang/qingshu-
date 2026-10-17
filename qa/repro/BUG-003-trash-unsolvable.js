// BUG-003 repro: solveLaunch(__qs.target('trash')) returns null for some rosters (found by A3, retry seed 205479616).
// Run: node tools/shot.mjs --script qa/repro/BUG-003-trash-unsolvable.js --out qa/repro/shots
qs.manual(true);
const out = [];
for (const [seed, g] of [[205479616, 'm'], [205479616, 'f'], [81, 'm'], [82, 'f']]) {
  await qs.start({ seed, playerGender: g, skipIntro: true, roundSeconds: 300 });
  qs.ctx.ai.students.setAmbient(false);
  qs.forceTeacher('writing', 999);
  const t0 = performance.now();
  const sol = qs.ctx.gameplay.solveLaunch(qs.target('trash'));
  const row = { seed, gender: g, solveMs: Math.round(performance.now() - t0), solved: !!sol, robust: sol?.robust, frontRight: ['r0c4', 'r0c5', 'r1c4', 'r1c5'].map((s) => `${s}:${qs.ctx.cast.occupant(s) ?? '-'}`).join(' ') };
  if (sol) { qs.ctx.gameplay.launch(sol); await qs.advanceUntil(() => !['aim', 'flight'].includes(qs.ctx.flow.phase), 20); row.live = qs.ctx.round.landing?.type; }
  else { await shot(`bug003-seed${seed}-${g}`); qs.ctx.round.timeLeft = 0.01; }
  await qs.runToEnding(120);
  out.push(row);
}
return out;
