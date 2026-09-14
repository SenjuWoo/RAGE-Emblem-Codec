import test from 'node:test';
import assert from 'node:assert/strict';
import { makeImage } from '../src/codec/model.js';
import { encodeLegacyStrips } from '../src/codec/legacy-encoder.js';

function imageFrom(w,h,fn){const d=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)d.set(fn(x,y),(y*w+x)*4);return makeImage(w,h,d);}

test('legacy encoder spans a solid image into one layer',()=>{
  const img=imageFrom(8,8,()=>[50,100,150,255]);
  const r=encodeLegacyStrips(img,{orientation:'rows',bits:8,precision:3});
  assert.equal(r.stats.layers,1);
});

test('legacy encoder keeps many stops for a changing ramp',()=>{
  const img=imageFrom(16,2,(x)=>[x*16,x*8,255-x*12,255]);
  const r=encodeLegacyStrips(img,{orientation:'rows',bits:8,precision:3});
  assert.ok(r.model.regions[0].stops.length>10);
});
