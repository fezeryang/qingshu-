// Animated classroom fixtures (owner: env-artist): ceiling fans (+ dynamic OBB colliders), curtains, wall clock.
import * as THREE from 'three';
import { FANS, ROOM, WALL_CLOCK } from '../core/layout.js';
import { Batch, GEO, mat4, toon, colBox, mergeColored, TAU } from './kit.js';
import { PAL } from './palette.js';
import { clockFaceTexture } from './textures.js';
import { damp } from '../core/util.js';
import { createCurtainMaterials } from './curtain.js';

// ---------------------------------------------------------------------------------------------
// Ceiling fans. Blade i points along (cos a, 0, sin a) with a = angle + i·2π/3; the rotating mesh uses
// rotation.y = -angle, which maps local +X onto exactly that direction — the same maths as the OBBs.
export const BLADE = { rIn: 0.1, width: 0.13, thick: 0.012, halfY: 0.02 };

export function createFans(group, colliders, staticBatch, mat) {
  const fans = [];
  const H = ROOM.height;
  for (const f of FANS) {
    // static: ceiling cap, downrod, motor housing
    staticBatch.add(GEO.cyl12, mat, mat4(f.x, H - 0.03, f.z, 0, 0, 0, 0.16, 0.06, 0.16), PAL.fanMotor);
    staticBatch.add(GEO.cyl8, mat, mat4(f.x, (H + f.bladeY + 0.08) / 2, f.z, 0, 0, 0, 0.035, H - f.bladeY - 0.08, 0.035), PAL.fanMotor);
    staticBatch.add(GEO.cyl16, mat, mat4(f.x, f.bladeY + 0.05, f.z, 0, 0, 0, 0.22, 0.12, 0.22), { top: PAL.fanMotor, side: 0xbfcfc4, bottom: 0xa9bab0 });
    colliders.push(colBox(f.x - 0.02, f.bladeY + 0.11, f.z - 0.02, f.x + 0.02, H, f.z + 0.02, 'prop', f.id));
    colliders.push(colBox(f.x - 0.09, f.bladeY - 0.01, f.z - 0.09, f.x + 0.09, f.bladeY + 0.11, f.z + 0.09, 'prop', f.id));
    // rotating blades (one merged mesh per fan)
    const len = f.r - BLADE.rIn;
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const a = (i * TAU) / 3;
      const rc = BLADE.rIn + len / 2;
      parts.push([GEO.box, mat4(Math.cos(a) * rc, 0, Math.sin(a) * rc, 0, -a, 0, len, BLADE.thick, BLADE.width), { top: PAL.fan, side: 0xd5ded8, bottom: 0xc8d3cc }]);
      parts.push([GEO.box, mat4(Math.cos(a) * 0.09, 0.01, Math.sin(a) * 0.09, 0, -a, 0, 0.09, 0.02, 0.05), 0xb5c2ba]); // blade iron
    }
    const blades = new THREE.Mesh(mergeColored(parts), mat);
    blades.position.set(f.x, f.bladeY, f.z);
    blades.castShadow = true;
    blades.name = `fan-${f.id}`;
    group.add(blades);
    // motion-blur disc (fades in with speed)
    const blur = new THREE.Mesh(new THREE.RingGeometry(BLADE.rIn + 0.02, f.r, 40, 1), new THREE.MeshBasicMaterial({ color: 0xdfe8e2, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
    blur.rotation.x = -Math.PI / 2;
    blur.position.set(f.x, f.bladeY - 0.008, f.z);
    group.add(blur);
    fans.push({ id: f.id, center: new THREE.Vector3(f.x, f.bladeY, f.z), radius: f.r, bladeY: f.bladeY, spinning: true, angle: 0, rps: f.rps, omega: f.rps * TAU, hub: blades, blur });
  }

  const _axis = new THREE.Vector3(0, 1, 0);
  function dynamicColliders(tOffset = 0) {
    const out = [];
    for (const f of fans) {
      const len = f.radius - BLADE.rIn, rc = BLADE.rIn + len / 2;
      const moving = f.omega > 0.5;
      for (let i = 0; i < 3; i++) {
        const a = f.angle + f.omega * tOffset + (i * TAU) / 3;
        const c = Math.cos(a), s = Math.sin(a);
        out.push({
          kind: 'obb', tag: moving ? 'fan' : 'prop', ownerId: f.id,
          center: new THREE.Vector3(f.center.x + c * rc, f.bladeY, f.center.z + s * rc),
          halfSize: new THREE.Vector3(len / 2, BLADE.halfY, BLADE.width / 2),
          quaternion: new THREE.Quaternion().setFromAxisAngle(_axis, -a),
          velocity: new THREE.Vector3(-s * f.omega * rc, 0, c * f.omega * rc),
        });
      }
    }
    return out;
  }
  function update(dt) {
    for (const f of fans) {
      const target = f.spinning ? f.rps * TAU : 0;
      f.omega += (target - f.omega) * damp(f.spinning ? 1.2 : 0.8, dt);
      if (!f.spinning && f.omega < 0.05) f.omega = 0;
      f.angle = (f.angle + f.omega * dt) % (TAU * 1000);
      f.hub.rotation.y = -f.angle;
      f.blur.material.opacity = Math.min(0.28, Math.max(0, (f.omega - 4) * 0.03));
      f.blur.visible = f.blur.material.opacity > 0.01;
    }
  }
  function reset() { for (const f of fans) { f.spinning = true; f.omega = f.rps * TAU; } }
  return { fans, dynamicColliders, update, reset };
}

// ---------------------------------------------------------------------------------------------
// Curtains: two gathered panels per window, one merged mesh, deformed on the GPU (including its shadow).
export function createCurtains(group, windows, lowfx) {
  const SU = lowfx ? 6 : 9, SV = lowfx ? 10 : 16;
  const panels = [];
  const wallX = ROOM.minX;
  for (const w of windows) {
    const z0 = w.z - w.w / 2, z1 = w.z + w.w / 2;
    const top = w.sillY + w.h + 0.14, bottom = w.sillY - 0.12;
    for (const side of [-1, 1]) {
      const gw = 0.42;
      const outer = side < 0 ? z0 - 0.14 : z1 + 0.14;            // panel edge away from the opening
      panels.push({ w, side, outer, inner: outer - side * gw, top, bottom, open: !!w.open, wallX });
    }
  }
  const vpp = (SU + 1) * (SV + 1);
  const pos = new Float32Array(panels.length * vpp * 3);
  const colr = new Float32Array(panels.length * vpp * 3);
  const cloth = new Float32Array(panels.length * vpp * 4);
  const open = new Float32Array(panels.length * vpp);
  const idx = [];
  const cBase = new THREE.Color(PAL.curtain), cHem = new THREE.Color(PAL.curtainHem), cShade = new THREE.Color(PAL.curtain).multiplyScalar(0.86);
  panels.forEach((p, k) => {
    const o = k * vpp;
    for (let j = 0; j <= SV; j++) for (let i = 0; i <= SU; i++) {
      const v = j / SV, u = i / SU;
      const vertex = o + j * (SU + 1) + i;
      const span = p.inner - p.outer, height = p.top - p.bottom;
      pos.set([p.wallX + 0.15, p.top - height * v, p.outer + span * u], vertex * 3);
      cloth.set([u, v, span, height], vertex * 4);
      open[vertex] = p.open ? 1 : 0;
      const c = v > 0.92 ? cHem : (i % 2 ? cShade : cBase);
      colr.set([c.r, c.g, c.b], (o + j * (SU + 1) + i) * 3);
    }
    for (let j = 0; j < SV; j++) for (let i = 0; i < SU; i++) {
      const a = o + j * (SU + 1) + i, b = a + 1, c = a + SU + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  geo.setIndex(idx);
  geo.setAttribute('aCurtain', new THREE.BufferAttribute(cloth, 4));
  geo.setAttribute('aCurtainOpen', new THREE.BufferAttribute(open, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += 1.2; // conservative bound for gusts, pleats and hem lift
  const clothMaterials = createCurtainMaterials();
  const mesh = new THREE.Mesh(geo, clothMaterials.material);
  mesh.customDepthMaterial = clothMaterials.depth;
  mesh.name = 'curtains';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // rods
  const rodParts = [];
  for (const w of windows) {
    const z0 = w.z - w.w / 2 - 0.35, z1 = w.z + w.w / 2 + 0.35, y = w.sillY + w.h + 0.16;
    rodParts.push([GEO.cyl8, mat4(wallX + 0.14, y, w.z, Math.PI / 2, 0, 0, 0.025, z1 - z0, 0.025), 0xb08a5a]);
    for (const z of [z0 + 0.04, z1 - 0.04]) rodParts.push([GEO.box, mat4(wallX + 0.07, y, z, 0, 0, 0, 0.14, 0.02, 0.02), 0x9a7a4e]);
  }
  const rods = new THREE.Mesh(mergeColored(rodParts), toon({ side: THREE.DoubleSide }));
  rods.castShadow = true;
  group.add(rods);
  const rodColliders = windows.map((w) => colBox(wallX + 0.125, w.sillY + w.h + 0.145, w.z - w.w / 2 - 0.35, wallX + 0.155, w.sillY + w.h + 0.175, w.z + w.w / 2 + 0.35, 'prop'));

  const update = clothMaterials.update;
  update(0, 0);
  return { mesh, update, rodColliders };
}

// ---------------------------------------------------------------------------------------------
// Wall clock above the blackboard. Auto mode: during a round it reads 15:45:00 − timeLeft (the bell rings
// at 15:45). clock.set(m, s) switches to manual for the rest of the round.
export function createClock(ctx, group, mat) {
  const R = 0.17;
  const root = new THREE.Group();
  root.position.set(WALL_CLOCK.x, WALL_CLOCK.y, WALL_CLOCK.z);
  group.add(root);
  const rim = new THREE.Mesh(mergeColored([
    [GEO.cyl24, mat4(0, 0, -0.005, Math.PI / 2, 0, 0, R * 2 + 0.05, 0.05, R * 2 + 0.05), { top: 0xd9483b, side: 0xc23a2e, bottom: 0xa83026 }],
  ]), mat);
  rim.castShadow = true;
  root.add(rim);
  const face = new THREE.Mesh(new THREE.CircleGeometry(R, 40), new THREE.MeshStandardMaterial({ map: clockFaceTexture(), roughness: 0.85 }));
  face.position.z = 0.0215;
  root.add(face);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(R, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }));
  glass.position.z = 0.035;
  root.add(glass);
  const hand = (len, w, color, z) => {
    const m = new THREE.Mesh(mergeColored([[GEO.box, mat4(0, len / 2 - 0.02, 0, 0, 0, 0, w, len, 0.004), color]]), mat);
    m.position.z = z;
    root.add(m);
    return m;
  };
  const hH = hand(R * 0.55, 0.014, 0x23232b, 0.025), hM = hand(R * 0.8, 0.009, 0x23232b, 0.028), hS = hand(R * 0.86, 0.004, 0xd23a2e, 0.031);
  const cap = new THREE.Mesh(mergeColored([[GEO.cyl8, mat4(0, 0, 0.033, Math.PI / 2, 0, 0, 0.02, 0.006, 0.02), 0xd23a2e]]), mat);
  root.add(cap);

  let manual = null;
  let idle = 15 * 3600 + 43 * 60 + 12;
  function show(secOfDay) {
    const s = ((secOfDay % 43200) + 43200) % 43200;
    hS.rotation.z = -((s % 60) / 60) * TAU;
    hM.rotation.z = -((s % 3600) / 3600) * TAU;
    hH.rotation.z = -(s / 43200) * TAU;
  }
  const api = {
    set(minutes, seconds = 0) { manual = 15 * 3600 + (+minutes || 0) * 60 + (+seconds || 0); show(manual); },
    /** extra: back to automatic (round timer / idle ticking) */
    auto() { manual = null; },
    update(dt) {
      if (manual != null) return;
      const r = ctx.round;
      const phase = ctx.flow?.phase;
      if (r && (phase === 'aim' || phase === 'flight' || phase === 'intro') && Number.isFinite(r.timeLeft)) {
        const tick = Math.ceil(r.timeLeft);                   // second hand ticks, not sweeps
        show(15 * 3600 + 45 * 60 - tick);
        idle = 15 * 3600 + 45 * 60 - tick;
      } else {
        idle += dt;
        show(Math.floor(idle));
      }
    },
  };
  show(idle);
  return api;
}
