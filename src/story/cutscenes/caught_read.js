// caught_read — 社死 · 当众朗读. Called to the front and made to read your own letter aloud, verbatim.
import { begin, settleClass, front, recipient, finalHold, cutaway } from './common.js';
import { V } from '../direct.js';
import { AISLES_X, PLATFORM } from '../../core/layout.js';

export default async function caughtRead(d) {
  const t = d.teacher;
  const me = d.seatPlayer();
  const crush = d.crush;
  const letter = d.round.letter?.text || '……';
  const duringAim = d.round.caughtDuring === 'aim' || !d.round.launched;
  const rec = duringAim ? null : (d.round.landing?.ownerId ? recipient(d) : null);
  begin(d, { music: null });
  settleClass(d, { teacher: 'class' });

  // 1 — the glare
  d.beat('react');
  d.sfx('recordScratch');
  d.expr(t, 'suspicious');
  d.look(t, me);
  d.anim(t, 'teacherAdjustGlasses');
  d.emote(t, '!', 1.2);
  d.sfx('stingDanger');
  await d.crashZoom(t, { dur: 0.3 });
  if (duringAim) {
    await d.say(t, '最后一排，靠窗的那位同学——', { mood: 'angry' });
    await d.say(t, d.pick(['你手里拿的，是什么？', '藏什么呢？拿出来。', '我盯你很久了。']), { mood: 'angry' });
  } else {
    await d.say(t, d.pick(['刚才飞过去的那个纸团……', '上课时间，空中飞行物？']), { mood: 'angry' });
    if (rec) {
      d.emote(rec, 'sweat'); d.look(rec, t); d.anim(rec, 'raiseHand');
      const why = d.round.delivery === 'bonk' ? '它砸的我！不是我扔的！' : d.round.delivery === 'pickup' ? '我、我只是捡起来……' : '不、不是我扔的！';
      await cutaway(d, rec, { line: why, expr: 'shock', hold: 1.1 });
    }
    await d.say(t, d.pick(['我都看见了。是谁扔的？', '扔的人，自己站起来。']), { mood: 'angry' });
  }

  // 2 — the whole class turns to look at you
  d.sfx('ooh');
  d.crowd((ch) => { d.look(ch, me); d.anim(ch, 'turnBack'); d.emote(ch, '!', 0.9); }, { stagger: 0.5 });
  if (crush) await cutaway(d, crush, { line: '……！', expr: 'embarrassed', clip: 'facepalm', emote: 'blush', look: me, hold: 0.9 });
  d.expr(me, 'shock');
  d.emote(me, 'sweat', 2);
  await front(d, me, { angle: -0.3, dist: 1.55, fov: 40 });
  await d.wait(1.1);
  await d.say(t, d.pick(['拿上来。念给大家听。', '上来。大声念出来。']), { mood: 'shout' });

  // 3 — the walk of shame (cut short)
  d.music('shame');
  await d.standUp(me);
  d.hideBall();
  d.hold(me, d.prop('letterOpen'));
  d.bg(d.walk(me, V(AISLES_X[0], 0, me.root.position.z), { speed: 1.2 }));
  d.cut({ pos: V(-4.3, 0.75, -0.6), look: V(-3.6, 1.2, 2.2), fov: 48 });
  const gossip = d.byTrait('gossip');
  if (gossip[0]) d.bubble(gossip[0], '哇哦——', 1.4);
  if (gossip[1]) d.after(0.5, () => d.bubble(gossip[1], '是情书吧？！', 1.4));
  d.sfx('murmur');
  await d.wait(2);

  // 4 — at the front, facing everyone
  d.place(me, V(-1.1, 0, PLATFORM.maxZ + 0.3), { yaw: Math.PI });
  d.place(t, V(0.9, PLATFORM.h, -5.05), { yaw: Math.PI - 0.5 });
  d.look(t, me);
  d.expr(t, 'smug');
  d.crowd((ch) => { d.look(ch, me); d.anim(ch, 'sitIdle', { loop: true }); }, { stagger: 0.2 });
  d.anim(me, 'read', { loop: true });
  d.expr(me, 'embarrassed');
  d.emote(me, 'sweat', 3);
  d.beat('climax');
  // from the aisle among the desks; the head sits low in frame so the letter sheet (top) never hides it
  const mh = d.headPos(me);
  d.cut({ pos: V(-1.45, 1.3, -1.2), look: mh.clone().add(V(0, 0.45, 0)), fov: 42 });
  d.bg(d.shot({ pos: V(-1.4, 1.3, -2.3), look: mh.clone().add(V(0, 0.4, 0)), fov: 40, dur: 9 }));
  d.duck(0.4, 2);
  // reactions while you read
  d.after(2.5, () => { for (const g of gossip) { d.anim(g, 'gasp'); d.expr(g, 'shock'); } });
  d.after(4, () => { if (crush) { d.expr(crush, 'embarrassed'); d.anim(crush, 'facepalm'); d.emote(crush, 'blush', 2); } });
  d.after(5.5, () => { for (const c of d.byTrait('clown')) { d.anim(c, 'laugh'); d.expr(c, 'happy'); } });
  const reading = Promise.all([
    d.reveal(letter, { mode: 'readAloud', cap: 16 }),
    d.speak(letter, { pitch: me?.spec?.voice?.pitch ?? 1, rate: 1, cap: 16 }),
  ]);
  await Promise.race([reading, d.wait(16)]);
  d.check();

  // 5 — the class erupts
  d.sfx('laughCrowd');
  d.sfx('ooh');
  d.crowd((ch) => { d.anim(ch, d.pick(['laugh', 'clap', 'point', 'laugh'])); d.expr(ch, 'happy'); }, { exclude: [crush], stagger: 0.35 });
  if (crush) { d.anim(crush, 'facepalm'); d.expr(crush, 'embarrassed'); }
  d.shake(0.45, 0.6);
  d.bg(d.caption('社 死', 'impact', 2.2));
  // your POV: slow push toward the laughing classmates
  const head = d.headPos(me);
  d.cut({ pos: head.clone().add(V(0, 0.02, 0.25)), look: V(-0.6, 1.0, 1.5), fov: 55 });
  await d.shot({ pos: V(-1.4, head.y + 0.1, head.z + 1.3), look: V(-0.4, 1.0, 1.8), fov: 48, dur: 2.6 }); // ends in the aisle

  // 6 — the teacher's verdict, your soul leaves
  await d.say(t, d.pick(['……文笔还行。下课来办公室。', '下次写作文也这么用心就好了。', '"的地得"都没分清。回去重写。']));
  d.beat('final');
  await front(d, me, { angle: 0.2, dist: 1.35, fov: 34 });
  d.expr(me, 'cry');
  d.emote(me, 'skull', 2.5);
  d.anim(me, 'shiver');
  await finalHold(d, 2);
}
