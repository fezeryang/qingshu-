// perfect — 完美 · 天台之约. The crush reads your letter, blushes line by line, writes back and lobs
// the reply to you; "放学后，天台见。" → heart iris → sunset rooftop, side by side.
import { begin, settleClass, front, reactionCloseUp, pickUpAndRead, hitPrelude, expressionRamp, traitLine, PLAYER_DESK_TOP, EYE, finalHold } from './common.js';
import { V } from '../direct.js';

const REPLY = {
  monitor: '放学后，天台见。\n（班长的命令，不许迟到）',
  disciplinarian: '放学后，天台见。\n此事，不记入小本本。',
  nerd: '放学后，天台见。\n（你的论证不太严谨，见面再讲）',
  sleeper: '放学后，天台见。\n（如果我没睡着的话）',
  foodie: '放学后，天台见。\n记得带零食。',
  gossip: '放学后，天台见。\n这次的八卦，我谁也不告诉。',
  jock: '放学后，天台见！\n迟到罚跑十圈。',
  artsy: '放学后，天台见。\n那里的夕阳，比你写的还要好看。',
  chuuni: '契约成立。\n放学后，天台见。',
  shy: '……放学后，\n天台见。',
  clown: '放学后，天台见。\n（这次不是恶作剧）',
  gamer: '放学后，天台见。\n组队申请：已通过。',
  normal: '放学后，天台见。',
};
const ROOF_TALK = [
  ['……你的字，好丑。', '但是，我看了好多遍。'],
  ['纸团飞过来的时候，我还以为是谁在恶作剧。', '……还好，是你。'],
  ['其实，我早就发现你上课一直在看我了。', '以后……要认真听讲啊，笨蛋。'],
];
const ME_LINE = ['……嗯。', '那……明天也一起看夕阳吧？', '我、我也不知道该说什么……'];

export default async function perfect(d) {
  const crush = d.crush;
  const me = d.seatPlayer();
  const t = d.teacher;
  const letter = d.round.letter?.text || '……';
  begin(d, { music: null });
  settleClass(d, { except: [crush], teacher: 'board' });

  // 1 — notice (the teacher keeps writing, back turned)
  d.beat('react');
  await front(d, crush, { angle: 0.45, dist: 1.5, fov: 38 });
  hitPrelude(d, [crush]);
  await pickUpAndRead(d, crush);

  // 2 — reading your words; the blush creeps in
  d.music('romance');
  d.bg(front(d, crush, { angle: 0.3, dist: 1.0, fov: 30, dur: 6 }));
  expressionRamp(d, crush, [[0, 'shock'], [1.6, 'embarrassed', 'sweat'], [3.4, 'blush', 'blush']]);
  await d.reveal(letter, { mode: 'read' });
  await reactionCloseUp(d, crush, { expr: 'blush', emote: 'blush', sfx: 'heartbeat', beat: 'climax', hold: 1.8 });

  // 3 — a glance back at you over the shoulder
  d.beat('glance');
  d.look(crush, me);
  d.expr(crush, 'blush');
  await d.overShoulder(me, crush, { dur: 0 });
  d.sfx('heartbeat');
  d.emote(crush, 'heart', 1.4);
  d.bg(d.caption('心 动', 'impact', 1.4));
  await d.wait(1.6);

  // 4 — writes a reply while the teacher lectures to the board
  d.look(crush, null);
  d.anim(crush, 'write', { loop: true });
  d.sfx('pencil');
  await d.closeUp(crush, { side: 'right', dist: 1.2, fov: 34, dur: 0 });
  d.bubble(t, d.pick(['所以这道题的答案是……', '同学们，这里是重点。', '看黑板，别走神。']), 1.8);
  await d.wait(1.8);

  // 5 — the reply flies back (reverse parabola)
  d.beat('reply');
  const note = d.prop('replyNote');
  d.anim(crush, 'throw');
  d.sfx('whoosh');
  await d.wait(0.25);
  const from = d.handPos(crush);
  const to = PLAYER_DESK_TOP();
  // side-on wide: camera beside the arc (never on it), fixed look at the arc's middle, gentle push-in
  const mid = from.clone().lerp(to, 0.5);
  const n = V(-(to.z - from.z), 0, to.x - from.x).normalize();
  let side = mid.clone().addScaledVector(n, 2.8);
  if (Math.abs(side.x) > 4.5 || side.z > 4.2 || side.z < -5.5) side = mid.clone().addScaledVector(n, -2.8);
  side.x = Math.max(-4.6, Math.min(4.6, side.x)); side.z = Math.max(-5.4, Math.min(4.2, side.z));
  side.y = Math.max(2.05, mid.y + 0.9);
  const look = mid.clone().add(V(0, 0.45, 0));
  d.cut({ pos: side, look, fov: 62 });
  d.slowMo(0.45, 1.1);
  d.bg(d.shot({ pos: side.clone().lerp(look, 0.12), look, fov: 58, dur: 1.3 }));
  await d.throwProp(note, from, to, { height: 0.85, duration: 1.3 });
  d.sfx('thudDesk', { volume: 0.4 });

  // 6 — "放学后，天台见。" (POV, looking down at your desk)
  me.root.visible = false;
  d.cut({ pos: EYE(), look: to, fov: 46 });
  d.sfx('paperUnfold');
  d.sfx('stingReveal', { volume: 0.6 });
  await d.reveal(traitLine(d, crush, REPLY, ['放学后，天台见。']), { mode: 'reply' });
  d.sfx('sparkle');

  // 7 — heart iris to the sunset rooftop
  await d.iris('out', 0.8);
  const set = d.stage('rooftop');
  d.showOnly([me, crush]);
  const L = d.anchor(set, 'left', V(-0.6, 0, -1.6), -Math.PI / 2);
  const R = d.anchor(set, 'right', V(0.6, 0, -1.6), Math.PI / 2);
  d.place(me, L);
  d.place(crush, R);
  d.hold(crush, null);
  d.anim(me, 'idle', { loop: true });
  d.anim(crush, 'blushShy');
  d.expr(me, 'embarrassed');
  d.expr(crush, 'blush');
  d.look(me, crush);
  d.look(crush, me);
  d.music('romance');
  await d.camAt(d.anchor(set, 'camWide'), { fov: 45 });
  await d.iris('in', 0.8);
  d.bg(d.caption('放学后 · 天台', 'chapter', 2.4));
  d.bg(d.twoShot(me, crush, { dur: 2.2, fov: 38 }));
  const talk = d.pick(ROOF_TALK);
  await d.say(crush, talk[0], { mood: 'shy' });
  await d.say(me, d.pick(ME_LINE));
  await d.say(crush, talk[1], { mood: 'love', expr: 'smile' });

  // 8 — side by side, facing the sunset
  const rail = d.anchor(set, 'railing', V(0, 0, -2.9), 0);
  d.bg(d.walk(me, rail.pos.clone().add(V(-0.3, 0, 0.55)), { speed: 0.8 }));
  await d.walk(crush, rail.pos.clone().add(V(0.3, 0, 0.55)), { speed: 0.8, cap: 2 });
  d.bg(d.face(me, rail.yaw || 0, 0.4));
  d.bg(d.face(crush, rail.yaw || 0, 0.4));
  d.look(me, null);
  d.look(crush, null);
  d.emote(crush, 'hearts', 2.5);
  d.emote(me, 'heart', 2.5);
  d.expr(me, 'happy');
  d.expr(crush, 'smile');
  await d.camAt(d.anchor(set, 'camSunset'), { fov: 50, dur: 2.4 });
  await finalHold(d, 1.8);
}
