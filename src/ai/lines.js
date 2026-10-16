// Text content for the AI module: blackboard lessons, teacher lines, classmate lines.
// Player-facing text is Simplified Chinese (docs/TEAM.md rule 7). Keep board lines short
// (≈ 18 glyphs) so they fit the blackboard canvas whatever font the world module uses.

/** Blackboard lessons. One is picked per round; lines are chalked one character at a time. */
export const LESSONS = [
  {
    id: 'quadratic',
    title: '§2.3 二次函数',
    lines: [
      'y = ax² + bx + c  (a≠0)',
      'a > 0 时，开口向上',
      '对称轴：x = -b / 2a',
      '顶点 (-b/2a, (4ac-b²)/4a)',
      '例1  y = x² - 4x + 3',
      '求顶点及与 x 轴交点',
      '解：y = (x - 2)² - 1',
      '∴ 顶点为 (2, -1)',
      '令 y = 0，x₁ = 1，x₂ = 3',
    ],
  },
  {
    id: 'parabola',
    title: '§2.4 抛物线的应用',
    lines: [
      '斜抛运动的轨迹是抛物线',
      'y = x·tanθ - gx²/(2v²cos²θ)',
      'θ = 45° 时射程最远',
      '例2  一纸团从后排抛出……',
      '初速度 v，仰角 θ',
      '求：它落在谁的桌上？',
      '注：空气阻力忽略不计',
    ],
  },
  {
    id: 'equation',
    title: '§1.5 一元二次方程',
    lines: [
      'ax² + bx + c = 0',
      'Δ = b² - 4ac',
      'Δ > 0：两个不等实根',
      'Δ = 0：两个相等实根',
      'x = (-b ± √Δ) / 2a',
      '例3  x² - 5x + 6 = 0',
      '解：(x - 2)(x - 3) = 0',
      '∴ x₁ = 2，x₂ = 3',
    ],
  },
  {
    id: 'circle',
    title: '§4.2 圆的切线',
    lines: [
      '切线 ⊥ 过切点的半径',
      '例4  PA、PB 切⊙O 于 A、B',
      '求证：PA = PB',
      '证明：连接 OA、OB、OP',
      '∵ OA ⊥ PA，OB ⊥ PB',
      '又 OA = OB，OP = OP',
      '∴ Rt△OAP ≌ Rt△OBP',
      '∴ PA = PB',
    ],
  },
];

/** Rare easter-egg board lines (at most two per round). */
export const BOARD_EGGS = [
  '解：设暗恋对象为 x',
  '∵ 心动  ∴ 心慌',
  '求证：我一点也不紧张',
  '注：本题与恋爱无关',
  'y = 1/x （距离越近越…）',
  '已知：她不知道',
];

/** The teacher mutters these over his shoulder while writing (back still turned). */
export const WRITING_MUTTER = [
  '这个地方要注意……',
  '都抄下来啊。',
  '这一步很关键。',
  '我写慢一点……',
];

/** Lecture lines while facing the class. */
export const LECTURE = [
  '这个地方很重要，考试必考！',
  '都看黑板，不要看窗外。',
  '后排的同学，听懂了没有？',
  '我再强调一遍啊——',
  '这道题上周是不是讲过？',
  '有问题的同学现在就问。',
  '你们是我带过最差的一届。',
  '下课铃是给老师的，不是给你们的。',
  '我在讲台上看得一清二楚。',
  '这题闭着眼睛都能做对。',
  '耽误大家一分钟，就是全班半小时。',
  '好，我们继续。',
  '把手机收起来，别以为我看不见。',
  '这个顶点，大家记住了没有？',
];

export const OPENING = ['好，我们接着上节课讲。', '安静，开始上课了。', '把书翻到第四十二页。'];

/** Turn tells (warning state). Empty string = no bubble, only the head tilt / emote. */
export const WARNING_TELL = ['嗯？', '……', '嗯——？', ''];
export const HEARD_TELL = ['什么声音？', '嗯？！', '谁？'];
export const FAKEOUT_TELL = ['嗯……算了。', '……', ''];
export const DRINK_TELL = ['（吸溜——）', '啊……', ''];
export const PATROL_LINES = ['我下来看看大家写得怎么样。', '都写完了吗？', '我看看谁没在听。'];
export const SUSPICIOUS_LINES = ['嗯——？', '靠窗那个同学……', '你手里拿的什么？', '我看见了啊。', '别以为我没看见。'];
export const SUSPICIOUS_CLEAR = ['……好好听课。', '嗯，继续。', '算你认真。'];
export const ALERT_AIM = ['那个同学！手里拿的什么！', '靠窗那个！站起来！'];
export const ALERT_BALL = ['谁扔的？！', '站住——什么东西飞过去了？！'];

/** Calling on a student (P1). {name} is replaced by the student's name. */
export const CALL_ON = ['{name}，你来回答一下。', '{name}，这道题你来说。', '{name}，你说说看。'];
export const ANSWER_GOOD = ['顶点是 (2, -1)！', 'x₁ = 2，x₂ = 3！', '因为半径垂直于切线！'];
export const ANSWER_BAD = ['呃……x 等于……二？', '选……C？', '我……刚才没听清。', '老师，这题超纲了吧？'];
export const REPLY_GOOD = ['很好，坐下。', '不错，大家要向{pron}学习。'];
export const REPLY_BAD = ['上课认真听！坐下。', '下课来我办公室。坐下吧。', '……站着听十分钟。算了，坐下。'];

/** Scolding someone who kept slacking after the teacher turned around (P1). */
export const SCOLD = {
  sleeper: ['{name}！醒醒！', '{name}，昨晚偷牛去了？'],
  gamer: ['{name}，桌子底下是什么？'],
  foodie: ['{name}，嘴里吃的什么？'],
  gossip: ['{name}，就你话多！'],
  clown: ['{name}，你做什么鬼脸？'],
  default: ['{name}，看黑板！'],
};
export const SCOLD_REPLY = { sleeper: '我、我没睡！', gamer: '没、没什么！', foodie: '（咕咚）没有！', gossip: '……', clown: '嘿嘿。', default: '对不起……' };

/** Classmate lines. */
export const STUDENT = {
  sneeze: ['阿嚏！', '阿——嚏！'],
  standUp: ['老师，我想去厕所！', '老师！窗外有只猫！', '（腿麻了……）'],
  raiseHand: ['老师，我有问题！', '老师，这题我会！', '老师——'],
  stretch: ['啊——好困……', '（伸懒腰）'],
  witness: ['诶？！', '那是什么？！', '纸团？'],
  catch: ['接住了！', '好球！', '嗯？谁的？'],
  hit: ['哎哟！', '谁砸我？！', '好痛……'],
  nearMiss: ['哇！', '吓死我了！'],
  gossip: ['听说了吗……', '真的假的！', '嘘——'],
  chuuni: ['吾之右手……在躁动……', '封印……快要解除了……'],
  clown: ['略略略～', '（挤眉弄眼）'],
  foodie: ['（咔嚓）', '（嚼嚼）'],
  note: ['（传纸条）', '放学去吃冰？'],
};
