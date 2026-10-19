// Character factory: rig + skinned body, face, hair, animation layers, IK, look-at, springs,
// props, emotes and live colliders. Contract: docs/CONTRACTS.md §4.2.
import * as THREE from 'three';
import { AISLES_X, PLATFORM } from '../core/layout.js';
import { BONES, BI, PARENT, proportions, bodyGeometry } from './body.js';
import { headGeometry, HEAD } from './head.js';
import { hairGeometry } from './hair.js';
import { Face, EXPR, EXPRESSIONS } from './face.js';
import { paletteMaterial, toonMaterial, outlineMaterial } from './toon.js';
import { Pose, Writer, NB, LIMBS, solveTwoBone } from './pose.js';
import { CLIPS, basePose, landmarks } from './clips.js';
import { emoteTexture, EMOTES } from './emotes.js';
import { resolveLook } from './looks.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _T = new THREE.Vector3(), _P = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const IDENTITY = new THREE.Matrix4();
const LIMB_CHAIN = {
  handL: ['upperArmL', 'forearmL', 'handL'], handR: ['upperArmR', 'forearmR', 'handR'],
  footL: ['thighL', 'shinL', 'footL'], footR: ['thighR', 'shinR', 'footR'],
};
const warned = new Set();
const warnOnce = (msg) => { if (!warned.has(msg)) { warned.add(msg); console.warn(`[characters] ${msg}`); } };
const shortestAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * @param {object} ctx  game ctx (time, engine, stage, config)
 * @param {object} spec roster spec (see contract)
 * @param {{makeProp:(name:string)=>THREE.Object3D, lowfx:boolean}} env
 */
