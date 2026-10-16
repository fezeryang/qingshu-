// ?debug=1 overlay (owner: gameplay): collider wireframes + predicted trajectory.
import * as THREE from 'three';
import { K_BOX, K_OBB, K_SPHERE, K_TRIGGER } from './physics.js';

const COLORS = { trigger: 0xff00ff, fan: 0xff3333, head: 0xffaa00, body: 0xffdd55, teacher: 0xff5500, desk: 0x33ccff, chair: 0x3399ff, book: 0x22ffaa };

function pushRecord(arr, col, o) {
  const c = new THREE.Color(o.kind === K_TRIGGER ? COLORS.trigger : COLORS[o.tag] ?? 0x88ff88);
  const seg = (a, b) => { arr.push(a.x, a.y, a.z, b.x, b.y, b.z); col.push(c.r, c.g, c.b, c.r, c.g, c.b); };
  if (o.kind === K_SPHERE) {
    const n = 16;
    for (let ax = 0; ax < 3; ax++) {
      for (let i = 0; i < n; i++) {
        const p = (k) => { const a = (k / n) * Math.PI * 2, u = Math.cos(a) * o.r, v = Math.sin(a) * o.r;
          return ax === 0 ? { x: o.cx + u, y: o.cy + v, z: o.cz } : ax === 1 ? { x: o.cx + u, y: o.cy, z: o.cz + v } : { x: o.cx, y: o.cy + u, z: o.cz + v }; };
        seg(p(i), p(i + 1));
      }
    }
    return;
  }
  const corner = (sx, sy, sz) => {
    if (o.kind === K_OBB) {
      const lx = sx * o.hx, ly = sy * o.hy, lz = sz * o.hz;
      return { x: o.cx + o.m00 * lx + o.m01 * ly + o.m02 * lz, y: o.cy + o.m10 * lx + o.m11 * ly + o.m12 * lz, z: o.cz + o.m20 * lx + o.m21 * ly + o.m22 * lz };
    }
    return { x: sx < 0 ? o.minx : o.maxx, y: sy < 0 ? o.miny : o.maxy, z: sz < 0 ? o.minz : o.maxz };
  };
  for (const [a, b] of [[[-1, -1, -1], [1, -1, -1]], [[-1, 1, -1], [1, 1, -1]], [[-1, -1, 1], [1, -1, 1]], [[-1, 1, 1], [1, 1, 1]],
    [[-1, -1, -1], [-1, 1, -1]], [[1, -1, -1], [1, 1, -1]], [[-1, -1, 1], [-1, 1, 1]], [[1, -1, 1], [1, 1, 1]],
    [[-1, -1, -1], [-1, -1, 1]], [[1, -1, -1], [1, -1, 1]], [[-1, 1, -1], [-1, 1, 1]], [[1, 1, -1], [1, 1, 1]]]) seg(corner(...a), corner(...b));
}

export class DebugDraw {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'gameplayDebug';
    scene.add(this.group);
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.7 });
    this.staticLines = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
    this.dynLines = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
    this.path = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff2266, depthTest: false }));
    for (const l of [this.staticLines, this.dynLines, this.path]) { l.frustumCulled = false; l.renderOrder = 999; this.group.add(l); }
  }
  static set(lines, records) {
    const arr = [], col = [];
    for (const o of records) pushRecord(arr, col, o);
    lines.geometry.dispose();
    lines.geometry = new THREE.BufferGeometry();
    lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    lines.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  setStatic(records) { DebugDraw.set(this.staticLines, records); }
  setDynamic(records) { DebugDraw.set(this.dynLines, records); }
  setPath(pts) {
    this.path.geometry.dispose();
    this.path.geometry = new THREE.BufferGeometry().setFromPoints((pts || []).map((p) => new THREE.Vector3(p.x, p.y, p.z)));
  }
}
