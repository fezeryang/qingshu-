// Paper-ball physics core (owner: gameplay). Pure and deterministic: depends only on three.js
// and src/core/layout.js, so it runs in Node for unit tests (dev/gameplay/physics.test.mjs).
//
// The ball is a sphere of radius R moving through Colliders (CONTRACTS.md §5):
//   box (AABB) | obb | sphere | trigger.
// Integration uses a fixed step H = 1/240 s, further split into sub-steps so that the ball never
// travels more than MAX_MOVE (≈ 0.45 R) per sub-step: a contact can never be skipped and the centre
// can never cross a face, so thin desk tops, window glass and bin walls cannot be tunnelled through.
// Several contacts in the same sub-step (corners, edges, wedges) are resolved iteratively.
//
// The SAME stepBall() drives the live ball, launch prediction (predict) and the launch solver,
// which is what lets solveLaunch() promise "this solution really lands there".
import * as THREE from 'three';
import { BALL_RADIUS, ROOM, WINDOWS, PLAYER_EYE } from '../core/layout.js';

export const PHYS = {
  R: BALL_RADIUS,
  G: 9.8,
  H: 1 / 240,                 // fixed physics step (s)
  MAX_MOVE: BALL_RADIUS * 0.45, // max travel per sub-step (m)
  MAX_SUB: 12,
  SKIN: 0.0015,               // contact considered "touching" within this gap (m)
  DRAG_QUAD: 0.016,           // quadratic air drag k (1/m): a = -k |v| v
  DRAG_LIN: 0.03,             // linear air drag (1/s)
  SPEED_MIN: 2.2,
  SPEED_MAX: 10.5,           // GDD says 9; with this layout 9 m/s cannot reach the bin, podium or teacher (see docs/modules/gameplay.md)
  LOB_DEG: 10,
  REST_SPEED: 0.12,           // m/s, relative to the support
  REST_TIME: 0.25,            // s at rest on a support → landed
  STUCK_TIME: 0.6,            // s slow while touching anything (wedged) → landed
  TIMEOUT: 7,                 // s of flight → landed('timeout')
  HIT_SPEED: 0.4,             // normal impact speed that counts as a hit / bounce
  BOUNCE_MIN: 0.3,            // below this normal speed the contact is perfectly inelastic
  NEAR_MISS: 0.35,            // m from a head's surface
  WIND_ACC: 1.6,              // m/s² at wind strength 1, right at the window
  WIND_X: -2.6,               // wind only acts for x < WIND_X
  NUDGE_ACC: 1.0,             // m/s² telekinesis (≈0.5–1 m landing shift at full willpower; lead call, was 2.5)
  MAX_SPEED: 30,              // safety clamp
};

/** Per-tag surface response. e = restitution, mu = Coulomb friction (impulse), roll = rolling resistance (× g). */
export const MATERIALS = {
  default: { e: 0.3, mu: 0.45, roll: 0.35 },
  floor: { e: 0.25, mu: 0.6, roll: 0.5 },
  ceiling: { e: 0.35, mu: 0.4, roll: 0.3 },
  wall: { e: 0.35, mu: 0.4, roll: 0.35 },
  blackboard: { e: 0.35, mu: 0.35, roll: 0.35 },
  door: { e: 0.35, mu: 0.4, roll: 0.35 },
  windowGlass: { e: 0.4, mu: 0.2, roll: 0.3 },
  windowFrame: { e: 0.3, mu: 0.4, roll: 0.4 },
  desk: { e: 0.3, mu: 0.5, roll: 0.45 },
  chair: { e: 0.3, mu: 0.5, roll: 0.45 },
  book: { e: 0.2, mu: 0.6, roll: 0.55 },
  podium: { e: 0.3, mu: 0.5, roll: 0.45 },
  teacherDesk: { e: 0.3, mu: 0.5, roll: 0.45 },
  trashRim: { e: 0.3, mu: 0.4, roll: 0.35 },
  head: { e: 0.55, mu: 0.3, roll: 0.25 },
  body: { e: 0.3, mu: 0.6, roll: 0.6 },
  teacher: { e: 0.5, mu: 0.4, roll: 0.4 },
  fan: { e: 0.3, mu: 0.3, roll: 0.3 },
  prop: { e: 0.3, mu: 0.5, roll: 0.45 },
};

