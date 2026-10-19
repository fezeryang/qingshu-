// three_pointer — 隐藏 · 三分球. Swish into the bin, commentator, standing ovation, the PE teacher
// bursts in to recruit you → the basketball court.
import { begin, settleClass, front, finalHold, cutaway } from './common.js';
import { V } from '../direct.js';
import { TRASH, DOORS } from '../../core/layout.js';

const CAST = { pitch: 0.9, speed: 1.2 };

export default async function threePointer(d) {
  const t = d.teacher;
  const me = d.seatPlayer();
  const crush = d.crush;
  begin(d, { music: null });
  settleClass(d, { teacher: 'class' });

  // 1 — swish (replay angle on the bin)
  d.beat('react');
  d.cut({ pos: V(TRASH.x - 0.95, 0.75, TRASH.z + 0.95), look: V(TRASH.x, 0.3, TRASH.z), fov: 40 });
  d.sfx('swish');
  d.slowMo(0.4, 1);
  await d.wait(0.5);
  d.music('sports');
  d.sfx('buzzer');
  await d.say('解说', '进了！空心入网！', { voice: CAST, mood: 'shout' });
  d.bg(d.caption('三 分 球 ！', 'impact', 2));
  d.sfx('cheer');

  // 2 — standing ovation
  d.crowd(async (ch) => { await d.standUp(ch); d.anim(ch, d.pick(['cheer', 'clap']), { loop: true }); d.expr(ch, 'happy'); }, { stagger: 0.5 });
  d.cut({ pos: V(0.4, 2.1, -4.3), look: V(-0.8, 1.1, 1.6), fov: 56 });
  d.expr(t, 'shock');
  d.emote(t, '!', 1.2);
  const jock = d.byTrait('jock')[0];
  await d.say(jock || '同学们', d.pick(['这弧线……是天才！', '空心入网！连框都没碰！']), { mood: 'shout' });
  await cutaway(d, t, { expr: 'shock', emote: '!', hold: 0.3 });
  await d.say(t, d.pick(['……这……这是在上课！', '……投得还挺准。']), { expr: 'sweat' });
  if (crush) await cutaway(d, crush, { line: '好帅……', clip: 'clap', expr: 'blush', emote: 'heart', look: me, hold: 0.9 });

  // 3 — the PE teacher bursts in
  const pe = d.npc('pe');
  const door = DOORS[0];
  d.place(pe, V(door.x - 0.4, 0, door.z + 0.5), { yaw: Math.PI / 2 });
  d.sfx('doorSlam');
  d.shake(0.3, 0.3);
  d.cut({ pos: V(2.4, 1.55, -2.6), look: d.headPos(pe), fov: 44 });
  d.look(pe, V(0, 1.1, 0.5));
  d.anim(pe, 'point');
  await d.say(pe, '刚才那一球，是谁投的？！', { emote: '!', mood: 'shout' });
  d.crowd((ch) => { d.look(ch, me); d.anim(ch, 'point'); }, { stagger: 0.3 });
  d.bg(d.walk(pe, V(2.2, 0, -2.6), { speed: 1.6 }));
  await front(d, me, { angle: -0.35, dist: 1.45, fov: 40 });
  d.expr(me, 'shock');
  d.emote(me, '?', 1.2);
  await d.say(pe, d.pick(['同学！校篮球队，就缺你这样的人才！', '你的抛物线……我找了整整十年！']), { mood: 'shout' });

  // 4 — the court
  await d.fade(1, 0.35, '#ffffff');
  const set = d.stage('court');
  const fans = [crush, ...d.students().filter((c) => c !== crush).slice(0, 5)].filter(Boolean);
  d.showOnly([me, pe, ...fans]);
  d.place(me, d.anchor(set, 'player', V(0, 0, 5)));
  d.place(pe, d.anchor(set, 'coach', V(2.6, 0, 6)));
  fans.forEach((c, i) => {
    const a = d.anchor(set, `crowd${i}`, V(-4, 0.4, i - 3), -Math.PI / 2);
    d.place(c, a);
    d.try('reset', () => c.reset?.());
    d.posture(c, 'stand');
    d.anim(c, i % 2 ? 'clap' : 'cheer', { loop: true });
    d.expr(c, 'happy');
  });
  d.hold(me, d.prop('basketball'));
  d.expr(me, 'determined');
  d.look(pe, me);
  await d.camAt(d.anchor(set, 'camWide'), { fov: 50 });
  await d.fade(0, 0.4, '#ffffff');
  d.bg(d.caption('一个月后 · 全国大赛', 'chapter', 2.2));
  d.sfx('cheer');
  await d.wait(1);

  // 5 — the shot
  d.beat('climax');
  const ball = d.prop('basketball', 'basketballShot');
  const hoop = d.anchor(set, 'hoop', V(0, 3.05, 0));
  d.hold(me, null);
  d.anim(me, 'throw');
  await d.wait(0.3);
  d.sfx('whoosh');
  d.slowMo(0.5, 1.2);
  d.bg(d.track(ball, { offset: V(1.2, 0.4, 1.4), dur: 1.4 }));
  await d.throwProp(ball, d.handPos(me), hoop.pos.clone().add(V(0, 0.05, 0)), { height: 2.2, duration: 1.4 });
  d.sfx('swish');
  d.sfx('buzzer');
  d.sfx('cheer');
  d.hideProp(ball);
  await d.say('解说', d.pick(['一封情书的弧线，成就了一位传奇射手！', '没送出去的情书，变成了全国大赛的绝杀！']), { voice: CAST, mood: 'shout' });
  d.expr(pe, 'cry');
  d.emote(pe, 'sparkle', 2);
  await d.say(pe, '好苗子……好苗子啊！', { mood: 'sad' });
  if (crush) { d.emote(crush, 'heart', 2); d.bubble(crush, '加油——！', 1.6); }

  // final: hero low angle
  d.anim(me, 'cheer');
  d.expr(me, 'happy');
  d.emote(me, 'sparkle', 2.5);
  await front(d, me, { angle: 0.35, dist: 2.0, height: -0.55, fov: 42, dur: 1.2 });
  await finalHold(d, 1.6);
}
