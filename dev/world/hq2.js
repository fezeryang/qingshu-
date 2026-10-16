qs.manual(true);
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true });
const ctx = qs.ctx, T = ctx.THREE, V = (x, y, z) => new T.Vector3(x, y, z);
await qs.advance(0.5);
ctx.cam.cut({ pos: V(4.2, 2.7, 4.3), look: V(-1.2, 0.9, -2.6), fov: 62 });
await shot('hq-overview');
ctx.cam.cut({ pos: V(0, 3.1, 0), look: V(-1.5, 0, -0.5), fov: 80 });
await shot('hq-top');
return qs.errors;
