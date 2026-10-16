// Robustness: presets with junk args always resolve; KeyC cycling; willpower slow-mo; no residue across retry (A4/F2/F4).
qs.manual(true);
const cam = qs.ctx.cam, T = qs.ctx.THREE, out = {};
await qs.start({ seed: 21, playerGender: 'm', skipIntro: true });
qs.forceTeacher('writing', 999);
// 1) every preset resolves, even with nonsense arguments
const calls = {
  closeUpNull: () => cam.closeUp(null), closeUpBad: () => cam.closeUp('nobody'), closeUpOk: () => cam.closeUp('crush', { side: 'right', dur: 0.2 }),
  twoShotBad: () => cam.twoShot(undefined, 'x'), overShoulderBad: () => cam.overShoulder(), wideBad: () => cam.wide('nope'),
  wideRooftop: () => cam.wide('rooftop', { dur: 0.2 }), wideClassroom: () => cam.wide('classroom.camFront'), orbitVec: () => cam.orbit({ x: 0, y: 1, z: 0 }, { dur: 0.3 }),
  orbitRad: () => cam.orbit('teacher', { fromYaw: Math.PI * 0.8, toYaw: Math.PI * 1.2, dur: 0.3, height: 1.6 }),
  trackNull: () => cam.track(null), trackObj: () => cam.track(new T.Object3D(), { dur: 0.2 }), crash: () => cam.crashZoom('teacher'),
  dutch: () => cam.dutch(), seq: () => cam.sequence([{ pos: [0, 2, 3], look: [0, 1, 0], dur: 0.2 }, { wait: 0.1 }, () => cam.dutch(5, 0.1), { preset: 'closeUp', args: ['crush', { dur: 0.1 }] }, null, 42]),
  shotEmpty: () => cam.shot({}), cut: () => cam.cut({ pos: [0, 2, 3], look: [0, 1, 0] }), slowMo: () => cam.slowMo(0.3, 0.3), slowMoJunk: () => cam.slowMo('x', -1),
  letterbox: () => cam.letterbox(), fade: () => cam.fade(), fade0: () => cam.fade(0, 0.1), flash: () => cam.flash(), irisIn: () => cam.irisHeart('in', 0.2), pipBad: () => cam.pip(true, { target: 'nope' }),
  lookAt: () => cam.lookAt('crush'), toFP: () => cam.toFP({ instant: true }),
};
const res = {};
for (const [k, f] of Object.entries(calls)) {
  let done = false, err = null;
  try { Promise.resolve(f()).then(() => { done = true; }, (e) => { err = String(e); }); } catch (e) { err = 'sync ' + e.message; }
  await qs.advance(0.6);
  res[k] = err || (done ? 'ok' : 'PENDING');
}
await qs.advance(1);
out.presets = Object.entries(res).filter(([, v]) => v !== 'ok');
out.presetCount = Object.keys(res).length;
qs.ctx.stage.show('classroom');
await cam.toFP({ instant: true });
await qs.advance(0.2);
// 2) KeyC cycling + willpower slow motion during a flight
const modes = [];
const off = qs.ctx.bus.on('cam:mode', (p) => modes.push(p.style || p.mode));
await qs.throwAt('r0c3');
await qs.advance(0.3);
qs.ctx.input.simulate({ down: 'KeyC' }); await qs.advance(0.05); qs.ctx.input.simulate({ up: 'KeyC' }); await qs.advance(0.05);
qs.ctx.input.simulate({ down: 'KeyC' }); await qs.advance(0.05); qs.ctx.input.simulate({ up: 'KeyC' }); await qs.advance(0.05);
out.styleAfter2C = cam.followStyle;
qs.ctx.bus.emit('ball:willpower', { on: true }); await qs.advance(0.4);
out.tsWillpower = +qs.ctx.engine.timeScale.toFixed(3);
qs.ctx.bus.emit('ball:willpower', { on: false }); await qs.advance(0.5);
out.tsAfterWillpower = +qs.ctx.engine.timeScale.toFixed(3);
off();
out.modes = modes;
cam.setFollowStyle('chase');
// 3) leave everything stuck on, then finish the round and retry through the ending card
await qs.advanceUntil(() => qs.ctx.flow.phase === 'ending', 20);
cam.fade(1, 0.2, '#000'); cam.letterbox(true, 0.2); cam.irisHeart('out', 0.3); cam.slowMo(0.2, 30); cam.pip(true); cam.dutch(20, 0.1);
await qs.advance(0.5);
out.stuck = cam.debug();
await qs.advanceUntil(() => qs.ctx.flow.phase === 'card', 120);
out.atCard = { ts: qs.ctx.engine.timeScale, fade: cam.debug().fade, pip: cam.debug().pip };
qs.cardChoice('retry');
await qs.advanceUntil(() => qs.ctx.flow.phase === 'aim', 60);
await qs.advance(0.6);
out.afterRetry = cam.debug();
await shot('r1-after-retry');
out.errors = qs.errors.slice(0, 5);
return out;
