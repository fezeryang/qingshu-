window.__setList = ['rooftop', 'office', 'schoolyard', 'court'];
// Ending sets: camWide of each (+ rooftop camSunset)
qs.manual(true);
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true });
const ctx = qs.ctx, T = ctx.THREE;
const out = {};
for (const name of (window.__setList || ['rooftop', 'office', 'schoolyard', 'court', 'cherryPath', 'canteen'])) {
  const t0 = performance.now();
  const set = ctx.stage.show(name);
  out[name] = { buildMs: Math.round(performance.now() - t0), anchors: Object.keys(set.anchors) };
  ctx.cast.showOnly([]);
  await qs.advance(0.3);
  const a = set.anchors.camWide;
  ctx.cam.cut({ pos: a.pos, look: a.look, fov: a.fov || 50 });
  await shot(`set-${name}`);
  out[name].calls = ctx.engine.renderer.info.render.calls;
}
const r = ctx.stage.get('rooftop').anchors.camSunset;
ctx.stage.show('rooftop'); ctx.cam.cut({ pos: r.pos, look: r.look, fov: r.fov });
await shot('set-rooftop-sunset');
return { out, errors: qs.errors };
