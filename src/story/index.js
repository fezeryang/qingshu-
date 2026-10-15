// STUB — to be replaced by the narrative-director agent. Contract: docs/CONTRACTS.md §4.6
import { SEATS, PLAYER_SEAT } from '../core/layout.js';
import { store } from '../core/util.js';

const ENDINGS = [
  { id: 'perfect', title: '完美 · 天台之约', rarity: 'rare', hint: '正中红心。' },
  { id: 'same_gender', title: '误投 · 认真的回应', rarity: 'common', hint: '扔给了和你同性别的同学……' },
  { id: 'wrong_caught', title: '误投 A · 请家长', rarity: 'common', hint: '扔错了人，还被发现了。' },
  { id: 'wrong_accept', title: '误投 B · 将错就错', rarity: 'common', hint: '扔错了人，对方却……' },
  { id: 'caught_read', title: '社死 · 当众朗读', rarity: 'common', hint: '被老师抓个正着。' },
  { id: 'chalk_counter', title: '隐藏 · 粉笔头反击', rarity: 'secret', hint: '有人被砸到了，而且是个大人物。' },
  { id: 'graded', title: '隐藏 · 59 分', rarity: 'secret', hint: '讲台也是一张桌子。' },
  { id: 'three_pointer', title: '隐藏 · 三分球', rarity: 'secret', hint: '教室里还有一个篮筐。' },
  { id: 'out_window', title: '隐藏 · 校园广播', rarity: 'secret', hint: '那扇窗户开着。' },
  { id: 'confetti', title: '隐藏 · 心碎成雪', rarity: 'secret', hint: '抬头看看。' },
  { id: 'self_love', title: '隐藏 · 爱自己', rarity: 'secret', hint: '有时候答案就在眼前。' },
  { id: 'lost', title: '隐藏 · 石沉大海', rarity: 'secret', hint: '有些情书谁也没收到。' },
  { id: 'coward', title: '怂 · 下课铃', rarity: 'common', hint: '犹豫就会败北。' },
];

const NAMES_F = ['林晓雨', '苏念', '陈可可', '周雪', '叶知秋', '唐糖', '许若晴', '温柔', '夏沫', '白露', '顾盼', '安然'];
const NAMES_M = ['王大壮', '陈思远', '赵小困', '李一鸣', '张浩然', '刘星', '孙悟', '江北', '何方', '宋书航', '高远'];

export async function install(ctx) {
  const { time } = ctx;

  function makeRoster(rng, playerGender) {
    const students = [];
    NAMES_F.forEach((name, i) => students.push({ id: `f${i}`, name, gender: 'f', role: 'student', trait: i === 0 ? 'monitor' : 'shy', look: {}, voice: { pitch: 1.2 } }));
    NAMES_M.forEach((name, i) => students.push({ id: `m${i}`, name, gender: 'm', role: 'student', trait: i === 0 ? 'jock' : 'normal', look: {}, voice: { pitch: 0.8 } }));
    const free = rng.shuffle(SEATS.filter((s) => s.id !== PLAYER_SEAT).map((s) => s.id));
    const seatMap = Object.fromEntries(SEATS.map((s) => [s.id, null]));
    students.forEach((s, i) => { seatMap[free[i]] = s.id; });
    const crushId = rng.pick(students.filter((s) => s.gender !== playerGender)).id;
    const teacher = { id: 'teacher', name: '王老师', gender: 'm', role: 'teacher', trait: 'strict', look: {}, voice: { pitch: 0.6 } };
    return { students, teacher, seatMap, crushId, playerSeatId: PLAYER_SEAT };
  }

  function resolve(round) {
    if (!round.launched) return round.caughtDuring === 'aim' ? 'caught_read' : 'coward';
    const L = round.landing || { type: 'timeout' };
    const tag = { teacher: 'chalk_counter', podium: 'graded', trash: 'three_pointer', outside: 'out_window', fan: 'confetti', self: 'self_love' }[L.type];
    if (tag) return tag;
    const st = L.ownerId && ctx.cast.get(L.ownerId)?.spec;
    if ((L.type === 'desk' || L.type === 'chair' || L.type === 'caught') && st && st.role === 'student') {
      if (round.teacherSawBall) return st.gender !== round.playerGender && st.id !== round.crushId ? 'wrong_caught' : 'caught_read';
      if (st.id === round.crushId) return 'perfect';
      if (st.gender === round.playerGender) return 'same_gender';
      return st.trait === 'monitor' ? 'wrong_caught' : 'wrong_accept';
    }
    return round.teacherSawBall ? 'caught_read' : 'lost';
  }

  const KEY = 'qingshu.endings';
  const gallery = {
    unlocked: () => store.get(KEY, []),
    unlock(id) { const u = gallery.unlocked(); if (u.includes(id)) return false; store.set(KEY, [...u, id]); return true; },
    reset() { store.set(KEY, []); },
  };

  ctx.story = {
    ENDINGS,
    letters: [
      { id: 'shy', title: '含蓄', text: '今天的夕阳很好看，和你一样。放学后能一起走吗？' },
      { id: 'chuuni', title: '中二', text: '命运的齿轮已经开始转动——我封印在左手的力量，只为守护你。' },
      { id: 'tuwei', title: '土味', text: '你知道我的缺点是什么吗？是缺点你。' },
    ],
    makeRoster,
    resolve,
    async playIntro() { await time.wait(1); },
    async playEnding(id) {
      const e = ENDINGS.find((x) => x.id === id);
      await ctx.ui.say('旁白', e.title);
    },
    gallery,
  };
}
