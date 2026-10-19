// Ending metadata + resolve() — the GDD §7 priority table (owner: narrative-director).
// Pure module: no three.js, no ctx. Unit test: node dev/story/resolve.test.mjs
import { PLAYER_SEAT, SEATS } from '../core/layout.js';
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
  { id: 'love_bonk', title: '隐藏 · 砸出来的缘分', subtitle: '一记"爆头"，砸出了一段缘分。', rarity: 'secret',
    hint: '有时候，"砸中"比"扔中"更浪漫。', icon: '💥', color: '#ff8fa8' },
  { id: 'passed_around', title: '隐藏 · 全班传阅', subtitle: '一张纸条传遍全班，最后才到 TA 手里。', rarity: 'secret',
    hint: '交给班上消息最灵通的人，就等于交给了全世界。', icon: '📨', color: '#8fd16a' },
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

/** A floor landing this close (m, XZ) to an occupied seat is picked up by its occupant (GDD §7 recipient rule). */
export const NEAR_SEAT_DIST = 0.9;
const PLACE_TYPES = new Set(['teacher', 'podium', 'teacherDesk', 'trash', 'outside', 'fan', 'self']);
const BODY_TAGS = new Set(['head', 'body']);

/**
 * GDD §7 recipient rule: who ends up with the letter, and how.
 *   desk   — rests on a desk/chair (or was caught): the occupant / catcher
 *   bonk   — otherwise, the first classmate it hit (head/body)
 *   pickup — otherwise, resting within NEAR_SEAT_DIST of an occupied seat: that seat's occupant
 *   null   — nobody (or a place landing: teacher, podium, bin, window, fan, own desk)
 * Pure. Returns { id, delivery }.
 */
export function decideRecipient(round, L) {
  const none = { id: null, delivery: null };
  if (!L || PLACE_TYPES.has(L.type) || isSelfLanding(L) || (L.type === 'intercept' && L.ownerId === 'teacher')) return none;
  const students = round?.roster?.students || [];
  const isStudent = (id) => !!id && id !== 'teacher' && students.some((s) => s.id === id);
  const occ = (seatId) => (seatId && seatId !== PLAYER_SEAT ? round?.roster?.seatMap?.[seatId] ?? null : null);
  if (L.type === 'desk' || L.type === 'chair' || L.type === 'intercept') {
    const id = L.ownerId ?? occ(L.seatId);
    if (isStudent(id)) return { id, delivery: 'desk' };
  }
  const hit = (Array.isArray(L.hits) ? L.hits : []).find((h) => h && BODY_TAGS.has(h.tag) && isStudent(h.ownerId));
  if (hit) return { id: hit.ownerId, delivery: 'bonk' };
  const p = L.pos;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
    let best = null;
    for (const s of SEATS) {
      const id = occ(s.id);
      if (!isStudent(id)) continue;
      const dist = Math.min(Math.hypot(p.x - s.x, p.z - s.chairZ), Math.hypot(p.x - s.x, p.z - s.deskZ));
      if (dist <= NEAR_SEAT_DIST && (!best || dist < best.dist)) best = { id, dist };
    }
    if (best) return { id: best.id, delivery: 'pickup' };
  } else if (L.nearSeatId && (L.nearSeatDist ?? 0) <= NEAR_SEAT_DIST && isStudent(occ(L.nearSeatId))) {
    return { id: occ(L.nearSeatId), delivery: 'pickup' };
  }
  return none;
}

/** Back-compat helper: the recipient's spec or null. */
export function recipientOf(round, L) {
  const { id } = decideRecipient(round, L);
  return id ? round?.roster?.students?.find((s) => s.id === id) || null : null;
}

/**
 * GDD §7, top to bottom. Pure apart from writing round.recipientId / round.delivery (contract §4.6).
 * Reads round.{launched, caughtDuring, teacherSawBall, landing, crushId, playerGender, roster}.
 */
export function resolve(round) {
  const r = round || {};
  const L = r.landing || { type: 'timeout', hits: [] };
  const { id: recId, delivery } = r.launched && r.caughtDuring !== 'aim' ? decideRecipient(r, L) : { id: null, delivery: null };
  if (round) { round.recipientId = recId; round.delivery = delivery; }
  // 1 coward — the bell rang and you never threw
  if (!r.launched && r.caughtDuring !== 'aim') return 'coward';
  // 2 caught_read (a) — suspicion maxed while aiming
  if (r.caughtDuring === 'aim') return 'caught_read';

  const seen = !!r.teacherSawBall || r.caughtDuring === 'flight';
  const rec = recId ? r.roster.students.find((s) => s.id === recId) : null;
  const special = hitTeacher(L) || !!SPECIAL[L.type] || isSelfLanding(L);
  const isCrush = !!rec && rec.id === r.crushId;
  const sameGender = !!rec && rec.gender === r.playerGender;

  // 2 caught_read (b) — the teacher saw it fly, and it ended up with the crush / a same-gender classmate / nobody
  if (seen && (isCrush || (rec && sameGender) || (!rec && !special))) return 'caught_read';
  // 3–8 — places, not people
  if (hitTeacher(L)) return 'chalk_counter';
  if (L.type === 'podium' || L.type === 'teacherDesk') return 'graded';
  if (L.type === 'trash') return 'three_pointer';
  if (L.type === 'outside') return 'out_window';
  if (L.type === 'fan') return 'confetti';
  if (isSelfLanding(L)) return 'self_love';
  if (rec) {
    // love_bonk — it bonked the crush (and the crush ended up with it), unseen
    const crushHit = (L.hits || []).some((h) => h && BODY_TAGS.has(h.tag) && h.ownerId === r.crushId);
    if (isCrush && !seen && (delivery === 'bonk' || crushHit)) return 'love_bonk';
    // passed_around — a gossip got it (not the crush), unseen
    if (!isCrush && !seen && rec.trait === 'gossip') return 'passed_around';
    if (!isCrush && !sameGender) return seen || SNITCH_TRAITS.includes(rec.trait) ? 'wrong_caught' : 'wrong_accept';
    if (!isCrush) return 'same_gender';
    return 'perfect';
  }
  // lost — floor / aisle far from everyone, nobody hit, unseen
  return 'lost';
}
