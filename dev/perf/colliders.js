// Compare the selective collider paths with a complete Three.js hierarchy refresh, including
// root moves after the animation tick and raised arms. No rendering is needed for this check.
qs.manual(true);
await qs.start({ seed: 31, skipIntro: true });
qs.forceTeacher('writing', 999);
const c = qs.ctx;
c.ai.students.setAmbient(false);
const chars = c.cast.all().filter((ch) => ch.root.visible);
const assert = (ok, message) => { if (!ok) throw new Error(message); };
let checked = 0, raised = 0;
for (const clip of ['sitIdle', 'raiseHand', 'stretch', 'catch']) {
  for (const ch of chars) { ch.stop(); void ch.play(clip, { loop: true, fade: 0 }); }
  await qs.advance(.8);
  for (const ch of chars) {
    // Teleport and turn between ticks: cached collision data must not survive this change.
    ch.root.position.x += .031;
    ch.root.rotation.y += .07;
    const colliders = ch.getColliders();
    const nodes = [ch.parts.spine, ch.parts.headCenter, ch.parts.upperArmL, ch.parts.upperArmR,
      ch.parts.forearmL, ch.parts.forearmR, ch.parts.handL, ch.parts.handR, ch.parts.gripL, ch.parts.gripR];
    const selective = nodes.map((o) => o.matrixWorld.clone());
    ch.root.updateWorldMatrix(true, true);
    nodes.forEach((node, i) => assert(node.matrixWorld.elements.every((v, j) => Math.abs(v - selective[i].elements[j]) < 1e-9), `${ch.id}/${clip}: stale ${node.name}`));
    const head = ch.headWorld(new c.THREE.Vector3());
    assert(colliders[0].center.distanceTo(head) < 1e-9, `${ch.id}/${clip}: stale head collider`);
    assert(colliders.every((col) => col.center ? Number.isFinite(col.center.length()) : Number.isFinite(col.min.length() + col.max.length())), 'non-finite collider');
    if (colliders.length > 2) raised++;
    checked++;
  }
}
assert(raised > 0, 'raised-arm collider branch not exercised');
assert(!qs.errors.length, qs.errors.join('\n'));
return { checked, raised, errors: qs.errors };
