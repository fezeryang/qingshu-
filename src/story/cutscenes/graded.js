// graded — 隐藏 · 59 分. The letter lands on the teacher's desk; he grades it in red chalk on the board.
import { begin, settleClass, front, wrap, finalHold } from './common.js';
import { V } from '../direct.js';
import { BLACKBOARD } from '../../core/layout.js';

const REMARKS = ['错别字 3 处', '比喻不当', '感情真挚，论据不足', '中心思想不明确', '字迹潦草', '结尾缺少升华', '没写名字（-1）'];

export default async function graded(d) {
  const t = d.teacher;
  const me = d.seatPlayer();
  const letter = d.round.letter?.text || '……';
  begin(d, { music: null });
  settleClass(d, { teacher: 'board' });

  // 1 — thud on the desk, the teacher turns
  d.beat('react');
  d.cut({ pos: V(2.3, 1.6, -3.2), look: V(0, 1.15, -5.0), fov: 42 });
  d.sfx('thudDesk');
  d.stop(t);
  d.emote(t, '?', 1.2);
  await d.wait(0.5);
  d.anim(t, 'teacherTurn');
  await d.face(t, Math.PI, 0.6);
  d.look(t, d.ballPos());
  d.expr(t, 'suspicious');
  d.sfx('gasp');
  d.crowd((ch) => { d.look(ch, t); d.emote(ch, '!', 0.8); }, { stagger: 0.4 });
  await d.play(t, 'pickUp', { cap: 1.2 });
  d.hideBall();
  d.sfx('paperUnfold');
  d.hold(t, d.prop('letterOpen'));
  await d.play(t, 'unfold', { cap: 1.2 });
  d.anim(t, 'read', { loop: true });
  d.look(t, null);
  await d.closeUp(t, { side: 'front', dist: 1.1, fov: 32, dur: 0.5 });
  await d.say(t, '嗯……', { expr: 'neutral' });

  // you, sweating
  await front(d, me, { angle: -0.3, dist: 1.45, fov: 38 });
  d.expr(me, 'shock');
  d.emote(me, 'sweat', 2);
  await d.say(me, d.pick(['……完了。', '（那是我的情书啊！）']), { mood: 'whisper' });

  // 2 — grading on the board
  d.music('comedy');
  await d.face(t, 0, 0.4);
  d.hold(t, d.prop('redChalk'));
  d.anim(t, 'teacherWrite', { loop: true });
  d.cut({ pos: V(0.4, 1.7, -2.4), look: V(0, BLACKBOARD.y, BLACKBOARD.z), fov: 46 });
  d.board.clear();
  const lines = ['《情书》批改', ...wrap(letter, 14, 3)];
  for (const line of lines) {
    d.sfx('chalkScratch');
    d.board.append((d.board.text ? '\n' : '') + line);
    await d.wait(0.45);
  }
  const remarks = [d.pick(REMARKS.slice(0, 1)), ...[...REMARKS.slice(1)].sort(() => d.rnd() - 0.5).slice(0, 2)];
  d.board.append(`\n${remarks.join(' · ')}    59 分`);
  d.sfx('chalkTap');
  d.beat('climax');
  await d.reveal(letter, { mode: 'grading', score: 59, cap: 8 });

  // 3 — the verdict
  d.stop(t);
  await d.face(t, Math.PI, 0.4);
  d.look(t, me);
  d.anim(t, 'teacherPointAt');
  await d.closeUp(t, { side: 'left', dist: 1.35, fov: 34, dur: 0.3 });
  await d.say(t, `${remarks[0]}，${remarks[1]}——59 分。`);
  d.sfx('buzzer');
  d.shake(0.35, 0.4);
  d.bg(d.caption('59 分', 'impact', 2));
  d.sfx('laughCrowd');
  d.crowd((ch) => { d.anim(ch, d.pick(['laugh', 'clap'])); d.expr(ch, 'happy'); }, { stagger: 0.4 });
  await d.wait(0.6);
  await d.say(t, d.pick(['差一分及格。下课来办公室，我教你怎么写。', '感情真挚，论证不足。回去重写，明天交。', '扣的那一分，是因为没写名字。']));

  // final: the board + your facepalm
  d.anim(me, 'facepalm');
  d.expr(me, 'embarrassed');
  await d.shot({ pos: V(-1.6, 1.5, -2.2), look: V(0.2, 1.55, -5.9), fov: 50, dur: 1.2 });
  await finalHold(d, 1.6);
}
