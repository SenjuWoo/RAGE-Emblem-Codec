import test from 'node:test';
import assert from 'node:assert/strict';
import { makeImage } from '../src/codec/model.js';
import { resizeImage } from '../src/codec/resample.js';
import { searchImage } from '../src/codec/search.js';

function solid(w,h,c) {
  const d=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<w*h;i++) d.set(c,i*4);
  return makeImage(w,h,d);
}

test('resizeImage preserves a solid image and requested dimensions',()=>{
  const r=resizeImage(solid(4,4,[20,40,60,255]),8,true);
  assert.equal(r.width,8); assert.equal(r.height,8);
  for(let i=0;i<r.data.length;i+=4) assert.deepEqual(Array.from(r.data.slice(i,i+4)),[20,40,60,255]);
});

test('searchImage returns the highest-quality feasible candidate',()=>{
  const img=solid(16,16,[180,40,90,255]);
  const result=searchImage(img,{
    budget:10000,reserve:0,resolutions:[8,16],bits:[8],
    encoderFamilies:['strips','tiles'],preset:'custom',maxCandidates:30
  });
  assert.ok(result.best);
  assert.ok(result.best.payloadBytes<=10000);
  assert.ok(result.best.quality>99);
  assert.ok(result.frontier.length>=1);
});

test('search stops globally after a zero-distortion candidate fits because no better quality is possible', () => {
  const image = solid(32,32,[80,120,160,255]);
  const result = searchImage(image,{preset:'deep',budget:1280000,reserve:0,maxCandidates:300});
  assert.ok((result.best?.mse ?? Infinity) < 1e-12);
  assert.equal(result.optimalFound,true);
  assert.equal(result.stoppedAtLimit,false);
  assert.ok(result.evaluated < 10, `exact solution should stop early, evaluated ${result.evaluated}`);
});

test('auto precision starts at highest fidelity and reports the chosen precision', () => {
  const image=solid(32,32,[80,120,160,255]);
  const result=searchImage(image,{preset:'fast',budget:1280000,reserve:0,precision:'auto',encoderFamilies:['strips'],bits:[8],resolutions:[32],maxCandidates:20});
  assert.equal(result.best?.settings?.precision,5);
  assert.match(result.best?.variant ?? '',/p5/);
});

test('custom quality target stops search once a fitting candidate reaches the requested fidelity', () => {
  const image=solid(32,32,[80,120,160,255]);
  const result=searchImage(image,{preset:'deep',qualityTarget:90,budget:1280000,reserve:0,precision:3,encoderFamilies:['strips','tiles'],bits:[8],resolutions:[32],maxCandidates:300});
  assert.equal(result.targetReached,true);
  assert.equal(result.stoppedAtLimit,false);
  assert.equal(result.evaluated,1);
});

test('stripOrientations rows-only never evaluates column strips', () => {
  const d=new Uint8ClampedArray(16*16*4);
  for(let y=0;y<16;y++) for(let x=0;x<16;x++) d.set([x*16,y*16,80,255],(y*16+x)*4);
  const image=makeImage(16,16,d);
  const both=searchImage(image,{
    preset:'custom',budget:1280000,reserve:0,resolutions:[8],bits:[8],
    encoderFamilies:['strips'],precision:3,maxCandidates:8
  });
  assert.ok(both.candidates.some(c=>c.encoder==='strips-columns'), 'control: default search must still try columns');
  const result=searchImage(image,{
    preset:'custom',budget:1280000,reserve:0,resolutions:[8],bits:[8],
    encoderFamilies:['strips'],stripOrientations:['rows'],precision:3,maxCandidates:8
  });
  assert.ok(result.candidates.length);
  assert.equal(result.candidates.some(c=>c.encoder==='strips-columns'), false);
  assert.equal(result.best?.encoder, 'strips-rows');
});

test('fast preset uses a near-lossless default target while deep remains untargeted', () => {
  const image=solid(32,32,[80,120,160,255]);
  const fast=searchImage(image,{preset:'fast',budget:1280000,reserve:0,precision:3,encoderFamilies:['strips','tiles'],bits:[8],resolutions:[32],maxCandidates:300});
  assert.equal(fast.qualityTarget,99.995);
  assert.equal(fast.targetReached,true);
  const deep=searchImage(image,{preset:'deep',budget:1280000,reserve:0,precision:3,encoderFamilies:['strips','tiles'],bits:[8],resolutions:[32],maxCandidates:300});
  assert.equal(deep.qualityTarget,null);
});
