import test from 'node:test';
import assert from 'node:assert/strict';
import { makeImage } from '../src/codec/model.js';
import { encodeStrips } from '../src/codec/strip-encoder.js';
import { encodeTiles } from '../src/codec/tile-encoder.js';

function rng(seed=0x12345678) {
  let s=seed>>>0;
  return () => ((s=(Math.imul(1664525,s)+1013904223)>>>0) / 2**32);
}

function assertSerialized(out) {
  assert.doesNotMatch(out.svg,/NaN|Infinity|undefined/);
  assert.doesNotMatch(out.layersJson,/NaN|Infinity|undefined/);
  const layers=JSON.parse(out.layersJson);
  assert.ok(Array.isArray(layers));
  assert.ok(out.payload.estimatedRequestBytes > 0);
  for (const r of out.model.regions) {
    assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h));
    assert.ok(r.w > 0 && r.h > 0);
  }
}

test('deterministic randomized images serialize safely across strip and tile encoders', () => {
  const random=rng();
  for(let n=0;n<16;n++) {
    const w=1+Math.floor(random()*14), h=1+Math.floor(random()*14);
    const data=new Uint8ClampedArray(w*h*4);
    for(let i=0;i<data.length;i+=4) {
      data[i]=Math.floor(random()*256); data[i+1]=Math.floor(random()*256); data[i+2]=Math.floor(random()*256);
      data[i+3]=random()<0.3?0:Math.floor(random()*256);
    }
    const image=makeImage(w,h,data);
    for(const orientation of ['rows','columns']) {
      assertSerialized(encodeStrips(image,{orientation,bits:[4,6,8][n%3],precision:3,gradientTolerance:n%8,mergeTolerance:n%3}));
    }
    for(const tolerance of [0,8,28]) {
      try {
        assertSerialized(encodeTiles(image,{bits:[4,6,8][n%3],precision:3,modelTolerance:tolerance,minTile:1,maxDepth:12,maxRegions:1200}));
      } catch (error) {
        assert.match(String(error?.message),/complexity limit/i);
      }
    }
  }
});