export const K_BOX = 0, K_OBB = 1, K_SPHERE = 2, K_TRIGGER = 3;
const KIND = { box: K_BOX, obb: K_OBB, sphere: K_SPHERE, trigger: K_TRIGGER };
const R = PHYS.R;
const fin = Number.isFinite;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------------------------------------
// Colliders

/** Fresh internal collider record (all numbers, no allocation in the hot loop). */
export function newRecord() {
  return {
    kind: 0, src: null, tag: '', ownerId: null, key: '', e: 0.3, mu: 0.4, roll: 0.3,
    minx: 0, miny: 0, minz: 0, maxx: 0, maxy: 0, maxz: 0,   // AABB (box/trigger: exact; others: bounds)
    cx: 0, cy: 0, cz: 0, r: 0,                              // centre (all), radius (sphere)
    hx: 0, hy: 0, hz: 0,                                     // obb half extents
    m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0, m20: 0, m21: 0, m22: 1, // obb rotation (columns = local axes)
    vx: 0, vy: 0, vz: 0,                                     // surface velocity (moving colliders)
  };
}

/**
 * Compile a contract Collider into `o` (internal record). Returns false for malformed input
 * (unknown kind, NaN numbers) so one bad collider can never poison the simulation.
 */
export function compileInto(o, c, key = '') {
  const kind = KIND[c?.kind];
  if (kind === undefined) return false;
  const tag = c.tag || 'prop';
  const m = MATERIALS[tag] || MATERIALS.default;
  o.kind = kind; o.src = c; o.tag = tag; o.ownerId = c.ownerId ?? null; o.key = key;
  o.e = fin(c.restitution) ? c.restitution : m.e;
  o.mu = fin(c.friction) ? c.friction : m.mu;
  o.roll = m.roll;
  o.vx = o.vy = o.vz = 0;
  if (c.velocity && fin(c.velocity.x) && fin(c.velocity.y) && fin(c.velocity.z)) { o.vx = c.velocity.x; o.vy = c.velocity.y; o.vz = c.velocity.z; }
  if (kind === K_BOX || kind === K_TRIGGER) {
    const a = c.min, b = c.max;
    if (!a || !b) return false;
    o.minx = Math.min(a.x, b.x); o.maxx = Math.max(a.x, b.x);
    o.miny = Math.min(a.y, b.y); o.maxy = Math.max(a.y, b.y);
    o.minz = Math.min(a.z, b.z); o.maxz = Math.max(a.z, b.z);
    o.cx = (o.minx + o.maxx) / 2; o.cy = (o.miny + o.maxy) / 2; o.cz = (o.minz + o.maxz) / 2;
  } else if (kind === K_SPHERE) {
    const p = c.center;
    if (!p || !(c.radius > 0)) return false;
    o.cx = p.x; o.cy = p.y; o.cz = p.z; o.r = c.radius;
    o.minx = p.x - c.radius; o.maxx = p.x + c.radius;
    o.miny = p.y - c.radius; o.maxy = p.y + c.radius;
    o.minz = p.z - c.radius; o.maxz = p.z + c.radius;
  } else { // obb
    const p = c.center, h = c.halfSize, q = c.quaternion || { x: 0, y: 0, z: 0, w: 1 };
    if (!p || !h) return false;
    o.cx = p.x; o.cy = p.y; o.cz = p.z;
    o.hx = Math.abs(h.x); o.hy = Math.abs(h.y); o.hz = Math.abs(h.z);
    let { x, y, z, w } = q;
    const ql = Math.hypot(x, y, z, w) || 1;
    x /= ql; y /= ql; z /= ql; w /= ql;
    // rotation matrix (column j = local axis j in world space)
    o.m00 = 1 - 2 * (y * y + z * z); o.m01 = 2 * (x * y - z * w); o.m02 = 2 * (x * z + y * w);
    o.m10 = 2 * (x * y + z * w); o.m11 = 1 - 2 * (x * x + z * z); o.m12 = 2 * (y * z - x * w);
    o.m20 = 2 * (x * z - y * w); o.m21 = 2 * (y * z + x * w); o.m22 = 1 - 2 * (x * x + y * y);
    const ex = Math.abs(o.m00) * o.hx + Math.abs(o.m01) * o.hy + Math.abs(o.m02) * o.hz;
    const ey = Math.abs(o.m10) * o.hx + Math.abs(o.m11) * o.hy + Math.abs(o.m12) * o.hz;
    const ez = Math.abs(o.m20) * o.hx + Math.abs(o.m21) * o.hy + Math.abs(o.m22) * o.hz;
    o.minx = p.x - ex; o.maxx = p.x + ex; o.miny = p.y - ey; o.maxy = p.y + ey; o.minz = p.z - ez; o.maxz = p.z + ez;
  }
  return fin(o.minx + o.maxx + o.miny + o.maxy + o.minz + o.maxz + o.cx + o.cy + o.cz + o.r + o.hx + o.hy + o.hz);
}

