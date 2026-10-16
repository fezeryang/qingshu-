// Reference classroom for Node tests (no DOM): colliders built from src/core/layout.js the same way
// the gray-box world does, plus seated "characters" (head sphere + torso box) and fan blades.
// Real world/character colliders differ in detail; the browser sweep (sweep.js) checks those.
import * as THREE from 'three';
import { ROOM, SEATS, DESK, CHAIR, PLATFORM, TEACHER_DESK, WINDOWS, TRASH, FANS, PLAYER_SEAT, HEAD_Y_SEATED } from '../../src/core/layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function staticColliders({ books = true } = {}) {
  const c = [];
  const box = (min, max, tag, ownerId) => c.push({ kind: 'box', min, max, tag, ownerId });
  box(V(ROOM.minX - 1, -0.1, ROOM.minZ - 1), V(ROOM.maxX + 1, 0, ROOM.maxZ + 1), 'floor');
  box(V(ROOM.minX, ROOM.height, ROOM.minZ), V(ROOM.maxX, ROOM.height + 0.1, ROOM.maxZ), 'ceiling');
  box(V(ROOM.minX, 0, ROOM.minZ - 0.1), V(ROOM.maxX, ROOM.height, ROOM.minZ), 'wall');
  box(V(ROOM.minX, 0, ROOM.maxZ), V(ROOM.maxX, ROOM.height, ROOM.maxZ + 0.1), 'wall');
  box(V(ROOM.maxX, 0, ROOM.minZ), V(ROOM.maxX + 0.1, ROOM.height, ROOM.maxZ), 'wall');
  const w0 = WINDOWS[0];
  const lw = (z0, z1, y0, y1) => box(V(ROOM.minX - 0.1, y0, z0), V(ROOM.minX, y1, z1), 'wall');
  lw(ROOM.minZ, ROOM.maxZ, 0, w0.sillY);
  lw(ROOM.minZ, ROOM.maxZ, w0.sillY + w0.h, ROOM.height);
  let z = ROOM.minZ;
  for (const w of WINDOWS) {
    lw(z, w.z - w.w / 2, w0.sillY, w0.sillY + w0.h);
    if (!w.open) box(V(ROOM.minX - 0.05, w.sillY, w.z - w.w / 2), V(ROOM.minX - 0.03, w.sillY + w.h, w.z + w.w / 2), 'windowGlass');
    z = w.z + w.w / 2;
  }
  lw(z, ROOM.maxZ, w0.sillY, w0.sillY + w0.h);
  c.push({ kind: 'trigger', min: V(-12, -1, -12), max: V(ROOM.minX - 0.15, 8, 12), tag: 'outside' });
  box(V(PLATFORM.minX, 0, PLATFORM.minZ), V(PLATFORM.maxX, PLATFORM.h, PLATFORM.maxZ), 'podium');
  box(V(TEACHER_DESK.x - TEACHER_DESK.w / 2, PLATFORM.h, TEACHER_DESK.z - TEACHER_DESK.d / 2),
    V(TEACHER_DESK.x + TEACHER_DESK.w / 2, TEACHER_DESK.topY, TEACHER_DESK.z + TEACHER_DESK.d / 2), 'teacherDesk');
  for (const s of SEATS) {
    box(V(s.x - DESK.w / 2, DESK.topY - DESK.top, s.deskZ - DESK.d / 2), V(s.x + DESK.w / 2, DESK.topY, s.deskZ + DESK.d / 2), 'desk', s.id);
    box(V(s.x - CHAIR.w / 2, CHAIR.seatY - 0.03, s.chairZ - CHAIR.d / 2), V(s.x + CHAIR.w / 2, CHAIR.seatY, s.chairZ + CHAIR.d / 2), 'chair', s.id);
    // chair back (rotated slightly: exercises OBBs)
    c.push({ kind: 'obb', center: V(s.x, (CHAIR.seatY + CHAIR.backTopY) / 2, s.chairZ + CHAIR.d / 2 + 0.01), halfSize: V(CHAIR.w / 2, (CHAIR.backTopY - CHAIR.seatY) / 2, 0.012),
      quaternion: new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.08), tag: 'chair', ownerId: s.id });
    if (books && (s.row + s.col) % 3 === 0) {
      // a small book pile on the left corner of some desks
      box(V(s.x - DESK.w / 2 + 0.03, DESK.topY, s.deskZ - 0.12), V(s.x - DESK.w / 2 + 0.2, DESK.topY + 0.06, s.deskZ + 0.1), 'book', s.id);
    }
  }
  const t = TRASH, th = 0.015;
  box(V(t.x - t.r, 0, t.z - t.r), V(t.x + t.r, t.h, t.z - t.r + th), 'trashRim');
  box(V(t.x - t.r, 0, t.z + t.r - th), V(t.x + t.r, t.h, t.z + t.r), 'trashRim');
  box(V(t.x - t.r, 0, t.z - t.r), V(t.x - t.r + th, t.h, t.z + t.r), 'trashRim');
  box(V(t.x + t.r - th, 0, t.z - t.r), V(t.x + t.r, t.h, t.z + t.r), 'trashRim');
  c.push({ kind: 'trigger', min: V(t.x - t.r + th, 0, t.z - t.r + th), max: V(t.x + t.r - th, t.h - 0.05, t.z + t.r - th), tag: 'trash' });
  return c;
}

