import test from 'node:test';
import assert from 'node:assert/strict';
import { quantizeByte, rgbaDistance } from '../src/codec/color.js';
import { simplifySamples } from '../src/codec/gradient.js';
import { asciiBase64Length, measurePayload } from '../src/codec/payload.js';

test('quantizeByte maps channel to requested bit depth endpoints', () => {
  assert.equal(quantizeByte(0, 4), 0);
  assert.equal(quantizeByte(255, 4), 255);
  assert.equal(quantizeByte(128, 8), 128);
  assert.ok(Math.abs(quantizeByte(128, 4) - 136) <= 1);
});

test('rgbaDistance includes alpha strongly enough to distinguish transparency', () => {
  assert.equal(rgbaDistance([10,20,30,255], [10,20,30,255]), 0);
  assert.ok(rgbaDistance([10,20,30,255], [10,20,30,0]) > 100);
});

test('simplifySamples collapses an exact linear ramp to two stops', () => {
  const samples = Array.from({length: 9}, (_, i) => [i*16, i*16, i*16, 255]);
  const stops = simplifySamples(samples, { tolerance: 0.01, edgeThreshold: 999, preserveEdges: false });
  assert.equal(stops.length, 2);
  assert.equal(stops[0].offset, 0.5 / samples.length);
  assert.equal(stops.at(-1).offset, 1 - 0.5 / samples.length);
});

test('simplifySamples preserves a hard step with paired boundary stops', () => {
  const samples = [
    [0,0,0,255],[0,0,0,255],[0,0,0,255],
    [255,255,255,255],[255,255,255,255],[255,255,255,255]
  ];
  const stops = simplifySamples(samples, { tolerance: 999, edgeThreshold: 100, preserveEdges: true });
  assert.ok(stops.length >= 4);
  assert.ok(stops.some((s, i) => i && Math.abs(s.offset - stops[i-1].offset) < 1e-9));
});

test('asciiBase64Length matches actual base64 length', () => {
  for (const s of ['', 'a', 'ab', 'abc', 'abcdefg', '<svg></svg>']) {
    assert.equal(asciiBase64Length(s.length), Buffer.from(s, 'ascii').toString('base64').length);
  }
});

test('measurePayload accounts for both base64 strings', () => {
  const m = measurePayload('<svg/>', '[{}]');
  assert.equal(m.base64DataBytes, Buffer.from('<svg/>').toString('base64').length + Buffer.from('[{}]').toString('base64').length);
  assert.ok(m.estimatedRequestBytes > m.base64DataBytes);
});

test('rgbaDistance ignores hidden RGB when both colors are fully transparent', () => {
  assert.equal(rgbaDistance([255,0,0,0],[0,0,255,0]),0);
});