/**
 * Broadphase: a uniform XZ grid of collider records. A collider is inserted into every cell its
 * AABB (grown by R + margin) overlaps; a query is the single cell containing the ball centre.
 * Huge colliders (floor, ceiling, outside trigger) go to `global`.
 */
export class Grid {
  constructor({ minX = ROOM.minX - 1.5, maxX = ROOM.maxX + 1.5, minZ = ROOM.minZ - 1.5, maxZ = ROOM.maxZ + 1.5, cell = 0.5 } = {}) {
    this.x0 = minX; this.z0 = minZ; this.cell = cell;
    this.nx = Math.ceil((maxX - minX) / cell); this.nz = Math.ceil((maxZ - minZ) / cell);
    this.cells = Array.from({ length: this.nx * this.nz }, () => []);
    this.global = [];
    this.all = [];
    this.touched = [];
    this.pool = [];
  }
  clear() {
    for (const i of this.touched) this.cells[i].length = 0;
    this.touched.length = 0;
    this.global.length = 0;
    this.all.length = 0;
  }
  ix(x) { return clamp(Math.floor((x - this.x0) / this.cell), 0, this.nx - 1); }
  iz(z) { return clamp(Math.floor((z - this.z0) / this.cell), 0, this.nz - 1); }
  insert(o) {
    const m = R + 0.06;
    const i0 = this.ix(o.minx - m), i1 = this.ix(o.maxx + m), k0 = this.iz(o.minz - m), k1 = this.iz(o.maxz + m);
    this.all.push(o);
    if ((i1 - i0 + 1) * (k1 - k0 + 1) > 120) { this.global.push(o); return; }
    for (let k = k0; k <= k1; k++) {
      for (let i = i0; i <= i1; i++) {
        const idx = k * this.nx + i;
        const cell = this.cells[idx];
        if (!cell.length) this.touched.push(idx);
        cell.push(o);
      }
    }
  }
  /** Replace the contents with compiled copies of `list`. keyFn(c, i) gives a stable identity key. */
  setColliders(list, keyFn) {
    this.clear();
    let n = 0;
    for (let i = 0; i < (list?.length || 0); i++) {
      const c = list[i];
      const o = this.pool[n] || (this.pool[n] = newRecord());
      if (!compileInto(o, c, keyFn ? keyFn(c, i) : `s${i}`)) continue;
      n++;
      this.insert(o);
    }
    return this;
  }
  cellAt(x, z) { return this.cells[this.iz(z) * this.nx + this.ix(x)]; }
}

/**
 * A collision scene = static grid (shared, rarely rebuilt) + dynamic grid (characters, fan blades;
 * rebuilt per frame or snapshotted by the solver) + optional "zones" (solver-only keep-out discs).
 */
export class Scene {
  constructor(staticGrid = new Grid(), dynamicGrid = new Grid()) {
    this.static = staticGrid;
    this.dynamic = dynamicGrid;
    this.zones = [];
    this.heads = [];
  }
  setDynamic(list, keyFn) {
    this.dynamic.setColliders(list, keyFn);
    this.heads.length = 0;
    for (const o of this.dynamic.all) if (o.kind === K_SPHERE && (o.tag === 'head' || o.tag === 'teacher')) this.heads.push(o);
    return this;
  }
}

/** Stable identity key for character / dynamic colliders (they are recreated every frame). */
export function dynamicKeyFn() {
  const counts = new Map();
  return (c) => {
    const base = `${c.tag}|${c.ownerId ?? ''}|${c.kind}`;
    const n = counts.get(base) || 0;
    counts.set(base, n + 1);
    return `${base}|${n}`;
  };
}

// ---------------------------------------------------------------------------------------------
// Ball state + stepping