/** Seated students in every seat except the player's (ids = 's_' + seatId), teacher at the board. */
export function characterColliders({ empty = [], headR = 0.15, teacher = true } = {}) {
  const out = [];
  const seatMap = {};
  for (const s of SEATS) {
    if (s.id === PLAYER_SEAT || empty.includes(s.id)) { seatMap[s.id] = null; continue; }
    const id = 's_' + s.id;
    seatMap[s.id] = id;
    out.push({ kind: 'sphere', center: V(s.x, HEAD_Y_SEATED, s.chairZ), radius: headR, tag: 'head', ownerId: id });
    out.push({ kind: 'box', min: V(s.x - 0.18, 0.44, s.chairZ - 0.12), max: V(s.x + 0.18, HEAD_Y_SEATED - headR + 0.02, s.chairZ + 0.12), tag: 'body', ownerId: id });
  }
  if (teacher) {
    out.push({ kind: 'sphere', center: V(0, 1.72, -5.45), radius: 0.15, tag: 'teacher', ownerId: 'teacher' });
    out.push({ kind: 'box', min: V(-0.2, 0.2, -5.6), max: V(0.2, 1.55, -5.3), tag: 'teacher', ownerId: 'teacher' });
  }
  const seatOf = Object.fromEntries(Object.entries(seatMap).filter(([, v]) => v).map(([k, v]) => [v, k]));
  return { colliders: out, seatMap, lookups: { occupant: (sid) => seatMap[sid] ?? null, seatOf: (id) => seatOf[id] ?? null } };
}

/** Fan blade OBBs at time t (same shape as the gray-box world). */
export function fanBlades(t = 0) {
  const out = [];
  for (const f of FANS) {
    const ang = f.rps * 2 * Math.PI * t;
    for (let i = 0; i < 3; i++) {
      const a = ang + (i * 2 * Math.PI) / 3;
      out.push({ kind: 'obb', tag: 'fan', ownerId: f.id,
        center: V(f.x + Math.cos(a) * f.r / 2, f.bladeY, f.z + Math.sin(a) * f.r / 2),
        halfSize: V(f.r / 2, 0.02, 0.06), quaternion: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -a),
        velocity: V(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(f.rps * 2 * Math.PI * f.r / 2) });
    }
  }
  return out;
}

export const FAN_LIST = FANS.map((f) => ({ id: f.id, center: V(f.x, f.bladeY, f.z), radius: f.r, bladeY: f.bladeY }));
