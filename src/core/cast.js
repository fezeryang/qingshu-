// The cast: every character instance in the game, and where they sit (owner: lead).
//
//   ctx.cast.get(id) / all() / students() / teacher
//   ctx.cast.seatOf(charId) → seatId | null,  ctx.cast.occupant(seatId) → charId | null
//   ctx.cast.seatAll()        put every student in their chair (sitting, facing the board), teacher at the board
//   ctx.cast.extra(spec)      create (once) a non-classroom character for endings: parent, principal, PE teacher…
//   ctx.cast.showOnly(ids) / showAll()
//   ctx.cast.colliders()      live colliders of all visible characters (heads, torsos) for the physics
import { SEAT_BY_ID, TEACHER_SPOTS } from './layout.js';
import { ORDER } from './engine.js';

export function installCast(ctx) {
  const chars = new Map();
  let seatMap = {};       // seatId → charId|null
  let seatOfChar = {};    // charId → seatId

  const cast = {
    teacher: null,
    get: (id) => chars.get(id) || null,
    all: () => [...chars.values()],
    students: () => [...chars.values()].filter((c) => c.spec.role === 'student'),
    seatOf: (id) => seatOfChar[id] || null,
    occupant: (seatId) => seatMap[seatId] || null,
    get seatMap() { return seatMap; },

    /** Create or reuse characters for a roster from ctx.story.makeRoster(). */
    setRoster(roster) {
      for (const spec of [roster.teacher, ...roster.students]) {
        if (!chars.has(spec.id)) {
          const ch = ctx.characters.create(spec);
          chars.set(spec.id, ch);
          ctx.engine.scene.add(ch.root);
        }
      }
      cast.teacher = chars.get(roster.teacher.id);
      seatMap = { ...roster.seatMap };
      seatOfChar = {};
      for (const [seatId, cid] of Object.entries(seatMap)) if (cid) seatOfChar[cid] = seatId;
    },
    extra(spec) {
      if (!chars.has(spec.id)) {
        const ch = ctx.characters.create(spec);
        chars.set(spec.id, ch);
        ctx.engine.scene.add(ch.root);
      }
      return chars.get(spec.id);
    },
    seatAll() {
      for (const ch of chars.values()) {
        const seatId = seatOfChar[ch.id];
        ch.reset?.();
        if (seatId) {
          const s = SEAT_BY_ID[seatId];
          ch.root.position.set(s.x, 0, s.chairZ);
          ch.root.rotation.set(0, 0, 0);
          ch.setPosture('sit');
          ch.root.visible = true;
        } else if (ch === cast.teacher) {
          const p = TEACHER_SPOTS.board[1];
          ch.root.position.set(p.x, 0.2, p.z);
          ch.root.rotation.set(0, Math.PI, 0); // facing the class (+Z)
          ch.setPosture('stand');
          ch.root.visible = true;
        } else {
          ch.root.visible = false; // extras stay hidden until an ending uses them
        }
      }
    },
    showOnly(ids) { const keep = new Set(ids); for (const ch of chars.values()) ch.root.visible = keep.has(ch.id); },
    showAll() { for (const ch of chars.values()) if (seatOfChar[ch.id] || ch === cast.teacher) ch.root.visible = true; },
    colliders() {
      const out = [];
      for (const ch of chars.values()) if (ch.root.visible) out.push(...ch.getColliders());
      return out;
    },
  };
  ctx.cast = cast;
  ctx.engine.onUpdate((dt) => { for (const ch of chars.values()) if (ch.root.visible) ch.update(dt); }, ORDER.CHARACTERS);
}
