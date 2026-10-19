qs.manual(true);
await qs.start({ seed: 31, skipIntro: true });
qs.forceTeacher('writing', 999);
const { engine, cam } = qs.ctx;
const { renderer, canvas, camera, performance: budget } = engine;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const originalDpr = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
const css = [canvas.clientWidth, canvas.clientHeight];
const size = renderer.setDrawingBufferSize;
let allocations = 0;
renderer.setDrawingBufferSize = function (...args) { allocations++; return size.apply(this, args); };
try {
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
  engine.resize();
  assert(renderer.getPixelRatio() === 1.5, 'high-DPI cap not applied');
  assert(allocations === 1, 'DPR change allocated more than once');
  engine.resize();
  assert(allocations === 1, 'unchanged size allocated a new buffer');
  for (let i = 0; i < 31; i++) budget.sample(1000 / 30);
  engine.resize();
  const ratio = renderer.getPixelRatio();
  assert(Math.abs(ratio - 1.35) < .001, 'sustained slow frames did not reduce drawing resolution');
  assert(canvas.width === Math.floor(css[0] * ratio), 'drawing width incorrect');
  assert(canvas.height === Math.floor(css[1] * ratio), 'drawing height incorrect');
  assert(canvas.clientWidth === css[0] && canvas.clientHeight === css[1], 'HUD/CSS layout resized');
  assert(camera.aspect === css[0] / css[1], 'camera aspect changed with DPR');
  cam.pip(true, { target: qs.ctx.cast.teacher });
  await shot('adaptive-pip');
  cam.pip(false);
  assert(!qs.errors.length, qs.errors.join('\n'));
  return { initialDpr: 1.5, adaptedDpr: ratio, allocations, css, buffer: [canvas.width, canvas.height], errors: qs.errors };
} finally {
  renderer.setDrawingBufferSize = size;
  if (originalDpr) Object.defineProperty(window, 'devicePixelRatio', originalDpr);
  else delete window.devicePixelRatio;
  for (let i = 0; i < 600; i++) budget.sample(1000 / 60);
  engine.resize();
}
