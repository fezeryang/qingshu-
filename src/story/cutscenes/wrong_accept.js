// wrong_accept — 误投 B · 将错就错. The wrong (opposite-gender) classmate blushes and says yes before you
// can explain. A baffling "and somehow we're dating" montage: day 1, day 30, day 100.
import { begin, settleClass, front, reactionCloseUp, receive, cutaway, recipient, expressionRamp, traitLine, finalHold } from './common.js';
import { V } from '../direct.js';

const YES = {
  gossip: '天哪……这次的八卦主角，居然是我自己？',
  sleeper: '（揉眼睛）……这是梦吗？那……我答应了。',
  foodie: '……我愿意把最后一包辣条分给你。',
  nerd: '经过严密推导……结论是：我接受。',
  jock: '好！我接受！',
  artsy: '……我会把今天画下来的。',
  chuuni: '……契约，成立。',
  shy: '……（用力地点头）',
  clown: '你认真的？……那我也认真了。',
  gamer: '组队申请……已通过。',
  normal: '……其实，我也注意你很久了。',
};

export default async function wrongAccept(d) {
  const rec = recipient(d);
  const crush = d.crush;
  const me = d.seatPlayer();
  const letter = d.round.letter?.text || '……';
  begin(d, { music: null });
  settleClass(d, { except: [rec], teacher: 'board' });

  // 1 — the wrong person reads it, and melts
  d.beat('react');
  await front(d, rec, { angle: 0.4, dist: 1.5, fov: 38 });
  await receive(d, rec);
  expressionRamp(d, rec, [[0, 'shock'], [1.4, 'embarrassed'], [2.6, 'blush', 'heart']]);
  await d.reveal(letter, { mode: 'read' });
  await reactionCloseUp(d, rec, { expr: 'blush', emote: 'heart', hold: 1.0, beat: 'reaction' });

  // 2 — a shy glance back… and an answer
  d.look(rec, me);
  d.anim(rec, 'blushShy');
  d.music('romance');
  await d.overShoulder(me, rec, { dur: 0 });
  d.sfx('heartbeat');
  await d.say(rec, traitLine(d, rec, YES, ['……好。']), { mood: 'love', expr: 'blush' });
  await front(d, me, { angle: -0.3, dist: 1.4, fov: 38 });
  d.expr(me, 'shock');
  d.emote(me, 'sweat', 1.6);
  await d.say(me, d.pick(['等……不是……', '那个，其实我是想扔给——']), { mood: 'shout' });
  d.beat('climax');
  await d.closeUp(rec, { side: 'front', dist: 1.15, fov: 32, dur: 0.3 });
  d.anim(rec, 'nod');
  d.expr(rec, 'love');
  d.emote(rec, 'hearts', 2);
  await d.say(rec, d.pick(['嗯！', '嗯，我知道的。', '不用说了，我都懂。']), { mood: 'love' });
  const spy = d.byTrait('gossip', { exclude: [rec] })[0];
  if (spy) await cutaway(d, spy, { line: d.pick(['哇哦——！', '大新闻！']), emote: 'sparkle', expr: 'happy', look: rec, hold: 0.9 });
  if (crush && crush !== rec) await cutaway(d, crush, { line: '……？', emote: '?', expr: 'shock', look: rec, hold: 0.9 });
  d.music('comedy');
  d.bg(d.caption('将 错 就 错', 'impact', 2));
  d.sfx('ooh');
  await d.wait(1.6);

  // 3 — montage, day 1: the cherry blossom path (you, still trying to explain)
  await d.iris('out', 0.7);
  const path = d.stage('cherryPath');
  d.showOnly([me, rec]);
  d.place(me, d.anchor(path, 'left', V(-0.5, 0, 0), -Math.PI / 2));
  d.place(rec, d.anchor(path, 'right', V(0.5, 0, 0), Math.PI / 2));
  d.look(me, rec);
  d.look(rec, me);
  d.expr(me, 'sweat');
  d.expr(rec, 'love');
  d.hold(rec, null);
  d.music('romance');
  await d.camAt(d.anchor(path, 'camWide'), { fov: 45 });
  await d.iris('in', 0.6);
  d.bg(d.twoShot(me, rec, { dur: 2.2 }));
  await d.caption('第 1 天：还没找到机会解释。', 'chapter', 2.4);

  // day 30: the canteen
  await d.fade(1, 0.3);
  const can = d.stage('canteen');
  d.showOnly([me, rec]);
  const table = d.anchor(can, 'tableB', V(0, 0, 0));
  const seats = table.seats || [{ pos: table.pos.clone().add(V(-0.45, 0, -0.62)), yaw: Math.PI }, { pos: table.pos.clone().add(V(-0.45, 0, 0.62)), yaw: 0 }];
  d.place(rec, seats[0], { posture: 'sit' });
  d.place(me, seats[2] || seats[1], { posture: 'sit' });
  d.hold(rec, d.prop('snack'));
  d.anim(rec, 'eat', { loop: true });
  d.expr(me, 'embarrassed');
  await d.twoShot(me, rec, { dur: 0, fov: 40 });
  await d.fade(0, 0.3);
  d.bubble(rec, '啊——张嘴。', 1.6);
  await d.caption('第 30 天：好像……解释不清了。', 'chapter', 2.4);

  // day 100: the rooftop at sunset
  await d.fade(1, 0.3);
  const roof = d.stage('rooftop');
  d.showOnly([me, rec]);
  d.hold(rec, null);
  const rail = d.anchor(roof, 'railing', V(0, 0, -2.9), 0);
  d.place(me, rail.pos.clone().add(V(-0.35, 0, 0.6)), { yaw: 0 });
  d.place(rec, rail.pos.clone().add(V(0.35, 0, 0.6)), { yaw: 0 });
  d.expr(me, 'smile');
  d.expr(rec, 'happy');
  await d.camAt(d.anchor(roof, 'camSunset'), { fov: 50 });
  await d.fade(0, 0.3);
  d.beat('final');
  d.look(me, rec);
  d.emote(me, 'blush', 2);
  d.emote(rec, 'heart', 2);
  await d.caption('第 100 天：……算了，就这样吧。', 'chapter', 2.6);
  await finalHold(d, 1.4);
}
