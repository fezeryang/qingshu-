// Launch solver (owner: gameplay). Finds {yaw, pitch, power} that really comes to rest on the
// collider containing a target point, verified with the very same simulator the live ball uses.
//
// Strategy
//   1. Work out the goal from the target: a trigger (bin / outside), a fan disc, a seat (desk, chair,
//      books on it), the podium, the teacher, a person, the floor, or just "near this point".
//   2. For each launch elevation in preference order (lob: high arcs that clear the front rows),
//      bisect the power so that the obstacle-free (drag-correct) arc passes through an aim point.
//      Arcs that would scrape the ceiling or cross a spinning fan's disc are pruned cheaply.
//   3. Fully simulate the candidate (static colliders + a snapshot of the characters + fan discs as
//      keep-out zones) and classify the landing. Successful candidates are re-simulated with small
//      yaw/power perturbations; the first fully robust one wins, else the best one found in budget.
import { PHYS, Grid, Scene, newBall, resetBall, stepBall, simulate, launchVelocity, dirFromYawPitch, K_TRIGGER } from './physics.js';
import { classifyLanding } from './landing.js';
import { ROOM, SEAT_BY_ID } from '../core/layout.js';
import * as THREE from 'three';

const DEG = Math.PI / 180;
const EMPTY = new Scene(new Grid({ cell: 50 }), new Grid({ cell: 50 }));
const now = () => (globalThis.performance ? performance.now() : Date.now());

const LOB = [58, 62, 54, 66, 50, 70, 46, 74, 42, 38, 34, 30, 26, 22, 18, 14, 10, 6, 2, -2, -6, -10, 78, 82, -16, -24, -34, -48, -62];
const FLAT = [8, 4, 12, 0, 16, 20, -4, 24, 28, 32, -8, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 78, -16, -24, -34, -48, -62];

function pitchOrder(opts) {
  const lo = Number.isFinite(opts.minPitchDeg) ? opts.minPitchDeg : -90, hi = Number.isFinite(opts.maxPitchDeg) ? opts.maxPitchDeg : 90;
  return pitchOrderRaw(opts).filter((x) => x >= lo && x <= hi);
}
function pitchOrderRaw(opts) {
  if (Number.isFinite(opts.pitchDeg)) {
    const p = opts.pitchDeg;
    const near = [];
    for (let k = 0; k <= 8; k++) { near.push(p + 2 * k); if (k) near.push(p - 2 * k); }
    if (Number.isFinite(opts.maxPitchDeg)) for (let x = Math.floor(opts.maxPitchDeg); x > p + 16; x -= 2) near.push(x);
    const rest = (opts.mode === 'flat' ? FLAT : LOB).filter((x) => Math.abs(x - p) > 16);
    return [...near, ...rest].filter((x) => x >= -70 && x <= 84);
  }
  return opts.mode === 'flat' ? FLAT : LOB;
}

/** Distance from point to a compiled record's surface (0 inside). */
function distToRecord(o, p) {
  if (o.kind === 2) return Math.max(0, Math.hypot(p.x - o.cx, p.y - o.cy, p.z - o.cz) - o.r);
  if (o.kind === 1) {
    const dx = p.x - o.cx, dy = p.y - o.cy, dz = p.z - o.cz;
    const lx = o.m00 * dx + o.m10 * dy + o.m20 * dz, ly = o.m01 * dx + o.m11 * dy + o.m21 * dz, lz = o.m02 * dx + o.m12 * dy + o.m22 * dz;
    return Math.hypot(Math.max(0, Math.abs(lx) - o.hx), Math.max(0, Math.abs(ly) - o.hy), Math.max(0, Math.abs(lz) - o.hz));
  }
  return Math.hypot(Math.max(o.minx - p.x, 0, p.x - o.maxx), Math.max(o.miny - p.y, 0, p.y - o.maxy), Math.max(o.minz - p.z, 0, p.z - o.maxz));
}

