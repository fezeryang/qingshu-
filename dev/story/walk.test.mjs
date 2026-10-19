import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDirector, CANCEL } from '../../src/story/direct.js';

function harness() {
  const caps = [], stops = [];
  const ctx = { time: { now: 0, wait: () => new Promise((resolve) => caps.push(resolve)) } };
  const d = createDirector(ctx, { debug: {}, props: new Map() }, 'walk-regression');
  let token = 0;
  const pending = [];
  const ch = { root: new THREE.Group(), posture: 'stand',
    setPosture(p) { this.posture = p; },
    stop(clip) { stops.push(clip); },
    walkTo(to) {
      const generation = ++token;
      if (this.root.position.distanceTo(to) < 0.02) return Promise.resolve();
      return new Promise((resolve) => pending.push(() => {
        if (generation === token) this.root.position.copy(to);
        resolve();
      }));
    },
  };
  return { d, ch, caps, pending, stops };
}

test('a capped walk cannot pull an actor out of the next scene', async () => {
  const { d, ch, caps, pending, stops } = harness();
  const walk = d.walk(ch, new THREE.Vector3(2.4, 0, -1.35), { cap: 0.2 });
  caps[0]();
  await walk;
  d.place(ch, new THREE.Vector3(0.68, 0, 3.9));
  pending[0](); // the old character tween finishes after the scene placement
  await Promise.resolve();
  assert.deepEqual(ch.root.position.toArray(), [0.68, 0, 3.9]);
  assert.deepEqual(stops, ['walk', 'run']);
});

test('cancelling a director invalidates its active character movement', async () => {
  const { d, ch, pending, stops } = harness();
  const walk = d.walk(ch, new THREE.Vector3(5, 0, 0));
  d.cancel();
  pending[0]();
  await assert.rejects(walk, (err) => err === CANCEL);
  assert.deepEqual(ch.root.position.toArray(), [0, 0, 0]);
  assert.deepEqual(stops, ['walk', 'run']);
});
