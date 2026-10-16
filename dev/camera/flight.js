// Camera self-test: one throw at the crush, a frame every 0.15 s (real/UI time), teacher forced to turn mid-flight.
qs.manual(true);
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true });
qs.forceTeacher('writing', 30);
await qs.advance(0.4);
const cam = qs.ctx.cam, T = qs.ctx.THREE;
const log = [];
await qs.throwAt('crush');
let n = 0, turned = false;
const t0 = qs.ctx.time.uiNow;
for (let i = 0; i < 9 && qs.ctx.flow.phase !== 'card'; i++) {
  await qs.advance(0.15);
  if (!turned && qs.ctx.time.uiNow - t0 > 0.5) { qs.forceTeacher('warning', 0.6); turned = true; }
  const b = qs.ctx.gameplay.ball;
  const p = b.pos.clone().project(cam.camera);
  log.push({ i, ball: b.state, ndc: [+p.x.toFixed(2), +p.y.toFixed(2)], ts: +qs.ctx.engine.timeScale.toFixed(2), mode: cam.mode, pip: cam.debug().pip });
  await shot('f' + (n++));
}
await qs.advanceUntil(() => qs.ctx.flow.phase !== 'flight', 20);
const after = cam.debug();
await qs.advance(1.5);
return { log, metrics: cam.metrics.flights, after, final: cam.debug(), phase: qs.ctx.flow.phase };
