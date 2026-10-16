// same_gender — 误投 · 认真的回应. A same-gender classmate reads it with total sincerity, stands up and
// says "……我愿意。" Warm absurdist comedy: the joke is the mix-up and their earnestness, never mockery.
import { begin, settleClass, front, pickUpAndRead, recipient, expressionRamp, traitLine, backToClassroom, finalHold } from './common.js';
import { V } from '../direct.js';

const YES = {
  nerd: '我验算了三遍。……我愿意。',
  jock: '好！我愿意！',
  chuuni: '这份契约，我接下了。……我愿意。',
  shy: '……我、我愿意。',
  clown: '（突然严肃）……我愿意。',
  foodie: '……我愿意。以后我的鸡腿，分你一半。',
  sleeper: '（醒了）……我愿意。',
  gamer: '组队邀请……已接受。我愿意。',
  gossip: '这次的头条……就是我们了。我愿意。',
  artsy: '这是我读过最美的一封信。……我愿意。',
  monitor: '作为班长，我郑重地回答你：我愿意。',
  disciplinarian: '本来要记你一笔的。……但是，我愿意。',
};
const AFTER = ['以后请多关照。', '放学，一起走吧。', '我会对你负责的。'];

export default async function sameGender(d) {
  const rec = recipient(d);
  const crush = d.crush;
  const me = d.seatPlayer();
  const t = d.teacher;
  const letter = d.round.letter?.text || '……';
  begin(d, { music: null });
  settleClass(d, { except: [rec], teacher: 'board' });

  // 1 — they read it. Carefully. Every word.
  d.beat('react');
  await front(d, rec, { angle: 0.4, dist: 1.5, fov: 38 });
  await pickUpAndRead(d, rec);
  d.bg(front(d, rec, { angle: 0.2, dist: 1.1, fov: 32, dur: 5 }));
  expressionRamp(d, rec, [[0, 'shock'], [2, 'neutral'], [3.6, 'determined']]);
  await d.reveal(letter, { mode: 'read' });

  // 2 — a long look back at you
  d.look(rec, me);
  d.sfx('clockTick');
  await d.overShoulder(me, rec, { dur: 0 });
  d.expr(me, 'sweat');
  await d.wait(1.4);

  // 3 — the solemn answer
  d.sfx('chairScrape');
  await d.standUp(rec);
  d.hold(rec, null);
  await d.face(rec, me, 0.5);
  d.look(rec, me);
  d.expr(rec, 'determined');
  d.beat('climax');
  await front(d, rec, { angle: 1.05, dist: 1.6, height: -0.15, fov: 44, dur: 0.6 });
  await d.say(rec, '……', { mood: 'shy' });
  d.expr(rec, 'blush');
  d.emote(rec, 'blush', 1.6);
  await d.say(rec, traitLine(d, rec, YES, ['……我愿意。']), { mood: 'love' });

  // 4 — silence… then the class explodes
  d.sfx('crickets');
  d.crowd((ch) => { d.look(ch, rec); d.expr(ch, 'shock'); }, { exclude: [rec], stagger: 0.15 });
  d.cut({ pos: V(0.4, 2.1, -4.3), look: V(-1.2, 1.0, 1.6), fov: 56 });
  await d.wait(1.1);
  d.music('romance');
  d.sfx('cheer');
  d.sfx('clapCrowd');
  d.crowd((ch) => { d.anim(ch, d.pick(['cheer', 'clap']), { loop: true }); d.expr(ch, 'happy'); }, { exclude: [rec, crush], stagger: 0.4 });
  d.bg(d.caption('全 班 沸 腾', 'impact', 1.9));
  await d.wait(0.6);
  if (crush) {
    d.expr(crush, 'shock');
    d.emote(crush, 'dots', 1.8);
    await d.closeUp(crush, { side: 'left', dist: 1.2, fov: 34, dur: 0 });
    await d.say(crush, d.pick(['……诶？', '……诶？？我呢？']));
  }
  await front(d, me, { angle: -0.3, dist: 1.4, fov: 38 });
  d.expr(me, 'shock');
  d.emote(me, 'sweat', 1.6);
  await d.say(me, d.pick(['等、等一下，我其实是想——', '不是，那封信其实……']), { mood: 'shout' });
  d.anim(rec, 'blushShy');
  d.emote(rec, 'hearts', 2);
  await d.say(rec, d.pick(AFTER), { mood: 'love', expr: 'smile' });

  // 5 — montage: cherry blossom path
  await d.iris('out', 0.7);
  const path = d.stage('cherryPath');
  d.showOnly([me, rec]);
  const bench = d.anchor(path, 'bench', V(2, 0, -1), Math.PI / 2);
  d.place(me, d.anchor(path, 'left', V(-0.5, 0, 0)).pos.clone().add(V(-1.6, 0, 0.8)), { yaw: 0 });
  d.place(rec, d.anchor(path, 'right', V(0.5, 0, 0)).pos.clone().add(V(-1.6, 0, 0.8)), { yaw: 0 });
  d.expr(me, 'sweat');
  d.expr(rec, 'happy');
  await d.camAt(d.anchor(path, 'camTrackStart'), { fov: 45 });
  await d.iris('in', 0.6);
  d.bg(d.caption('后来——', 'chapter', 2));
  d.bg(d.camAt(d.anchor(path, 'camTrackEnd'), { fov: 45, dur: 3.2 }));
  d.bg(d.walk(me, bench.pos.clone().add(V(0, 0, 0.35)), { speed: 0.9 }));
  await d.walk(rec, bench.pos.clone().add(V(0, 0, -0.35)), { speed: 0.9, cap: 3.2 });
  d.emote(rec, 'heart', 1.6);
  d.expr(me, 'smile');

  // montage: the canteen — half a drumstick
  await d.fade(1, 0.3);
  const can = d.stage('canteen');
  d.showOnly([me, rec]);
  const table = d.anchor(can, 'tableA', V(0, 0, 0));
  const seats = table.seats || [{ pos: table.pos.clone().add(V(-0.45, 0, -0.62)), yaw: Math.PI }, { pos: table.pos.clone().add(V(-0.45, 0, 0.62)), yaw: 0 }];
  d.place(rec, seats[0], { posture: 'sit' });
  d.place(me, seats[2] || seats[1], { posture: 'sit' });
  d.hold(rec, d.prop('snack'));
  d.anim(rec, 'eat', { loop: true });
  await d.twoShot(me, rec, { dur: 0, fov: 40 });
  await d.fade(0, 0.3);
  await d.say(rec, '鸡腿，分你一半。', { expr: 'happy' });
  d.expr(me, 'happy');

  // montage: standing at the back of the class together (罚站)
  await d.fade(1, 0.3);
  backToClassroom(d, [me]);
  d.place(me, V(-0.5, 0, 4.1), { yaw: 0 });
  d.place(rec, V(0.1, 0, 4.1), { yaw: 0 });
  d.hold(rec, null);
  d.stop(t);
  d.teacherAtBoard('class');
  d.expr(t, 'angry');
  d.cut({ pos: V(-0.2, 1.5, 2.0), look: V(-0.2, 1.25, 4.1), fov: 46 });
  await d.fade(0, 0.3);
  d.bubble(t, '你们两个，站好！', 1.6);
  d.bg(d.caption('（一起被罚站）', 'whisper', 2));
  d.look(me, rec);
  d.look(rec, me);
  await d.wait(1.2);
  d.beat('final');
  d.anim(me, 'laugh');
  d.anim(rec, 'laugh');
  d.expr(me, 'happy');
  d.expr(rec, 'happy');
  d.bg(d.caption(d.pick(['……好像，也不错？', '青春，就是一场认真的误会。']), 'chapter', 2.6));
  await finalHold(d, 2.2);
}
