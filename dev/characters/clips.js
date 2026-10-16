// Key frames of important clips. Each character plays one clip; we sample at the clip's key time.
qs.manual(true);
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true });
const ctx = qs.ctx, T = ctx.THREE;
ctx.stage.get('classroom').group.visible = false;
for (const ch of ctx.cast.all()) ch.root.visible = false;
ctx.engine.scene.background = new T.Color('#d9e2ee');
const amb = new T.HemisphereLight(0xffffff, 0x8899aa, 1.6); const sun = new T.DirectionalLight(0xffffff, 2.1); sun.position.set(-3, 5, 4);
ctx.engine.scene.add(amb, sun);
const sets = (globalThis.__clipSets) || [
  ['stand', [['raiseHand', 0.9], ['stretch', 1.0], ['cheer', 0.7], ['point', 0.9], ['wave', 0.8], ['gasp', 0.5], ['facepalm', 1.0], ['laugh', 1.2]]],
  ['stand', [['sneeze', 0.6], ['sneeze', 0.9], ['yawn', 1.0], ['clap', 0.5], ['bow', 0.8], ['shakeHead', 0.3], ['nod', 0.15], ['blushShy', 1.0]]],
  ['stand', [['walk', 0.15], ['run', 0.1], ['dance', 0.3], ['cry', 0.5], ['faint', 1.7], ['shiver', 0.3], ['catch', 0.4], ['throw', 0.4]]],
  ['stand', [['pickUp', 0.65], ['unfold', 1.8], ['read', 1.0], ['teacherWrite', 0.5], ['teacherLecture', 2.4], ['teacherDrink', 1.2], ['teacherPointAt', 1.0], ['teacherAdjustGlasses', 0.6]]],
  ['sit', [['sitIdle', 1], ['write', 1.0], ['sleep', 1.0], ['turnBack', 1.0], ['chatLeft', 0.8], ['eat', 1.2], ['phone', 1.0], ['standUp', 0.6]]],
];
let idx = 0;
const made = [];
const roles = ['student', 'student', 'student', 'teacher'];
for (const [post, list] of sets) {
  list.forEach(([clip, at], i) => {
    const teacher = clip.startsWith('teacher');
    const ch = ctx.characters.create({ id: `clip_${idx++}`, gender: i % 2 ? 'f' : 'm', role: teacher ? 'teacher' : 'student', look: { height: 1, build: 'normal' } });
    ctx.engine.scene.add(ch.root);
    ch.setPosture(post);
    ch.root.visible = false;
    made.push({ ch, clip, at, i, set: post });
  });
}
ctx.engine.onUpdate((dt) => made.forEach((m) => m.ch.root.visible && m.ch.update(dt)), 20);
const out = [];
for (let si = 0; si < sets.length; si++) {
  const group = made.filter((m, k) => Math.floor(k / 8) === si);
  for (const m of group) {
    m.ch.root.visible = true;
    m.ch.root.position.set((m.i - 3.5) * 0.85, 0, 0);
    m.ch.root.rotation.y = Math.PI * 0.82;
    if (m.clip === 'point' || m.clip === 'teacherPointAt' || m.clip === 'catch') m.ch.lookAt(new T.Vector3(m.ch.root.position.x - 1, 1.7, 3));
    m.ch.play(m.clip, { loop: ['walk', 'run', 'dance', 'cry', 'shiver', 'clap', 'read', 'sitIdle', 'write', 'sleep', 'chatLeft', 'eat', 'phone', 'teacherWrite', 'teacherLecture'].includes(m.clip), fade: 0 });
  }
  // advance each to its own key time: step the max time but freeze those that reached it
  const tmax = Math.max(...group.map((m) => m.at));
  const steps = Math.round(tmax * 60);
  for (let k = 0; k <= steps; k++) {
    const t = k / 60;
    for (const m of group) m.frozen = t >= m.at;
    await qs.advance(1 / 60);
    for (const m of group) if (m.frozen && !m.saved) { m.saved = true; m.update = m.ch.update; m.ch.update = () => {}; }
  }
  ctx.cam.cut({ pos: new T.Vector3(0, 1.3, 4.6), look: new T.Vector3(0, 0.8, 0), fov: 48 });
  await shot(`clips_${si}`);
  for (const m of group) { m.ch.root.visible = false; if (m.update) m.ch.update = m.update; }
  out.push(group.map((m) => m.clip).join(','));
}
return { out, errors: qs.errors.slice(0, 5) };
