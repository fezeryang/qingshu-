// Voice budget check: logs every teacher/student bubble with its voiced flag.
//   node tools/shot.mjs --script dev/ai/voice.js --out dev/ai/shots
qs.manual(true);
const ctx = qs.ctx, log = [];
const orig = ctx.ui.bubble.bind(ctx.ui);
ctx.ui.bubble = (id, text, o = {}) => { log.push({ t: +ctx.time.now.toFixed(2), ph: ctx.flow.phase, id, text, voiced: !!o.voiced }); return orig(id, text, o); };
await qs.start({ seed: 21, playerGender: 'm', skipIntro: true });
await qs.advance(40);
qs.forceTeacher('writing', 5);
await qs.advance(0.2);
await qs.throwAt('crush');
await qs.advance(0.2);
ctx.ai.students.trigger('teacherTurn');
await qs.advanceUntil(() => ctx.flow.phase !== 'flight', 8);
const voicedT = log.filter((l) => l.voiced && l.id === ctx.cast.teacher.id).map((l) => l.t);
const gaps = voicedT.slice(1).map((t, i) => +(t - voicedT[i]).toFixed(2));
return { total: log.length, voiced: log.filter((l) => l.voiced).length, minGap: Math.min(...gaps), flightVoiced: log.filter((l) => l.ph === 'flight' && l.voiced), log: log.map((l) => `${l.t} ${l.ph} ${l.id} ${l.voiced ? 'V' : '-'} ${l.text}`), errors: qs.errors };
