// self_love — 隐藏 · 爱自己. It bounces back onto your own desk; you read it and are deeply moved.
import { begin, settleClass, front, reactionCloseUp, pickUpAndRead, expressionRamp, neighbour, EYE, finalHold } from './common.js';
import { V } from '../direct.js';

export default async function selfLove(d) {
  const me = d.seatPlayer();
  const letter = d.round.letter?.text || '……';
  begin(d, { music: null });
  settleClass(d, { teacher: 'board' });

  // 1 — POV: it came back
  d.beat('react');
  me.root.visible = false;
  d.cut({ pos: EYE(), look: d.ballPos(), fov: 50 });
  d.sfx('pop');
  await d.wait(0.9);
  await d.say(me, d.pick(['……？', '……它回来了？']));

  // 2 — you pick it up and read it
  me.root.visible = true;
  await front(d, me, { angle: 0.4, dist: 1.5, fov: 38 });
  await pickUpAndRead(d, me, { notice: false });
  d.music('romance');
  d.bg(front(d, me, { angle: 0.25, dist: 1.05, fov: 30, dur: 5 }));
  expressionRamp(d, me, [[0, 'shock'], [1.4, 'blush', 'blush'], [3.2, 'cry']]);
  await d.reveal(letter, { mode: 'read' });
  await reactionCloseUp(d, me, { expr: 'cry', emote: 'sparkle', hold: 0.6, beat: 'reaction' });
  await d.say(me, d.pick(['……写得真好。', '原来……我这么会说话。', '这个人……好懂我。']), { mood: 'love', expr: 'cry' });

  // 3 — hug the letter; your deskmate is baffled
  d.beat('climax');
  d.hold(me, d.prop('letterOpen'));
  d.anim(me, 'blushShy');
  d.emote(me, 'hearts', 2.5);
  d.sfx('sparkle');
  const mate = neighbour(d, me);
  if (mate) { d.look(mate, me); d.emote(mate, 'dots', 1.8); d.bubble(mate, d.pick(['……？', '你还好吗？']), 1.6); }
  // the camera pulls slowly back and up: one small figure in a big classroom
  d.bg(d.caption(d.pick(['爱别人之前，先学会爱自己。', '最好的收件人，是你自己。', '兜兜转转，你终于读懂了自己。']), 'chapter', 3.2));
  // straight dolly back along one sightline (from the aisle, front-left of you), so the framing never swings
  const head = d.headPos(me);
  const dir = V(0.74, 0.16, -0.66).normalize();
  d.cut({ pos: head.clone().addScaledVector(dir, 1.5), look: head, fov: 40 });
  await d.shot({ pos: head.clone().addScaledVector(dir, 4.8).add(V(0, 1.1, 0)), look: head, fov: 50, dur: 5, ease: (k) => 1 - (1 - k) ** 3 });
  await finalHold(d, 1.6);
}
