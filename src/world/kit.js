// Shared building helpers for the environment (owner: env-artist).
//
// - Batch: collects many small geometries per material and merges them into one mesh (keeps draw calls low).
//   Every batched geometry gets a baked vertex colour, so one toon material can paint hundreds of props.
// - Collider helpers: colliders are plain data built from the SAME numbers as the visible boxes.
// - Materials: one shared toon gradient + a small cache of toon materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng } from '../core/rng.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const TAU = Math.PI * 2;

const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
/** Compose a transform matrix: position, euler rotation (XYZ), scale. */
export function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order = 'XYZ') {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, order)), _s.set(sx, sy, sz));
}

// Unit primitives (cloned by Batch.add, never rendered directly).
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cyl12: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  cyl16: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  cyl24: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
  sphere: new THREE.SphereGeometry(0.5, 12, 8),
  ico: new THREE.IcosahedronGeometry(0.5, 1),
  ico0: new THREE.IcosahedronGeometry(0.5, 0),
  plane: new THREE.PlaneGeometry(1, 1),
  cone8: new THREE.ConeGeometry(0.5, 1, 8),
};

// ---------------------------------------------------------------------------------------------
// Materials
let _gradient = null;
/** 3-step toon ramp shared by every environment material (shadow / mid / lit). */
export function toonGradient() {
  if (_gradient) return _gradient;
  _gradient = new THREE.DataTexture(new Uint8Array([0, 178, 255]), 3, 1, THREE.RedFormat);
  _gradient.minFilter = _gradient.magFilter = THREE.NearestFilter;
  _gradient.generateMipmaps = false;
  _gradient.needsUpdate = true;
  return _gradient;
}

/** Toon material with vertex colours (the default for batched props). */
export function toon(opts = {}) {
  return new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true, ...opts });
}

// ---------------------------------------------------------------------------------------------
// Batching
const _c = new THREE.Color();
const KEEP = new Set(['position', 'normal', 'uv']);

/**
 * color: hex | THREE.Color | {top, side, bottom} (picked by face normal) | fn(nx,ny,nz,px,py,pz) → hex
 * uvFn(geometry): optional, runs after the transform (e.g. world-space UVs, atlas remaps).
 */
function prepare(geometry, matrix, color, uvFn) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  if (matrix) g.applyMatrix4(matrix);
  const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count;
  const col = new Float32Array(n * 3);
  const fixed = typeof color === 'number' || color?.isColor;
  if (fixed) _c.set(color);
  for (let i = 0; i < n; i++) {
    if (!fixed) {
      const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      if (typeof color === 'function') _c.set(color(nx, ny, nz, pos.getX(i), pos.getY(i), pos.getZ(i)));
      else _c.set(ny > 0.5 ? color.top : ny < -0.5 ? (color.bottom ?? color.side) : color.side);
    }
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  uvFn?.(g);
  return g;
}

export class Batch {
  constructor() { this.lists = new Map(); }
  add(geometry, material, matrix, color = 0xffffff, uvFn) {
    if (!this.lists.has(material)) this.lists.set(material, []);
    this.lists.get(material).push(prepare(geometry, matrix, color, uvFn));
    return this;
  }
  /** Axis-aligned box from its centre and size. */
  box(material, color, cx, cy, cz, sx, sy, sz, uvFn) {
    return this.add(GEO.box, material, mat4(cx, cy, cz, 0, 0, 0, sx, sy, sz), color, uvFn);
  }
  /** Box from min/max corners. */
  boxMM(material, color, x0, y0, z0, x1, y1, z1, uvFn) {
    return this.box(material, color, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, uvFn);
  }
  get empty() { return this.lists.size === 0; }
  /** Merge into one mesh per material and add them to `parent`. Returns the meshes. */
  build(parent, { castShadow = true, receiveShadow = true, name = 'batch', renderOrder } = {}) {
    const out = [];
    for (const [mat, geoms] of this.lists) {
      if (!geoms.length) continue;
      const merged = mergeGeometries(geoms, false);
      for (const g of geoms) g.dispose();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = name;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (renderOrder != null) mesh.renderOrder = renderOrder;
      parent.add(mesh);
      out.push(mesh);
    }
    this.lists.clear();
    return out;
  }
}

/** Merge a list of geometries (already transformed) into one non-indexed geometry with colours. */
export function mergeColored(parts) {
  const geoms = parts.map(([geo, matrix, color, uvFn]) => prepare(geo, matrix, color, uvFn));
  const merged = mergeGeometries(geoms, false);
  for (const g of geoms) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/** World-space planar UVs (picked per face normal), `scale` = texture repeats per metre. */
export function worldUV(scaleU = 1, scaleV = scaleU, offU = 0, offV = 0) {
  return (g) => {
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let u, v;
      if (ay >= ax && ay >= az) { u = x; v = -z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
      uv.setXY(i, u * scaleU + offU, v * scaleV + offV);
    }
  };
}

/** Remap a box's UVs: the top face into rect `top` [u0, v0, u1, v1], every other face into rect `side`. */
export function atlasUV(top, side = top, flipU = false) {
  return (g) => {
    const nor = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const r = nor.getY(i) > 0.5 ? top : side;
      let u = uv.getX(i);
      if (flipU) u = 1 - u;
      uv.setXY(i, r[0] + (r[2] - r[0]) * u, r[1] + (r[3] - r[1]) * uv.getY(i));
    }
  };
}

/** Map plane UVs 0..1 into an atlas rect [u0, v0, u1, v1]. */
export function rectUV(r) {
  return (g) => {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + (r[2] - r[0]) * uv.getX(i), r[1] + (r[3] - r[1]) * uv.getY(i));
  };
}

// ---------------------------------------------------------------------------------------------
// Colliders (pure data, contract §5)
export function colBox(x0, y0, z0, x1, y1, z1, tag, ownerId, extra) {
  const c = { kind: 'box', min: V(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), max: V(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)), tag };
  if (ownerId != null) c.ownerId = ownerId;
  return extra ? Object.assign(c, extra) : c;
}
export function colTrigger(x0, y0, z0, x1, y1, z1, tag) {
  return { kind: 'trigger', min: V(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), max: V(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)), tag };
}

/**
 * A "solid": one visible box + its collider from the same numbers (guaranteed alignment).
 * Returns the collider (or null if no tag).
 */
export function makeSolid(batch, colliders) {
  return (material, color, x0, y0, z0, x1, y1, z1, tag, ownerId, uvFn) => {
    batch.boxMM(material, color, x0, y0, z0, x1, y1, z1, uvFn);
    if (!tag) return null;
    const c = colBox(x0, y0, z0, x1, y1, z1, tag, ownerId);
    colliders.push(c);
    return c;
  };
}

// ---------------------------------------------------------------------------------------------
// Canvas textures
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
export function canvasTexture(canvas, { repeat = false, srgb = true, anisotropy = 4, mipmaps = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  if (!mipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  return t;
}
export function drawTexture(w, h, draw, opts) {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d'), w, h, c);
  return canvasTexture(c, opts);
}

/** Deterministic cosmetic rng for textures / decoration (never Math.random → stable screenshots). */
export const rngFor = (label) => createRng(`world/${label}`);

/** Font stacks (system fonts only; Kaiti looks like handwriting / chalk). */
export const FONT_KAI = '"AR PL KaitiM GB", "KaiTi", "STKaiti", "Kaiti SC", "楷体", "Droid Sans Fallback", "Noto Sans CJK SC", serif';
export const FONT_HEI = '"Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", "WenQuanYi Micro Hei", "Droid Sans Fallback", sans-serif';