export function newBall() {
  return {
    px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, t: 0,
    lx: 0, ly: 0, lz: 0,           // last valid position (NaN guard)
    done: false, reason: null, triggerTag: null, fanKey: null, fanOwner: null,
    support: null, sny: 0, snx: 0, snz: 0,   // supporting collider (largest upward normal this step)
    lastSupport: null,             // last non-null support (snapshot {tag, ownerId, key})
    contacts: [], prevContacts: [], // keys of colliders touched this / previous sub-step
    restTime: 0, stuckTime: 0,
    hits: [], bounces: 0, touched: false,
    apexDone: false, apex: null, prevVy: 0,
    near: new Map(), nearMisses: [],
    windVx: 0, windVy: 0, windVz: 0, windDrift: 0,
    guard: 0, nanFix: 0, steps: 0, maxHeight: -Infinity,
  };
}

export function resetBall(b, pos, vel) {
  b.px = b.lx = pos.x; b.py = b.ly = pos.y; b.pz = b.lz = pos.z;
  b.vx = vel.x; b.vy = vel.y; b.vz = vel.z;
  b.t = 0; b.done = false; b.reason = null; b.triggerTag = null; b.fanKey = null; b.fanOwner = null;
  b.support = null; b.lastSupport = null; b.sny = 0;
  b.contacts.length = 0; b.prevContacts.length = 0;
  b.restTime = 0; b.stuckTime = 0; b.hits = []; b.bounces = 0; b.touched = false;
  b.apexDone = false; b.apex = null; b.prevVy = vel.y;
  b.near = new Map(); b.nearMisses = [];
  b.windVx = b.windVy = b.windVz = 0; b.windDrift = 0;
  b.guard = 0; b.nanFix = 0; b.steps = 0; b.maxHeight = pos.y;
  return b;
}

export const speedFromPower = (power) => PHYS.SPEED_MIN + (PHYS.SPEED_MAX - PHYS.SPEED_MIN) * clamp(fin(power) ? power : 0, 0, 1);
export const powerFromSpeed = (speed) => clamp((speed - PHYS.SPEED_MIN) / (PHYS.SPEED_MAX - PHYS.SPEED_MIN), 0, 1);

/** Unit direction for yaw (0 = -Z, positive turns left) and pitch (elevation, radians). */
export function dirFromYawPitch(yaw, pitch, out = new THREE.Vector3()) {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

/** Initial velocity for a launch spec {yaw, pitch, power} | {dir, power} | {vel}. */
export function launchVelocity(spec, out = new THREE.Vector3()) {
  if (spec.vel) return out.copy(spec.vel);
  const speed = fin(spec.speed) ? spec.speed : speedFromPower(spec.power);
  if (spec.dir) {
    out.copy(spec.dir);
    if (out.lengthSq() < 1e-12) out.set(0, 0, -1);
    return out.normalize().multiplyScalar(speed);
  }
  return dirFromYawPitch(fin(spec.yaw) ? spec.yaw : 0, fin(spec.pitch) ? spec.pitch : 0, out).multiplyScalar(speed);
}

/**
 * Launch origin: a little in front of the right shoulder, from the seat's eye point and the view
 * yaw/pitch only (never from arm animation), so scripted launches and player throws match exactly.
 */
export function launchOriginFor(yaw = 0, pitch = 0, eye = PLAYER_EYE, out = new THREE.Vector3()) {
  const y = fin(yaw) ? yaw : 0, p = clamp(fin(pitch) ? pitch : 0, -1.2, 1.2);
  const rx = Math.cos(y), rz = -Math.sin(y);          // right
  const fx = -Math.sin(y), fz = -Math.cos(y);         // forward (horizontal)
  const cp = Math.cos(p), sp = Math.sin(p);
  const reach = 0.24;
  return out.set(
    eye.x + rx * 0.17 + fx * (0.05 + reach * cp),
    eye.y - 0.13 + reach * sp * 0.6,
    eye.z + rz * 0.17 + fz * (0.05 + reach * cp),
  );
}

// scratch for contact queries
const C = { nx: 0, ny: 0, nz: 0, d: 0 };

/** Penetration test of the ball centre (x,y,z) against record o. Fills C; returns true when touching. */
function contactTest(o, x, y, z) {
  const reach = R + PHYS.SKIN;
  if (o.kind === K_SPHERE) {
    const dx = x - o.cx, dy = y - o.cy, dz = z - o.cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    const rr = o.r + reach;
    if (d2 >= rr * rr) return false;
    const d = Math.sqrt(d2);
    if (d > 1e-9) { C.nx = dx / d; C.ny = dy / d; C.nz = dz / d; } else { C.nx = 0; C.ny = 1; C.nz = 0; }
    C.d = o.r + R - d;
    return true;
  }
  let lx, ly, lz, hx, hy, hz;
  if (o.kind === K_BOX) {
    lx = x - o.cx; ly = y - o.cy; lz = z - o.cz;
    hx = (o.maxx - o.minx) / 2; hy = (o.maxy - o.miny) / 2; hz = (o.maxz - o.minz) / 2;
  } else {
    const dx = x - o.cx, dy = y - o.cy, dz = z - o.cz;
    lx = o.m00 * dx + o.m10 * dy + o.m20 * dz; // R^T · d
    ly = o.m01 * dx + o.m11 * dy + o.m21 * dz;
    lz = o.m02 * dx + o.m12 * dy + o.m22 * dz;
    hx = o.hx; hy = o.hy; hz = o.hz;
  }
  const qx = clamp(lx, -hx, hx), qy = clamp(ly, -hy, hy), qz = clamp(lz, -hz, hz);
  const dx = lx - qx, dy = ly - qy, dz = lz - qz;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= reach * reach) return false;
  let nx, ny, nz;
  if (d2 > 1e-14) {
    const d = Math.sqrt(d2);
    nx = dx / d; ny = dy / d; nz = dz / d;
    C.d = R - d;
  } else {
    // centre inside the box (only possible after a large external push): leave by the nearest face
    const fx = hx - Math.abs(lx), fy = hy - Math.abs(ly), fz = hz - Math.abs(lz);
    nx = ny = nz = 0;
    if (fy <= fx && fy <= fz) { ny = ly >= 0 ? 1 : -1; C.d = R + fy; } else if (fx <= fz) { nx = lx >= 0 ? 1 : -1; C.d = R + fx; } else { nz = lz >= 0 ? 1 : -1; C.d = R + fz; }
  }
  if (o.kind === K_OBB) {
    C.nx = o.m00 * nx + o.m01 * ny + o.m02 * nz;
    C.ny = o.m10 * nx + o.m11 * ny + o.m12 * nz;
    C.nz = o.m20 * nx + o.m21 * ny + o.m22 * nz;
  } else { C.nx = nx; C.ny = ny; C.nz = nz; }
  return true;
}

