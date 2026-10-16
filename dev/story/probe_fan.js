// Probe: can the solver reach a fan from the player seat? (seeds × target variants)
qs.manual(true);
const out = [];
for (const seed of [11, 3, 7]) {
  await qs.start({ seed, playerGender: 'm', skipIntro: true });
  const L = qs.ctx.layout;
  for (const f of L.FANS) for (const k of [0.3, 0.6, 0.9]) {
    const p = new qs.ctx.THREE.Vector3(f.x + f.r * k, f.bladeY, f.z);
    const s = qs.ctx.gameplay.solveLaunch(p, { budgetMs: 400 });
    out.push(`${seed} ${f.id} k${k}: ${s ? s.expect?.type : 'null'}`);
  }
}
return out;
