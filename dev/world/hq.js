// Normal-quality (shadows) check; run with --query "mute=1"
qs.manual(true);
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true });
const ctx = qs.ctx, T = ctx.THREE, V = (x, y, z) => new T.Vector3(x, y, z);
await qs.advance(0.5);
await shot('hq-player');
ctx.cam.cut({ pos: V(4.2, 2.7, 4.3), look: V(-1.2, 0.9, -2.6), fov: 62 });
await shot('hq-overview');
// environment-only draw calls
ctx.cast.showOnly([]);
const r = ctx.engine.renderer; r.info.autoReset = false; r.info.reset(); r.render(ctx.engine.scene, ctx.engine.camera);
const envCalls = r.info.render.calls, envTris = r.info.render.triangles; r.info.autoReset = true;
let meshes = 0; ctx.world.classroom.group.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine) meshes++; });
return { envCalls, envTris, meshes, mem: r.info.memory, errors: qs.errors };