const paperFactor = (impact) => clamp(1.12 - 0.08 * impact, 0.45, 1);

function hitRecord(b, o, impact) {
  b.bounces++;
  const h = { tag: o.tag, ownerId: o.ownerId, t: +b.t.toFixed(3), speed: +impact.toFixed(2), x: b.px, y: b.py, z: b.pz, nx: C.nx, ny: C.ny, nz: C.nz, key: o.key };
  b.hits.push(h);
  return h;
}

/**
 * Resolve every contact touching the ball (static + dynamic). Up to 3 passes so that corners and
 * wedges between several colliders settle. Velocity response: restitution along the normal (speed-
 * dependent paper damping, perfectly inelastic when slow) + Coulomb friction impulse.
 */
function resolveContacts(b, scene, ev) {
  b.support = null; b.sny = -2;
  const tmp = b.prevContacts; b.prevContacts = b.contacts; b.contacts = tmp; b.contacts.length = 0;
  const sg = scene.static, dg = scene.dynamic;
  const lists = [sg.global, sg.cellAt(b.px, b.pz), dg.global, dg.cellAt(b.px, b.pz)];
  for (let pass = 0; pass < 3; pass++) {
    let pushed = false;
    for (let li = 0; li < 4; li++) {
      const list = lists[li];
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o.kind === K_TRIGGER) continue;
        const reach = R + PHYS.SKIN;
        if (b.px < o.minx - reach || b.px > o.maxx + reach || b.py < o.miny - reach || b.py > o.maxy + reach || b.pz < o.minz - reach || b.pz > o.maxz + reach) continue;
        if (!contactTest(o, b.px, b.py, b.pz)) continue;
        if (o.tag === 'fan') {
          // shredded: the blade wins immediately
          const impact = Math.hypot(b.vx - o.vx, b.vy - o.vy, b.vz - o.vz);
          const h = hitRecord(b, o, impact);
          ev?.hit?.(b, h, o);
          b.done = true; b.reason = 'fan'; b.fanKey = o.key; b.fanOwner = o.ownerId;
          return;
        }
        if (C.d > 0) { b.px += C.nx * C.d; b.py += C.ny * C.d; b.pz += C.nz * C.d; pushed = true; }
        const rvx = b.vx - o.vx, rvy = b.vy - o.vy, rvz = b.vz - o.vz;
        const vn = rvx * C.nx + rvy * C.ny + rvz * C.nz;
        if (vn < 0) {
          const impact = -vn;
          const e = impact > PHYS.BOUNCE_MIN ? o.e * paperFactor(impact) : 0;
          const jn = (1 + e) * impact;
          const tx = rvx - vn * C.nx, ty = rvy - vn * C.ny, tz = rvz - vn * C.nz;
          b.vx += jn * C.nx; b.vy += jn * C.ny; b.vz += jn * C.nz;
          const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
          if (tl > 1e-9) {
            const dv = Math.min(o.mu * jn, tl) / tl;
            b.vx -= tx * dv; b.vy -= ty * dv; b.vz -= tz * dv;
          }
          if (impact > PHYS.HIT_SPEED && !b.prevContacts.includes(o.key) && !b.contacts.includes(o.key)) {
            const h = hitRecord(b, o, impact);
            ev?.hit?.(b, h, o);
          }
        }
        if (!b.contacts.includes(o.key)) b.contacts.push(o.key);
        b.touched = true;
        if (C.ny > b.sny) { b.sny = C.ny; b.snx = C.nx; b.snz = C.nz; b.support = o; }
      }
    }
    if (!pushed) break;
  }
}

