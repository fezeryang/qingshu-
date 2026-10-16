// First-person arm states (uses the arms gameplay parented to the camera).
qs.manual(true);
await qs.start({ seed: 3, playerGender: 'f', skipIntro: true });
const ctx = qs.ctx;
qs.forceTeacher('writing', 60);
await qs.advance(0.6);
const arms = ctx.engine.camera.children.find((o) => o.name === 'fpArms');
const api = arms && arms.userData.api;
const out = { found: !!arms, api: !!api };
if (!api) return out;
for (const [st, ch, dur] of [['holdBall', 0, 0.6], ['charge', 0.4, 0.5], ['charge', 1, 0.6], ['study', 0, 0.8], ['write', 0, 0.6], ['throw', 0, 0.12]]) {
  api.setState(st); api.setCharge(ch);
  await qs.advance(dur);
  if (st === 'study' || st === 'write') {
    const cam = ctx.engine.camera;
    cam.rotation.set(-0.8, 0.05, 0, 'YXZ'); cam.updateMatrixWorld(true);
    for (let i = 0; i < 90; i++) api.update(1 / 60);
  }
  await shot(`arms_${st}${ch ? '_' + ch : ''}`);
}
out.hand = api.handWorld().toArray().map((v) => +v.toFixed(3));
out.errors = qs.errors.slice(0, 5);
return out;
