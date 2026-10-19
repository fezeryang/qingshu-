// confetti — 隐藏 · 心碎成雪. The fan shreds the letter into heart-shaped scraps that fall like snow;
// the crush catches one.
import { begin, settleClass, front, finalHold, cutaway } from './common.js';
import { V } from '../direct.js';
import { FANS } from '../../core/layout.js';

export default async function confetti(d) {
  const crush = d.crush;
  const me = d.seatPlayer();
  const t = d.teacher;
  const L = d.round.landing || {};
  const bp = d.ballPos();
  const fan = FANS.find((f) => f.id === L.fanId || f.id === L.ownerId)
    || [...FANS].sort((a, b) => Math.hypot(a.x - bp.x, a.z - bp.z) - Math.hypot(b.x - bp.x, b.z - bp.z))[0];
  begin(d, { music: null });
  settleClass(d, { teacher: 'board' });
  d.hideBall();

  // 1 — shredded
  d.beat('react');
  d.cut({ pos: V(fan.x, 1.75, fan.z + 2.3), look: V(fan.x, fan.bladeY, fan.z), fov: 52 }); // aisle line, above the heads
  d.sfx('shatter', { volume: 0.5 });
  d.sfx('fanHum');
  d.slowMo(0.5, 1.6);
  const pieces = [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2;
    return d.putProp(d.prop('confetti', `confetti${i}`), V(fan.x + Math.cos(a) * 0.4, fan.bladeY - 0.12, fan.z + Math.sin(a) * 0.4));
  });
  const starts = pieces.map((p) => p.position.clone());
  const drift = pieces.map((_, i) => V((i % 2 ? 1 : -1) * (0.6 + i * 0.25), 0, (i < 2 ? 1 : -1) * (0.5 + i * 0.2)));
  d.run(() => d.tween(9, (k) => {
    pieces.forEach((p, i) => {
      p.position.copy(starts[i]).addScaledVector(drift[i], k);
      p.position.y = starts[i].y - k * 1.95;
      p.position.x += Math.sin(k * 7 + i) * 0.12;
      p.rotation.set(Math.sin(k * 5 + i) * 0.5, k * 4 + i, 0);
    });
  }));
  d.music('romance');
  await d.wait(1.2);

  // 2 — everyone looks up
  d.crowd((ch) => { d.look(ch, V(fan.x, fan.bladeY - 0.6, fan.z)); d.expr(ch, d.pick(['happy', 'shock', 'smile'])); }, { stagger: 0.8 });
  d.stop(t);
  d.look(t, V(fan.x, fan.bladeY, fan.z));
  d.bg(d.shot({ pos: V(fan.x, 1.05, fan.z + 3.4), look: V(fan.x, 2.0, fan.z), fov: 62, dur: 3 })); // low in the aisle
  const poet = d.byTrait('artsy')[0];
  await d.say(poet || '同学', '……下雪了。', { mood: 'whisper' });
  d.bg(d.caption('下 雪 了', 'whisper', 2));
  await d.wait(0.8);

  await cutaway(d, t, { line: '……？', emote: '?', expr: 'shock', look: V(fan.x, fan.bladeY, fan.z), hold: 0.8 });
  const foodie = d.byTrait('foodie')[0];
  if (foodie) await cutaway(d, foodie, { line: '……能吃吗？', clip: 'eat', expr: 'happy', emote: 'music', hold: 1.0 });
  // 3 — the crush catches a piece
  d.beat('climax');
  const scrap = d.prop('confetti', 'confettiPalm');
  scrap.scale.setScalar(0.35);
  d.anim(crush, 'catch');
  d.hold(crush, scrap);
  await front(d, crush, { angle: 0.4, dist: 1.4, fov: 46, dur: 0 });
  d.look(crush, d.handPos(crush));
  d.expr(crush, 'smile');
  await d.wait(0.6);
  d.expr(crush, 'blush');
  d.emote(crush, 'heart', 1.8);
  d.sfx('sparkle');
  await d.say(crush, d.pick(['……是谁的心，碎了呢。', '心形的……雪？', '好漂亮。像是谁的心意。']), { mood: 'shy' });

  // 4 — you, laughing and crying at once
  await front(d, me, { angle: -0.35, dist: 1.45, fov: 38 });
  d.expr(me, 'cry');
  d.emote(me, 'sweat', 1.6);
  await d.say(me, d.pick(['……是我的。', '（那是我的心啊……）', '（碎得……还挺好看的。）']), { mood: 'sad' });
  d.bg(d.caption('心 碎 成 雪', 'chapter', 2.6));
  const sleeper = d.byTrait('sleeper')[0];
  if (sleeper) { d.stop(sleeper); d.expr(sleeper, 'sleepy'); d.bubble(sleeper, '……下课了吗？', 1.6); }
  else d.bubble(t, '……谁把风扇开这么大的？', 1.6);

  // final: wide from below, scraps drifting over the class
  await d.shot({ pos: V(fan.x, 1.75, 4.2), look: V(fan.x * 0.5, 2.0, -1.5), fov: 58, dur: 1.4 }); // back of the aisle, above the heads
  await finalHold(d, 2.6);
}