/** Is (x,y,z) inside any trigger? Returns the record or null. */
function triggerAt(scene, x, y, z) {
  const sg = scene.static;
  const lists = [sg.global, sg.cellAt(x, z), scene.dynamic.global, scene.dynamic.cellAt(x, z)];
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.kind === K_TRIGGER && x > o.minx && x < o.maxx && y > o.miny && y < o.maxy && z > o.minz && z < o.maxz) return o;
    }
  }
  return null;
}

/** Openings in the left wall the ball may legitimately leave through (open windows). */
export function defaultOpenings(windows = WINDOWS) {
  return windows.filter((w) => w.open).map((w) => ({ z0: w.z - w.w / 2, z1: w.z + w.w / 2, y0: w.sillY, y1: w.sillY + w.h }));
}

/**
 * Last-resort containment (should never fire when the world's colliders are right): keeps the ball
 * inside the room except through an open window. Counts interventions in b.guard.
 */
function guardBounds(b, openings, prevX) {
  const lo = R * 0.25;
  if (b.py < lo) { b.py = R; if (b.vy < 0) b.vy = -b.vy * 0.2; b.guard++; }
  if (b.px > ROOM.minX - 0.05) { // inside the room footprint (outside the window we only fall)
    if (b.py > ROOM.height - lo) { b.py = ROOM.height - R; if (b.vy > 0) b.vy = -b.vy * 0.3; b.guard++; }
    if (b.px > ROOM.maxX - lo) { b.px = ROOM.maxX - R; if (b.vx > 0) b.vx = -b.vx * 0.3; b.guard++; }
    if (b.pz < ROOM.minZ + lo) { b.pz = ROOM.minZ + R; if (b.vz < 0) b.vz = -b.vz * 0.3; b.guard++; }
    if (b.pz > ROOM.maxZ - lo) { b.pz = ROOM.maxZ - R; if (b.vz > 0) b.vz = -b.vz * 0.3; b.guard++; }
  }
  const wallX = ROOM.minX + lo;
  if (b.px < wallX && prevX >= wallX) {
    let ok = false;
    for (const w of openings) if (b.pz > w.z0 && b.pz < w.z1 && b.py > w.y0 && b.py < w.y1) { ok = true; break; }
    if (!ok) { b.px = ROOM.minX + R; if (b.vx < 0) b.vx = -b.vx * 0.3; b.guard++; }
  }
}

const smooth01 = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Advance the ball by h seconds (normally PHYS.H). env (all optional):
 *   wind: {x,y,z, strength}   gust direction + 0..1 strength (acts for x < WIND_X, strongest at the window)
 *   nudge: {x,y,z}            extra acceleration (m/s²), e.g. telekinesis
 *   bounds: bool              room containment safety net (default true)
 *   openings: [...]           openings for the safety net (default: open windows from layout)
 *   near: bool                track near misses against scene.heads
 * ev (callbacks, all optional): hit(b, hit, record), apex(b), nearMiss(b, info), zone(b, zone, dt)
 */
