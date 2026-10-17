// A3 memory probe: replays identical rounds (same seed + target) with rendering, printing renderer.info.memory.
// Run: node tools/shot.mjs --script qa/repro/memory-replay-probe.js --out qa/repro/shots
qs.manual(true);
const mem = () => ({ ...qs.ctx.engine.renderer.info.memory });
const play = async (seed, target) => {
  await qs.start({ seed, playerGender: 'm', skipIntro: true, roundSeconds: 300 });
  qs.ctx.ai.students.setAmbient(false);
  qs.forceTeacher('writing', 999);
  qs.ctx.gameplay.launch(qs.ctx.gameplay.solveLaunch(qs.target(target)));
  for (let i = 0; i < 200 && qs.ctx.flow.phase !== 'card'; i++) { await qs.advance(0.5); qs.render(); }
  return { id: qs.ctx.round.endingId, ...mem() };
};
const rows = [];
for (let i = 0; i < 3; i++) rows.push(await play(12, 'crush'));
for (let i = 0; i < 2; i++) rows.push(await play(12, 'floor'));
for (let i = 0; i < 2; i++) rows.push(await play(12, 'crush'));
return rows.map((r) => `${r.id}: geometries ${r.geometries}, textures ${r.textures}`);
