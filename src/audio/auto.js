// Automatic score and sound effects driven by bus events and per-frame state (nobody has to call
// these). Cues are deferred by one frame and skipped if another module played the same sound
// itself meanwhile, so hand-placed cutscene cues never double up with the automatic ones.
import { clamp } from './dsp.js';

const ACTIVE = new Set(['intro', 'aim', 'flight']);
const STATE_TENSION = { warning: 0.7, watching: 0.4, suspicious: 0.75, alert: 0.9, patrol: 0.55, fakeout: 0.5, drinking: 0.15, idle: 0.1, writing: 0 };
/** fallback ending music if story never picks a track */
export const ENDING_TRACK = {
  perfect: 'romance', same_gender: 'romance', wrong_accept: 'comedy', wrong_caught: 'tragedy', caught_read: 'shame',
  chalk_counter: 'comedy', graded: 'comedy', three_pointer: 'sports', out_window: 'broadcast', confetti: 'romance',
  self_love: 'mystery', lost: 'lonely', coward: 'lonely',
};
const HIT = {
  desk: 'thudDesk', chair: 'thudDesk', book: 'thudDesk', podium: 'thudDesk', teacherDesk: 'thudDesk', door: 'thudDesk',
  wall: 'thudDesk', blackboard: 'thudDesk', windowFrame: 'thudDesk', prop: 'bounceSoft', floor: 'bounceSoft', ceiling: 'bounceSoft',
  head: 'thudHead', teacher: 'thudHead', body: 'bounceSoft', windowGlass: 'ding', trashRim: 'ding', fan: 'pop',
};

