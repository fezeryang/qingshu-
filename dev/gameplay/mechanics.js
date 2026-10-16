// Input mechanics check:  node tools/shot.mjs --script dev/gameplay/mechanics.js --out dev/gameplay/shots
qs.manual(true);
const ctx = qs.ctx, g = ctx.gameplay, inp = ctx.input;
const out = {};
const evs = (from, types) => qs.events.slice(from).filter((e) => types.includes(e.type)).map((e) => e.type + (e.payload?.on !== undefined ? ':' + e.payload.on : '') + (e.payload?.tag ? ':' + e.payload.tag : ''));

// 1) charge → study cancels → can't charge while studying → release study → charge → throw
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true });
qs.forceTeacher('writing', 999);
let mark = qs.events.length;
inp.simulate({ down: 'Mouse0' }); await qs.advance(0.4);
out.powerAt04 = +g.aim.power.toFixed(3);
inp.simulate({ down: 'Mouse2' }); await qs.advance(0.1);
out.afterStudy = { charging: g.aim.charging, studying: g.aim.studying };
inp.simulate({ up: 'Mouse0' }); await qs.advance(0.05);
inp.simulate({ down: 'Mouse0' }); await qs.advance(0.1);
out.pressWhileStudying = g.aim.charging;
inp.simulate({ up: 'Mouse0' }); inp.simulate({ up: 'Mouse2' }); await qs.advance(0.1);
inp.simulate({ down: 'Mouse0' }); await qs.advance(1.1);
out.powerAt11 = +g.aim.power.toFixed(3);
const jitter = [];
for (let i = 0; i < 12; i++) { await qs.advance(0.1); jitter.push(+g.aim.power.toFixed(3)); }
out.fullChargeJitter = [Math.min(...jitter), Math.max(...jitter)];
inp.simulate({ up: 'Mouse0' }); await qs.advance(0.05);
out.thrown = g.ball.state;
await qs.advanceUntil(() => g.ball.state !== 'flying', 10);
out.events1 = evs(mark, ['aim:charge', 'aim:cancel', 'aim:study', 'ball:launched', 'ball:apex', 'ball:hit', 'ball:nearMiss', 'ball:landed']);
await qs.runToEnding(120);

// 2) hold breath + D: landing shift vs. the same throw without
async function throwWith(keys) {
  await qs.start({ seed: 4, playerGender: 'm', skipIntro: true });
  qs.forceTeacher('writing', 999);
  ctx.ai?.students?.setAmbient?.(false);
  const sol = g.solveLaunch(qs.target('r1c3'));
  const m = qs.events.length;
  g.launch(sol);
  await qs.advance(0.3);
  for (const k of keys) inp.simulate({ down: k });
  let maxScale = 1, minScale = 1;
  for (let i = 0; i < 1500 && g.ball.state === 'flying'; i++) { await qs.advance(1 / 60); minScale = Math.min(minScale, ctx.engine.timeScale); }
  for (const k of keys) inp.simulate({ up: k });
  await qs.advance(0.1);
  const L = g.ball.landing;
  const r = { pos: L.pos.toArray().map((v) => +v.toFixed(2)), type: L.type, seat: L.seatId, willpowerLeft: +g.willpower.value.toFixed(2), minTimeScale: +minScale.toFixed(2), events: evs(m, ['ball:willpower']) };
  await qs.runToEnding(120);
  return r;
}
out.noBreath = await throwWith([]);
out.breathD = await throwWith(['Space', 'KeyD']);
out.breathA = await throwWith(['Space', 'KeyA']);
out.shiftD = +Math.hypot(out.breathD.pos[0] - out.noBreath.pos[0], out.breathD.pos[2] - out.noBreath.pos[2]).toFixed(2);

// 3) intercept by a classmate mid-flight
await qs.start({ seed: 5, playerGender: 'm', skipIntro: true });
qs.forceTeacher('writing', 999);
const sol = g.solveLaunch(qs.target('r2c2'));
g.launch(sol);
await qs.advance(0.6);
const catcher = ctx.cast.occupant('r2c2');
g.intercept(catcher);
await qs.advance(0.3);
out.intercept = { landing: g.ball.landing.type, ownerId: g.ball.landing.ownerId, seatId: g.ball.landing.seatId, catcher, ending: await qs.runToEnding(120) };

// 4) scriptedThrow resolves
const m2 = ctx.characters.createProp('replyNote');
const t0 = ctx.time.now;
const p = g.scriptedThrow({ mesh: m2, from: new ctx.THREE.Vector3(0, 1, 0), to: new ctx.THREE.Vector3(1, 1, -1), height: 0.5, duration: 0.6 });
let done = false; p.then(() => { done = true; });
await qs.advance(0.7);
out.scripted = { done, at: m2.position.toArray().map((v) => +v.toFixed(2)), dt: +(ctx.time.now - t0).toFixed(2) };
m2.removeFromParent();
out.predictLen = g.predict({ yaw: 0, pitch: 0.6, power: 0.5 }, 1).length;
out.errors = qs.errors.slice(0, 5);
return out;
