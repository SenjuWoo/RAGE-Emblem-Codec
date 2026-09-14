import test from 'node:test';
import assert from 'node:assert/strict';
import { makeImage } from '../src/codec/model.js';
import { resizeImage } from '../src/codec/resample.js';
import { searchImage, STRIP_LEVELS } from '../src/codec/search.js';

function solid(w,h,c) {
  const d=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<w*h;i++) d.set(c,i*4);
  return makeImage(w,h,d);
}

function imageFrom(w,h,fn) {
  const d=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) d.set(fn(x,y),(y*w+x)*4);
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

test('search does not descend to 4-bit after an 8-bit candidate already fits', () => {
  const d = new Uint8ClampedArray(32 * 32 * 4);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const v = (x * 11 + y * 5 + ((x * y) % 7)) & 255;
      d.set([v, 40 + (y % 80), 90, 255], (y * 32 + x) * 4);
    }
  }
  const image = makeImage(32, 32, d);
  const result = searchImage(image, {
    preset: 'custom',
    budget: 1_280_000,
    reserve: 0,
    resolutions: [16],
    bits: [8, 4],
    encoderFamilies: ['strips'],
    precision: 3,
    qualityTarget: null,
    maxCandidates: 80
  });
  assert.ok(result.best, 'expected a feasible winner');
  assert.ok(result.candidates.some(c => c.bits === 8 && c.payloadBytes <= result.effectiveBudget));
  assert.equal(result.candidates.some(c => c.bits === 4), false, '4-bit must not run after 8-bit already fits');
  assert.equal(result.best.bits, 8);
});

test('strip search never uses dangerous cross-scanline merge tolerances above 2', () => {
  assert.ok(STRIP_LEVELS.some(([g,m])=>g===18&&m===2),'expected a tiny merge-2 last-resort level');
  assert.equal(STRIP_LEVELS.some(([,m])=>m>2),false,'merge tolerances above 2 can create scanline bands');
});

test('fast preset does not include 4-bit RGB in the default sweep', () => {
  const image = solid(16, 16, [20, 180, 90, 255]);
  const result = searchImage(image, { preset: 'fast', budget: 1, reserve: 0, encoderFamilies: ['strips'], maxCandidates: 24 });
  const bits = [...new Set(result.candidates.map(c => c.bits))].sort((a, b) => b - a);
  assert.equal(bits.includes(4), false, `fast bits were ${bits.join(',')}`);
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
  assert.equal(fast.qualityTarget,99.95);
  assert.equal(fast.targetReached,true);
  const deep=searchImage(image,{preset:'deep',budget:1280000,reserve:0,precision:3,encoderFamilies:['strips','tiles'],bits:[8],resolutions:[32],maxCandidates:300});
  assert.equal(deep.qualityTarget,null);
});

test('search candidates expose artifact diagnostics and transparency guard settings', () => {
  const d=new Uint8ClampedArray(16*16*4);
  for(let y=4;y<12;y++) for(let x=5;x<11;x++) d.set([220,220,220,255],(y*16+x)*4);
  d.set([255,255,255,4],(2*16+8)*4); // isolated alpha noise that should be ignored by guard
  const image=makeImage(16,16,d);
  const result=searchImage(image,{
    preset:'custom',budget:1280000,reserve:0,resolutions:[16],bits:[8],
    encoderFamilies:['strips'],stripOrientations:['columns'],precision:5,
    alphaThreshold:8,alphaPad:1,maxCandidates:2,qualityTarget:null
  });
  assert.ok(result.candidates.length);
  const c=result.candidates[0];
  for(const key of ['baseQuality','artifactPenalty','transparentLeakage','directionalArtifact']) {
    assert.ok(Number.isFinite(c[key]),`missing numeric ${key}`);
  }
  assert.equal(c.settings.alphaThreshold,8);
  assert.equal(c.settings.alphaPad,1);
});

test('adaptive tiles are evaluated before aggressive strip compression levels',()=>{
  const img=imageFrom(16,16,(x,y)=>{
    const v=(x*19+y*23+(x*y)%37)%256;
    return [v,(v*3)%256,(255-v),255];
  });
  const r=searchImage(img,{
    preset:'custom',budget:18000,reserve:0,resolutions:[16],bits:[8],
    encoderFamilies:['strips','tiles'],precision:5,maxCandidates:80,qualityTarget:null,maxRegions:2000
  });
  const tileIndex=r.candidates.findIndex(c=>c.encoder==='adaptive-tiles');
  const aggressiveIndex=r.candidates.findIndex(c=>/^p5-g(?:18|28|40)-/.test(c.variant));
  assert.ok(tileIndex>=0,'expected adaptive tile candidates');
  assert.ok(aggressiveIndex>=0,'expected aggressive strip candidates');
  assert.ok(tileIndex<aggressiveIndex,`tile index ${tileIndex} should precede aggressive strip index ${aggressiveIndex}`);
});
