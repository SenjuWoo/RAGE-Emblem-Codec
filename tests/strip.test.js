import test from 'node:test';
import assert from 'node:assert/strict';
import { makeImage } from '../src/codec/model.js';
import { encodeStrips } from '../src/codec/strip-encoder.js';

function solid(w,h,rgba) {
  const data = new Uint8ClampedArray(w*h*4);
  for (let i=0;i<w*h;i++) data.set(rgba,i*4);
  return makeImage(w,h,data);
}

test('solid image collapses to one horizontal strip layer', () => {
  const r = encodeStrips(solid(8,8,[240,20,20,255]), { orientation:'rows', precision:3, bits:8, gradientTolerance:0, preserveEdges:true, mergeTolerance:0 });
  assert.equal(r.stats.layers, 1);
  assert.match(r.svg, /<path/);
  assert.equal(JSON.parse(r.layersJson).length, 2); // background + one content layer
});

test('fully transparent image emits no content layers', () => {
  const r = encodeStrips(solid(8,8,[20,30,40,0]), { orientation:'columns', precision:3, bits:8, gradientTolerance:0, preserveEdges:true, mergeTolerance:0 });
  assert.equal(r.stats.layers, 0);
  assert.equal(JSON.parse(r.layersJson).length, 1);
});

test('identical neighboring rows are spanned rather than duplicated', () => {
  const img = solid(16,16,[10,140,220,255]);
  const r = encodeStrips(img, { orientation:'rows', precision:3, bits:8, gradientTolerance:0, preserveEdges:true, mergeTolerance:0 });
  assert.equal(r.stats.layers, 1);
  assert.equal(r.model.regions[0].h, 16);
});
