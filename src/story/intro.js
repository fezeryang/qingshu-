// Intro: the bell, "上课！", 起立 / 老师好, sit, slow push onto the crush (≤ 6 s, click/Space skips).
import { PLAYER_EYE } from '../core/layout.js';
import { V } from './direct.js';
import { front } from './cutscenes/common.js';

export async function intro(d) {
  const { ctx } = d;
  const t = d.teacher;
  const crush = d.crush;
  const monitor = d.byTrait('monitor')[0] || d.byTrait('disciplinarian')[0] || d.students()[0];
  d.beat('start');
  d.try('ai.teacher.setEnabled', () => ctx.ai?.teacher?.setEnabled?.(false));
  d.try('ai.students.setAmbient', () => ctx.ai?.students?.setAmbient?.(false));
  d.hud(false);
  d.teacherAtBoard('class', 1);
  d.anim(t, 'idle', { loop: true });
  d.bg(d.letterbox(true, 0.3));

  // Wide from the back of the room, sun from the windows on the left.
  d.cut({ pos: V(2.3, 2.15, 4.1), look: V(-0.6, 1.2, -4.6), fov: 52 });
  ctx.bus.emit('bell', {});
  // the bell sound itself is played by audio on the 'bell' event
  await d.waitUI(0.55);

  d.anim(t, 'teacherLecture');
  d.bubble(t, '上课！', 1.1);
  await d.waitUI(0.65);

  d.bubble(monitor, '起立！', 0.9);
  d.sfx('chairScrape');
  d.crowd((ch) => d.standUp(ch), { stagger: 0.25 });
  await d.waitUI(0.8);

  d.bubble(V(0, 1.75, -0.4), '老——师——好——', 1.2);
  d.sfx('murmur', { volume: 0.6 });
  d.crowd((ch) => d.anim(ch, 'bow'), { stagger: 0.15 });
  await d.waitUI(0.85);

  d.bubble(t, '同学们好，坐。', 0.9);
  d.crowd((ch) => d.sitDown(ch), { stagger: 0.2 });
  await d.waitUI(0.55);

  // The crush: your gaze zooms in through the class, then a soft 3/4 close-up.
  d.beat('crush');
  const head = d.headPos(crush);
  const eye = V(PLAYER_EYE.x, PLAYER_EYE.y, PLAYER_EYE.z);
  const dir = head.clone().sub(eye).normalize();
  d.cut({ pos: eye.clone().addScaledVector(dir, 0.4), look: head, fov: 42 });
  d.sfx('heartbeat');
  d.sfx('slowmoIn', { volume: 0.5 });
  d.slowMo(0.55, 1.4);
  d.bg(d.shot({ pos: head.clone().addScaledVector(dir, -1.25).add(V(0, 0.05, 0)), look: head, fov: 24, dur: 0.6 }));
  d.look(crush, V(-5, 1.6, crush ? crush.root.position.z - 0.6 : 0)); // gazing out of the window
  d.anim(crush, 'sitIdle', { loop: true, speed: 0.4 });
  await d.waitUI(1.05);

  d.bg(front(d, crush, { angle: 0.55, dist: 1.5, fov: 42, dur: 0 }));
  d.expr(crush, 'smile');
  d.emote(crush, 'sparkle', 1.6);
  d.sfx('heartbeat');
  d.sfx('sparkle', { volume: 0.6 });
  d.bg(d.caption(d.name(crush), 'chapter', 1.3));
  await d.waitUI(1.3);
  d.beat('done');
}

/** Called after the intro finished or was skipped: leave a clean aim state. */
export function introCleanup(ctx, d) {
  const name = d.name(d.crush);
  d.try('cast.seatAll', () => ctx.cast?.seatAll?.());
  d.try('letterbox', () => ctx.cam?.letterbox?.(false, 0.2));
  d.try('toFP', () => ctx.cam?.toFP?.({ instant: true }));
  d.try('hud.show', () => ctx.ui?.hud?.show?.(null));
  d.objective(`把情书扔到 ${name} 的桌上`);
  d.try('ai.teacher.setEnabled', () => ctx.ai?.teacher?.setEnabled?.(true));
  d.try('ai.students.setAmbient', () => ctx.ai?.students?.setAmbient?.(true));
}
