qs.manual(true);
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true });
const ctx = qs.ctx;
await qs.advance(0.2);
await shot('classroom-fp');
ctx.cam.cut({ pos: new ctx.THREE.Vector3(-3.12, 1.24, 2.22), look: new ctx.THREE.Vector3(-30, -0.5, -8), fov: 60 });
await shot('campus-window');
const out = {};
for (const name of ['rooftop', 'office', 'schoolyard', 'court', 'cherryPath', 'canteen']) {
  const set = ctx.stage.show(name);
  ctx.cast.showOnly([]);
  await qs.advance(0.1);
  const a = set.anchors.camWide;
  ctx.cam.cut({ pos: a.pos, look: a.look, fov: a.fov || 50 });
  await shot(`set-${name}`);
  out[name] = { calls: ctx.engine.renderer.info.render.calls, triangles: ctx.engine.renderer.info.render.triangles };
}
if (qs.errors.length) throw new Error(qs.errors.join('\n'));
return { out, errors: qs.errors };
