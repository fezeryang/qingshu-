// Geometry builder: merges primitive pieces into one indexed BufferGeometry with palette UVs,
// optional rigid/blended skin weights and a per-vertex outline weight (aOutline).
import * as THREE from 'three';
import { slotUV } from './toon.js';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

/** Matrix from position [x,y,z], rotation [x,y,z] (Euler XYZ), scale number|[x,y,z]. */
export function M(pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  _p.set(pos[0], pos[1], pos[2]);
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  if (typeof scale === 'number') _s.set(scale, scale, scale); else _s.set(scale[0], scale[1], scale[2]);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

export class Builder {
  constructor({ skinned = false } = {}) {
    this.skinned = skinned;
    this.pos = []; this.nor = []; this.uv = []; this.si = []; this.sw = []; this.ol = []; this.idx = [];
  }
  /**
   * @param {THREE.BufferGeometry} geo  primitive (consumed / disposed)
   * @param {{m?:THREE.Matrix4, pre?:THREE.Matrix4, slot?:number, uv?:Function, bone?:number, weights?:Function, outline?:number, deform?:Function}} o
   */
  add(geo, o = {}) {
    const m = o.pre ? new THREE.Matrix4().multiplyMatrices(o.m || new THREE.Matrix4(), o.pre) : (o.m || new THREE.Matrix4());
    const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv;
    if (o.smooth !== false && geo.index && /Sphere|Capsule|Lathe|Torus/.test(geo.type)) smoothSeams(geo);
    const base = this.pos.length / 3;
    _m3.getNormalMatrix(m);
    const flip = m.determinant() < 0;
    const suv = slotUV(o.slot ?? 0);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i);
      if (o.deform) o.deform(_v, i);
      _v.applyMatrix4(m);
      _n.fromBufferAttribute(N, i).applyMatrix3(_m3).normalize();
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
      if (o.uv) { const t = o.uv(i, _v, UV ? UV.getX(i) : 0, UV ? UV.getY(i) : 0); this.uv.push(t[0], t[1]); } else this.uv.push(suv[0], suv[1]);
      if (this.skinned) {
        if (o.weights) { const w = o.weights(_v); this.si.push(w[0], w[2] ?? 0, w[4] ?? 0, 0); this.sw.push(w[1], w[3] ?? 0, w[5] ?? 0, 0); }
        else { this.si.push(o.bone ?? 0, 0, 0, 0); this.sw.push(1, 0, 0, 0); }
      }
      this.ol.push(o.outline ?? 1);
    }
    if (geo.index) {
      const I = geo.index.array;
      for (let i = 0; i < I.length; i += 3) {
        if (flip) this.idx.push(base + I[i], base + I[i + 2], base + I[i + 1]);
        else this.idx.push(base + I[i], base + I[i + 1], base + I[i + 2]);
      }
    } else {
      for (let i = 0; i < P.count; i += 3) {
        if (flip) this.idx.push(base + i, base + i + 2, base + i + 1);
        else this.idx.push(base + i, base + i + 1, base + i + 2);
      }
    }
    geo.dispose();
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aOutline', new THREE.Float32BufferAttribute(this.ol, 1));
    if (this.skinned) {
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    }
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Average normals of vertices that share a position (fixes seams so outlines don't crack). */
export function smoothSeams(geo, eps = 1e-4) {
  const P = geo.attributes.position, N = geo.attributes.normal;
  const map = new Map();
  const key = (i) => `${Math.round(P.getX(i) / eps)},${Math.round(P.getY(i) / eps)},${Math.round(P.getZ(i) / eps)}`;
  for (let i = 0; i < P.count; i++) { const k = key(i); (map.get(k) || map.set(k, []).get(k)).push(i); }
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const list of map.values()) {
    if (list.length < 2) continue;
    a.set(0, 0, 0);
    for (const i of list) a.add(b.fromBufferAttribute(N, i));
    a.normalize();
    for (const i of list) N.setXYZ(i, a.x, a.y, a.z);
  }
  N.needsUpdate = true;
  return geo;
}

// Primitive shorthands (all low-poly; callers place them with M()).
export const sphere = (w = 16, h = 12) => new THREE.SphereGeometry(1, w, h);
export const capsule = (r, len, cap = 4, rad = 10) => new THREE.CapsuleGeometry(r, Math.max(0.0001, len), cap, rad);
export const cyl = (rt, rb, h, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const cone = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);
export const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
export const torus = (r, t, rs = 6, ts = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);
export function lathe(profile, seg = 16, phiStart = 0, phiLength = Math.PI * 2) {
  // LatheGeometry faces outward only when the profile runs bottom → top
  if (profile.length > 1 && profile[0][1] > profile[profile.length - 1][1]) profile = [...profile].reverse();
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)), seg, phiStart, phiLength);
}

/** Capsule spanning from point a to point b (local coords). */
export function capsuleAB(a, b, r, cap = 4, rad = 10) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = new THREE.Vector3().subVectors(B, A);
  const len = d.length();
  const g = capsule(r, len, cap, rad);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return { g, m };
}
