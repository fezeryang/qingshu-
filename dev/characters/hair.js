// Hair style grid: every hairStyle × gender, front close-up and back.
qs.manual(true);
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true });
const ctx = qs.ctx, T = ctx.THREE;
ctx.stage.get('classroom').group.visible = false;
for (const ch of ctx.cast.all()) ch.root.visible = false;
ctx.engine.scene.background = new T.Color('#cfd8e6');
const amb = new T.HemisphereLight(0xffffff, 0x8899aa, 1.6); const sun = new T.DirectionalLight(0xffffff, 2.2); sun.position.set(-3, 5, 4);
ctx.engine.scene.add(amb, sun);
const styles = ['short', 'buzz', 'messy', 'sidepart', 'curtain', 'bob', 'ponytail', 'twintails', 'long', 'bun', 'braid', 'combover', 'bald'];
const accs = ['none', 'hairclip', 'headband', 'earbuds', 'freckles', 'mole', 'bandaid'];
const made = [];
styles.forEach((hs, i) => {
  const g = ['ponytail', 'twintails', 'long', 'bun', 'braid', 'bob'].includes(hs) ? 'f' : 'm';
  const ch = ctx.characters.create({ id: `hs_${hs}`, gender: g, role: 'student', look: { hairStyle: hs, accessory: accs[i % accs.length], glasses: i % 4 === 3, height: 1, build: 'normal', bottom: i % 2 ? 'skirt' : 'pants' } });
  ctx.engine.scene.add(ch.root);
  ch.setPosture('stand');
  const col = i % 7, row = Math.floor(i / 7);
  ch.root.position.set((col - 3) * 0.62, 0, -row * 1.2);
  ch.root.rotation.y = Math.PI;
  made.push(ch);
});
qs.ctx.engine.onUpdate((dt) => made.forEach((c) => c.update(dt)), 20);
await qs.advance(0.5);
const row = (r) => made.forEach((c, i) => { c.root.visible = Math.floor(i / 7) === r; });
for (const r of [0, 1]) {
  row(r);
  ctx.cam.cut({ pos: new T.Vector3(0, 1.45, 2.4 - r * 1.2), look: new T.Vector3(0, 1.2, -0.6 - r * 1.2), fov: 50 });
  made.forEach((c) => { c.root.rotation.y = Math.PI; });
  await qs.advance(0.3);
  await shot(`hair_front${r}`);
  made.forEach((c) => { c.root.rotation.y = 0.0; });
  await qs.advance(0.3);
  await shot(`hair_back${r}`);
  made.forEach((c) => { c.root.rotation.y = Math.PI * 0.5; });
  await qs.advance(0.3);
  await shot(`hair_side${r}`);
}
return qs.errors.slice(0, 5);
