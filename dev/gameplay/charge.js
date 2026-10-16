// Charging preview close look (+ debug overlay when run with debug=1)
qs.manual(true);
const ctx = qs.ctx, g = ctx.gameplay;
await qs.start({ seed: 7, playerGender: 'f', skipIntro: true });
qs.forceTeacher('writing', 999);
ctx.input.simulate({ nx: 0.35, ny: 0.45 });
await qs.advance(1.0);
ctx.input.simulate({ down: 'Mouse0' });
await qs.advance(0.5);
await shot('charge-mid');
await qs.advance(1.0);
await shot('charge-full');
return { power: g.aim.power, charging: g.aim.charging, fp: [ctx.cam.fp.yaw, ctx.cam.fp.pitch], errors: qs.errors.slice(0, 5) };
