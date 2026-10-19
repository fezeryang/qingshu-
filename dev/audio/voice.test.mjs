import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVoice } from '../../src/audio/voice.js';

test('late clip decodes cannot revive cancelled dialogue or a skipped intro', async () => {
  const originalFetch = globalThis.fetch;
  const listeners = new Map(), decodes = [], sources = [];
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const manifest = { lines: { teacher: {
    '你好。': { f: 'line', d: 2 },
    '上课！': { f: 'ritual', d: 1 },
  } } };
  globalThis.fetch = async (url) => String(url).endsWith('.json')
    ? { ok: true, json: async () => manifest }
    : { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
  const ac = {
    currentTime: 0,
    decodeAudioData: () => new Promise((resolve) => decodes.push(resolve)),
    createBufferSource() {
      const source = { playbackRate: {}, connect() {}, start() { sources.push(source); }, stop() {}, disconnect() {} };
      return source;
    },
    createGain: () => ({ gain: { value: 1, setTargetAtTime() {} }, connect() {}, disconnect() {} }),
  };
  const ctx = { config: {}, settings: {}, flow: { phase: 'aim' }, time: { uiNow: 0 },
    bus: { on(type, fn) { const list = listeners.get(type) || []; list.push(fn); listeners.set(type, list); } } };
  const emit = (type, value) => { for (const fn of listeners.get(type) || []) fn(value); };
  const M = { ac, running: true, silent: () => false, bus: { voiceIn: {} }, duck: () => ({ until: 100 }) };
  try {
    const voice = createVoice(M, ctx, () => {});
    await flush();
    const first = voice.voiceLine('你好。', null, { charId: 'teacher' });
    await flush();
    assert.equal(decodes.length, 1);
    first.cancel();
    await first;
    decodes.shift()({ duration: 2 });
    await flush();
    voice.update(0.1);
    assert.equal(sources.length, 0, 'cancelled line started after decoding');
    assert.equal(voice.activeJobs, 0);

    ctx.flow.phase = 'intro';
    emit('bell', {});
    voice.update(0.6);
    await flush();
    assert.equal(decodes.length, 1);
    ctx.flow.phase = 'aim';
    emit('phase', { to: 'aim' });
    ctx.flow.phase = 'intro';
    emit('bell', {}); // a new ritual must not accept the old ritual's decode callback
    decodes.shift()({ duration: 1 });
    await flush();
    assert.equal(sources.length, 0, 'old intro started a clip inside the new intro');
    voice.update(0.6);
    await flush();
    assert.equal(sources.length, 1, 'new intro did not play its own scheduled clip');
    voice.stopVoice();
    assert.equal(voice.ritualActive, false);

    ctx.flow.phase = 'ending';
    const blips = voice.stats.blips;
    await voice.voiceLine('你好。', null, { charId: 'teacher' });
    await voice.speak('你好。');
    voice.blip(null, '好');
    assert.equal(voice.activeJobs, 0);
    assert.equal(voice.stats.blips, blips, 'text-only ending emitted a blip');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
