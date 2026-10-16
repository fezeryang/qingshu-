// Behaviour AI (owner: qs-ai-designer). Contract: docs/CONTRACTS.md §4.4. Notes: docs/modules/ai.md
//
//   teacher.js   王老师: state machine, view cone, suspicion, hearing, blackboard, lectures
//   students.js  classmates: ambient fidgets by trait, ball reactions, in-flight accidents, P1 scenes
//   lines.js     all Chinese text (board lessons, lecture lines, classmate lines)
import { PLAYER_EYE, BLACKBOARD } from '../core/layout.js';
import { smoothstep, yawTo, deg } from '../core/util.js';
import { createTeacher, TEACHER_STATES, TUNE } from './teacher.js';
import { createStudents, INCIDENT_KINDS } from './students.js';

const BOARD_YAW = yawTo(PLAYER_EYE, { x: BLACKBOARD.x, z: BLACKBOARD.z });
const BOARD_PITCH = Math.atan2(BLACKBOARD.y - PLAYER_EYE.y, Math.hypot(BLACKBOARD.x - PLAYER_EYE.x, BLACKBOARD.z - PLAYER_EYE.z));
const wrap = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

export async function install(ctx) {
  const { bus, engine } = ctx;

  /** How suspicious the player looks: charging 1, gaze far from the board ≈ 0.2, studying 0. */
  function playerExposure() {
    const aim = ctx.gameplay?.aim;
    if (!aim || aim.studying) return 0;
    if (aim.charging) return 1;
    const fp = ctx.cam?.fp;
    if (!fp || !Number.isFinite(fp.yaw) || !Number.isFinite(fp.pitch)) return 0;
    const off = Math.hypot(wrap(fp.yaw - BOARD_YAW), (fp.pitch - BOARD_PITCH) * 0.8);
    return 0.2 * smoothstep(deg(22), deg(45), off);
  }

  let students = null;
  const teacher = createTeacher(ctx, {
    playerExposure,
    onWatching: (o) => students?._onWatching(o),
    callOn: () => students?.callOn(),
    onCaught: () => {},
  });
  students = createStudents(ctx, teacher);

  bus.on('round:setup', () => {
    teacher._resetRound();
    students._resetRound();
  });
  bus.on('phase', ({ to }) => {
    if (to === 'aim') {
      teacher.setEnabled(true);        // whatever the intro did, the aim phase needs a live teacher
      students._startAim();
    } else if (to === 'flight') {
      // keep going: the cycle continues during the flight
    } else {
      teacher._settle();
      if (to === 'ending' || to === 'title' || to === 'card' || to === 'letter') students._endScene();
    }
  });
  bus.on('teacher:state', ({ state }) => students._onTeacherState(state));
  bus.on('ball:launched', (p) => students._onLaunched(p));
  bus.on('ball:hit', ({ tag, ownerId, speed, pos }) => {
    if (ctx.flow?.phase !== 'flight') return;
    if (teacher._hearLoud(tag, speed)) teacher.hear(pos);
    if (tag === 'head' && ownerId) students.react('hit', ownerId);
  });
  bus.on('ball:nearMiss', ({ ownerId, pos }) => {
    if (ctx.flow?.phase !== 'flight' || !ownerId) return;
    if (ownerId === ctx.cast?.teacher?.id || ownerId === 'teacher') teacher.hear(pos);   // whoosh past his ear
    else students.react('nearMiss', ownerId);
  });

  engine.onUpdate((dt) => {
    teacher._update(dt);
    students._update(dt);
  }, engine.ORDER.AI);

  ctx.ai = {
    teacher,
    students,
    playerExposure,
    STATES: TEACHER_STATES,
    INCIDENT_KINDS,
    TUNE,
    debug: {
      get timeline() { return teacher.timeline; },
      teacher: () => teacher.debug(),
      students: () => students.list(),
    },
  };
}