/** What does "hitting this target" mean? */
export function makeGoal(target, scene, fans = []) {
  const p = target;
  for (const g of [scene.static, scene.dynamic]) {
    for (const o of g.all) if (o.kind === K_TRIGGER && p.x > o.minx && p.x < o.maxx && p.y > o.miny && p.y < o.maxy && p.z > o.minz && p.z < o.maxz) {
      return { kind: 'trigger', tag: o.tag, landType: o.tag === 'trash' ? 'trash' : 'outside', target: p };
    }
  }
  for (const f of fans) {
    if (Math.abs(p.y - f.y) < 0.2 && Math.hypot(p.x - f.x, p.z - f.z) < f.r + 0.1) return { kind: 'fan', landType: 'fan', fan: f, target: p };
  }
  let best = null, bd = Infinity;
  for (const g of [scene.static, scene.dynamic]) {
    for (const o of g.all) {
      if (o.kind === K_TRIGGER || o.tag === 'fan' || o.tag === 'ceiling') continue;
      const d = distToRecord(o, p);
      // prefer specific objects over the floor/walls when equally close
      const bias = o.tag === 'floor' || o.tag === 'wall' ? 0.01 : 0;
      if (d + bias < bd) { bd = d + bias; best = o; }
    }
  }
  if (best && bd <= PHYS.R + 0.06) {
    const t = best.tag;
    if ((t === 'desk' || t === 'chair' || t === 'book') && SEAT_BY_ID[best.ownerId]) return { kind: 'seat', seatId: best.ownerId, target: p };
    if (t === 'podium' || t === 'teacherDesk') return { kind: 'podium', landType: 'podium', target: p };
    if (t === 'teacher') return { kind: 'teacher', landType: 'teacher', target: p };
    if ((t === 'head' || t === 'body') && best.ownerId != null) return { kind: 'person', ownerId: best.ownerId, target: p };
    if (t === 'floor') return { kind: 'floor', landType: 'floor', target: p };
  }
  return { kind: 'near', target: p };
}

function evaluate(goal, res, landing) {
  const p = goal.target;
  const err = Math.hypot(res.pos.x - p.x, res.pos.z - p.z);
  let ok;
  switch (goal.kind) {
    case 'seat': ok = landing.seatId === goal.seatId && (landing.type === 'desk' || landing.type === 'chair' || landing.type === 'self'); break;
    case 'trigger': case 'podium': case 'teacher': ok = landing.type === goal.landType; break;
    case 'fan': ok = res.reason === 'fan' || landing.type === 'fan'; break;
    case 'person': ok = res.hits.some((h) => h.ownerId === goal.ownerId); break;
    case 'floor': ok = landing.type === 'floor' && err < 1.0; break;
    default: ok = err < 0.35 && res.reason !== 'timeout';
  }
  const charHits = res.hits.filter((h) => h.tag === 'head' || h.tag === 'body').length;
  return { ok, err: ['trigger', 'fan', 'teacher', 'person'].includes(goal.kind) ? 0 : err, charHits };
}

/**
 * @param {object} a
 *   origin: Vector3, target: Vector3, scene: Scene (static + snapshot), fans: [{x,z,y,r,hh}],
 *   opts: {pitchDeg?, mode?}, lookups: {occupant, seatOf}, env: base env for simulate (openings), budgetMs
 * @returns {{yaw, pitch, power, expect, robust, sims, ms}|null}
 */
