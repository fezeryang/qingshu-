// lost — 隐藏 · 石沉大海. Nobody notices. Night falls; the janitor sweeps it up (ball's POV).
import { begin, settleClass, front, finalHold } from './common.js';
import { V } from '../direct.js';
import { DOORS } from '../../core/layout.js';

export default async function lost(d) {
  const me = d.seatPlayer();
  const t = d.teacher;
  const bp = d.ballPos();
  bp.y = Math.max(bp.y, 0.04);
  begin(d, { music: 'lonely' });
  settleClass(d, { teacher: 'board' });

  // 1 — the ball's eye view: life goes on
  d.beat('react');
  d.cut({ pos: bp.clone().add(V(0.3, 0.1, 0.45)), look: V(bp.x - 0.4, 0.75, bp.z - 3), fov: 58 });
  d.sfx('clockTick');
  d.bubble(t, d.pick(['好，我们看下一题。', '这个公式，要背下来。']), 1.8);
  await d.wait(1.6);
  d.bg(d.caption('……没有人注意到。', 'whisper', 2.4));
  await d.wait(1.2);
  await front(d, me, { angle: 0.3, dist: 1.45, fov: 40 });
  d.expr(me, 'sad');
  d.emote(me, 'dots', 1.8);
  await d.say(me, d.pick(['……算了。', '……', '（它就那样……躺在地上。）']), { mood: 'sad' });

  // 2 — time-lapse to night
  d.sfx('bell');
  await d.fade(1, 0.7);
  d.mood('night');
  d.showOnly([]);
  const janitor = d.npc('janitor');
  const door = DOORS[1];
  d.place(janitor, V(door.x - 0.6, 0, door.z - 0.2), { yaw: Math.PI / 2 });
  d.hold(janitor, d.prop('broom'));
  d.cut({ pos: V(1.6, 2.5, 4.1), look: bp, fov: 55 });
  await d.fade(0, 0.8);
  d.bg(d.caption('当天晚上', 'chapter', 2));
  d.sfx('footstep');
  await d.walk(janitor, bp.clone().add(V(0.55, 0, 0.45)).setY(0), { speed: 1.4, cap: 4.5 });

  // 3 — ball's POV, looking up at the janitor
  d.beat('climax');
  d.look(janitor, bp);
  d.cut({ pos: bp.clone().add(V(-0.05, 0.05, -0.05)), look: d.headPos(janitor), fov: 62 });
  await d.wait(0.5);
  await d.say(janitor, d.pick(['……又是一封没送出去的。', '年轻真好啊。', '这周第三封了。']), { mood: 'sad' });
  d.hold(janitor, d.prop('dustpan'));
  d.anim(janitor, 'pickUp');
  await d.wait(0.6);
  d.sfx('swoosh');
  d.hideBall();
  d.fade(0.6, 0.2);
  await d.wait(0.3);
  d.fade(0, 0.4);
  d.bg(d.caption('石 沉 大 海', 'chapter', 2.6));

  // 4 — off she goes, humming
  d.emote(janitor, 'music', 2.5);
  d.bg(d.walk(janitor, V(door.x - 0.6, 0, door.z - 0.2), { speed: 0.9 }));
  d.beat('final');
  d.cut({ pos: V(-1.2, 1.9, -4.2), look: V(3.2, 0.9, 2.6), fov: 52 });
  await d.shot({ pos: V(-0.6, 1.8, -3.6), look: V(3.6, 0.9, 3.0), fov: 48, dur: 2 });
  await finalHold(d, 1.4);
}
