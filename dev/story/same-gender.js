// Complete same-gender ending playback: scene transitions, actors, framing and final card.
qs.manual(true);
const ctx = qs.ctx, V = (x, y, z) => new ctx.THREE.Vector3(x, y, z);
const params = new URLSearchParams(location.search);
const gender = params.get('gender') || 'm';
const target = gender === 'm' ? 'wang_dazhuang' : 'chen_keke';
await qs.start({ seed: +(params.get('seed') || 11), playerGender: gender, crushId: gender === 'm' ? 'su_nian' : 'wen_yan', skipIntro: true,
  letter: params.has('long') ? '我喜欢你。'.repeat(60) : '放学后，可以一起走一段路吗？' });
qs.forceTeacher('writing', 999);
ctx.ai.students.setAmbient(false);
const seat = ctx.layout.SEAT_BY_ID[ctx.cast.seatOf(target)];
ctx.bus.emit('ball:launched', { pos: V(-3, 1, 2), vel: V(0, 1, -1), power: 0.5 });
await qs.advance(0.1);
ctx.bus.emit('ball:landed', { type: 'floor', pos: V(seat.x, 0.04, seat.chairZ + 0.3), hits: params.has('pickup') ? [] : [{ tag: 'head', ownerId: target, t: 0.6, speed: 3 }], flightTime: 1, bounces: 0, nearMisses: [], seatId: null, ownerId: null });
await qs.advanceUntil(() => ctx.flow.phase === 'ending', 5);
const start = ctx.time.now, stages = [], snapshots = [];
let lastStage = null, lastBeat = null, returnAt = null;
const inspect = () => {
  const me = ctx.cast.get(`player_${gender}`), rec = ctx.cast.get(target);
  const camera = ctx.engine.camera;
  camera.updateMatrixWorld(true);
  const actor = (ch) => {
    const head = new ctx.THREE.Vector3(); ch.headWorld(head);
    const screen = head.clone().project(camera);
    const top = head.clone().add(V(0, 0.35, 0)).project(camera);
    const feet = ch.root.position.clone().add(V(0, 0.02, 0)).project(camera);
    return { visible: ch.root.visible, posture: ch.posture, pos: ch.root.position.toArray(), head: head.toArray(), screen: screen.toArray(), top: top.y, feet: feet.y };
  };
  return { at: +(ctx.time.now - start).toFixed(2), phase: ctx.flow.phase, stage: ctx.stage.current, beat: ctx.story.debug.beat, me: actor(me), rec: actor(rec) };
};
while (ctx.flow.phase === 'ending' && ctx.time.now - start < 60) {
  await qs.advance(0.2);
  if (ctx.stage.current !== lastStage) {
    stages.push({ name: ctx.stage.current, at: +(ctx.time.now - start).toFixed(2) });
    if (lastStage && lastStage !== 'classroom' && ctx.stage.current === 'classroom') returnAt = ctx.time.now;
    lastStage = ctx.stage.current;
  }
  const beat = ctx.story.debug.beat;
  if ((beat === 'climax' && lastBeat !== beat) || (returnAt && ctx.time.now - returnAt > 0.8 && !snapshots.some((s) => s.kind === 'punishment')) || (['cherryPath', 'canteen'].includes(lastStage) && !snapshots.some((s) => s.stage === lastStage) && ctx.time.now - start - stages.at(-1).at > 0.8)) {
    const kind = lastStage === 'cherryPath' ? 'path' : lastStage === 'canteen' ? 'canteen' : returnAt ? 'punishment' : 'climax';
    snapshots.push({ kind, ...inspect() });
    if ((!params.has('punishmentOnly') || kind === 'punishment') && (!params.has('canteenOnly') || kind === 'canteen')) await shot(`${gender}-${kind}`);
  }
  lastBeat = beat;
}
const require = (ok, message) => { if (!ok) throw new Error(message); };
require(ctx.round.endingId === 'same_gender', 'wrong ending');
require(ctx.flow.phase === 'card', 'ending did not reach its card');
require(ctx.story.debug.durations.same_gender?.result === 'ok', 'ending timed out or failed');
require(stages.map((s) => s.name).join(',') === 'classroom,cherryPath,canteen,classroom', 'missing montage location');
require(snapshots.length === 4, 'missing climax/path/canteen/punishment frame');
for (const snapshot of [...snapshots.filter((s) => s.kind !== 'climax'), inspect()]) {
  for (const role of ['me', 'rec']) {
    const actor = snapshot[role];
    require(actor.visible && actor.posture === (snapshot.stage === 'canteen' ? 'sit' : 'stand'), `${snapshot.stage}: ${role} missing or seated`);
    const [x, y, z] = actor.screen;
    require([x, y, z].every(Number.isFinite) && Math.abs(x) < 0.95 && Math.abs(y) < 0.75 && z > -1 && z < 1, `${snapshot.stage}: ${role} outside frame (${actor.screen})`);
    require(actor.top < 0.76 && (snapshot.stage === 'canteen' || actor.feet > -0.76), `${snapshot.stage}: ${role} clipped by cinema bars`);
  }
}
require(!qs.errors.length && !ctx.story.debug.lastError, 'runtime story error');
const out = { pass: true, ending: ctx.round.endingId, target, stages, snapshots, final: inspect(), result: ctx.story.debug.durations.same_gender, beats: ctx.story.debug.beats, error: ctx.story.debug.lastError, errors: qs.errors };
return out;
