// love_bonk — 隐藏 · 砸出来的缘分. The ball bonks the crush on the head. She turns round, glaring…
// and your eyes meet. She reads it, blushes, and bonks you right back: "扯平了。"
import { begin, settleClass, front, reactionCloseUp, cutaway, teacherOblivious, finalHold } from './common.js';
import { V } from '../direct.js';

const EVEN = ['扯平了。', '这一下，算你欠我的。', '下次……瞄准一点。'];

export default async function loveBonk(d) {
  const crush = d.crush;
  const me = d.seatPlayer();
  const letter = d.round.letter?.text || '……';
  begin(d, { music: null });
  settleClass(d, { except: [crush], teacher: 'board' });

  // 1 — BONK (slow-motion replay on the back of her head)
  d.beat('react');
  d.expr(crush, 'dizzy');
  d.anim(crush, 'gasp');
  await front(d, crush, { angle: 2.6, dist: 1.3, fov: 44 }); // from behind-ish: the spot where it hit
  d.sfx('thudHead');
  d.slowMo(0.3, 1.0);
  d.shake(0.3, 0.3);
  d.emote(crush, 'sparkle', 1.2);
  await d.caption('咚！', 'impact', 1.1);

  // 2 — she clutches her head and turns round, furious
  d.anim(crush, 'facepalm');
  d.emote(crush, 'anger', 1.4);
  d.look(crush, me);
  await d.overShoulder(me, crush, { dur: 0 });
  await d.say(crush, d.pick(['谁啊？！', '……是谁砸我？']), { mood: 'angry', expr: 'angry' });

  // 3 — you, frozen, guilty
  await front(d, me, { angle: -0.35, dist: 1.4, fov: 42 });
  d.expr(me, 'shock');
  d.emote(me, 'sweat', 1.6);
  await d.say(me, d.pick(['对、对不起……', '……手滑了。']), { mood: 'whisper' });

  // 4 — eyes meet. Time stops.
  d.music('romance');
  d.sfx('heartbeat');
  d.slowMo(0.4, 1.4);
  d.expr(crush, 'shock');
  d.look(me, crush);
  await d.twoShot(me, crush, { dur: 0, fov: 40 });
  d.bg(d.caption('四目相对', 'chapter', 2));
  d.after(0.8, () => { d.expr(crush, 'embarrassed'); d.emote(crush, 'blush', 1.6); });
  await d.wait(1.8);

  // 5 — she picks it up and reads it
  d.look(crush, d.ballPos());
  await front(d, crush, { angle: 0.4, dist: 1.4, fov: 44 });
  await d.play(crush, 'pickUp', { cap: 1.2 });
  d.hideBall();
  d.sfx('paperUnfold');
  d.hold(crush, d.prop('letterOpen'));
  d.anim(crush, 'read', { loop: true });
  await d.reveal(letter, { mode: 'read' });
  d.beat('climax');
  await reactionCloseUp(d, crush, { expr: 'blush', emote: 'hearts', sfx: 'sparkle', hold: 1.5 });

  // 6 — meanwhile…
  await teacherOblivious(d, d.pick(['后排的，安静一点。', '这个公式要背。']), 1.0);

  // 7 — she bonks you right back
  const ball = d.prop('letterBall', 'bonkBack');
  d.look(crush, me);
  d.anim(crush, 'throw');
  await d.wait(0.25);
  d.sfx('whoosh');
  const target = d.headPos(me).add(V(0, 0.18, 0));
  d.cut({ pos: target.clone().add(V(1.0, 0.35, -1.6)), look: target, fov: 46 });
  await d.throwProp(ball, d.handPos(crush), target, { height: 0.5, duration: 0.8 });
  d.sfx('thudHead');
  d.shake(0.25, 0.3);
  d.hideProp(ball);
  d.expr(me, 'dizzy');
  d.emote(me, 'hearts', 2);
  await d.wait(0.4);
  await cutaway(d, crush, { expr: 'smile', clip: 'laugh', hold: 0.4 });
  await d.say(crush, d.pick(EVEN), { mood: 'shy' });

  // final — the two of you, grinning like idiots; a classmate rolls their eyes
  const mate = d.byTrait('gossip', { exclude: [crush] })[0];
  if (mate) { d.look(mate, me); d.emote(mate, 'dots', 2); }
  d.expr(me, 'happy');
  d.expr(crush, 'smile');
  d.emote(crush, 'heart', 2);
  await d.twoShot(me, crush, { dur: 1.2, fov: 44 });
  d.bg(d.caption('一 砸 钟 情', 'chapter', 2.4));
  await finalHold(d, 2);
}
