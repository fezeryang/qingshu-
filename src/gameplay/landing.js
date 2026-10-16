// Landing classification (owner: gameplay). Pure: turns a physics result into the contract's
// Landing record (CONTRACTS.md §5). Used by the live ball and by the solver's success test.
import { SEATS, SEAT_BY_ID, DESK, CHAIR, PLAYER_SEAT, BALL_RADIUS } from '../core/layout.js';

const SEAT_TAGS = new Set(['desk', 'chair', 'book']);
const PODIUM_TAGS = new Set(['podium', 'teacherDesk']);

/** Seat whose desk top (or chair seat) footprint contains the point, if the height fits. */
export function seatAtPoint(x, y, z) {
  const m = BALL_RADIUS * 0.5;
  for (const s of SEATS) {
    if (Math.abs(x - s.x) <= DESK.w / 2 + m) {
      if (Math.abs(z - s.deskZ) <= DESK.d / 2 + m && y >= DESK.topY - 0.02 && y <= DESK.topY + 0.6) return { seatId: s.id, part: 'desk' };
      if (Math.abs(z - s.chairZ) <= CHAIR.d / 2 + m && y >= CHAIR.seatY - 0.02 && y <= CHAIR.backTopY + 0.3) return { seatId: s.id, part: 'chair' };
    }
  }
  return null;
}

/** Nearest seat (by desk centre, XZ) — flavour info for floor landings. */
export function nearestSeat(x, z) {
  let best = null, bd = Infinity;
  for (const s of SEATS) {
    const d = Math.hypot(x - s.x, z - (s.deskZ + s.chairZ) / 2);
    if (d < bd) { bd = d; best = s.id; }
  }
  return best;
}

/**
 * @param {object} res  physics result: {reason, triggerTag, support:{tag,ownerId}, pos, t, hits, bounces, nearMisses, fanOwner}
 * @param {object} q    lookups: {occupant(seatId) → charId|null, seatOf(charId) → seatId|null, playerSeat?}
 * @returns Landing {type, seatId, ownerId, pos, hits, flightTime, bounces, nearMisses, support, reason, ...}
 */
export function classifyLanding(res, q = {}) {
  const occupant = q.occupant || (() => null);
  const seatOf = q.seatOf || (() => null);
  const playerSeat = q.playerSeat || PLAYER_SEAT;
  const pos = res.pos;
  const hits = (res.hits || []).map((h) => ({ tag: h.tag, ownerId: h.ownerId ?? null, t: h.t, speed: h.speed }));
  const L = {
    type: 'floor', seatId: null, ownerId: null, pos,
    hits, flightTime: +(res.t || 0).toFixed(3), bounces: res.bounces || 0,
    nearMisses: (res.nearMisses || []).map((n) => ({ ownerId: n.ownerId, dist: n.dist })),
    support: res.support ? { tag: res.support.tag, ownerId: res.support.ownerId ?? null } : null,
    reason: res.reason,
  };
  const teacherHit = hits.find((h) => h.tag === 'teacher');
  if (teacherHit) { // GDD §7: hitting the teacher outranks everything else
    L.type = 'teacher'; L.ownerId = teacherHit.ownerId || 'teacher';
    return L;
  }
  if (res.reason === 'fan') { L.type = 'fan'; L.fanId = res.fanOwner ?? null; return L; }
  if (res.reason === 'trigger') { L.type = res.triggerTag === 'trash' ? 'trash' : 'outside'; return L; }

  const s = res.support;
  const toSeat = (seatId, part) => {
    L.seatId = seatId;
    L.ownerId = occupant(seatId) ?? null;
    L.type = seatId === playerSeat ? 'self' : part;
  };
  if (!s) {
    const at = pos && seatAtPoint(pos.x, pos.y, pos.z);
    if (at) toSeat(at.seatId, at.part);
    else L.type = res.reason === 'timeout' ? 'timeout' : 'floor';
  } else if (SEAT_TAGS.has(s.tag) && SEAT_BY_ID[s.ownerId]) {
    toSeat(s.ownerId, s.tag === 'chair' ? 'chair' : 'desk');
  } else if (PODIUM_TAGS.has(s.tag)) {
    L.type = 'podium';
  } else if ((s.tag === 'head' || s.tag === 'body') && s.ownerId != null) {
    // came to rest on a person (lap, shoulder, top of the head): it is theirs
    const seatId = seatOf(s.ownerId);
    if (seatId) { toSeat(seatId, 'chair'); L.ownerId = s.ownerId; } else L.type = 'floor';
  } else if (s.tag === 'floor') {
    L.type = 'floor';
  } else {
    // props / unknown supports: attribute to a desk if it lies on one, else it is lost
    const at = pos && seatAtPoint(pos.x, pos.y, pos.z);
    if (at) toSeat(at.seatId, at.part); else L.type = 'floor';
  }
  if (L.type === 'floor' && pos) L.nearSeatId = nearestSeat(pos.x, pos.z);
  return L;
}
