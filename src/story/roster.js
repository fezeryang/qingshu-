// Class roster, teacher and ending NPCs (owner: narrative-director).
// Pure data + makeRoster(); no three.js, no ctx — importable from Node tests.
import { SEATS, PLAYER_SEAT } from '../core/layout.js';

/** Traits whose owners report a mis-delivered love letter to the teacher. */
export const SNITCH_TRAITS = ['monitor', 'disciplinarian'];

const S = (id, name, gender, trait, look, pitch, bio, speed = 1) => ({
  id, name, gender, role: 'student', trait,
  look: { eyeColor: '#3a2a22', glasses: false, accessory: 'none', outfit: 'uniform', build: 'normal', height: 1, ...look },
  voice: { pitch, speed }, bio,
});

// 23 fixed classmates: 12 girls + 11 boys. Every trait exists for both genders
// (snitch: monitor = girl, disciplinarian = boy), so every ending is reachable with either player gender.
export const STUDENTS = [
  // ---- girls ----
  S('lin_xiaoyu', '林晓雨', 'f', 'monitor', { bottom: 'skirt', skin: '#f6d7c3', hairColor: '#2a1d17', hairStyle: 'ponytail', accessory: 'hairclip', height: 1.0, build: 'slim' }, 1.3,
    '班长。正义感爆表，看到有人违纪，手会比脑子先举起来："老师！"'),
  S('gu_xiaosuan', '顾小算', 'f', 'nerd', { skin: '#f8dcc8', hairColor: '#1b1a1f', hairStyle: 'braid', glasses: true, height: 0.95, build: 'slim', eyeColor: '#2a3550' }, 1.4,
    '年级第一。草稿纸写得像印刷体，看到什么都想先列个方程。'),
  S('bai_xiaomeng', '白小梦', 'f', 'sleeper', { skin: '#f3d3bd', hairColor: '#4b3527', hairStyle: 'messy', height: 0.97 }, 1.2,
    '外号"睡美人"。上课睡觉从不打呼，老师都不忍心叫醒她。', 0.8),
  S('chen_keke', '陈可可', 'f', 'foodie', { skin: '#f1cdb3', hairColor: '#3e2a20', hairStyle: 'bob', height: 0.93, build: 'sturdy' }, 1.5,
    '抽屉就是一个小卖部：辣条、薯片、果冻，应有尽有。'),
  S('tang_tang', '唐糖', 'f', 'gossip', { bottom: 'skirt', skin: '#f7d9c6', hairColor: '#3b2418', hairStyle: 'twintails', accessory: 'hairclip', height: 0.96, build: 'slim' }, 1.6,
    '全班恋爱情报中转站，消息比校园广播还快。', 1.2),
  S('xia_mo', '夏沫', 'f', 'jock', { skin: '#e9be9c', hairColor: '#211a19', hairStyle: 'short', accessory: 'headband', height: 1.06 }, 1.25,
    '女篮队长，反应速度 0.1 秒，飞过来的东西一律接住。'),
  S('ye_zhiqiu', '叶知秋', 'f', 'artsy', { bottom: 'skirt', skin: '#f8e0cf', hairColor: '#5a3b2a', hairStyle: 'bun', accessory: 'mole', height: 1.02, build: 'slim', eyeColor: '#5a4030' }, 1.3,
    '文艺少女。数学课本的空白处画满了漫画，下雨天会写诗。', 0.9),
  S('leng_yue', '冷月', 'f', 'chuuni', { bottom: 'skirt', skin: '#f9e3d6', hairColor: '#1c1b2b', hairStyle: 'curtain', accessory: 'bandaid', height: 0.99, build: 'slim', eyeColor: '#5b3a8a' }, 1.15,
    '自称"暗夜的魔女"，左眼封印着冰之魔眼（其实是麦粒肿）。'),
  S('su_nian', '苏念', 'f', 'shy', { bottom: 'skirt', skin: '#f8dccb', hairColor: '#2b211c', hairStyle: 'long', height: 0.94, build: 'slim' }, 1.45,
    '说话声音比翻书声还小，被点名时耳朵会先红。', 0.8),
  S('le_duoduo', '乐多多', 'f', 'clown', { skin: '#f0caa9', hairColor: '#7a4527', hairStyle: 'ponytail', accessory: 'freckles', height: 0.98 }, 1.55,
    '笑点低、笑声高，能把王老师的口头禅模仿得一模一样。', 1.15),
  S('you_xiaoyou', '游小悠', 'f', 'gamer', { skin: '#f5d5c0', hairColor: '#2e2a3a', hairStyle: 'sidepart', accessory: 'earbuds', height: 0.96, build: 'slim' }, 1.35,
    '笔袋里藏着掌机，段位比成绩高，口头禅是"再来一局"。'),
  S('xu_ruoqing', '许若晴', 'f', 'normal', { bottom: 'skirt', skin: '#f4d4bf', hairColor: '#4a3021', hairStyle: 'long', accessory: 'hairclip', height: 1.01 }, 1.3,
    '普通得刚刚好：成绩中等，笑起来很好看，人缘意外地好。'),
  // ---- boys ----
  S('yan_zheng', '严正', 'm', 'disciplinarian', { skin: '#f0cfb6', hairColor: '#121212', hairStyle: 'sidepart', glasses: true, height: 1.04 }, 0.85,
    '纪律委员。随身带着小本本，上面记着全班每个人的"罪行"。'),
  S('song_shuhang', '宋书航', 'm', 'nerd', { skin: '#f6dac6', hairColor: '#1b1b1b', hairStyle: 'short', glasses: true, height: 0.94, build: 'slim', eyeColor: '#2a3550' }, 1.0,
    '眼镜片比瓶底还厚，口头禅是"这题很简单"。'),
  S('zhao_xiaokun', '赵小困', 'm', 'sleeper', { skin: '#efcbb0', hairColor: '#3a2c22', hairStyle: 'messy', height: 1.0 }, 0.8,
    '一节课能睡三觉，梦话里都在背单词。', 0.75),
  S('wang_dazhuang', '王大壮', 'm', 'foodie', { skin: '#e8bc98', hairColor: '#1e1a18', hairStyle: 'buzz', height: 1.07, build: 'sturdy' }, 0.75,
    '饭量是全班的总和，上课偷吃包子从没被抓到过。'),
  S('hu_shuo', '胡硕', 'm', 'gossip', { skin: '#f3d1b9', hairColor: '#5b3a25', hairStyle: 'sidepart', accessory: 'mole', height: 0.97, build: 'slim' }, 1.05,
    '外号"胡说"。全校八卦的源头，至少一半是从他这里传出去的。', 1.2),
  S('zhang_haoran', '张浩然', 'm', 'jock', { skin: '#e3b28e', hairColor: '#1a1414', hairStyle: 'short', accessory: 'headband', height: 1.08, build: 'sturdy' }, 0.8,
    '体育委员，篮球场上的闪电。反射神经比脑子快。'),
  S('jiang_bei', '江北', 'm', 'artsy', { skin: '#f5d8c4', hairColor: '#2a1f1a', hairStyle: 'curtain', accessory: 'earbuds', height: 1.03, build: 'slim' }, 0.95,
    '吉他少年，课本里夹着自己写的歌词，耳机从来不摘。', 0.9),
  S('long_aotian', '龙傲天', 'm', 'chuuni', { skin: '#f2d0b8', hairColor: '#151520', hairStyle: 'messy', accessory: 'bandaid', height: 1.0, build: 'slim', eyeColor: '#8a2a2a' }, 0.9,
    '右手缠着绷带，声称封印着黑龙（其实是打篮球扭的）。'),
  S('wen_yan', '温言', 'm', 'shy', { skin: '#f7dcca', hairColor: '#3b2a20', hairStyle: 'curtain', accessory: 'freckles', height: 0.95, build: 'slim' }, 1.05,
    '一句话要在心里排练十遍才敢说出口，脸红是常态。', 0.8),
  S('sun_xiaokong', '孙小空', 'm', 'clown', { skin: '#ecc4a5', hairColor: '#3a2a1f', hairStyle: 'buzz', height: 0.93 }, 1.1,
    '班级活宝。王老师转身三秒，他就能表演一段单口相声。', 1.15),
  S('li_yiming', '李一鸣', 'm', 'gamer', { skin: '#f1d3bf', hairColor: '#26222e', hairStyle: 'curtain', glasses: true, height: 0.98 }, 0.95,
    '手机藏在课本下面，游戏段位比考试排名高。'),
];

