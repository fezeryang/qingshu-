// Run with tools/shot.mjs --script dev/perf/measure.js --query 'mute=1&round=300'.
// CPU ticks exclude rendering. Render timings use gl.finish and are software-GPU diagnostics,
// not estimates of frame rate on a player's GPU. Keep browser benchmarks sequential.
qs.manual(true);
await qs.start({ seed: 31, playerGender: 'm', skipIntro: true });
qs.forceTeacher('writing', 999);
const c = qs.ctx;
const { Face } = await import('/src/characters/face.js');
const originalFace = Face.prototype.render;
let paints = 0;
Face.prototype.render = function (state) {
  const changed = originalFace.call(this, state);
  if (changed) paints++;
  return changed;
};
const stats = (values) => {
  const a = values.slice().sort((x, y) => x - y);
  return { n: a.length, avg: a.reduce((x, y) => x + y, 0) / a.length, p50: a[Math.floor(a.length * .5)], p95: a[Math.floor(a.length * .95)], max: a.at(-1) };
};
const mc = new MessageChannel();
const yieldTask = () => new Promise((resolve) => { mc.port1.onmessage = resolve; mc.port2.postMessage(0); });
const measure = async (n) => {
  const times = [];
  paints = 0;
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    c.engine.tick(1 / 60);
    times.push(performance.now() - start);
    await yieldTask();
  }
  return { ...stats(times), facePaints: paints, phase: c.flow.phase };
};
try {
  await qs.advance(1);
  const aim = await measure(600);
  c.input.enabled = true;
  c.input.simulate({ down: 'Mouse0' });
  const charge = await measure(90);
  c.input.simulate({ down: 'Mouse2' });
  c.engine.tick(1 / 60);
  await yieldTask();
  c.input.simulate({ up: 'Mouse0' });
  c.input.simulate({ up: 'Mouse2' });
  await qs.advance(.2);
  const rendered = [];
  for (let i = 0; i < 4; i++) {
    c.engine.tick(1 / 60);
    const start = performance.now();
    qs.render();
    c.engine.renderer.getContext().finish();
    if (i) rendered.push(performance.now() - start);
    await yieldTask();
  }
  const info = c.engine.renderer.info;
  const result = { aim, charge, render: stats(rendered), renderPhase: c.flow.phase, draw: { ...info.render }, memory: { ...info.memory }, pixelRatio: c.engine.renderer.getPixelRatio(), errors: qs.errors };
  console.log('PERF_RESULT ' + JSON.stringify(result));
  await shot('classroom');
  return result;
} finally {
  Face.prototype.render = originalFace;
  mc.port1.close(); mc.port2.close();
}
