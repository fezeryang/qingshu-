// Bootstrap (owner: lead): build ctx, install every module in dependency order, start the flow.
import * as THREE from 'three';
import { createEngine } from './core/engine.js';
import { createBus } from './core/bus.js';
import { createRng } from './core/rng.js';
import { createInput } from './core/input.js';
import { installCast } from './core/cast.js';
import { installStage } from './core/stage.js';
import { installFlow } from './core/flow.js';
import { installDebug } from './core/debug.js';
import { config } from './core/config.js';
import { store } from './core/util.js';
import * as layout from './core/layout.js';

import * as world from './world/index.js';
import * as characters from './characters/index.js';
import * as story from './story/index.js';
import * as ai from './ai/index.js';
import * as gameplay from './gameplay/index.js';
import * as camera from './camera/index.js';
import * as audio from './audio/index.js';
import * as ui from './ui/index.js';

async function boot() {
  const canvas = document.getElementById('game');
  const engine = createEngine(canvas);
  if (config.lowfx) { engine.renderer.shadowMap.enabled = false; engine.renderer.setPixelRatio(1); }

  const bus = createBus();
  bus.clock = () => engine.time.now;

  const ctx = {
    THREE, config, layout, engine, bus,
    time: engine.time,
    input: createInput(engine, bus),
    makeRng: createRng,
    rng: createRng(config.seed ?? 1),
    settings: { masterVolume: 0.8, musicVolume: 0.7, sfxVolume: 0.9, sensitivity: 1, reducedMotion: false, playerGender: 'm', ...store.get('qingshu.settings', {}) },
    round: null,
  };
  if (config.mute) ctx.settings.masterVolume = 0;
  window.__qsCtx = ctx;
  installDebug(ctx); // first, so it captures errors thrown during install

  // Order matters: later modules may read APIs that earlier ones attached to ctx.
  await world.install(ctx);        // ctx.world
  await characters.install(ctx);   // ctx.characters
  await story.install(ctx);        // ctx.story (roster, endings, cutscenes)
  installCast(ctx);                // ctx.cast
  installStage(ctx);               // ctx.stage
  await ai.install(ctx);           // ctx.ai
  await gameplay.install(ctx);     // ctx.gameplay
  await camera.install(ctx);       // ctx.cam
  await audio.install(ctx);        // ctx.audio
  await ui.install(ctx);           // ctx.ui
  installFlow(ctx);                // ctx.flow

  ctx.stage.show('classroom');
  engine.start();
  document.body.classList.add('ready');
  window.__qs.ready = true;
  ctx.flow.run().catch((err) => console.error('[flow] crashed', err));
}

boot().catch((err) => {
  console.error('[boot] failed', err);
  const el = document.getElementById('boot-error');
  if (el) { el.textContent = '启动失败：' + (err?.message || err); el.hidden = false; }
});