export function solveLaunch(a) {
  const t0 = now();
  const { origin, target, scene } = a;
  const opts = a.opts || {};
  const budget = a.budgetMs ?? 140;
  const fans = a.fans || [];
  const goal = makeGoal(target, scene, fans);
  const env = { bounds: true, ...(a.env || {}), wind: null, nudge: null };
  const lookups = a.lookups || {};
  let sims = 0;

  // fan discs: keep-out zones (or the goal itself)
  scene.zones = fans.map((f) => ({ ...f }));
  let zoneTime = 0;
  const zoneEv = {
    zone(b, zn, dt) {
      if (goal.kind === 'fan' && zn === scene.zones[fans.indexOf(goal.fan)]) {
        zoneTime += dt;
        if (zoneTime >= 0.1) { b.done = true; b.reason = 'fan'; b.fanOwner = zn.id ?? null; }
      } else if (goal.kind !== 'fan') { b.done = true; b.reason = 'zone'; }
    },
  };

  const dx = target.x - origin.x, dz = target.z - origin.z;
  const D = Math.hypot(dx, dz);
  const ux = D > 1e-6 ? dx / D : 0, uz = D > 1e-6 ? dz / D : -1;     // horizontal unit toward target
  const vel = new THREE.Vector3();
  const fb = newBall();

  /** Height of the obstacle-free arc where it reaches horizontal distance `dist` (+ pruning info). */
  function arcAt(yaw, pitch, power, dist) {
    launchVelocity({ yaw, pitch, power }, vel);
    resetBall(fb, origin, vel);
    let px = 0, py = origin.y, prevD = 0;
    let crossedZone = false;
    for (let i = 0; i < 1400; i++) {
      stepBall(fb, EMPTY, { bounds: false }, PHYS.H);
      const d = (fb.px - origin.x) * ux + (fb.pz - origin.z) * uz;
      if (goal.kind !== 'fan') for (const f of fans) if (Math.abs(fb.py - f.y) < f.hh + PHYS.R + 0.03 && Math.hypot(fb.px - f.x, fb.pz - f.z) < f.r + PHYS.R + 0.06) crossedZone = true;
      if (d >= dist) {
        const k = (dist - prevD) / Math.max(1e-9, d - prevD);
        return { y: py + (fb.py - py) * k, maxH: fb.maxHeight, crossedZone, descending: fb.vy < 0 };
      }
      if (fb.py < -1 || fb.t > 4) return null;
      px = d; py = fb.py; prevD = d;
    }
    return null;
  }

  /** Power whose free arc passes through (dist, y). */
  function powerFor(yaw, pitch, dist, y) {
    const hi = arcAt(yaw, pitch, 1, dist);
    if (!hi || hi.y < y) return null;
    const lo = arcAt(yaw, pitch, 0, dist);
    if (lo && lo.y > y) return null;
    let a0 = 0, a1 = 1;
    for (let i = 0; i < 11; i++) {
      const m = (a0 + a1) / 2;
      const r = arcAt(yaw, pitch, m, dist);
      if (!r || r.y < y) a0 = m; else a1 = m;
    }
    return (a0 + a1) / 2;
  }

  function run(yaw, pitch, power) {
    sims++;
    zoneTime = 0;
    launchVelocity({ yaw, pitch, power }, vel);
    const res = simulate(scene, origin, vel, { env, ev: zoneEv });
    const landing = classifyLanding(res, lookups);
    return { res, landing, ...evaluate(goal, res, landing) };
  }

  const ceilingY = ROOM.height - PHYS.R - 0.03;
  const offsets = goal.kind === 'seat' || goal.kind === 'podium' || goal.kind === 'floor'
    ? [[0, 0], [-0.1, 0], [0.07, 0], [0, 0.12], [0, -0.12], [-0.16, 0], [-0.1, 0.12], [-0.1, -0.12]]
    : goal.kind === 'trigger' && goal.tag === 'trash' ? [[0, 0], [-0.05, 0], [0.05, 0], [0, 0.05], [0, -0.05]]
      : [[0, 0], [-0.08, 0], [0.08, 0]];
  const dYaw = 0.0045, dPow = 0.004;
  let best = null;
  const pitches = pitchOrder(opts);

  outer:
  for (let pi = 0; pi < pitches.length; pi++) {
    const pitch = pitches[pi] * DEG;
    for (const [along, side] of offsets) {
      if (now() - t0 > budget) break outer;
      const ax = target.x + ux * along - uz * side, az = target.z + uz * along + ux * side;
      const yaw = Math.atan2(-(ax - origin.x), -(az - origin.z));
      const dist = Math.hypot(ax - origin.x, az - origin.z);
      const power = powerFor(yaw, pitch, dist, target.y);
      if (power == null) break; // no power reaches this aim point at this elevation; try the next one
      const arc = arcAt(yaw, pitch, power, dist);
      if (!arc || arc.maxH > ceilingY || arc.crossedZone) break;
      if (goal.kind === 'fan' && arc.descending && Math.abs(arc.y - target.y) > 0.3) continue;
      const c = run(yaw, pitch, power);
      if (!c.ok) continue;
      let robust = 0;
      for (const [dy, dp] of [[dYaw, 0], [-dYaw, 0], [0, dPow], [0, -dPow]]) {
        if (power + dp < 0 || power + dp > 1) continue;
        if (run(yaw + dy, pitch, power + dp).ok) robust++;
      }
      const cand = { yaw, pitch, power, robust, err: c.err, charHits: c.charHits, rank: pi, landing: c.landing, res: c.res };
      const better = !best || cand.robust > best.robust || (cand.robust === best.robust && (cand.charHits < best.charHits || (cand.charHits === best.charHits && cand.err < best.err - 0.05)));
      if (better) best = cand;
      if (cand.robust >= 4 && cand.err < 0.2 && cand.charHits === 0) break outer;
      if (cand.robust >= 4 && cand.err < 0.2 && pi > 6) break outer;
    }
  }
  if (!best) return null;
  return {
    yaw: best.yaw, pitch: best.pitch, power: best.power,
    expect: { type: best.landing.type, seatId: best.landing.seatId, ownerId: best.landing.ownerId, pos: best.res.pos, flightTime: +best.res.t.toFixed(2) },
    goal: goal.kind, robust: best.robust, sims, ms: +(now() - t0).toFixed(1),
  };
}

/** Fan discs (solver keep-out zones) from the world's fan list. */
export function fanZones(fans) {
  return (fans || []).map((f) => ({
    id: f.id, x: f.center?.x ?? f.x, z: f.center?.z ?? f.z, y: f.bladeY ?? f.center?.y ?? f.y, r: f.radius ?? f.r ?? 0.7, hh: 0.05,
  })).filter((f) => Number.isFinite(f.x + f.y + f.z + f.r));
}

export { dirFromYawPitch };