export function installAuto(ctx, A) {
  const { bus, time } = ctx;
  const S = { phase: 'boot', susp: 0, kick: 0, slow: false, slowAt: -9, hitAt: {}, tension: 0 };
  const phase = () => ctx.flow?.phase ?? S.phase;
  const teacherPos = (head) => {
    const ch = ctx.ai?.teacher?.character || ctx.cast?.teacher;
    if (!ch?.root) return null;
    if (head && ch.headWorld) { try { return ch.headWorld(new ctx.THREE.Vector3()); } catch { /* fall through */ } }
    return ch.root.position.clone().setY(1.2);
  };
  const charPos = (id) => { const ch = id && ctx.cast?.get?.(id); return ch?.root ? ch.root.position.clone().setY(1.1) : null; };

  bus.on('phase', ({ to, endingId }) => {
    S.phase = to;
    if (to === 'title') A.autoMusic('title', 1.2);
    else if (to === 'letter') { if (A.music() !== 'title') A.autoMusic('title', 1.2); }
    else if (to === 'intro' || to === 'aim') A.autoMusic('classroom', to === 'aim' ? 1 : 1.5);
    else if (to === 'flight') A.autoMusic('flight', 0.35);
    else if (to === 'ending') {
      A.autoMusic(null, 0.8);
      A.autoMusic(ENDING_TRACK[endingId] || 'comedy', 1.5, 2.5);
    }
    if (to !== 'aim' && to !== 'flight') S.kick = 0;
  });
  bus.on('round:setup', () => { S.susp = 0; S.kick = 0; S.slow = false; S.inPlayed = false; S.tension = 0; A.resetRound(); });
  bus.on('ending:shown', () => A.finishMusic());
  bus.on('suspicion', ({ value }) => { S.susp = clamp(+value || 0, 0, 1); });
  bus.on('teacher:state', ({ state }) => {
    if (!ACTIVE.has(phase())) return;
    if (state === 'warning') { A.cue('stingDanger', { volume: 0.75 }); A.cue('hmm', { volume: 0.8, pos: teacherPos(true) }); S.kick = Math.max(S.kick, 0.75); }
    else if (state === 'fakeout') { A.cue('hmm', { volume: 0.6, pos: teacherPos(true), rate: 1.08 }); S.kick = Math.max(S.kick, 0.5); }
    else if (state === 'drinking') A.cue('sip', { volume: 0.6, pos: teacherPos(true) });
    else if (state === 'alert') A.cue('stingDanger', { volume: 0.9 });
  });
  bus.on('teacher:caught', ({ reason }) => {
    if (reason === 'aim') { A.cue('recordScratch', { volume: 0.9 }); A.autoMusic(null, 0.2); }
    else A.cue('stingDanger', { volume: 0.9 });
  });
  bus.on('aim:study', ({ on }) => { if (on) A.cue('pageFlip', { volume: 0.45 }); });
  bus.on('ball:launched', ({ power = 0.6 }) => A.cue('whoosh', { rate: 0.85 + 0.4 * power, volume: 0.55 + 0.45 * power }));
  bus.on('ball:hit', ({ tag, speed = 2, pos }) => {
    const name = HIT[tag] || 'bounceSoft';
    const now = time.uiNow;
    if (now - (S.hitAt[name] ?? -9) < 0.07) return;
    S.hitAt[name] = now;
    A.cue(name, { volume: clamp(speed / 5, 0.15, 1), pos, rate: name === 'ding' ? (tag === 'trashRim' ? 0.55 : 1.6) : 1 }, true);
  });
  bus.on('ball:nearMiss', ({ pos }) => A.cue('swoosh', { volume: 0.55, pos, rate: 1.1 }));
  bus.on('ball:willpower', ({ on }) => { if (on) A.cue('gasp', { volume: 0.3, rate: 1.15 }); });
  bus.on('ball:landed', ({ type, pos }) => {
    if (type === 'trash') A.cue('swish', { volume: 0.9, pos });
    else if (type === 'fan') A.cue('shatter', { volume: 0.9, pos });
    else if (type === 'outside') { A.cue('whoosh', { rate: 0.7, volume: 0.8, fadeOut: 1.0 }); A.cue('windGust', { volume: 0.35 }); }
    else if (type === 'intercept') A.cue('pop', { volume: 0.8, pos });
  });
  bus.on('incident', ({ kind, pos }) => { if (kind === 'wind') A.cue('windGust', { volume: 0.55, pos }); });
  bus.on('student:event', ({ kind, id }) => {
    if (!ACTIVE.has(phase())) return;
    const pos = charPos(id);
    if (kind === 'sneeze') A.cue('sneeze', { volume: 0.8, pos });
    else if (kind === 'standUp') A.cue('chairScrape', { volume: 0.6, pos });
    else if (kind === 'turnAround') A.cue('chairScrape', { volume: 0.3, pos, rate: 1.2 });
    else if (kind === 'witness') A.cue('gasp', { volume: 0.4, pos });
  });
  bus.on('bell', () => A.cue('bell', { volume: 0.9 }));
  bus.on('round:timeout', () => { S.kick = 0; });
  bus.on('say', ({ text }) => A.duck(0.22, Math.min(6, 0.8 + String(text || '').length * 0.06)));

  /** per frame: tension, slow motion, declarative ambience beds */
  function update(uiDt) {
    const ph = phase();
    const T = ctx.ai?.teacher;
    const aim = ctx.gameplay?.aim;
    // --- tension
    S.kick = Math.max(0, S.kick - uiDt * 0.25);
    let auto = 0;
    if (ph === 'aim' || ph === 'flight') {
      const st = STATE_TENSION[T?.state] ?? 0;
      const charge = aim?.charging ? 0.2 + 0.35 * clamp(aim.power || 0, 0, 1) : 0;
      auto = clamp(Math.max(S.susp, st * 0.85, S.kick) + charge, 0, 1);
    }
    const target = Math.max(A.manualTension(), auto);
    S.tension += (target - S.tension) * (1 - Math.exp(-(target > S.tension ? 4 : 1.2) * uiDt));
    A.applyTension(S.tension);

    // --- slow motion (bullet time) — flight only
    const ts = ctx.engine.timeScale;
    const flight = ph === 'flight';
    if (flight && !S.slow && ts < 0.75) {
      S.slow = true;
      if (!S.inPlayed && time.uiNow - S.slowAt > 0.4) { A.cue('slowmoIn', { volume: 0.55 }); S.inPlayed = true; }
      S.slowAt = time.uiNow;
    } else if (S.slow && (ts > 0.9 || !flight)) {
      S.slow = false;
      if (S.inPlayed && flight && time.uiNow - S.slowAt > 0.25) A.cue('slowmoOut', { volume: 0.5 });
      S.inPlayed = false; S.slowAt = time.uiNow;
    }
    A.applySlow(S.slow ? clamp(ts, 0.05, 1) : 1);

    // --- beds
    const want = {};
    const stage = ctx.stage?.current;
    const room = ctx.world?.classroom;
    if (stage === 'classroom' && ACTIVE.has(ph) && T) {
      if (T.state === 'writing') want.chalk = { name: 'chalkScratch', volume: ph === 'flight' ? 0.25 : 0.4, pos: teacherPos(true) };
      if (T.state === 'patrol') want.steps = { name: 'footstep', volume: 0.55, pos: teacherPos(false) };
      if (room?.fans?.some?.((f) => f.spinning)) want.fan = { name: 'fanHum', volume: 0.14 };
    }
    if (ph === 'aim' && aim?.charging) {
      const p = clamp(aim.power || 0, 0, 1);
      want.heart = { name: 'heartbeat', volume: 0.35 + 0.5 * p, rate: 1 + 1.3 * p };
    }
    if (ph !== 'title' && ph !== 'boot') {
      const mood = room?.mood;
      if (stage === 'classroom' && mood === 'rain') want.amb = { name: 'rain', volume: 0.35 };
      else if (stage === 'classroom' && mood === 'night') want.amb = { name: 'crickets', volume: 0.3 };
      else if (stage === 'office') want.amb = { name: 'rain', volume: 0.45 };
      else if (stage === 'rooftop') want.amb = { name: 'birds', volume: 0.18 };
      else if (stage === 'cherryPath' || stage === 'schoolyard') want.amb = { name: 'birds', volume: 0.3 };
      else if (stage === 'court' || stage === 'canteen') want.amb = { name: 'murmur', volume: 0.3 };
    }
    A.beds(want);
  }
  return { update, state: S };
}

