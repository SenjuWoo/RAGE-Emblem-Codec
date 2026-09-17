import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the real worker handler and codec without a browser transport.
test('worker preserves artifact diagnostics in progress summaries', async t => {
  const messages = [];
  const previous = globalThis.self;
  globalThis.self = { postMessage: msg => messages.push(msg) };
  t.after(() => { if (previous === undefined) delete globalThis.self; else globalThis.self = previous; });
  await import('../src/worker.js');
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 4; y < 12; y++) for (let x = 5; x < 11; x++) data.set([220, 220, 220, 255], (y * 16 + x) * 4);
  data.set([255, 255, 255, 4], (2 * 16 + 8) * 4);
  self.onmessage({ data: { type: 'search', width: 16, height: 16, buffer: data.buffer,
    options: { resolutions: [16], bits: [8], maxCandidates: 1, qualityTarget: null, reserve: 0 } } });
  const candidate = messages.find(m => m.type === 'progress').progress.candidate;
  const full = messages.find(m => m.type === 'done').result.candidates[0];
  assert.ok(full.artifactPenalty > 0, 'fixture must have a measured artifact');
  for (const key of ['artifactPenalty', 'transparentLeakage', 'directionalArtifact']) assert.equal(candidate[key], full[key], key);
});
