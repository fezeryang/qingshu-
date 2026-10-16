// out_window — 隐藏 · 校园广播. Out of the window, onto the principal's bald head, read tenderly over the
// school-wide PA. Back in class, every head turns to you.
import { begin, settleClass, front, backToClassroom, finalHold } from './common.js';
import { V } from '../direct.js';
import { WINDOWS } from '../../core/layout.js';

const PA = '校长（广播）';

export default async function outWindow(d) {
  const me = d.seatPlayer();
  const crush = d.crush;
  const t = d.teacher;
  const letter = d.round.letter?.text || '……';
  const win = WINDOWS.find((w) => w.open) || WINDOWS[1];
  begin(d, { music: null });
  settleClass(d, { teacher: 'board' });

  // 1 — it's gone
  d.beat('react');
  d.cut({ pos: V(-3.7, 1.55, win.z + 1.3), look: V(-5.8, 1.5, win.z - 0.6), fov: 50 });
  d.sfx('windGust');
  const nearWindow = d.students().filter((c) => c.root.position.x < -2);
  for (const c of nearWindow) { d.look(c, V(win.x, 1.6, win.z)); d.emote(c, '?', 1.2); }
  const witness = nearWindow.find((c) => c.spec?.trait === 'gossip') || nearWindow[0];
  await d.say(witness || '同学', d.pick(['……刚才，是不是有什么东西飞出去了？', '诶？窗外飞出去一个纸团？']));
  await front(d, me, { angle: 0.3, dist: 1.45, fov: 40 });
  d.expr(me, 'shock');
  d.emote(me, 'sweat', 1.6);
  await d.say(me, d.pick(['……完了。', '（不要啊——！）']), { mood: 'whisper' });

  // 2 — the schoolyard: it drifts down… onto the principal
  await d.fade(1, 0.35);
  const set = d.stage('schoolyard');
  const principal = d.npc('principal');
  d.showOnly([principal]);
  d.place(principal, d.anchor(set, 'principal', V(1.6, 0, -2.9)));
  d.anim(principal, 'idle', { loop: true });
  const land = d.anchor(set, 'landing', V(0.4, 0, -4.2));
  d.music('mystery');
  await d.camAt(d.anchor(set, 'camHigh'), { fov: 55 });
  await d.fade(0, 0.35);
  const ball = d.putProp(d.prop('letterBall', 'yardBall'), land.pos.clone().add(V(0, 6, 0)));
  const head = d.headPos(principal);
  const start = ball.position.clone();
  d.bg(d.track(ball, { offset: V(1.2, 0.6, 1.6), dur: 2.4 }));
  await d.tween(2.4, (k) => {
    ball.position.lerpVectors(start, head.clone().add(V(0, 0.18, 0)), k);
    ball.position.x += Math.sin(k * 9) * 0.35 * (1 - k);
    ball.rotation.set(k * 6, k * 4, 0);
  });
  d.sfx('pop');
  d.emote(principal, '!', 1);
  d.shake(0.15, 0.2);
  await d.play(principal, 'pickUp', { cap: 1 });
  d.hideProp(ball);
  d.hold(principal, d.prop('letterOpen'));
  d.anim(principal, 'read', { loop: true });
  await d.closeUp(principal, { side: 'front', dist: 1.15, fov: 34, dur: 0.4 });
  d.expr(principal, 'shock');
  await d.wait(0.9);
  d.expr(principal, 'cry');
  d.emote(principal, 'sparkle', 1.6);
  await d.say(principal, d.pick(['……多么纯洁的感情啊。', '年轻……真好啊。', '这让我想起了我的初恋。']), { mood: 'sad' });

  // 3 — over the PA
  d.hold(principal, d.prop('megaphone'));
  d.expr(principal, 'happy');
  d.sfx('ding');
  d.after(0.35, () => d.sfx('ding'));
  d.music('broadcast');
  await d.camAt(d.anchor(set, 'camWide'), { fov: 55 });
  d.bg(d.caption('全 校 广 播', 'impact', 2));
  await d.say(PA, '咳咳。全体师生请注意——', { voice: principal?.spec?.voice, charId: principal?.id });
  d.beat('climax');
  const spk = d.anchor(set, 'speaker', V(0, 4.6, -6));
  d.bg(d.shot({ pos: spk.pos.clone().add(V(1.6, -0.6, 2.6)), look: spk.pos, fov: 40, dur: 6 }));
  const reading = Promise.all([
    d.reveal(letter, { mode: 'readAloud', cap: 15 }),
    d.speak(letter, { pitch: 0.65, rate: 0.9, cap: 15 }),
  ]);
  // cut back to the classroom halfway through: everyone frozen, listening
  await Promise.race([reading, d.wait(4)]);
  backToClassroom(d, [me]);
  d.seat(me, d.round.roster?.playerSeatId || 'r4c0');
  d.stop(t);
  d.place(t, t.root.position, { yaw: Math.PI });
  d.expr(t, 'shock');
  d.crowd((ch) => { d.look(ch, me); d.expr(ch, d.pick(['shock', 'happy', 'smug'])); }, { stagger: 0.6 });
  if (crush) { d.after(1.2, () => { d.expr(crush, 'blush'); d.anim(crush, 'facepalm'); d.emote(crush, 'blush', 2); }); }
  d.cut({ pos: V(-0.3, 2.1, -4.2), look: V(-2.2, 1.0, 1.8), fov: 48 });
  d.bg(d.shot({ pos: V(-1.8, 1.6, -0.6), look: d.headPos(me), fov: 40, dur: 8 }));
  await Promise.race([reading, d.wait(11)]);
  d.check();

  // 4 — the principal's blessing
  d.sfx('ooh');
  await d.say(PA, d.pick(['……写这封信的同学，校长支持你！但要以学业为重哦。', '……以上，是今天的"校园好声音"。', '……这位同学，放学后来一趟校长室，校长给你签个名。']), { voice: principal?.spec?.voice, charId: principal?.id });
  d.bg(d.caption('全 校 皆 知', 'impact', 2));
  d.beat('final');
  await front(d, me, { angle: -0.3, dist: 1.4, fov: 36 });
  d.anim(me, 'facepalm');
  d.expr(me, 'embarrassed');
  d.emote(me, 'skull', 2.2);
  await finalHold(d, 1.8);
}
