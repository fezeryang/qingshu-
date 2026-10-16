// Seated class: player's view, side view of a row (chair/desk clipping), back-row close-up.
qs.manual(true);
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true });
const ctx = qs.ctx, T = ctx.THREE, L = ctx.layout;
qs.forceTeacher('writing', 60);
await qs.advance(1.0);
await shot('class_player');
qs.ctx.gameplay?.arms && (qs.ctx.gameplay.arms.group.visible = false);
const s = L.SEAT_BY_ID.r2c2;
ctx.cam.cut({ pos: new T.Vector3(s.x - 1.6, 1.0, s.chairZ - 0.2), look: new T.Vector3(s.x, 0.7, s.chairZ - 0.2), fov: 50 });
await shot('class_side');
ctx.cam.cut({ pos: new T.Vector3(0.0, 1.5, -4.2), look: new T.Vector3(0, 0.9, 0), fov: 55 });
await shot('class_front');
ctx.cam.cut({ pos: new T.Vector3(s.x + 0.9, 1.3, s.deskZ - 0.9), look: new T.Vector3(s.x, 0.85, s.chairZ), fov: 45 });
await shot('class_close');
const ch = ctx.cast.students()[0];
const head = ch.headWorld(new T.Vector3());
return { head: head.toArray().map((v) => +v.toFixed(3)), colliders: ch.getColliders().map((c) => c.kind + ':' + c.tag), state: qs.state().drawCalls, errors: qs.errors.slice(0, 5) };
