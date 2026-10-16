// Headless cue log check (default ?mute=1, AudioContext never unlocked): debug.recent must still record.
qs.manual(true);
const A = qs.ctx.audio;
const musicByPhase = {};
qs.ctx.bus.on('phase', ({ to }) => { setTimeout(() => { musicByPhase[to] = musicByPhase[to] || []; }, 0); });
await qs.start({ seed: 5, playerGender: 'm', skipIntro: true });
await qs.advance(0.2); musicByPhase.aim = A.debug.music;
qs.forceTeacher('warning', 0.8); await qs.advance(1);
qs.forceTeacher('writing', 30);
qs.ctx.input.simulate({ down: 'Mouse0' }); await qs.advance(0.8);
qs.ctx.input.simulate({ up: 'Mouse0' }); await qs.advance(0.3);
musicByPhase.flight = A.debug.music;
const id = await qs.runToEnding(90);
musicByPhase.card = A.debug.music;
const h = A.loop('murmur', { volume: 0.1 }); h.set({ volume: 0.3, rate: 1.1 }); h.stop(0.2);
A.sfx('nope'); A.music('nope'); A.blip({ pitch: 1.3 }, '好');
let done = false; const t0 = qs.ctx.time.uiNow;
A.speak('喂，你在干什么？').then(() => (done = true));
await qs.advanceUntil(() => done, 20);
return { id, musicByPhase, state: A.debug.state, speak: { done, ui: +(qs.ctx.time.uiNow - t0).toFixed(2) },
  recent: A.debug.recent.map((r) => `${r.kind}:${r.name}${r.auto ? '*' : ''}`).join(' '), errors: qs.errors };