export function stepBall(b, scene, env = {}, h = PHYS.H, ev = null) {
  if (b.done) return b;
  const speed0 = Math.hypot(b.vx, b.vy, b.vz);
  const n = Math.min(PHYS.MAX_SUB, Math.max(1, Math.ceil((speed0 * h) / PHYS.MAX_MOVE)));
  const hs = h / n;
  const wind = env.wind, nudge = env.nudge, bounds = env.bounds !== false;
  const openings = env.openings || DEFAULT_OPENINGS;
  for (let k = 0; k < n && !b.done; k++) {
    // forces
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    const drag = PHYS.DRAG_QUAD * sp + PHYS.DRAG_LIN;
    let ax = -drag * b.vx, ay = -PHYS.G - drag * b.vy, az = -drag * b.vz;
    if (wind && wind.strength > 0 && b.px < PHYS.WIND_X) {
      const f = PHYS.WIND_ACC * wind.strength * smooth01(PHYS.WIND_X, ROOM.minX + 0.4, b.px);
      ax += wind.x * f; ay += wind.y * f; az += wind.z * f;
      b.windVx += wind.x * f * hs; b.windVy += wind.y * f * hs; b.windVz += wind.z * f * hs;
    }
    if (nudge) { ax += nudge.x; ay += nudge.y; az += nudge.z; }
    b.vx += ax * hs; b.vy += ay * hs; b.vz += az * hs;
    const prevX = b.px;
    b.px += b.vx * hs; b.py += b.vy * hs; b.pz += b.vz * hs;
    b.windDrift += Math.hypot(b.windVx, b.windVy, b.windVz) * hs;
    b.t += hs;

    resolveContacts(b, scene, ev);
    if (b.done) break;
    if (bounds) guardBounds(b, openings, prevX);

    // rolling resistance + static friction on a supporting surface
    const s = b.support;
    if (s && b.sny > 0.5) {
      b.lastSupport = s;
      const rvx = b.vx - s.vx, rvy = b.vy - s.vy, rvz = b.vz - s.vz;
      const vn = rvx * b.snx + rvy * b.sny + rvz * b.snz;
      const tx = rvx - vn * b.snx, ty = rvy - vn * b.sny, tz = rvz - vn * b.snz;
      const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
      const dec = s.roll * PHYS.G * b.sny * hs;
      if (tl <= dec) { b.vx -= tx; b.vy -= ty; b.vz -= tz; } else if (tl > 0) { const f = dec / tl; b.vx -= tx * f; b.vy -= ty * f; b.vz -= tz * f; }
    }

    // triggers (bin, outside)
    const trg = triggerAt(scene, b.px, b.py, b.pz);
    if (trg) { b.done = true; b.reason = 'trigger'; b.triggerTag = trg.tag; break; }
    if (bounds && b.px < ROOM.minX - 0.45) { b.done = true; b.reason = 'trigger'; b.triggerTag = 'outside'; break; }

    // solver keep-out zones (fan discs)
    if (scene.zones.length) {
      for (const zn of scene.zones) {
        if (Math.abs(b.py - zn.y) < zn.hh + R && Math.hypot(b.px - zn.x, b.pz - zn.z) < zn.r + R) { ev?.zone?.(b, zn, hs); if (b.done) break; }
      }
      if (b.done) break;
    }

    // NaN / runaway guard
    if (!fin(b.px + b.py + b.pz + b.vx + b.vy + b.vz)) {
      b.px = b.lx; b.py = b.ly; b.pz = b.lz; b.vx = b.vy = b.vz = 0; b.nanFix++;
    } else {
      const v2 = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
      if (v2 > PHYS.MAX_SPEED * PHYS.MAX_SPEED) { const f = PHYS.MAX_SPEED / Math.sqrt(v2); b.vx *= f; b.vy *= f; b.vz *= f; }
      b.lx = b.px; b.ly = b.py; b.lz = b.pz;
    }
    if (b.py > b.maxHeight) b.maxHeight = b.py;

    // rest detection
    const rs = s ? Math.hypot(b.vx - s.vx, b.vy - s.vy, b.vz - s.vz) : Math.hypot(b.vx, b.vy, b.vz);
    if (s && b.sny > 0.5 && rs < PHYS.REST_SPEED) b.restTime += hs; else b.restTime = 0;
    if (b.contacts.length && rs < PHYS.REST_SPEED) b.stuckTime += hs; else b.stuckTime = 0;
    if (b.restTime >= PHYS.REST_TIME || b.stuckTime >= PHYS.STUCK_TIME) { b.done = true; b.reason = 'rest'; if (s) b.lastSupport = s; break; }
  }
  b.steps++;
  // apex (first time vertical velocity turns downward; immediately if launched downward)
  if (!b.apexDone && (b.vy <= 0 || b.done)) {
    b.apexDone = true;
    b.apex = { x: b.px, y: b.py, z: b.pz, t: b.t };
    ev?.apex?.(b);
  }
  b.prevVy = b.vy;
  if (env.near && scene.heads.length) trackNearMisses(b, scene, ev);
  if (!b.done && b.t >= PHYS.TIMEOUT) { b.done = true; b.reason = 'timeout'; }
  return b;
}
const DEFAULT_OPENINGS = defaultOpenings();

