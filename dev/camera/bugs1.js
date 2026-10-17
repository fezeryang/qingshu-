// Fix round 1: BUG-004 (curtains hide the ball at the window exit) + BUG-005 (foreground heads in ending close-ups).
qs.manual(true);
const cam = qs.ctx.cam, T = qs.ctx.THREE, out = {};
// --- BUG-004: real-mesh rays camera → ball every follow frame (like QA F1), seed 91 window throw
const vis = (o) => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
for (const seed of [91, 92, 93]) {
  await qs.start({ seed, playerGender: 'm', skipIntro: true });
  qs.forceTeacher('writing', 60); cam.setFollowStyle('chase');
  await qs.throwAt('window');
  const rc = new T.Raycaster(); let frames = 0, hidden = 0, what = {};
  for (let i = 0; i < 600 && qs.ctx.gameplay.ball.state === 'flying'; i++) {
    await qs.advance(1 / 60);
    if (cam.mode !== 'follow' || qs.ctx.gameplay.ball.state !== 'flying') continue;
    frames++;
    const b = qs.ctx.gameplay.ball.pos, c = cam.camera.position, R = 0.04; let blocked = 0, by = null;
    for (const off of [[0, 0, 0], [R, 0, 0], [-R, 0, 0], [0, R, 0], [0, -R, 0]]) {
      const tgt = b.clone().add(new T.Vector3(...off)); const dir = tgt.clone().sub(c); const len = dir.length();
      rc.set(c, dir.normalize()); rc.far = len - 0.05; rc.camera = cam.camera;
      const h = rc.intersectObjects(qs.ctx.engine.scene.children, true).find((x) => vis(x.object) && x.object.type === 'Mesh' && x.object !== qs.ctx.gameplay.ball.mesh && !x.object.name.includes('letterBall') && !/lightShaft/.test(x.object.name || ''));
      if (h) { blocked++; by = h.object.name || h.object.parent?.name; }
    }
    if (blocked === 5) { hidden++; what[by] = (what[by] || 0) + 1; }
  }
  if (seed === 91) { await qs.advance(0.05); }
  out['window' + seed] = { frames, hidden, what, metric: cam.metrics.last && { ratio: cam.metrics.last.ratio, occluded: cam.metrics.last.occluded } };
  await qs.advanceUntil(() => qs.ctx.flow.phase !== 'flight', 20);
}
// --- BUG-005: confetti ending close-ups
await qs.start({ seed: 31, playerGender: 'm', skipIntro: true });
qs.forceTeacher('writing', 60);
await qs.throwAt('fan');
await qs.advanceUntil(() => qs.ctx.flow.phase === 'ending', 20);
await qs.advance(5); out.conf5 = cam.debug().fgHidden; await shot('b1-confetti-5s');
await qs.advance(3); out.conf8 = cam.debug().fgHidden; await shot('b2-confetti-8s');
// caught_read
await qs.start({ seed: 32, playerGender: 'f', skipIntro: true });
qs.forceTeacher('watching', 30); qs.setSuspicion(0.99); qs.ctx.gameplay.aim.charging = true;
await qs.advanceUntil(() => qs.ctx.flow.phase === 'ending', 20);
await qs.advance(5); out.cr5 = cam.debug().fgHidden; await shot('b3-caught-5s');
await qs.advance(3); out.cr8 = cam.debug().fgHidden; await shot('b4-caught-8s');
// perfect
await qs.start({ seed: 33, playerGender: 'm', skipIntro: true });
qs.forceTeacher('writing', 60);
await qs.throwAt('crush');
await qs.advanceUntil(() => qs.ctx.flow.phase === 'ending', 20);
await qs.advance(5); out.p5 = { end: qs.ctx.round.endingId, fg: cam.debug().fgHidden }; await shot('b5-ending-5s');
out.errors = qs.errors.slice(0, 5);
return out;
