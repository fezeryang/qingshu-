// Probe: camera vs avatar during self_love
qs.manual(true);
await qs.start({ seed: 11, playerGender: 'm', crushId: 'su_nian', skipIntro: true });
qs.forceTeacher('writing', 999);
await qs.throwAt('self');
await qs.advanceUntil(() => qs.ctx.flow.phase === 'ending', 30);
const log = [];
const cam = qs.ctx.engine.camera;
const me = qs.ctx.cast.get('player_m');
const T = qs.ctx.THREE;
const snap = (tag) => { const f = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); const h = new T.Vector3(); me.headWorld(h); log.push({ tag, beat: qs.ctx.story.debug.beat, cam: cam.position.toArray().map((v) => +v.toFixed(2)), fwd: f.toArray().map((v) => +v.toFixed(2)), head: h.toArray().map((v) => +v.toFixed(2)), vis: me.root.visible, root: me.root.position.toArray().map((v) => +v.toFixed(2)), mode: qs.ctx.cam.mode }); };
for (let i = 0; i < 14; i++) { await qs.advance(1); snap('t' + i); }
await shot('self_probe');
return log;
