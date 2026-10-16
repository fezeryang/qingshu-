// Environment module (owner: env-artist). Contract: docs/CONTRACTS.md §4.1. Notes: docs/modules/world.md
//
//   ctx.world.classroom        the classroom set (colliders, blackboard, clock, fans, wind, moods)
//   ctx.world.buildSet(name)   ending sets, built lazily once and cached
//   ctx.world.showColliders(on) extra: wireframe overlay of every collider (auto-on with ?debug=1)
import * as THREE from 'three';
import { buildClassroom } from './classroom.js';
import { buildEndingSet, SET_NAMES } from './sets.js';

export async function install(ctx) {
  const classroom = buildClassroom(ctx);
  const sets = new Map();
  let debugLines = null;

  function buildSet(name) {
    if (name === 'classroom') return classroom;
    if (!sets.has(name)) {
      let set;
      try { set = buildEndingSet(ctx, name); } catch (err) { console.warn(`[world] set "${name}" failed to build, using fallback`, err); set = buildEndingSet(ctx, '__fallback', name); }
      sets.set(name, set);
    }
    return sets.get(name);
  }

  function showColliders(on = true) {
    if (!on) { if (debugLines) { debugLines.removeFromParent(); debugLines.geometry.dispose(); debugLines = null; } return; }
    if (debugLines) return;
    debugLines = buildColliderLines(classroom.colliders);
    classroom.group.add(debugLines);
    const dyn = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff3355, depthTest: false, transparent: true }));
    dyn.renderOrder = 1001;
    dyn.frustumCulled = false;
    debugLines.add(dyn);
    debugLines.userData.dyn = dyn;
  }

  const baseUpdate = classroom.update;
  classroom.update = (dt, time) => {
    baseUpdate(dt, time);
    const dyn = debugLines?.userData.dyn;
    if (dyn) { dyn.geometry.dispose(); dyn.geometry = colliderGeometry(classroom.dynamicColliders()); }
  };

  ctx.world = { classroom, buildSet, showColliders, setNames: SET_NAMES, get sets() { return sets; } };

  // per-round reset (contract §1): day mood, clean board, no wind
  let newsVariant = 0;
  ctx.bus.on('round:setup', (p) => {
    classroom.reset();
    const v = Math.abs(p?.index ?? 0) % 3;           // P2: the back-wall newspaper changes between rounds
    if (v !== newsVariant) { newsVariant = v; classroom.setNewspaper(v); }
  });
  if (ctx.config.debug) showColliders(true);
}

// ---------------------------------------------------------------------------------------------
const COLORS = { trigger: [0.2, 1, 0.4], book: [1, 0.6, 0.1], desk: [0.2, 0.7, 1], chair: [0.4, 0.5, 1], default: [1, 1, 0.2] };
function colliderGeometry(list) {
  const P = [], C = [];
  const corners = (c) => {
    if (c.kind === 'box' || c.kind === 'trigger') {
      const a = c.min, b = c.max;
      return [[a.x, a.y, a.z], [b.x, a.y, a.z], [b.x, b.y, a.z], [a.x, b.y, a.z], [a.x, a.y, b.z], [b.x, a.y, b.z], [b.x, b.y, b.z], [a.x, b.y, b.z]];
    }
    if (c.kind === 'obb') {
      const h = c.halfSize, out = [];
      for (const [sx, sy, sz] of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) {
        const v = new THREE.Vector3(sx * h.x, sy * h.y, sz * h.z).applyQuaternion(c.quaternion).add(c.center);
        out.push([v.x, v.y, v.z]);
      }
      return out;
    }
    if (c.kind === 'sphere') {
      const r = c.radius, o = c.center;
      return [[o.x - r, o.y - r, o.z - r], [o.x + r, o.y - r, o.z - r], [o.x + r, o.y + r, o.z - r], [o.x - r, o.y + r, o.z - r], [o.x - r, o.y - r, o.z + r], [o.x + r, o.y - r, o.z + r], [o.x + r, o.y + r, o.z + r], [o.x - r, o.y + r, o.z + r]];
    }
    return null;
  };
  const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const c of list) {
    if (c.tag === 'floor' || c.tag === 'ceiling' || c.tag === 'outside') continue;
    const k = corners(c);
    if (!k) continue;
    const col = c.kind === 'trigger' ? COLORS.trigger : COLORS[c.tag] || COLORS.default;
    for (const [i, j] of E) { P.push(...k[i], ...k[j]); C.push(...col, ...col); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}
function buildColliderLines(list) {
  const lines = new THREE.LineSegments(colliderGeometry(list), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.85 }));
  lines.renderOrder = 1000;
  lines.frustumCulled = false;
  lines.name = 'colliderDebug';
  return lines;
}
