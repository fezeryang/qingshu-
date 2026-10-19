qs.manual(true);
await qs.start({ seed: 31, playerGender: 'm', skipIntro: true });
qs.forceTeacher('writing', 999);
const c = qs.ctx;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
c.ai.students.setAmbient(false);

// Only visible face changes invalidate the canvas, but speech/blinks/tears remain animated.
const { Face } = await import('/src/characters/face.js');
const face = new Face(c.cast.teacher.look);
const state = { expr: 'neutral', blink: false, talk: false, gx: 0, gy: 0, glint: false, tear: 0 };
assert(face.render(state), 'first face must paint');
const version = face.texture.version;
for (let i = 0; i < 60; i++) assert(!face.render({ ...state, tear: i % 4 }), 'neutral face repainted for invisible tears');
assert(face.texture.version === version, 'unchanged face uploaded');
assert(face.render({ ...state, blink: true }), 'blink did not paint');
assert(face.render({ ...state, talk: true }), 'speech did not paint');
assert(face.render({ ...state, expr: 'cry' }), 'cry did not paint');
assert(face.render({ ...state, expr: 'cry', tear: 1 }), 'animated tears did not paint');
face.dispose();

// GPU curtains must keep CPU geometry static while time/wind and matching shadows change.
const cloth = c.world.classroom.group.getObjectByName('curtains');
const posVersion = cloth.geometry.attributes.position.version;
const normalVersion = cloth.geometry.attributes.normal.version;
c.world.classroom.gust(1, 5);
await qs.advance(1);
assert(cloth.customDepthMaterial, 'curtain shadow deformation missing');
assert(cloth.geometry.attributes.position.version === posVersion, 'curtain vertices still uploaded each tick');
assert(cloth.geometry.attributes.normal.version === normalVersion, 'curtain normals still recomputed');
assert(c.engine.performance.scale === 1, 'manual ticks changed resolution');
await shot('classroom');

// A 60 Hz charge updates its visual hint at 30 Hz; cancellation and a fresh charge are immediate.
const dots = c.engine.scene.getObjectByName('trajectoryDots');
const before = dots.geometry.attributes.position.version;
c.input.simulate({ down: 'Mouse0' });
await qs.advance(2);
const previews = dots.geometry.attributes.position.version - before;
assert(previews >= 59 && previews <= 61, `expected 60 previews, got ${previews}`);
assert(c.gameplay.aim.charging && dots.visible, 'charging preview missing');
c.input.simulate({ down: 'Mouse2' });
await qs.advance(1 / 60);
assert(!c.gameplay.aim.charging && !dots.visible, 'study did not cancel preview');
c.input.simulate({ up: 'Mouse0' });
c.input.simulate({ up: 'Mouse2' });
await qs.advance(1 / 60);
c.input.simulate({ down: 'Mouse0' });
const fresh = dots.geometry.attributes.position.version;
await qs.advance(1 / 60);
assert(dots.geometry.attributes.position.version > fresh, 'fresh charge did not draw immediately');
c.input.simulate({ up: 'Mouse0' });
await qs.advance(1 / 60);
assert(c.gameplay.ball.state === 'flying', 'release did not launch');
c.cam.pip(true, { target: c.cast.teacher });
await shot('flight-pip');
c.cam.pip(false);

c.cam.cut({ pos: new c.THREE.Vector3(-1.8, 1.6, 2), look: new c.THREE.Vector3(-3.9, 1.8, -1.4), fov: 60 });
await shot('curtain-gust');
assert(!qs.errors.length, qs.errors.join('\n'));
assert(c.engine.renderer.info.programs.every((p) => p.diagnostics?.runnable !== false), 'shader compilation failed');
return { previews, staticCurtainGeometry: true, faceCache: true, errors: qs.errors };
