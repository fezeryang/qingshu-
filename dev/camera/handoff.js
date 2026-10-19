// Playtest-1 hand-off: release beat → pull-out → chase, sampled on the real (UI) clock.
qs.manual(true);
const cam = qs.ctx.cam, out = [];
await qs.start({ seed: 301, playerGender: 'm', skipIntro: true });
qs.forceTeacher('writing', 60);
cam.setFollowStyle('chase');
await qs.advance(0.3);
await shot('h0-aim');
const u0 = qs.ctx.time.uiNow;
await qs.throwAt('r0c2');
const marks = [0.08, 0.2, 0.35, 0.55, 0.9, 1.5, 2.2, 2.8];
for (const [i, m] of marks.entries()) {
  await qs.advanceUntil(() => qs.ctx.time.uiNow - u0 >= m, 10);
  const b = qs.ctx.gameplay.ball, p = b.pos.clone().project(cam.camera);
  out.push({ real: +(qs.ctx.time.uiNow - u0).toFixed(2), game: +(b.t ?? 0).toFixed(2), ts: +qs.ctx.engine.timeScale.toFixed(2), dist: +cam.camera.position.distanceTo(b.pos).toFixed(2), ndc: [+p.x.toFixed(2), +p.y.toFixed(2)], state: b.state, mode: cam.mode });
  await shot(`h${i + 1}`);
}
await qs.advanceUntil(() => qs.ctx.flow.phase !== 'flight', 10);
return { out, metrics: cam.metrics.last };
