// Expression matrix: 16 contract expressions on 4×4 heads (2 characters alternating), + emotes row.
qs.manual(true);
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true });
const ctx = qs.ctx, T = ctx.THREE;
ctx.stage.get('classroom').group.visible = false;
for (const ch of ctx.cast.all()) ch.root.visible = false;
ctx.engine.scene.background = new T.Color('#e6e1ec');
const amb = new T.HemisphereLight(0xffffff, 0x8899aa, 1.7); const sun = new T.DirectionalLight(0xffffff, 2.0); sun.position.set(-2, 4, 5);
ctx.engine.scene.add(amb, sun);
const ex = ctx.characters.expressions;
const made = ex.map((e, i) => {
  const f = i % 2 === 0;
  const ch = ctx.characters.create({ id: `ex_${e}`, gender: f ? 'f' : 'm', role: 'student', look: { hairStyle: f ? 'bob' : 'short', glasses: e === 'smug', height: 1, build: 'normal', hairColor: f ? '#3b2418' : '#1e1a18' } });
  ctx.engine.scene.add(ch.root);
  ch.setPosture('stand');
  ch.root.position.set((i % 4 - 1.5) * 0.62, -Math.floor(i / 4) * 0.52, Math.floor(i / 4) * 0.45);
  ch.root.rotation.y = Math.PI;
  ch.setExpression(e);
  return ch;
});
ctx.engine.onUpdate((dt) => made.forEach((c) => c.update(dt)), 20);
await qs.advance(0.4);
for (const c of made) c.blink = () => {};
ctx.cam.cut({ pos: new T.Vector3(0, 0.75, 4.4), look: new T.Vector3(0, 0.45, 0.6), fov: 46 });
await shot('expressions');
// emotes
const em = ctx.characters.emotes;
made.forEach((c, i) => { c.setExpression('neutral'); if (em[i]) c.emote(em[i], 5); });
await qs.advance(0.6);
await shot('emotes');
return { ex, errors: qs.errors.slice(0, 5) };
