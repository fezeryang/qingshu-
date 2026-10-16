// Classroom preview: player view, overview, board, window, fans, colliders, moods. (≤ 10 shots)
qs.manual(true);
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true });
const ctx = qs.ctx, T = ctx.THREE, cam = ctx.cam, room = ctx.world.classroom, V = (x, y, z) => new T.Vector3(x, y, z);
room.blackboard.write('第三章  二次函数\n[[yellow]]y = ax² + bx + c[[white]]   (a ≠ 0)\n');
room.blackboard.append('例1：已知 f(x) = x² − 2x + 3，求 f(x) 的最小值。\n解：f(x) = (x − 1)² + 2  ∴ [[red]]最小值为 2');
await qs.advance(1.0);
await shot('01-player');
cam.cut({ pos: V(4.2, 2.7, 4.3), look: V(-1.2, 0.9, -2.6), fov: 62 });
await shot('02-overview');
await qs.advance(4);
cam.cut({ pos: V(0, 1.55, -3.0), look: V(0, 1.75, -6), fov: 50 });
await shot('03-board');
room.gust(1, 3);
await qs.advance(0.8);
cam.cut({ pos: V(-2.6, 1.5, 1.4), look: V(-5, 1.6, -0.9), fov: 55 });
await shot('04-window-gust');
cam.cut({ pos: V(0.6, 1.4, 3.0), look: V(-1.2, 2.6, -1.5), fov: 60 });
await shot('05-fans');
ctx.world.showColliders(true);
cam.cut({ pos: V(3.6, 3.1, 3.6), look: V(-0.5, 0.5, -2.0), fov: 62 });
await shot('06-colliders');
ctx.world.showColliders(false);
for (const m of ['sunset', 'night', 'rain']) {
  room.setMood(m);
  await qs.advance(0.2);
  cam.cut({ pos: V(3.9, 2.0, 4.1), look: V(-2.0, 1.2, -2.0), fov: 62 });
  await shot(`07-mood-${m}`);
}
room.setMood('day');
return { state: qs.state(), errors: qs.errors, colliders: room.colliders.length, wind: room.wind.strength };
