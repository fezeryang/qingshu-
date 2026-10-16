// Character module (owner: qs-character-artist). Contract: docs/CONTRACTS.md §4.2.
//   ctx.characters.create(spec) → Character     chibi character (skinned body, canvas face, hair, clips)
//   ctx.characters.createArms() → FPArms        first-person hands
//   ctx.characters.createProp(name, opts?)      procedural props
// Extras are documented in docs/modules/characters.md.
import { ORDER } from '../core/engine.js';
import { createCharacter } from './character.js';
import { createArms as makeArms } from './arms.js';
import { createProp as makeProp, updateConfetti, PROPS } from './props.js';
import { CLIPS } from './clips.js';
import { EXPRESSIONS } from './face.js';
import { EMOTES } from './emotes.js';
import { HAIR_STYLES } from './hair.js';
import { outlineUniform } from './toon.js';

export async function install(ctx) {
  const lowfx = !!ctx.config?.lowfx;
  const registry = new Map();
  const animated = new Set();

  function createProp(name, opts) {
    let p;
    try { p = makeProp(name, opts || {}); } catch (err) { console.error('[characters] prop failed', name, err); p = makeProp('card'); }
    if (p.userData.confetti) animated.add(p);
    return p;
  }
  const env = { lowfx, makeProp: (n) => createProp(n) };

  function create(spec) {
    let ch;
    try { ch = createCharacter(ctx, spec, env); } catch (err) {
      console.error('[characters] create failed, falling back to defaults', err);
      ch = createCharacter(ctx, { id: spec?.id ?? 'anon', name: spec?.name, gender: spec?.gender === 'f' ? 'f' : 'm', role: spec?.role === 'teacher' ? 'teacher' : 'student', look: {} }, env);
      ch.spec = spec;
    }
    registry.set(ch.id, ch);
    return ch;
  }
  function createArms() { return makeArms(ctx, (n) => createProp(n)); }

  // mouths move while ui.say() shows a line for this character
  ctx.bus.on('say', (p) => {
    const ch = p?.charId != null ? registry.get(String(p.charId)) : null;
    if (!ch) return;
    const n = String(p.text ?? '').length;
    ch.talk(Math.min(8, 0.4 + n / 14));
  });

  // animated props (confetti) – game clock, so slow motion applies
  ctx.engine.onUpdate((dt) => {
    for (const p of animated) {
      if (!p.parent) continue;
      if (p.visible) updateConfetti(p, dt);
    }
  }, ORDER.CHARACTERS);

  ctx.characters = {
    create, createArms, createProp,
    get(id) { return registry.get(id) || null; },
    clips: Object.keys(CLIPS).filter((k) => k !== 'shuffle'),
    expressions: EXPRESSIONS,
    emotes: EMOTES,
    props: PROPS,
    hairStyles: HAIR_STYLES,
    outline: outlineUniform,
  };
}