function trackNearMisses(b, scene, ev) {
  for (const o of scene.heads) {
    const id = o.ownerId;
    if (id == null) continue;
    let rec = b.near.get(id);
    if (rec?.done) continue;
    const d = Math.hypot(b.px - o.cx, b.py - o.cy, b.pz - o.cz) - o.r;
    if (d > PHYS.NEAR_MISS && !rec) continue;
    if (!rec) { rec = { min: d, done: false, x: b.px, y: b.py, z: b.pz }; b.near.set(id, rec); }
    if (d < rec.min) { rec.min = d; rec.x = b.px; rec.y = b.py; rec.z = b.pz; }
    const struck = b.hits.some((h) => h.ownerId === id && (h.tag === 'head' || h.tag === 'teacher' || h.tag === 'body'));
    if (struck) { rec.done = true; continue; }
    if (d > rec.min + 0.03 || d > PHYS.NEAR_MISS || b.done) {
      rec.done = true;
      if (rec.min <= PHYS.NEAR_MISS) {
        const info = { ownerId: id, dist: +Math.max(0, rec.min).toFixed(3), x: rec.x, y: rec.y, z: rec.z };
        b.nearMisses.push({ ownerId: id, dist: info.dist });
        ev?.nearMiss?.(b, info);
      }
    }
  }
}

/** Snapshot of a support record for results (records are pooled and get overwritten). */
export const supportInfo = (o) => (o ? { tag: o.tag, ownerId: o.ownerId, key: o.key } : null);

/**
 * Run a whole flight to completion. Returns a plain result:
 *   {reason: 'rest'|'trigger'|'fan'|'timeout'|'zone', triggerTag, support:{tag,ownerId}, pos:{x,y,z}, t,
 *    hits, bounces, nearMisses, apex, maxHeight, path?: [{x,y,z,t}], guard, nanFix}
 * opts: {env, maxTime, record (seconds between path samples, 0 = off), ev, stopAt (seconds)}
 */
export function simulate(scene, pos, vel, opts = {}) {
  const b = resetBall(opts.ball || newBall(), pos, vel);
  const env = opts.env || {};
  const path = opts.record ? [{ x: b.px, y: b.py, z: b.pz, t: 0 }] : null;
  const stopAt = opts.stopAt ?? Infinity;
  let nextRec = opts.record || Infinity;
  while (!b.done && b.t < stopAt) {
    stepBall(b, scene, env, PHYS.H, opts.ev);
    if (path && (b.t >= nextRec - 1e-9 || b.done)) { path.push({ x: b.px, y: b.py, z: b.pz, t: b.t }); nextRec += opts.record; }
  }
  return {
    reason: b.done ? b.reason : 'stopped', triggerTag: b.triggerTag, fanOwner: b.fanOwner,
    support: supportInfo(b.reason === 'rest' ? (b.lastSupport || b.support) : b.support || (b.reason === 'timeout' ? b.lastSupport : null)),
    pos: { x: b.px, y: b.py, z: b.pz }, vel: { x: b.vx, y: b.vy, z: b.vz }, t: b.t,
    hits: b.hits, bounces: b.bounces, nearMisses: b.nearMisses, apex: b.apex, maxHeight: b.maxHeight,
    path, guard: b.guard, nanFix: b.nanFix, windDrift: b.windDrift, ball: b,
  };
}
