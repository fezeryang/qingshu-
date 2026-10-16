// Ending metadata + resolve() — the GDD §7 priority table (owner: narrative-director).
// Pure module: no three.js, no ctx. Unit test: node dev/story/resolve.test.mjs
import { PLAYER_SEAT } from '../core/layout.js';
import { SNITCH_TRAITS } from './roster.js';

export const ENDINGS = [
  { id: 'perfect', title: '完美 · 天台之约', subtitle: '纸团飞过四排课桌，心意零误差着陆。', rarity: 'rare',
    hint: '正中红心——而且，老师什么都没看见。', icon: '💌', color: '#ff7aa8' },
  { id: 'same_gender', title: '误投 · 认真的回应', subtitle: '扔错了人，却收到了一份认真得过分的回答。', rarity: 'common',
    hint: '和你同性别的同学，也会很认真地读你的信……', icon: '🌸', color: '#f49ac1' },
  { id: 'wrong_caught', title: '误投 A · 请家长', subtitle: '三千字检讨，从"尊敬的老师"一直写到天亮。', rarity: 'common',
    hint: '扔错了人，而对方恰好是个"正直"的人。', icon: '📝', color: '#7f8fa6' },
  { id: 'wrong_accept', title: '误投 B · 将错就错', subtitle: '错的人，对的时间，莫名其妙的一百天。', rarity: 'common',
    hint: '扔错了人，对方却红了脸。', icon: '🙈', color: '#ffb26b' },
  { id: 'caught_read', title: '社死 · 当众朗读', subtitle: '你写下的每一个字，全班都听见了。', rarity: 'common',
    hint: '在老师的眼皮底下动手。', icon: '📢', color: '#e05a5a' },
  { id: 'chalk_counter', title: '隐藏 · 粉笔头反击', subtitle: '三十年教龄的狙击手，从不失手。', rarity: 'secret',
    hint: '有人被砸到了——而且是个大人物。', icon: '🎯', color: '#6fb7a8' },
  { id: 'graded', title: '隐藏 · 59 分', subtitle: '离及格，只差一个"喜欢"。', rarity: 'secret',
    hint: '讲台，也是一张桌子。', icon: '💯', color: '#d94a4a' },
  { id: 'three_pointer', title: '隐藏 · 三分球', subtitle: '情书没送到，校篮球队收到了。', rarity: 'secret',
    hint: '教室角落里，也有一个"篮筐"。', icon: '🏀', color: '#ff8c32' },
  { id: 'out_window', title: '隐藏 · 校园广播', subtitle: '全校三千人，都知道你喜欢谁了。', rarity: 'secret',
    hint: '那扇窗户，一直开着。', icon: '📻', color: '#5fb3e8' },
  { id: 'confetti', title: '隐藏 · 心碎成雪', subtitle: '你的心碎成了一千片，每一片都是心形的。', rarity: 'secret',
    hint: '抬头看看——天花板上有东西在转。', icon: '❄️', color: '#9fd4ff' },
  { id: 'self_love', title: '隐藏 · 爱自己', subtitle: '兜兜转转，最懂你的人还是你自己。', rarity: 'secret',
    hint: '有时候，答案就在你自己的桌上。', icon: '🪞', color: '#b68cff' },
  { id: 'lost', title: '隐藏 · 石沉大海', subtitle: '有些情书，注定没有收件人。', rarity: 'secret',
    hint: '有些情书谁也没收到——连地板都不在乎。', icon: '🌊', color: '#4a5a8a' },
  { id: 'coward', title: '怂 · 下课铃', subtitle: '犹豫了一整节课，错过了一整个青春。', rarity: 'common',
    hint: '犹豫，就会败北。', icon: '🔔', color: '#9a9a9a' },
];
export const ENDING_IDS = ENDINGS.map((e) => e.id);

/** Landing types that have their own ending regardless of who is nearby. */
const SPECIAL = { podium: 'graded', teacherDesk: 'graded', trash: 'three_pointer', outside: 'out_window', fan: 'confetti', self: 'self_love' };

/** Did the ball touch the teacher at any point? */
export function hitTeacher(L) {
  if (!L) return false;
  if (L.type === 'teacher') return true;
  if (L.type === 'intercept' && L.ownerId === 'teacher') return true;
  return Array.isArray(L.hits) && L.hits.some((h) => h && (h.tag === 'teacher' || h.ownerId === 'teacher'));
}

/** Did it come back to the player's own desk/chair? */
export function isSelfLanding(L) {
  return !!L && (L.type === 'self' || ((L.type === 'desk' || L.type === 'chair') && L.seatId === PLAYER_SEAT));
}

/** The classmate who "received" the letter (desk/chair occupant or whoever caught it), or null. */
export function recipientOf(round, L) {
  if (!L || !['desk', 'chair', 'intercept'].includes(L.type) || isSelfLanding(L)) return null;
  let id = L.ownerId;
  if (!id && L.seatId) id = round?.roster?.seatMap?.[L.seatId] ?? null;
  if (!id || id === 'teacher') return null;
  return round?.roster?.students?.find((s) => s.id === id) || null;
}

/**
 * GDD §7, top to bottom. Pure: reads only `round` (launched, caughtDuring, teacherSawBall, landing,
 * crushId, playerGender, roster.students/seatMap).
 */
export function resolve(round) {
  const r = round || {};
  // 1 coward — the bell rang and you never threw
  if (!r.launched && r.caughtDuring !== 'aim') return 'coward';
  // 2 caught_read (a) — suspicion maxed while aiming
  if (r.caughtDuring === 'aim') return 'caught_read';

  const L = r.landing || { type: 'timeout', hits: [] };
  const seen = !!r.teacherSawBall || r.caughtDuring === 'flight';
  const rec = recipientOf(r, L);
  const special = hitTeacher(L) || !!SPECIAL[L.type] || isSelfLanding(L);
  const isCrush = !!rec && rec.id === r.crushId;
  const sameGender = !!rec && rec.gender === r.playerGender;

  // 2 caught_read (b) — the teacher saw it fly, and it landed on the crush / a same-gender classmate / the floor
  if (seen && (isCrush || (rec && sameGender) || (!rec && !special))) return 'caught_read';
  // 3–8 — places, not people
  if (hitTeacher(L)) return 'chalk_counter';
  if (L.type === 'podium' || L.type === 'teacherDesk') return 'graded';
  if (L.type === 'trash') return 'three_pointer';
  if (L.type === 'outside') return 'out_window';
  if (L.type === 'fan') return 'confetti';
  if (isSelfLanding(L)) return 'self_love';
  if (rec) {
    if (!isCrush && !sameGender) {
      // 9 wrong_caught / 11 wrong_accept
      return seen || SNITCH_TRAITS.includes(rec.trait) ? 'wrong_caught' : 'wrong_accept';
    }
    if (!isCrush) return 'same_gender';   // 10 (unseen, guaranteed by the caught_read rule above)
    return 'perfect';                     // 12 (unseen)
  }
  // 13 lost — floor / aisle / empty desk / timeout, unseen
  return 'lost';
}
