// coward — 怂 · 下课铃. The bell rings; the crush leaves laughing with someone else; the ball has gone
// soggy in your sweaty palm.
import { begin, settleClass, front, neighbour, EYE, finalHold } from './common.js';
import { V } from '../direct.js';
import { DOORS } from '../../core/layout.js';

export default async function coward(d) {
  const me = d.seatPlayer();
  const crush = d.crush;
  const t = d.teacher;
  const friend = neighbour(d, crush, { exclude: [me] });
  begin(d, { music: null });
  settleClass(d, { teacher: 'class' });

  // 1 — the bell, POV
  d.beat('react');
  me.root.visible = false;
  d.cut({ pos: EYE(), look: d.headPos(t), fov: 55 });
  // flow already emitted 'bell' (audio plays it); the ringing carries into this shot
  await d.say(t, d.pick(['好，下课。', '今天就到这里，下课。']));
  d.sfx('chairScrape');
  d.crowd((ch) => d.standUp(ch), { stagger: 0.6 });
  await d.wait(0.6);

  // 2 — the crush leaves with someone else, laughing
  const exit = V(DOORS[1].x - 0.7, 0, DOORS[1].z);
  if (crush && friend) {
    d.look(crush, friend);
    d.look(friend, crush);
    d.bubble(friend, d.pick(['放学去喝奶茶吗？', '走，去小卖部！', '周末一起去看电影吧？']), 1.6);
    await d.wait(0.6);
    d.anim(crush, 'laugh');
    d.expr(crush, 'happy');
    d.bubble(crush, d.pick(['好呀！', '走吧走吧！', '哈哈，好！']), 1.4);
  }
  d.bg(d.shot({ pos: EYE(), look: exit.clone().setY(1.2), fov: 45, dur: 3.4 }));
  d.bg(d.walk(friend, exit.clone().add(V(0, 0, -0.5)), { speed: 1.4 }));
  await d.walk(crush, exit, { speed: 1.4, cap: 3.4 });
  if (crush) crush.root.visible = false;
  if (friend) friend.root.visible = false;
  d.sfx('doorSlam', { volume: 0.4 });

  // 3 — the soggy letter
  d.beat('climax');
  d.showOnly([me]);
  me.root.visible = true;
  d.music('lonely');
  d.hold(me, d.prop('letterBall', 'soggyBall'));
  d.expr(me, 'sad');
  d.emote(me, 'sweat', 2.4);
  const hand = d.handPos(me);
  d.cut({ pos: hand.clone().add(V(0.25, 0.18, -0.35)), look: hand, fov: 34 });
  d.bg(d.caption('纸团……被手汗泡软了。', 'whisper', 2.4));
  await d.wait(2.2);
  d.shake(0.25, 0.4);
  d.bg(d.caption('怂', 'impact', 2));
  await d.wait(1);

  // 4 — alone in the sunset classroom
  d.mood('sunset');
  d.hold(me, null);
  d.anim(me, 'sleep', { loop: true });
  d.cut({ pos: V(3.9, 2.4, 4.1), look: V(-3.1, 0.9, 2.0), fov: 45 });
  d.bg(d.shot({ pos: V(1.2, 1.9, 3.8), look: V(-3.1, 0.95, 2.1), fov: 40, dur: 4 }));
  await d.say(me, d.pick(['……明天。明天一定。', '……下节课再说吧。', '（其实明天也不会扔的吧。）']), { mood: 'sad' });
  await finalHold(d, 2);
}
