// STUB (gray-box) — to be replaced by the character-artist agent. Contract: docs/CONTRACTS.md §4.2
import * as THREE from 'three';
import { BALL_RADIUS } from '../core/layout.js';

export async function install(ctx) {
  const { time } = ctx;

  function create(spec) {
    const root = new THREE.Group();
    root.name = spec.id;
    const color = spec.role === 'teacher' ? 0x556070 : spec.gender === 'f' ? 0xe08aa0 : 0x5a86c8;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.45, 4, 8), new THREE.MeshStandardMaterial({ color }));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf2cfae }));
    const pelvis = new THREE.Group();
    root.add(pelvis);
    pelvis.add(body, head);
    let posture = 'sit';
    const layoutPose = () => {
      const base = posture === 'sit' ? 0.44 : 0.85;
      body.position.y = base + 0.25;
      head.position.y = base + 0.62;
    };
    layoutPose();
    const state = { expression: 'neutral', clip: 'idle', lookTarget: null };
    const _v = new THREE.Vector3();

    const ch = {
      id: spec.id, spec, root,
      parts: { pelvis, head, torso: body },
      get posture() { return posture; },
      setPosture(p) { posture = p; layoutPose(); },
      play(clip, opts = {}) { state.clip = clip; return opts.loop ? Promise.resolve() : time.wait((opts.duration ?? 1) / (opts.speed ?? 1)); },
      stop() { state.clip = 'idle'; },
      setExpression(name) { state.expression = name; },
      lookAt(target) { state.lookTarget = target; },
      emote() { return Promise.resolve(); },
      hold() {},
      headWorld(target = new THREE.Vector3()) { return head.getWorldPosition(target); },
      handWorld(hand, target = new THREE.Vector3()) { return body.getWorldPosition(target).add(new THREE.Vector3(0.2, 0, 0)); },
      async walkTo(pos, { speed = 1.1 } = {}) {
        const from = root.position.clone();
        const dist = from.distanceTo(pos);
        root.rotation.y = Math.atan2(-(pos.x - from.x), -(pos.z - from.z));
        await time.tween({ duration: dist / speed, onUpdate: (k) => root.position.lerpVectors(from, pos, k) });
      },
      async faceTo(target, dur = 0.3) {
        root.rotation.y = typeof target === 'number' ? target : Math.atan2(-(target.x - root.position.x), -(target.z - root.position.z));
        await time.wait(dur);
      },
      getColliders() {
        head.getWorldPosition(_v);
        const b = body.getWorldPosition(new THREE.Vector3());
        return [
          { kind: 'sphere', center: _v.clone(), radius: 0.15, tag: spec.role === 'teacher' ? 'teacher' : 'head', ownerId: spec.id },
          { kind: 'box', min: b.clone().add(new THREE.Vector3(-0.18, -0.35, -0.12)), max: b.clone().add(new THREE.Vector3(0.18, 0.35, 0.12)), tag: spec.role === 'teacher' ? 'teacher' : 'body', ownerId: spec.id },
        ];
      },
      reset() { state.clip = 'idle'; state.expression = 'neutral'; state.lookTarget = null; },
      update() {},
      debugState: state,
    };
    return ch;
  }

  function createArms() {
    const group = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.4), new THREE.MeshStandardMaterial({ color: 0x5a86c8 }));
    arm.position.set(0.2, -0.2, -0.3);
    const ball = createProp('letterBall');
    ball.position.set(0.2, -0.16, -0.5);
    group.add(arm, ball);
    let charge = 0;
    let st = 'idle';
    return {
      group,
      setGender() {},
      setState(s) { st = s; ball.visible = s === 'holdBall' || s === 'charge'; group.visible = s !== 'hidden'; },
      get state() { return st; },
      setCharge(p) { charge = p; arm.position.y = -0.2 + p * 0.12; },
      handWorld(target = new THREE.Vector3()) { return ball.getWorldPosition(target); },
      update() {},
    };
  }

  function createProp(name) {
    if (name === 'letterBall') {
      return new THREE.Mesh(new THREE.IcosahedronGeometry(BALL_RADIUS, 1), new THREE.MeshStandardMaterial({ color: 0xfff6ee, flatShading: true }));
    }
    return new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.14), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  }

  ctx.characters = { create, createArms, createProp };
}
