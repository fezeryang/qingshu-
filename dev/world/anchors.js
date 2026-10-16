// Characters on ending-set anchors + blackboard API edge cases.
qs.manual(true);
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true });
const ctx = qs.ctx, T = ctx.THREE, bb = ctx.world.classroom.blackboard;
const res = {};
// blackboard: markup, overflow scrolling, typewriter
bb.clear();
for (let i = 1; i <= 12; i++) bb.append(`第${i}行：[[yellow]]a${i}[[white]] + b = c，这是一行很长很长的板书内容用来测试自动换行与滚动效果。\n`);
res.writingBefore = bb.isWriting;
await qs.advance(3);
res.writingMid = bb.isWriting;
bb.flush();
res.writingAfter = bb.isWriting;
res.textLen = bb.text.length;
ctx.cam.cut({ pos: new T.Vector3(0, 1.6, -3.0), look: new T.Vector3(0, 1.7, -6), fov: 50 });
await shot('bb-overflow');
bb.write('错别字 3 个，比喻不当。\n[[big]][[red]]59 分');
await shot('bb-graded');
// gust
ctx.world.classroom.gust(0.9, 1.0); await qs.advance(0.4); res.windPeak = +ctx.world.classroom.wind.strength.toFixed(2);
await qs.advance(1.0); res.windAfter = ctx.world.classroom.wind.strength;
// unknown set / anchor never throws
res.unknownSet = ctx.world.buildSet('moon').name;
res.unknownAnchor = !!ctx.world.buildSet('rooftop').anchors.nope.pos;
// characters on anchors
ctx.ai?.teacher?.setEnabled?.(false);
const studs = ctx.cast.students();
const place = (ch, a, posture = 'stand') => { ch.root.position.copy(a.pos); ch.root.rotation.set(0, a.yaw ?? 0, 0); ch.setPosture(posture); ch.root.visible = true; };
let set = ctx.stage.show('rooftop');
ctx.cast.showOnly([studs[0].id, studs[1].id]);
place(studs[0], set.anchors.left); place(studs[1], set.anchors.right);
await qs.advance(0.2); ctx.cam.cut(set.anchors.camWide); await shot('a-rooftop');
set = ctx.stage.show('office');
const t = ctx.cast.teacher;
ctx.cast.showOnly([t.id, studs[0].id, studs[2].id, studs[3].id]);
place(t, set.anchors.teacherChair, 'sit'); place(studs[0], set.anchors.student); place(studs[2], set.anchors.parent1); place(studs[3], set.anchors.parent2);
await qs.advance(0.2); ctx.cam.cut(set.anchors.camWide); await shot('a-office');
ctx.cam.cut(set.anchors.camOverShoulder); await shot('a-office-ots');
set = ctx.stage.show('court');
const ids = studs.slice(0, 8).map((s) => s.id); ctx.cast.showOnly(ids);
place(studs[0], set.anchors.player); place(studs[1], set.anchors.coach);
for (let i = 0; i < 6; i++) place(studs[2 + i], set.anchors[`crowd${i}`]);
await qs.advance(0.2); ctx.cam.cut(set.anchors.camWide); await shot('a-court');
set = ctx.stage.show('cherryPath'); ctx.cast.showOnly([studs[0].id, studs[1].id]);
place(studs[0], set.anchors.left); place(studs[1], set.anchors.right);
await qs.advance(0.2); ctx.cam.cut(set.anchors.camWide); await shot('a-cherry');
set = ctx.stage.show('canteen'); ctx.cast.showOnly([studs[0].id, studs[1].id]);
place(studs[0], set.anchors.tableA.seats[0], 'sit'); place(studs[1], set.anchors.tableA.seats[2], 'sit');
await qs.advance(0.2); ctx.cam.cut(set.anchors.camWide); await shot('a-canteen');
set = ctx.stage.show('schoolyard'); ctx.cast.showOnly([studs[0].id]);
place(studs[0], set.anchors.principal);
await qs.advance(0.2); ctx.cam.cut(set.anchors.camHigh); await shot('a-yard-high');
return { res, errors: qs.errors };
