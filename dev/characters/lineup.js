// Lineup of the whole cast on a neutral background, front + back view.
qs.manual(true);
await qs.start({ seed: 3, playerGender: 'm', skipIntro: true });
const ctx = qs.ctx, T = ctx.THREE;
ctx.stage.get('classroom').group.visible = false;
ctx.engine.scene.background = new T.Color('#cfd8e6');
const amb = new T.HemisphereLight(0xffffff, 0x8899aa, 1.6); const sun = new T.DirectionalLight(0xffffff, 2.2); sun.position.set(-3, 5, 4);
ctx.engine.scene.add(amb, sun);
ctx.ai?.teacher?.setEnabled?.(false);
ctx.ai?.students?.setAmbient?.(false);
const all = ctx.cast.all();
const extras = [
  { id: 'principal', name: '校长', gender: 'm', role: 'npc', trait: 'x', look: { outfit: 'suit', hairStyle: 'bald', glasses: true, build: 'sturdy' } },
  { id: 'pe', name: '体育老师', gender: 'm', role: 'npc', trait: 'x', look: { outfit: 'tracksuit', hairStyle: 'buzz' } },
  { id: 'mom', name: '妈妈', gender: 'f', role: 'npc', trait: 'x', look: { outfit: 'casual', hairStyle: 'bun' } },
  { id: 'janitor', name: '清洁工', gender: 'm', role: 'npc', trait: 'x', look: { outfit: 'janitor', hairStyle: 'short' } },
].map((s) => ctx.cast.extra(s));
const list = [...all, ...extras];
const n = list.length, sp = 0.55;
list.forEach((ch, i) => {
  ch.reset(); ch.setPosture('stand'); ch.root.visible = true;
  const row = i < n / 2 ? 0 : 1, col = row ? i - Math.ceil(n / 2) : i;
  ch.root.position.set((col - n / 4) * sp, 0, row * -1.6 - 1);
  ch.root.rotation.set(0, Math.PI, 0);
});
await qs.advance(0.3);
ctx.cam.cut({ pos: new T.Vector3(0, 1.4, 5.2), look: new T.Vector3(0, 0.9, -1.8), fov: 50 });
await shot('lineup_front');
ctx.cam.cut({ pos: new T.Vector3(-1.2, 1.25, 1.2), look: new T.Vector3(-1.2, 1.0, -1), fov: 40 });
await shot('lineup_close');
list.forEach((ch) => ch.root.rotation.set(0, 0, 0));
await qs.advance(0.1);
await shot('lineup_back');
const one = list[0];
return { n, drawCalls: one.drawCalls, layers: one.layers, specs: list.slice(0, 4).map((c) => c.look && { hs: c.look.hairStyle, o: c.look.outfit, b: c.look.bottom }), errors: qs.errors.slice(0, 5) };