export const TEACHER = {
  id: 'teacher', name: '王老师', gender: 'm', role: 'teacher', trait: 'strict',
  look: { skin: '#eac3a4', hairColor: '#3a3632', hairStyle: 'combover', eyeColor: '#2a2420', glasses: true, height: 1.06, build: 'sturdy', outfit: 'shirtTie', accessory: 'mole' },
  voice: { pitch: 0.6, speed: 0.9 },
  bio: '数学老师，教龄三十年。保温杯不离手，粉笔头百发百中。',
};

const N = (id, name, gender, look, pitch, bio) => ({
  id, name, gender, role: 'npc', trait: 'normal',
  look: { eyeColor: '#2e2420', glasses: false, accessory: 'none', build: 'normal', height: 1.05, ...look },
  voice: { pitch }, bio,
});

/** Ending-only characters. Create with ctx.cast.extra(NPCS.x) (cast caches by id). */
export const NPCS = {
  dad: N('npc_dad', '爸爸', 'm', { skin: '#e6bd9c', hairColor: '#24201e', hairStyle: 'sidepart', glasses: true, build: 'sturdy', outfit: 'casual', height: 1.08 }, 0.7,
    '平时话不多，年轻时也写过情书。'),
  mom: N('npc_mom', '妈妈', 'f', { skin: '#f3d2bc', hairColor: '#3a2620', hairStyle: 'bun', outfit: 'casual', height: 1.02, accessory: 'mole' }, 1.25,
    '嗓门大，心更软。'),
  principal: N('npc_principal', '校长', 'm', { skin: '#efc8a8', hairColor: '#8a8580', hairStyle: 'bald', glasses: true, build: 'sturdy', outfit: 'suit', height: 1.04 }, 0.65,
    '慈祥的校长，最爱在升旗仪式上讲话。'),
  pe: N('npc_pe', '体育老师', 'm', { skin: '#d9a47e', hairColor: '#141414', hairStyle: 'buzz', build: 'sturdy', outfit: 'tracksuit', height: 1.08, accessory: 'headband' }, 0.7,
    '校篮球队主教练，嗓门能盖过上课铃。'),
  janitor: N('npc_janitor', '保洁阿姨', 'f', { skin: '#e8c0a0', hairColor: '#6e6660', hairStyle: 'bun', outfit: 'janitor', height: 0.95, build: 'sturdy' }, 1.0,
    '学校里最晚下班的人，见过无数封没送出去的情书。'),
};

