// Gameplay screenshots:  node tools/shot.mjs --script dev/gameplay/shots.js --out dev/gameplay/shots
// (add --query "lowfx=1&mute=1&debug=1" for collider wireframes)
qs.manual(true);
const ctx = qs.ctx, T = ctx.THREE, g = ctx.gameplay;
const info = {};
await qs.start({ seed: 7, playerGender: 'm', skipIntro: true });
qs.forceTeacher('writing', 999);
ctx.ai?.students?.setAmbient?.(false);
// look a bit right and up toward the class, then hold the mouse to charge
ctx.input.simulate({ nx: -0.25, ny: 0.35 });
await qs.advance(1.0);
await shot('1-aim');
ctx.input.simulate({ down: 'Mouse0' });
await qs.advance(0.75);
info.chargePower = +g.aim.power.toFixed(3);
info.dots = g.predict({ ...ctx.cam.fp, pitch: ctx.cam.fp.pitch + 10 * Math.PI / 180, power: g.aim.power }, 0.35).length;
await shot('2-charging-dots');
ctx.input.simulate({ up: 'Mouse0' });
await qs.advance(0.3);
info.afterRelease = { state: g.ball.state, pos: g.ball.pos.toArray().map((v) => +v.toFixed(2)), cam: ctx.cam.mode };
await shot('3-flight-follow');
// side view of the flight from a fixed camera
await qs.advanceUntil(() => g.ball.state !== 'flying', 10);
info.playerThrow = g.ball.landing && `${g.ball.landing.type}/${g.ball.landing.seatId}`;
await qs.runToEnding(120);

// deterministic lob onto the crush's desk: mid-flight wide shot + landing close-up
await qs.start({ seed: 7, playerGender: 'm', skipIntro: true });
qs.forceTeacher('writing', 999);
ctx.ai?.students?.setAmbient?.(false);
const sol = await qs.throwAt('crush');
await qs.advanceUntil(() => g.ball.t > sol.expect.flightTime * 0.45 || g.ball.state !== 'flying', 5);
const mid = g.ball.pos.clone();
ctx.cam.cut({ pos: new T.Vector3(mid.x + 2.6, 2.0, mid.z + 1.8), look: mid, fov: 55 });
await shot('4-flight-wide');
await qs.advanceUntil(() => g.ball.state !== 'flying', 10);
await qs.advance(0.05);
const p = g.ball.pos.clone();
info.crush = { seat: ctx.cast.seatOf(ctx.round.crushId), landing: `${g.ball.landing.type}/${g.ball.landing.seatId}`, bounces: g.ball.landing.bounces };
ctx.cam.cut({ pos: new T.Vector3(p.x + 0.35, p.y + 0.22, p.z - 0.45), look: p, fov: 40 });
await shot('5-landed-closeup');
info.errors = qs.errors.slice(0, 5);
return info;
