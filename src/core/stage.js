// Scene sets (owner: lead). Only one set is visible at a time: the classroom, or an ending set
// built lazily by ctx.world.buildSet(name). Sets share the world origin; characters are moved
// into a set by the cutscene that uses it.
//
//   ctx.stage.show('rooftop') → set   (hides the others, applies the set's background/fog/exposure)
//   ctx.stage.current                 name of the visible set
//   ctx.stage.get(name)               the set object (builds it if needed)
import { ORDER } from './engine.js';

export function installStage(ctx) {
  const sets = new Map();
  const { scene, renderer } = ctx.engine;

  const stage = {
    current: null,
    get(name) {
      if (!sets.has(name)) {
        const set = name === 'classroom' ? ctx.world.classroom : ctx.world.buildSet(name);
        set.group.visible = false;
        if (!set.group.parent) scene.add(set.group);
        sets.set(name, set);
      }
      return sets.get(name);
    },
    show(name) {
      const set = stage.get(name);
      for (const s of sets.values()) s.group.visible = s === set;
      scene.background = set.background ?? null;
      scene.fog = set.fog ?? null;
      renderer.toneMappingExposure = set.exposure ?? 1;
      stage.current = name;
      ctx.bus.emit('stage', { name });
      return set;
    },
  };
  ctx.stage = stage;
  ctx.engine.onUpdate((dt, time) => { const s = stage.current && sets.get(stage.current); s?.update?.(dt, time); }, ORDER.WORLD);
}
