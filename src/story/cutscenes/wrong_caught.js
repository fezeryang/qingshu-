// wrong_caught — 误投 A · 请家长. Wrong desk, and the recipient reports it (or the teacher saw).
// Next day in the office, rain outside, both parents, a 3000-character self-criticism.
import { begin, settleClass, front, pickUpAndRead, recipient, finalHold } from './common.js';
import { V } from '../direct.js';
import { SNITCH_TRAITS } from '../roster.js';

export default async function wrongCaught(d) {
  const rec = recipient(d);
  const t = d.teacher;
  const me = d.seatPlayer();
  const seen = !!d.round.teacherSawBall || d.round.caughtDuring === 'flight';
  const snitch = SNITCH_TRAITS.includes(rec?.spec?.trait);
  begin(d, { music: null });
  settleClass(d, { except: [rec], teacher: seen ? 'class' : 'board' });

  // 1 — the wrong person reads it
  d.beat('react');
  await front(d, rec, { angle: 0.4, dist: 1.45, fov: 38 });
  await pickUpAndRead(d, rec);
  d.expr(rec, 'shock');
  await d.wait(0.8);
  if (snitch && !seen) {
    d.expr(rec, 'angry');
    d.emote(rec, 'anger', 1.4);
    await d.standUp(rec);
    d.anim(rec, 'raiseHand');
    await d.say(rec, rec.spec.trait === 'monitor'
      ? d.pick(['报告老师！有人上课传情书！', '老师！这里有人违反课堂纪律！'])
      : d.pick(['报告！上课时间传递违禁纸条——我已经记下来了。', '报告老师！发现情书一封，证据确凿！']), { mood: 'shout' });
    d.stop(t);
    d.anim(t, 'teacherTurn');
    await d.face(t, Math.PI, 0.5);
  } else {
    d.expr(rec, 'embarrassed');
    d.emote(rec, 'sweat', 1.4);
    d.teacherAtBoard('class');
    await d.say(t, d.pick(['那个纸团，我都看见了。拿过来。', '上课扔纸条？拿上来我看看。']), { mood: 'angry' });
  }

  // 2 — the teacher reads it, and the verdict
  d.hold(rec, null);
  d.hold(t, d.prop('letterOpen', 'letterOpen2'));
  d.anim(t, 'read', { loop: true });
  await d.closeUp(t, { side: 'front', dist: 1.1, fov: 32, dur: 0.3 });
  d.expr(t, 'angry');
  d.emote(t, 'anger', 1.6);
  d.sfx('stingDanger');
  await d.wait(0.6);
  d.look(t, me);
  d.anim(t, 'teacherPointAt');
  await d.crashZoom(t, { dur: 0.25 });
  await d.say(t, d.pick(['最后一排靠窗的同学——明天，把家长叫来。', '你。下课。请家长。']), { mood: 'angry' });
  d.sfx('ooh');
  d.crowd((ch) => { d.look(ch, me); d.emote(ch, '!', 0.8); }, { stagger: 0.4, exclude: [rec] });
  await front(d, me, { angle: -0.3, dist: 1.4, fov: 38 });
  d.expr(me, 'shock');
  d.emote(me, 'skull', 1.6);
  d.music('tragedy');
  await d.wait(1.2);

  // 3 — the office, next day, rain
  await d.fade(1, 0.6);
  const set = d.stage('office');
  const dad = d.npc('dad');
  const mom = d.npc('mom');
  d.showOnly([t, me, dad, mom]);
  d.try('t.reset', () => t.reset?.());
  d.place(t, d.anchor(set, 'teacherChair', V(0, 0, -1.2), Math.PI), { posture: 'sit' });
  d.place(me, d.anchor(set, 'student', V(0, 0, -0.3)));
  d.place(dad, d.anchor(set, 'parent1', V(-0.8, 0, 0.35)));
  d.place(mom, d.anchor(set, 'parent2', V(0.8, 0, 0.35)));
  d.expr(me, 'sad');
  d.anim(me, 'idle', { loop: true });
  d.loop('rain', { volume: 0.5 });
  await d.camAt(d.anchor(set, 'camWide'), { fov: 50 });
  await d.fade(0, 0.6);
  d.bg(d.caption('第二天 · 办公室', 'chapter', 2.2));
  await d.say(t, d.pick(['您家孩子，上课传情书。还传错了人。', '情书。上课写的。还扔错了桌子。']));
  d.expr(mom, 'shock');
  d.anim(mom, 'gasp');
  await d.say(mom, d.pick(['我们家孩子从小就老实啊！', '什么？！我们家孩子还会写情书？！']), { mood: 'shout' });
  d.hold(dad, d.prop('letterOpen'));
  d.anim(dad, 'read', { loop: true });
  await d.closeUp(dad, { side: 'front', dist: 1.15, fov: 34, dur: 0.3 });
  await d.say(dad, d.pick(['……这字写得，跟我当年一模一样。', '……这比喻，比我当年强多了。']), { expr: 'smug' });
  d.look(mom, dad);
  d.expr(mom, 'angry');
  d.emote(mom, 'anger', 1.6);
  await d.say(mom, '……你当年写给谁的？！', { mood: 'angry' });
  d.expr(dad, 'sweat');
  d.emote(dad, 'sweat', 1.4);

  // 4 — the sentence
  d.beat('climax');
  await d.camAt(d.anchor(set, 'camOverShoulder'), { fov: 42, dur: 0.4 });
  await d.say(t, '回去写三千字检讨。明天交。');
  d.expr(me, 'shock');
  await d.say(me, '三、三千字？！', { mood: 'shout' });
  d.shake(0.35, 0.4);
  d.sfx('stingDanger');
  await d.caption('检讨书 · 3000 字', 'impact', 2);
  d.beat('final');
  await front(d, me, { angle: 0.3, dist: 1.35, fov: 36, dur: 0.6 });
  d.expr(me, 'cry');
  d.anim(me, 'cry', { loop: true });
  d.bg(d.caption(d.pick(['尊敬的王老师：我错了。（还剩 2994 字）', '我深刻认识到，情书应该先瞄准再扔。（还剩 2981 字）']), 'whisper', 2.6));
  await finalHold(d, 2.2);
}
