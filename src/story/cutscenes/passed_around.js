// passed_around — 隐藏 · 全班传阅. A gossip gets it, peeks… and the note travels secretly, desk to desk,
// round the whole class (each classmate reacting in character) until it finally reaches the crush.
import { begin, settleClass, front, receive, recipient, cutaway, finalHold } from './common.js';
import { V } from '../direct.js';

// how each kind of classmate reacts when the note passes through their hands
const PASS = {
  nerd: { line: '格式不对。', expr: 'suspicious', emote: 'dots' },
  sleeper: { line: '（醒来，传走，睡着）', expr: 'sleepy', emote: 'zzz' },
  foodie: { line: '（吧唧）……嗯，甜。', expr: 'happy', emote: 'music' },
  gossip: { line: '天哪天哪！', expr: 'happy', emote: 'sparkle' },
  jock: { line: '收到！传！', expr: 'determined', emote: '!' },
  artsy: { line: '……好美。', expr: 'blush', emote: 'heart' },
  chuuni: { line: '禁忌的文书……', expr: 'smug', emote: 'sparkle' },
  shy: { line: '（脸红）', expr: 'embarrassed', emote: 'blush' },
  clown: { line: '噗——', expr: 'happy', emote: 'music', clip: 'laugh' },
  gamer: { line: '转发了。', expr: 'neutral', emote: 'dots' },
  monitor: { line: '……这次就算了。', expr: 'suspicious', emote: 'sweat' },
  disciplinarian: { line: '……我什么都没看见。', expr: 'sweat', emote: 'sweat' },
  normal: { line: '哇……', expr: 'shock', emote: '!' },
};

/** Up to n classmates roughly on the way from a to b (sorted along the path). */
function relay(d, a, b, n, exclude) {
  const pa = a.root.position, pb = b.root.position;
  const dir = pb.clone().sub(pa); const len = dir.length() || 1; dir.divideScalar(len);
  const ex = new Set(exclude.filter(Boolean).map((c) => c.id));
  return d.students()
    .filter((c) => !ex.has(c.id))
    .map((c) => { const v = c.root.position.clone().sub(pa); const along = v.dot(dir); const side = v.clone().addScaledVector(dir, -along).length(); return { c, along, side }; })
    .filter((x) => x.along > 0.2 && x.along < len - 0.2)
    .sort((x, y) => x.side - y.side)
    .slice(0, n)
    .sort((x, y) => x.along - y.along)
    .map((x) => x.c);
}

export default async function passedAround(d) {
  const gossip = recipient(d);
  const crush = d.crush;
  const me = d.seatPlayer();
  const t = d.teacher;
  begin(d, { music: null });
  settleClass(d, { except: [gossip], teacher: 'board' });

  // 1 — the gossip gets it and peeks
  d.beat('react');
  await front(d, gossip, { angle: 0.4, dist: 1.5, fov: 44 });
  await receive(d, gossip);
  d.expr(gossip, 'smug');
  d.emote(gossip, 'sparkle', 1.6);
  await d.say(gossip, d.pick(['哦豁——', '这可是大新闻……']), { mood: 'whisper' });
  await front(d, me, { angle: -0.3, dist: 1.4, fov: 42 });
  d.expr(me, 'shock');
  d.emote(me, 'skull', 1.4);
  await d.say(me, '不……不要传……', { mood: 'whisper' });

  // 2 — and so it begins
  d.music('comedy');
  d.bg(d.caption('传阅开始', 'chapter', 1.6));
  let chain = relay(d, gossip, crush || gossip, 5, [gossip, crush, me]);
  if (chain.length < 3) chain = [...chain, ...d.students().filter((c) => ![gossip, crush, ...chain].includes(c))].slice(0, 4);
  const note = d.prop('letterOpen', 'passedNote');
  d.hold(gossip, null);
  let from = gossip;
  for (let i = 0; i < chain.length; i++) {
    const ch = chain[i];
    // a quick wide of the hand-off every other hop: the note visibly sails across the aisle
    if (i % 2 === 0) {
      const a = d.handPos(from), b = d.handPos(ch);
      const mid = a.clone().lerp(b, 0.5);
      d.cut({ pos: mid.clone().add(V(0.4, 1.0, 1.7)), look: mid, fov: 50 });
      d.sfx('swoosh', { volume: 0.5 });
      await d.throwProp(note, a, b, { height: 0.3, duration: 0.45 });
    }
    d.hold(ch, note);
    d.anim(ch, 'read', { loop: true });
    const r = PASS[ch.spec?.trait] || PASS.normal;
    await cutaway(d, ch, { line: r.line, expr: r.expr, emote: r.emote, clip: r.clip, hold: 1.0, angle: i % 2 ? -0.4 : 0.4 });
    d.hold(ch, null);
    d.anim(ch, 'sitIdle', { loop: true });
    from = ch;
    // 3 — halfway: the teacher nearly turns round. Everyone freezes.
    if (i === Math.floor(chain.length / 2) - 1 && t) {
      d.beat('freeze');
      d.stop(t);
      d.sfx('stingDanger');
      d.emote(t, '?', 1.2);
      d.slowMo(0.35, 1.2);
      d.cut({ pos: V(0.2, 1.7, -2.6), look: d.headPos(t), fov: 40 });
      await d.face(t, Math.PI / 2, 0.5);
      d.bubble(t, '……嗯？', 1.2);
      d.crowd((c) => { d.anim(c, 'write', { loop: true }); d.expr(c, 'sweat'); }, { stagger: 0.1 });
      await d.wait(0.9);
      d.bg(d.caption('装 认 真', 'impact', 1.2));
      await d.face(t, 0, 0.4);
      d.anim(t, 'teacherWrite', { loop: true });
      d.crowd((c) => { d.anim(c, 'sitIdle', { loop: true }); d.expr(c, 'neutral'); }, { stagger: 0.2 });
      await d.wait(0.4);
    }
  }

  // 4 — it finally reaches the crush
  d.beat('climax');
  if (crush) {
    const a = d.handPos(from), b = d.handPos(crush);
    await d.throwProp(note, a, b, { height: 0.3, duration: 0.45 });
    d.hold(crush, note);
    d.anim(crush, 'read', { loop: true });
    d.music('romance');
    await front(d, crush, { angle: 0.4, dist: 1.4, fov: 44 });
    d.expr(crush, 'shock');
    await d.wait(0.7);
    d.expr(crush, 'blush');
    d.emote(crush, 'blush', 1.6);
    d.look(crush, me);
    await d.say(crush, d.pick(['……为什么我是最后一个看到的？', '……全班都看过了？']), { mood: 'shy' });
  }

  // 5 — the whole class turns to you, beaming
  d.sfx('ooh');
  d.crowd((c) => { d.look(c, me); d.expr(c, 'smug'); d.emote(c, d.pick(['heart', 'sparkle', 'music']), 1.6); }, { stagger: 0.4 });
  d.cut({ pos: V(-1.4, 2.1, -3.8), look: V(-2.4, 1.0, 1.8), fov: 52 });
  await d.wait(0.6);
  d.bg(d.caption('全班都知道了', 'impact', 2));
  d.shake(0.25, 0.3);
  await d.wait(1.2);
  await front(d, me, { angle: 0.3, dist: 1.4, fov: 42 });
  d.anim(me, 'facepalm');
  d.expr(me, 'embarrassed');
  d.emote(me, 'sweat', 2);
  await finalHold(d, 1.8);
}
