// Classroom-only speech regression. Run with --query "lowfx=1" (audio enabled).
qs.manual(true);
const ctx = qs.ctx, A = ctx.audio;
const results = [];
const check = (name, ok, data = {}) => {
  results.push({ name, pass: !!ok, ...data });
  if (!ok) throw new Error(`${name}: ${JSON.stringify(data)}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function real(seconds) {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++) {
    await qs.advance(0.05);
    await sleep(50);
  }
}
await qs.start({ seed: 21, playerGender: 'm', skipIntro: true });
ctx.ai.teacher.setEnabled(false);
ctx.ai.students.setAmbient(false);
A.unlock();
A.music(null, { fade: 0.01 });
await real(1.5);
check('voice manifest loaded', A.debug.speech.clips.manifestLines >= 368, A.debug.speech.clips);
check('real chatter decoded', A.debug.speech.chatterBuffers >= 8, { buffers: A.debug.speech.chatterBuffers });

let done = false;
const before = A.debug.speech.clips.hits;
const line = A.voiceLine('最后一排那个同学……', null, { charId: 'teacher' });
line.then(() => { done = true; });
let peak = -120;
for (let i = 0; i < 160 && !done; i++) {
  await real(0.05);
  peak = Math.max(peak, A.debug.meter()?.peakDb ?? -120);
}
check('teacher clip plays and resolves', done && A.debug.speech.clips.hits > before && peak > -60, { peak, done, state: A.debug.state, gain: A.debug.gain, masterGain: A.debug.masterGain, clock: A.debug.clock, speech: A.debug.speech });

let cancelled = false;
A.voiceLine('最后一排那个同学……', null, { charId: 'teacher' }).then(() => { cancelled = true; });
await real(0.15);
ctx.flow.setPhase('ending');
await qs.advance(0.05);
check('ending cancels classroom speech', cancelled && A.debug.speech.activeJobs === 0);
const blips = A.debug.blips, hits = A.debug.speech.clips.hits;
let silent = false;
A.voiceLine('最后一排那个同学……', null, { charId: 'teacher' }).then(() => { silent = true; });
A.blip({ pitch: 1 }, '好');
await qs.advance(0.05);
check('ending dialogue has no speech or blips', silent && A.debug.blips === blips && A.debug.speech.clips.hits === hits);

ctx.flow.setPhase('intro');
ctx.bus.emit('bell', {});
await real(0.7);
check('intro ritual starts', A.debug.speech.ritualActive);
ctx.flow.setPhase('aim');
ctx.ai.teacher.setEnabled(false);
await real(0.1);
check('skipping intro stops ritual', !A.debug.speech.ritualActive);

// A second intro must not inherit a cancelled first intro's pending clips.
ctx.flow.setPhase('intro');
ctx.bus.emit('bell', {});
await real(0.1);
A.stopVoice();
await real(0.15);
check('stopVoice cancels ritual', !A.debug.speech.ritualActive && A.debug.speech.activeJobs === 0);

ctx.flow.setPhase('aim');
ctx.ai.teacher.setEnabled(false);
let off = false;
A.voiceLine('最后一排那个同学……', null, { charId: 'teacher' }).then(() => { off = true; });
await real(0.15);
ctx.settings.voiceMode = 'off';
await real(0.1);
check('voice setting stops active line', off && A.debug.speech.activeJobs === 0);
ctx.settings.voiceMode = 'speech';

ctx.ai.students.setAmbient(true);
await real(0.5);
check('classroom chatter loop starts', A.debug.loops.includes('murmur'));
ctx.ai.students.setAmbient(false);
await real(0.7);
check('quiet class stops chatter', !A.debug.loops.includes('murmur'));
ctx.ai.students.setAmbient(true);
await real(0.5);
check('classroom chatter restarts', A.debug.loops.includes('murmur'));

ctx.settings.masterVolume = 0;
A.applySettings(ctx.settings);
await real(0.8);
const meter = A.debug.meter();
check('master mute is silent', meter.peakDb <= -100, { ...meter, gain: A.debug.gain, state: A.debug.state, player: A.debug.player, masterGain: A.debug.masterGain, clock: A.debug.clock });
check('no runtime errors', qs.errors.length === 0, { errors: qs.errors });
return { results, speech: A.debug.speech };