/** The player's own body for endings that show "you" (one per gender; cast.extra caches by id). */
export function playerAvatarSpec(gender) {
  const g = gender === 'f' ? 'f' : 'm';
  return {
    id: `player_${g}`, name: '你', gender: g, role: 'npc', trait: 'normal',
    look: g === 'f'
      ? { skin: '#f7dbc8', hairColor: '#2c201b', hairStyle: 'long', bottom: 'skirt', eyeColor: '#3a2a22', glasses: false, height: 0.98, build: 'slim', outfit: 'uniform', accessory: 'hairclip' }
      : { skin: '#f0cfb5', hairColor: '#1d1816', hairStyle: 'messy', eyeColor: '#3a2a22', glasses: false, height: 1.0, build: 'normal', outfit: 'uniform', accessory: 'none' },
    voice: { pitch: g === 'f' ? 1.3 : 0.95 },
    bio: '坐在最后一排靠窗的位置——动漫主角专座。',
  };
}

const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * Build this round's roster.
 * @param rng          ctx.rng.fork('roster') (any object with shuffle/pick)
 * @param playerGender 'm' | 'f'
 * @param opts         { crushId?, seatMap? } — test overrides.
 *   seatMap may be partial: listed seats are used as given (id or null = keep empty); every student not
 *   listed is placed, in shuffled order, into the remaining free seats. The player's seat is always empty.
 */
export function makeRoster(rng, playerGender = 'm', opts = {}) {
  const pg = playerGender === 'f' ? 'f' : 'm';
  const students = STUDENTS.map(clone);
  const ids = new Set(students.map((s) => s.id));
  const seatMap = Object.fromEntries(SEATS.map((s) => [s.id, null]));
  const placed = new Set();
  const reserved = new Set([PLAYER_SEAT]);

  if (opts && opts.seatMap && typeof opts.seatMap === 'object') {
    for (const [seatId, cid] of Object.entries(opts.seatMap)) {
      if (!(seatId in seatMap) || seatId === PLAYER_SEAT) continue;
      reserved.add(seatId);
      if (cid && ids.has(cid) && !placed.has(cid)) { seatMap[seatId] = cid; placed.add(cid); }
    }
  }
  const freeSeats = rng.shuffle(SEATS.filter((s) => !reserved.has(s.id)).map((s) => s.id));
  const toPlace = rng.shuffle(students.filter((s) => !placed.has(s.id)).map((s) => s.id));
  toPlace.forEach((cid, i) => { if (i < freeSeats.length) { seatMap[freeSeats[i]] = cid; placed.add(cid); } });

  let crushId = opts && opts.crushId && ids.has(opts.crushId) ? opts.crushId : null;
  if (!crushId) {
    const seated = students.filter((s) => placed.has(s.id));
    const pool = seated.filter((s) => s.gender !== pg);
    crushId = (pool.length ? rng.pick(pool) : rng.pick(seated.length ? seated : students)).id;
  }
  return { students, teacher: clone(TEACHER), seatMap, crushId, playerSeatId: PLAYER_SEAT, playerGender: pg };
}
