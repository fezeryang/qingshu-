import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameBudget, renderPixelRatio } from '../../src/core/performance.js';

test('high-DPI and 4K buffers stay within the pixel budget; lowfx stays at DPR 1', () => {
  for (const [w, h, dpr] of [[960, 540, 2], [1920, 1080, 2], [3840, 2160, 2], [390, 844, 3]]) {
    const ratio = renderPixelRatio(w, h, dpr);
    assert.ok(w * h * ratio ** 2 <= 1920 * 1080 + 1);
    assert.ok(ratio <= dpr && ratio <= 1.5);
    assert.equal(renderPixelRatio(w, h, dpr, .6, true), 1);
  }
  assert.equal(renderPixelRatio(960, 540, 1), 1);
});

test('sustained missed frames reduce resolution, with a bounded floor', () => {
  const b = createFrameBudget();
  for (let i = 0; i < 1200; i++) b.sample(1000 / 30);
  assert.equal(b.scale, .6);
  assert.ok(b.frameMs > 30);
});

test('one long frame and hidden-tab delays do not trigger a quality change', () => {
  const b = createFrameBudget();
  for (let i = 0; i < 120; i++) b.sample(i === 45 ? 100 : 1000 / 60);
  assert.equal(b.scale, 1);
  for (const invalid of [5000, NaN, Infinity, 0, -10]) b.sample(invalid);
  assert.equal(b.scale, 1);
});

test('resolution recovers slowly and stable 60 Hz stays at full quality', () => {
  const b = createFrameBudget();
  for (let i = 0; i < 35; i++) b.sample(1000 / 30);
  assert.equal(b.scale, .9);
  for (let i = 0; i < 180; i++) b.sample(1000 / 60);
  assert.equal(b.scale, .9);
  for (let i = 0; i < 600; i++) b.sample(1000 / 60);
  assert.equal(b.scale, 1);
});

test('pause/manual reset discards previous timing windows', () => {
  const b = createFrameBudget();
  for (let i = 0; i < 29; i++) b.sample(40);
  b.reset();
  b.sample(40);
  assert.equal(b.scale, 1);
});
