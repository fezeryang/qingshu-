// Teacher states + class contrast screenshots.
//   node tools/shot.mjs --script dev/ai/teacher.js --out dev/ai/shots
qs.manual(true);
const ctx = qs.ctx, V = (x, y, z) => new ctx.THREE.Vector3(x, y, z);
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true });
const wide = () => ctx.cam.cut({ pos: V(3.6, 2.5, 3.6), look: V(-0.8, 1.0, -4.2), fov: 55 });
const info = {};
qs.forceTeacher('writing', 20);
await qs.advance(6);                 // board fills, class goes into mischief
wide(); await shot('t1_writing'); info.writing = { board: ctx.world.classroom.blackboard.text, acts: ctx.ai.students.list().map((s) => s.act).join(',') };
qs.forceTeacher('warning', 5);
await qs.advance(0.3);
ctx.cam.cut({ pos: V(0.6, 1.9, -3.4), look: V(-0.6, 1.6, -5.4), fov: 50 }); await shot('t2_warning');
qs.forceTeacher('watching', 20);
await qs.advance(2.5);
wide(); await shot('t3_watching'); info.watching = { acts: ctx.ai.students.list().map((s) => s.act).join(','), vis: ctx.ai.teacher.playerVisibility() };
qs.forceTeacher('patrol', 20);
await qs.advance(3.2);
wide(); await shot('t4_patrol'); info.patrol = ctx.ai.teacher.debug();
qs.setSuspicion(0.7);
qs.forceTeacher('suspicious', 20);
await qs.advance(2.5);
ctx.cam.toFP?.({ instant: true }); await qs.advance(0.1); await shot('t5_suspicious_fp'); info.susp = ctx.ai.teacher.debug();
qs.setSuspicion(0);
qs.forceTeacher('drinking', 10);
await qs.advance(1);
ctx.cam.cut({ pos: V(0.4, 1.9, -3.2), look: V(0, 1.6, -5.3), fov: 45 }); await shot('t6_drinking');
info.errors = qs.errors;
return info;
