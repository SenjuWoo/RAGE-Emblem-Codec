import test from 'node:test';
import assert from 'node:assert/strict';
import { makeImage } from '../src/codec/model.js';
import { encodeTiles } from '../src/codec/tile-encoder.js';

function imageFrom(w,h,fn) {
  const d = new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) d.set(fn(x,y), (y*w+x)*4);
  return makeImage(w,h,d);
}

test('adaptive tile encoder collapses a solid image to one region', () => {
  const img=imageFrom(16,16,()=>[12,34,56,255]);
  const r=encodeTiles(img,{precision:3,bits:8,modelTolerance:0,minTile:2,maxDepth:8,edgeThreshold:80});
  assert.equal(r.stats.layers,1);
});

test('adaptive tile encoder omits transparent image', () => {
  const img=imageFrom(16,16,()=>[0,0,0,0]);
  const r=encodeTiles(img,{precision:3,bits:8,modelTolerance:0,minTile:2,maxDepth:8,edgeThreshold:80});
  assert.equal(r.stats.layers,0);
});

test('adaptive tile encoder partitions high-detail checkerboard', () => {
  const img=imageFrom(16,16,(x,y)=>((x+y)&1)?[255,255,255,255]:[0,0,0,255]);
  const r=encodeTiles(img,{precision:3,bits:8,modelTolerance:3,minTile:2,maxDepth:8,edgeThreshold:80});
  assert.ok(r.stats.layers>1);
});

test('adaptive tile encoder stops pathological region explosions', () => {
  const img=imageFrom(32,32,(x,y)=>((x+y)&1)?[255,0,255,255]:[0,255,0,255]);
  assert.throws(() => encodeTiles(img,{precision:3,bits:8,modelTolerance:0,minTile:1,maxDepth:12,edgeThreshold:80,maxRegions:8}), /complexity limit/i);
});

test('adaptive tile encoder drops isolated sub-threshold alpha noise', () => {
  const d=new Uint8ClampedArray(8*8*4);
  d.set([255,255,255,4],(3*8+3)*4);
  const img=makeImage(8,8,d);
  const r=encodeTiles(img,{precision:5,bits:8,modelTolerance:0,minTile:1,maxDepth:8,maxRegions:500,alphaThreshold:8});
  assert.equal(r.stats.layers,0);
  assert.equal(r.model.regions.length,0);
});