export function createCharacter(ctx, spec, env) {
  spec = spec && typeof spec === 'object' ? spec : { id: 'anon' };
  const look = resolveLook(spec);
  const D = proportions(look.adult, look.build, look.gender);
  const s = look.height * (look.adult ? 1 : 1);
  const teacher = look.role === 'teacher';
  const id = String(spec.id ?? 'anon');
  const ownerId = teacher ? 'teacher' : id;
  const time = ctx.time;

  // ------------------------------------------------------------------ rig
  const root = new THREE.Group();
  root.name = id;
  const rig = new THREE.Group();
  rig.name = `${id}.rig`;
  rig.scale.setScalar(s);
  root.add(rig);
  const bones = {};
  for (const n of BONES) {
    const b = new THREE.Bone();
    b.name = n;
    b.position.fromArray(D.offsets[n]);
    bones[n] = b;
    (PARENT[n] ? bones[PARENT[n]] : rig).add(b);
  }
  root.updateMatrixWorld(true);
  _mi.copy(rig.matrixWorld).invert();
  const boneList = BONES.map((n) => bones[n]);
  const inverses = boneList.map((b) => new THREE.Matrix4().multiplyMatrices(_mi, b.matrixWorld).invert());
  const skeleton = new THREE.Skeleton(boneList, inverses);

  const palMat = paletteMaterial(look.colors);
  const outlines = [];
  const bodyGeo = bodyGeometry(D, look.shape, look.bottom, { whistle: look.outfit === 'tracksuit' });
  const body = new THREE.SkinnedMesh(bodyGeo, palMat);
  body.name = `${id}.body`;
  body.bind(skeleton, IDENTITY);
  body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.9);
  body.castShadow = true;
  rig.add(body);
  if (!env.lowfx) {
    const ol = new THREE.SkinnedMesh(bodyGeo, outlineMaterial());
    ol.bind(skeleton, IDENTITY);
    ol.boundingSphere = body.boundingSphere;
    ol.name = `${id}.bodyOutline`;
    rig.add(ol);
    outlines.push(ol);
  }

  // head + face
  const face = new Face(look);
  const faceMat = toonMaterial({ map: face.texture });
  faceMat.name = 'charFace';
  const headGroup = new THREE.Group();
  headGroup.scale.setScalar(D.headScale);
  bones.head.add(headGroup);
  const headMesh = new THREE.Mesh(headGeometry(), faceMat);
  headMesh.castShadow = true;
  headMesh.name = `${id}.head`;
  headGroup.add(headMesh);
  const addOutline = (geo, parent) => {
    if (env.lowfx) return;
    const o = new THREE.Mesh(geo, outlineMaterial());
    parent.add(o);
    outlines.push(o);
  };
  addOutline(headMesh.geometry, headGroup);
  const hair = hairGeometry(look.hairStyle, look.gender, { accessory: look.accessory, glasses: look.glasses, cap: look.outfit === 'janitor' });
  if (hair.geo) {
    const hm = new THREE.Mesh(hair.geo, palMat);
    hm.castShadow = true;
    hm.name = `${id}.hair`;
    headGroup.add(hm);
    addOutline(hair.geo, headGroup);
  }
  const springs = hair.swings.map((sw) => {
    const pivot = new THREE.Object3D();
    pivot.position.fromArray(sw.pos);
    headGroup.add(pivot);
    const mesh = new THREE.Mesh(sw.geo, palMat);
    mesh.castShadow = true;
    pivot.add(mesh);
    addOutline(sw.geo, pivot);
    const rest = new THREE.Vector3().fromArray(sw.rest).normalize();
    return { pivot, rest, dir: rest.clone(), vel: new THREE.Vector3(), prevP: new THREE.Vector3(), prevV: new THREE.Vector3(), init: false, k: sw.stiff * sw.stiff * 0.6, c: sw.stiff * 0.55, range: sw.range };
  });

  // anchors
  const headCenter = new THREE.Object3D();
  headCenter.position.set(HEAD.C[0], HEAD.C[1], HEAD.C[2]);
  headGroup.add(headCenter);
  const grips = {};
  for (const side of ['L', 'R']) {
    const g = new THREE.Object3D();
    g.name = `grip${side}`;
    g.position.set(0, -0.045 * D.handS, -0.004);
    bones[`hand${side}`].add(g);
    grips[side] = g;
  }
  const bothAnchor = new THREE.Object3D();
  bothAnchor.name = 'gripBoth';
  root.add(bothAnchor);
  grips.both = bothAnchor;
  // Parent-before-child paths needed by collision shapes. Hair, outlines, props, fingers and
  // legs do not contribute to these colliders and need not be traversed again after posing.
  const colliderNodes = [rig, bones.hips, bones.spine, bones.chest, bones.neck, bones.head, headGroup, headCenter];
  for (const side of ['L', 'R']) colliderNodes.push(bones[`shoulder${side}`], bones[`upperArm${side}`], bones[`forearm${side}`], bones[`hand${side}`], grips[side]);

  // emote sprite
  let emoteSprite = null;
  const emoteState = { active: false, kind: '!', t: 0, dur: 1.5 };

  // ------------------------------------------------------------------ state
  const lmStand = landmarks(D, s, false);
  const lmSit = landmarks(D, s, true);
  const seatHips = 0.44 + D.pelvisDrop * s;
  const c = { s, D, seated: true, side: 1, teacher, adult: look.adult, lm: lmSit, lmStand, lmSit, seatHips, off: [0, 0], standOff: [0, 0], look: null, holdingBoth: false };
  let posture = 'sit';
  const standOffset = [0, 0];
  const acc = new Pose(), tmp = new Pose();
  const W = new Writer();
  let layers = [];
  let clock = (look.variant * 37) % 13;
  let expression = 'neutral';
  let glintFlag = false;
  let talkUntil = 0;
  const lookState = { target: null, weight: 0, curW: 0, yaw: 0, pitch: 0, desYaw: 0, desPitch: 0 };
  const lookWorld = new THREE.Vector3();
  const lookLocal = new THREE.Vector3();
  let hasLook = false;
  const blink = { next: 1 + look.variant * 3, t: 0 };
  const gazeIdle = { next: 2, gx: 0, gy: 0 };
  const held = { L: null, R: null, both: null };
  const heldTemp = { L: null, R: null, both: null }; // layer that created it
  const propCache = {};
  let walkToken = 0, faceToken = 0;
  let collCache = null, collFrame = -1;
  const collPos = new THREE.Vector3(); let collYaw = NaN;

  const getProp = (name) => (propCache[name] ||= env.makeProp(name));

  function attach(prop, hand) {
    const anchor = grips[hand];
    anchor.add(prop);
    const gr = prop.userData?.grip;
    const g = gr ? (gr[hand] || gr.R || gr) : null;
    if (g?.pos) {
      prop.position.fromArray(g.pos);
      if (hand === 'L' && !gr.L) prop.position.x *= -1;
    } else prop.position.set(0, 0, 0);
    if (g?.rot) {
      prop.rotation.set(g.rot[0], g.rot[1], g.rot[2]);
      if (hand === 'L' && !gr.L) { prop.rotation.y *= -1; prop.rotation.z *= -1; }
    } else prop.rotation.set(0, 0, 0);
  }
  function hold(prop, hand = 'R') {
    hand = hand === 'L' ? 'L' : hand === 'both' ? 'both' : 'R';
    if (held[hand]) held[hand].removeFromParent();
    held[hand] = null; heldTemp[hand] = null;
    if (!prop || !prop.isObject3D) return;
    for (const h of ['L', 'R', 'both']) if (held[h] === prop) { held[h] = null; heldTemp[h] = null; }
    held[hand] = prop;
    attach(prop, hand);
  }
  function holdTemp(name, hand, layer) {
    if (held[hand]) return;
    if (hand === 'both' && (held.L || held.R)) return;
    const p = getProp(name);
    hold(p, hand);
    heldTemp[hand] = layer;
  }
  function releaseTemp(layer) {
    for (const h of ['L', 'R', 'both']) if (heldTemp[h] === layer) { held[h]?.removeFromParent(); held[h] = null; heldTemp[h] = null; }
  }

  // ------------------------------------------------------------------ layers
  function finishLayer(L, interrupted = false) {
    if (L.done) return;
    L.done = true;
    const clip = L.clip;
    if (!interrupted && clip.endPosture) {
      posture = clip.endPosture;
      if (posture === 'stand') { standOffset[0] = c.standOff[0]; standOffset[1] = c.standOff[1]; } else { standOffset[0] = 0; standOffset[1] = 0; }
      releaseTemp(L);
      layers = layers.filter((x) => x !== L);
      for (const x of layers) if (x.clip.posture && x.clip.posture !== posture) fadeOut(x, 0.15);
    } else if (!interrupted && clip.hold) {
      L.t = clip.dur; L.held = true;
    } else {
      fadeOut(L, 0.25);
    }
    L.resolve?.();
  }
  function fadeOut(L, fade = 0.25) {
    if (L.target === 0) return;
    L.target = 0; L.fadeRate = 1 / Math.max(0.01, fade);
    if (!L.done) { L.done = true; L.resolve?.(); }
  }
  function removeLayer(L) {
    releaseTemp(L);
    layers = layers.filter((x) => x !== L);
  }

  function play(name, opts = {}) {
    const clip = CLIPS[name];
    if (!clip) { warnOnce(`unknown clip "${name}"`); return Promise.resolve(); }
    c.side = aisleSide();
    const loop = !!opts.loop;
    const speed = Number.isFinite(opts.speed) && opts.speed > 0 ? opts.speed : 1;
    const fade = Number.isFinite(opts.fade) ? Math.max(0, opts.fade) : 0.2;
    const track = loop || clip.hold ? 'A' : 'B';
    if (name === 'standUp' && posture === 'stand') return Promise.resolve();
    if (name === 'sitDown' && posture === 'sit') return Promise.resolve();
    const top = layers.filter((x) => x.target > 0 && x.track === track).pop();
    if (loop && top && top.name === name && top.loop) { top.speed = speed; return Promise.resolve(); }
    for (const x of layers) {
      if (x.target === 0) continue;
      if (x.track === track || clip.endPosture || (x.held && track === 'A')) fadeOut(x, Math.max(0.12, fade));
    }
    if (name === 'standUp') {
      const inClass = ctx.stage?.current === 'classroom';
      c.standOff = inClass ? [aisleSide() * 0.34, 0.06] : [0, 0.05];
    }
    const L = { name, clip, t: 0, speed, loop, w: fade > 0 ? 0 : 1, target: 1, fadeRate: fade > 0 ? 1 / fade : 1e3, track, done: false, held: false, events: {}, resolve: null };
    layers.push(L);
    if (clip.prop) holdTemp(clip.prop.name, clip.prop.hand, L);
    if (loop) return Promise.resolve();
    return new Promise((resolve) => {
      L.resolve = resolve;
      time.wait(clip.dur / speed).then(() => { if (!L.done) { L.t = clip.dur; fireEvents(L, clip.dur); finishLayer(L); } });
    });
  }
  function stop(name) {
    for (const L of layers) if (!name || L.name === name) fadeOut(L, 0.25);
  }
  function layerTime(L) {
    const d = L.clip.dur;
    if (!L.loop) return Math.min(L.t, d);
    if (L.clip.seg && !L.clip.loop) {
      const [a, b] = L.clip.seg;
      return L.t < b ? L.t : a + ((L.t - a) % (b - a));
    }
    return L.t % d;
  }
  function fireEvents(L, t) {
    const ev = L.clip.events;
    if (!ev) return;
    for (const [k, at] of Object.entries(ev)) {
      if (!L.events[k] && t >= at) { L.events[k] = true; onClipEvent(L, k); }
    }
  }
  function onClipEvent(L, k) {
    if (L.name === 'unfold' && k === 'open') {
      if (held.R && (heldTemp.R || held.R.userData?.prop === 'letterBall')) { held.R.removeFromParent(); held.R = null; heldTemp.R = null; }
      if (!held.both) hold(getProp('letterOpen'), 'both');
    } else if (k === 'release' && heldTemp.R === L) {
      held.R?.removeFromParent(); held.R = null; heldTemp.R = null;
    }
    ch.onClipEvent?.(L.name, k);
  }

  function aisleSide() {
    if (ctx.stage?.current !== 'classroom') return 1;
    let best = Infinity, ax = 0;
    for (const x of AISLES_X) { const d = Math.abs(x - root.position.x); if (d < best) { best = d; ax = x; } }
    const right = Math.cos(root.rotation.y) * (ax - root.position.x);
    return right >= 0 ? 1 : -1;
  }

  // ------------------------------------------------------------------ per frame
  function update(dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    clock += dt;
    c.seated = posture === 'sit';
    c.lm = c.seated ? lmSit : lmStand;
    c.off = standOffset;
    c.holdingBoth = !!held.both;

    // look target in world / root space
    hasLook = false;
    const tg = lookState.target;
    if (tg) {
      if (tg.isVector3) lookWorld.copy(tg);
      else if (tg.isObject3D) tg.getWorldPosition(lookWorld);
      hasLook = true;
      lookLocal.copy(lookWorld);
      root.worldToLocal(lookLocal);
      c.look = lookLocal;
    } else c.look = null;

    // layers advance
    for (const L of layers) {
      if (!L.held) L.t += dt * L.speed;
      if (L.w < L.target) L.w = Math.min(L.target, L.w + dt * L.fadeRate);
      else if (L.w > L.target) L.w = Math.max(L.target, L.w - dt * L.fadeRate);
      if (!L.done) {
        fireEvents(L, layerTime(L));
        if (!L.loop && L.t >= L.clip.dur) finishLayer(L);
      }
    }
    for (const L of [...layers]) if (L.target === 0 && L.w <= 0) removeLayer(L);

    // evaluate
    W.bind(acc);
    basePose(W, c);
    tmp.copy(acc); W.bind(tmp);
    (c.seated ? CLIPS.sitIdle : CLIPS.idle).fn(W, clock, c);
    acc.copy(tmp);
    let faceOverride = null;
    for (const L of layers) {
      const w = L.w * L.w * (3 - 2 * L.w);
      if (w <= 0.001) continue;
      const lt = layerTime(L);
      tmp.copy(acc); W.bind(tmp);
      L.clip.fn(W, lt, c);
      const f = typeof L.clip.face === 'function' ? L.clip.face(lt) : L.clip.face;
      if (f && w > 0.5) faceOverride = f;
      acc.blend(tmp, w);
    }
    // breathing
    const br = Math.sin(clock * 1.7);
    acc.rot[BI.chest * 3] += br * 0.012;
    acc.rot[BI.shoulderL * 3 + 2] -= br * 0.01;
    acc.rot[BI.shoulderR * 3 + 2] += br * 0.01;

    // look-at overlay (uses last frame's chest matrix)
    const wTarget = hasLook ? lookState.weight : 0;
    lookState.curW += (wTarget - lookState.curW) * (1 - Math.exp(-8 * dt));
    if (hasLook) {
      _mi.copy(bones.chest.matrixWorld).invert();
      _v.copy(lookWorld).applyMatrix4(_mi);
      _v.y -= (D.neck + D.headOff + 0.18 * D.headScale);
      lookState.desYaw = Math.atan2(-_v.x, -_v.z);
      lookState.desPitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
    }
    const yawT = hasLook ? THREE.MathUtils.clamp(lookState.desYaw, -1.35, 1.35) : 0;
    const pitchT = hasLook ? THREE.MathUtils.clamp(lookState.desPitch, -0.65, 0.5) : 0;
    const k = 1 - Math.exp(-9 * dt);
    lookState.yaw += (yawT - lookState.yaw) * k;
    lookState.pitch += (pitchT - lookState.pitch) * k;
    const lw = lookState.curW;
    if (lw > 0.001) {
      const y = lookState.yaw * lw, p = lookState.pitch * lw;
      acc.rot[BI.neck * 3] += p * 0.3; acc.rot[BI.head * 3] += p * 0.7;
      acc.rot[BI.neck * 3 + 1] += y * 0.35; acc.rot[BI.head * 3 + 1] += y * 0.55;
      acc.rot[BI.chest * 3 + 1] += y * 0.12;
    }

    applyPose();
    updateSprings(dt);
    updateFace(dt, faceOverride);
    updateEmote(dt);
    collFrame = -1;
  }

  function applyPose() {
    const R = acc.rot;
    for (let i = 0; i < NB; i++) boneList[i].rotation.set(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]);
    bones.hips.position.set(acc.hips[0] / s, acc.hips[1] / s, acc.hips[2] / s);
    rig.rotation.set(acc.tilt[0], acc.tilt[1], acc.tilt[2]);
    rig.position.set(0, acc.tilt[3], 0);
    root.updateMatrixWorld(true);
    // IK
    for (let l = 0; l < 4; l++) {
      const k = l * 7, w = acc.ik[k + 3];
      if (w <= 0.001) continue;
      const limb = LIMBS[l];
      const [un, ln, en] = LIMB_CHAIN[limb];
      const upper = bones[un], lower = bones[ln], end = bones[en];
      const parent = upper.parent;
      _mi.copy(parent.matrixWorld).invert();
      _T.set(acc.ik[k], acc.ik[k + 1], acc.ik[k + 2]).applyMatrix4(root.matrixWorld).applyMatrix4(_mi);
      _P.set(acc.ik[k + 4], acc.ik[k + 5], acc.ik[k + 6]).transformDirection(root.matrixWorld).transformDirection(_mi);
      const knee = l >= 2;
      const l1 = knee ? D.thigh : D.upperArm, l2 = knee ? D.shin : D.forearm;
      solveTwoBone(upper, lower, _T, _P, l1, l2, Math.min(1, w), knee);
      upper.updateMatrixWorld(true);
      if (knee) {
        // keep the sole level with the rig, FK foot rotation applied on top
        _m.extractRotation(rig.matrixWorld); _q.setFromRotationMatrix(_m);
        _m.extractRotation(lower.matrixWorld); _q2.setFromRotationMatrix(_m).invert().multiply(_q);
        _q.copy(end.quaternion);
        _q2.multiply(_q);
        end.quaternion.copy(_q).slerp(_q2, Math.min(1, w));
        end.updateMatrixWorld(true);
      }
    }
    // two-handed grip anchor between the hands
    if (held.both) {
      // FK/IK above already refreshed these matrices; avoid rewalking both ancestor chains.
      _v.setFromMatrixPosition(grips.L.matrixWorld); _v2.setFromMatrixPosition(grips.R.matrixWorld);
      _v.add(_v2).multiplyScalar(0.5);
      root.worldToLocal(_v);
      bothAnchor.position.copy(_v);
      bothAnchor.rotation.set(-0.35 + acc.rot[BI.head * 3] * 0.4, acc.rot[BI.chest * 3 + 1] + acc.rot[BI.spine * 3 + 1], 0);
      bothAnchor.updateMatrixWorld(true);
    }
  }

  function updateSprings(dt) {
    if (!springs.length || dt <= 0) return;
    _m.extractRotation(headGroup.matrixWorld);
    _q.setFromRotationMatrix(_m);
    _q2.copy(_q).invert();
    for (const sp of springs) {
      _v.setFromMatrixPosition(sp.pivot.matrixWorld);
      if (!sp.init || _v.distanceTo(sp.prevP) > 0.4) { sp.prevP.copy(_v); sp.prevV.set(0, 0, 0); sp.init = true; sp.vel.set(0, 0, 0); }
      _v2.subVectors(_v, sp.prevP).divideScalar(dt);
      _v3.subVectors(_v2, sp.prevV).divideScalar(dt).applyQuaternion(_q2).clampLength(0, 30);
      sp.prevP.copy(_v); sp.prevV.copy(_v2);
      // desired: rest direction bent toward gravity
      _T.copy(DOWN).applyQuaternion(_q2);
      _P.copy(sp.rest).multiplyScalar(0.45).addScaledVector(_T, 0.55).normalize();
      const ax = (_P.x - sp.dir.x) * sp.k - sp.vel.x * sp.c - _v3.x * 0.9;
      const ay = (_P.y - sp.dir.y) * sp.k - sp.vel.y * sp.c - _v3.y * 0.9;
      const az = (_P.z - sp.dir.z) * sp.k - sp.vel.z * sp.c - _v3.z * 0.9;
      sp.vel.x += ax * dt; sp.vel.y += ay * dt; sp.vel.z += az * dt;
      sp.dir.addScaledVector(sp.vel, dt).normalize();
      const ang = sp.dir.angleTo(_P);
      if (ang > sp.range) { _v.copy(sp.dir).lerp(_P, 1 - sp.range / ang).normalize(); sp.dir.copy(_v); sp.vel.multiplyScalar(0.5); }
      sp.pivot.quaternion.setFromUnitVectors(DOWN, sp.dir);
      sp.pivot.updateMatrixWorld(true);
    }
  }

  function updateFace(dt, override) {
    blink.next -= dt;
    if (blink.next <= 0) { blink.t = 0.13; blink.next = 1.8 + Math.random() * 3.6; if (Math.random() < 0.18) blink.next = 0.25; }
    if (blink.t > 0) blink.t -= dt;
    let gx = 0, gy = 0;
    if (hasLook && lookState.curW > 0.2) {
      gx = THREE.MathUtils.clamp((lookState.desYaw - lookState.yaw) * 1.6 + lookState.yaw * 0.35, -1, 1);
      gy = THREE.MathUtils.clamp((lookState.desPitch - lookState.pitch) * 1.6 + lookState.pitch * 0.3, -1, 1);
    } else {
      gazeIdle.next -= dt;
      if (gazeIdle.next <= 0) { gazeIdle.next = 1.5 + Math.random() * 3; gazeIdle.gx = Math.random() < 0.55 ? 0 : (Math.random() - 0.5) * 0.9; gazeIdle.gy = (Math.random() - 0.5) * 0.3; }
      gx = gazeIdle.gx; gy = gazeIdle.gy;
    }
    const talking = acc.talk || clock < talkUntil;
    face.render({
      expr: override || acc.face || expression,
      blink: blink.t > 0,
      talk: talking && Math.floor(clock * 8.5 + Math.sin(clock * 3.1) * 0.8) % 2 === 0,
      gx: Math.round(gx * 4) / 4, gy: Math.round(gy * 4) / 4,
      glint: !!(acc.glint || glintFlag) && look.glasses,
      tear: Math.floor(clock * 7) % 4,
    });
  }

  function updateEmote(dt) {
    if (!emoteState.active || !emoteSprite) return;
    const e = emoteState;
    e.t += dt;
    if (e.t >= e.dur) { e.active = false; emoteSprite.visible = false; return; }
    const pop = e.t < 0.28 ? easeOutBack(e.t / 0.28) : 1;
    const out = e.t > e.dur - 0.2 ? Math.max(0, (e.dur - e.t) / 0.2) : 1;
    let sc = 0.3 * pop * out, ox = 0.17, oy = 0.36, rot = 0;
    switch (e.kind) {
      case 'zzz': oy += e.t * 0.06; ox += Math.sin(e.t * 2) * 0.03; break;
      case 'hearts': case 'music': oy += Math.sin(e.t * 5) * 0.02; rot = Math.sin(e.t * 4) * 0.15; break;
      case 'anger': sc *= 1 + 0.12 * Math.max(0, Math.sin(e.t * 14)); break;
      case 'sweat': oy -= Math.min(0.06, e.t * 0.05); ox = 0.22; break;
      case '!': rot = Math.sin(e.t * 30) * 0.15 * Math.max(0, 1 - e.t * 3); break;
      case 'heart': sc *= 1 + 0.1 * Math.max(0, Math.sin(e.t * 9)); break;
      default: break;
    }
    _v.setFromMatrixPosition(headCenter.matrixWorld);
    _v.y += oy * s;
    root.worldToLocal(_v);
    _v.x += ox * s;
    emoteSprite.position.copy(_v);
    emoteSprite.scale.set(sc * s, sc * s, 1);
    emoteSprite.material.rotation = rot;
    emoteSprite.visible = true;
  }

  // ------------------------------------------------------------------ public API
  const parts = {
    root, rig, pelvis: bones.hips, hips: bones.hips, spine: bones.spine, torso: bones.chest, chest: bones.chest, neck: bones.neck, head: bones.head,
    headCenter, face: headMesh, body, gripL: grips.L, gripR: grips.R, gripBoth: bothAnchor,
  };
  for (const n of BONES) parts[n] = bones[n];

  const ch = {
    id, spec, root, parts, look,
    get posture() { return posture; },
    get expression() { return expression; },
    get held() { return { ...held }; },
    get layers() { return layers.map((L) => ({ name: L.name, t: +L.t.toFixed(3), w: +L.w.toFixed(3), loop: L.loop })); },
    onClipEvent: null,
    setPosture(p) {
      if (p !== 'sit' && p !== 'stand') return;
      if (p === posture) return;
      posture = p;
      standOffset[0] = standOffset[1] = 0;
      for (const L of [...layers]) if (L.clip.endPosture || (L.clip.posture && L.clip.posture !== p)) { L.resolve?.(); L.done = true; removeLayer(L); }
    },
    play,
    stop,
    isPlaying(name) { return layers.some((L) => L.name === name && L.target > 0); },
    clipDuration(name) { return CLIPS[name]?.dur ?? 0; },
    clipEvents(name) { return { ...(CLIPS[name]?.events || {}) }; },
    setExpression(name) {
      if (!EXPR[name]) { warnOnce(`unknown expression "${name}"`); name = 'neutral'; }
      expression = name;
    },
    lookAt(target, weight = 1) {
      if (target && !(target.isVector3 || target.isObject3D)) target = null;
      lookState.target = target ? (target.isVector3 ? target.clone() : target) : null;
      lookState.weight = THREE.MathUtils.clamp(Number.isFinite(weight) ? weight : 1, 0, 1);
    },
    emote(kind, dur = 1.5) {
      if (kind === 'question') kind = '?';
      if (!EMOTES.includes(kind)) { warnOnce(`unknown emote "${kind}"`); kind = '!'; }
      dur = Number.isFinite(dur) && dur > 0 ? dur : 1.5;
      if (!emoteSprite) {
        emoteSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoteTexture(kind), transparent: true, depthWrite: false }));
        emoteSprite.renderOrder = 10;
        emoteSprite.name = `${id}.emote`;
        root.add(emoteSprite);
      }
      emoteSprite.material.map = emoteTexture(kind);
      emoteSprite.material.needsUpdate = true;
      Object.assign(emoteState, { active: true, kind, t: 0, dur });
      emoteSprite.visible = false;
      return time.wait(dur);
    },
    hold,
    /** Detach the prop in `hand`, keeping its world transform (re-parented to the scene). */
    drop(hand = 'R') {
      const p = held[hand]; if (!p) return null;
      held[hand] = null; heldTemp[hand] = null;
      const scene = ctx.engine?.scene;
      if (scene) scene.attach(p); else p.removeFromParent();
      return p;
    },
    async walkTo(pos, { speed = 1.1 } = {}) {
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
      const token = ++walkToken;
      if (posture === 'sit') { await play('standUp'); if (token !== walkToken) return; }
      bakeOffset();
      const from = root.position.clone();
      const to = new THREE.Vector3(pos.x, Number.isFinite(pos.y) ? pos.y : from.y, pos.z);
      const dist = Math.hypot(to.x - from.x, to.z - from.z);
      if (dist < 0.02) { root.position.copy(to); return; }
      const sp = Math.max(0.1, Number.isFinite(speed) ? speed : 1.1);
      const yaw = Math.atan2(-(to.x - from.x), -(to.z - from.z));
      await ch.faceTo(yaw, Math.min(0.35, Math.abs(shortestAngle(yaw - root.rotation.y)) * 0.25 + 0.05));
      if (token !== walkToken) return;
      const run = sp > 2.2;
      play(run ? 'run' : 'walk', { loop: true, speed: run ? sp / 3.2 : sp / 1.1, fade: 0.15 });
      const inClass = ctx.stage?.current === 'classroom';
      await time.tween({
        duration: dist / sp,
        onUpdate: (kk) => {
          if (token !== walkToken) return;
          root.position.lerpVectors(from, to, kk);
          if (inClass) root.position.y = groundY(root.position.x, root.position.z);
        },
      });
      if (token === walkToken) { root.position.copy(to); stop(run ? 'run' : 'walk'); }
    },
    async faceTo(posOrYaw, dur = 0.3) {
      let yaw;
      if (typeof posOrYaw === 'number') yaw = posOrYaw;
      else if (posOrYaw && (posOrYaw.isVector3 || posOrYaw.isObject3D)) {
        const p = posOrYaw.isObject3D ? posOrYaw.getWorldPosition(new THREE.Vector3()) : posOrYaw;
        yaw = Math.atan2(-(p.x - root.position.x), -(p.z - root.position.z));
      } else return;
      if (!Number.isFinite(yaw)) return;
      const token = ++faceToken;
      const y0 = root.rotation.y;
      const delta = shortestAngle(yaw - y0);
      if (Math.abs(delta) < 1e-3) return;
      const shuffle = posture === 'stand' && Math.abs(delta) > 0.5 && dur > 0.12 && !layers.some((L) => (L.name === 'walk' || L.name === 'run') && L.target > 0);
      if (shuffle) play('shuffle', { loop: true, fade: 0.08, internal: true });
      await time.tween({ duration: Math.max(0, dur), ease: (x) => x * x * (3 - 2 * x), onUpdate: (kk) => { if (token === faceToken) root.rotation.y = y0 + delta * kk; } });
      if (shuffle) stop('shuffle');
    },
    getColliders() {
      const frame = time.frame;
      if (collCache && collFrame === frame && collPos.equals(root.position) && collYaw === root.rotation.y) return collCache.slice();
      root.updateWorldMatrix(true, false);
      for (const node of colliderNodes) node.updateWorldMatrix(false, false);
      const tag = teacher ? 'teacher' : null;
      const out = [];
      _v.setFromMatrixPosition(headCenter.matrixWorld);
      out.push({ kind: 'sphere', center: _v.clone(), radius: 0.215 * s * D.headScale, tag: tag || 'head', ownerId });
      // torso box in spine space → world AABB
      const W2 = D.torsoW * 1.08, dz = D.torsoW * D.torsoD * 1.15;
      const y0 = -(D.spine + D.pelvisDrop * 0.8), y1 = D.chest + D.shoulderY + 0.03;
      const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      const mw = bones.spine.matrixWorld;
      for (let i = 0; i < 8; i++) {
        _v2.set(i & 1 ? W2 : -W2, i & 2 ? y1 : y0, i & 4 ? dz : -dz).applyMatrix4(mw);
        min.min(_v2); max.max(_v2);
      }
      out.push({ kind: 'box', min, max, tag: tag || 'body', ownerId });
      for (const side of ['L', 'R']) {
        _v2.setFromMatrixPosition(bones[`upperArm${side}`].matrixWorld);
        _v3.setFromMatrixPosition(bones[`hand${side}`].matrixWorld);
        if (_v3.y > _v2.y + 0.1 * s) {
          _v.setFromMatrixPosition(bones[`forearm${side}`].matrixWorld);
          out.push({ kind: 'sphere', center: _v.clone().lerp(_v3, 0.5), radius: 0.06 * s, tag: tag || 'body', ownerId });
          _v.setFromMatrixPosition(grips[side].matrixWorld);
          out.push({ kind: 'sphere', center: _v.clone(), radius: 0.06 * s, tag: tag || 'body', ownerId });
        }
      }
      collCache = out; collFrame = frame; collPos.copy(root.position); collYaw = root.rotation.y;
      return out.slice();
    },
    headWorld(target = new THREE.Vector3()) { return headCenter.getWorldPosition(target); },
    handWorld(hand = 'R', target = new THREE.Vector3()) {
      if (hand && hand.isVector3) { target = hand; hand = 'R'; }
      return grips[hand === 'L' ? 'L' : 'R'].getWorldPosition(target);
    },
    reset() {
      for (const L of layers) { L.done = true; L.resolve?.(); releaseTemp(L); }
      layers = [];
      expression = 'neutral';
      for (const h of ['L', 'R', 'both']) { held[h]?.removeFromParent(); held[h] = null; heldTemp[h] = null; }
      lookState.target = null; lookState.curW = 0; lookState.yaw = 0; lookState.pitch = 0;
      emoteState.active = false; if (emoteSprite) emoteSprite.visible = false;
      talkUntil = 0; glintFlag = false;
      standOffset[0] = standOffset[1] = 0;
      walkToken++; faceToken++;
      for (const sp of springs) sp.init = false;
      collCache = null;
    },
    update,
    // ---- additions (docs/modules/characters.md)
    talk(sec = 1.5) { talkUntil = Math.max(talkUntil, clock + Math.max(0, Number(sec) || 0)); },
    setTalking(on) { talkUntil = on ? clock + 1e6 : 0; },
    setGlint(on) { glintFlag = !!on; },
    setOutline(on) { for (const o of outlines) o.visible = !!on; },
    blink() { blink.t = 0.13; },
    get drawCalls() { let n = 0; root.traverseVisible((o) => { if (o.isMesh || o.isSprite) n++; }); return n; },
  };

  function bakeOffset() {
    if (!standOffset[0] && !standOffset[1]) return;
    const y = root.rotation.y;
    const ox = standOffset[0], oz = standOffset[1];
    root.position.x += ox * Math.cos(y) + oz * Math.sin(y);
    root.position.z += -ox * Math.sin(y) + oz * Math.cos(y);
    standOffset[0] = standOffset[1] = 0;
  }
  function groundY(x, z) {
    const onPlat = x > PLATFORM.minX && x < PLATFORM.maxX && z > PLATFORM.minZ && z < PLATFORM.maxZ;
    return onPlat ? PLATFORM.h : 0;
  }

  // initial pose so the first frame is not a T-pose
  root.userData.character = ch;
  update(0);
  return ch;
}

function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; }
export { EXPRESSIONS };
