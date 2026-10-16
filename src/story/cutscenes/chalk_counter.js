// chalk_counter — 隐藏 · 粉笔头反击. You hit the teacher. He turns slowly, glasses glint, sniper chalk.
import { begin, settleClass, front, finalHold } from './common.js';
import { V } from '../direct.js';

export default async function chalkCounter(d) {
  const t = d.teacher;
  const me = d.seatPlayer();
  begin(d, { music: null });
  settleClass(d, { teacher: 'board' });
  d.stop(t);

  // 1 — the bonk, the silence
  d.beat('react');
  d.cut({ pos: V(-1.3, 1.55, -1.2), look: d.headPos(t), fov: 40 });
  d.sfx('thudHead');
  d.emote(t, 'anger', 1.6);
  d.crowd((ch) => { d.anim(ch, 'gasp'); d.expr(ch, 'shock'); d.look(ch, t); }, { stagger: 0.3 });
  d.sfx('gasp');
  await d.wait(0.9);

  // 2 — the slow turn
  d.anim(t, 'teacherTurn');
  d.bg(d.dutch(8, 1.4));
  await d.face(t, me.root.position, 1.6);
  d.dutch(0, 0.2);
  await d.closeUp(t, { side: 'front', dist: 1.0, fov: 28, dur: 0.4 });
  d.anim(t, 'teacherAdjustGlasses');
  d.expr(t, 'suspicious');
  await d.wait(0.4);
  d.emote(t, 'sparkle', 1.0);
  d.sfx('stingReveal');
  d.music('mystery');
  const pair = d.pick([
    ['我教了三十年书……', '还是头一回，被学生用情书偷袭。'],
    ['……谁的"暗器"？', '很好。现在轮到我了。'],
    ['这一下，力道不错。', '可惜——准头差了点。'],
  ]);
  await d.say(t, pair[0], { mood: 'angry' });
  await d.say(t, pair[1], { mood: 'angry', expr: 'smug' });

  // 3 — sniper chalk
  d.beat('climax');
  const chalk = d.prop('chalk');
  d.hold(t, chalk);
  d.look(t, me);
  d.anim(t, 'teacherThrowChalk');
  await d.wait(0.52); // the clip releases the chalk at 0.52 s
  d.hold(t, null);
  d.bg(d.caption('狙 击', 'impact', 1.4));
  d.sfx('whoosh');
  d.slowMo(0.3, 1.5);
  const from = d.handPos(t);
  const to = d.headPos(me).add(V(0, 0.06, -0.12));
  d.bg(d.track(chalk, { offset: V(0.35, 0.15, 0.45), dur: 0.95 }));
  await d.throwProp(chalk, from, to, { height: 0.25, duration: 0.95 });

  // 4 — impact
  d.flash('#ffffff', 0.35);
  d.shake(0.6, 0.5);
  d.sfx('thudHead');
  d.sfx('ding');
  d.hideProp(chalk);
  await front(d, me, { angle: -0.25, dist: 1.3, fov: 36 });
  d.expr(me, 'dizzy');
  d.emote(me, 'dots', 2);
  d.anim(me, 'shiver');
  d.music('comedy');
  await d.wait(1);

  // 5 — applause for the sniper
  d.sfx('clapCrowd');
  d.crowd((ch) => { d.anim(ch, 'clap'); d.expr(ch, 'happy'); d.look(ch, t); }, { stagger: 0.4 });
  const clown = d.byTrait('clown')[0];
  await d.say(clown || '同学们', d.pick(['好准！老师，再来一个！', '百发百中！不愧是王老师！']), { mood: 'shout' });
  await d.closeUp(t, { side: 'right', dist: 1.15, fov: 32, dur: 0.4 });
  d.expr(t, 'smug');
  d.anim(t, 'teacherLecture');
  await d.say(t, d.pick(['继续上课。', '这道题，我们再讲一遍。', '下次瞄准一点。']));
  d.bg(d.caption('命中率 100%', 'chapter', 2.2));
  await d.shot({ pos: V(0.2, 2.2, -3.9), look: V(-1.6, 0.9, 1.6), fov: 55, dur: 1.2 });
  await finalHold(d, 1.6);
}
