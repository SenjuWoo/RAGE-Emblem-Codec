import test from 'node:test';
import assert from 'node:assert/strict';
import { makeImage } from '../src/codec/model.js';
import { resizeFitImage } from '../src/codec/resample.js';
import { rasterizeModel } from '../src/codec/metrics.js';
import { searchImage } from '../src/codec/search.js';
import { ROCKSTAR, serializeRegions } from '../src/codec/rockstar.js';
import { fitWithinMaxSide } from '../src/codec/source-utils.js';

function imageFrom(w,h,fn) {
  const d = new Uint8ClampedArray(w*h*4);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) d.set(fn(x,y), (y*w+x)*4);
  return makeImage(w,h,d);
}


test('source dimension cap preserves aspect ratio without upscaling smaller images', () => {
  assert.deepEqual(fitWithinMaxSide(4000,2000,2048),{width:2048,height:1024,scale:0.512});
  assert.deepEqual(fitWithinMaxSide(640,480,2048),{width:640,height:480,scale:1});
});
test('resizeFitImage preserves aspect ratio and centers into transparent square', () => {
  const src=imageFrom(2,1,()=>[255,0,0,255]);
  const out=resizeFitImage(src,4,false);
  assert.equal(out.width,4); assert.equal(out.height,4);
  assert.deepEqual(Array.from(out.data.slice(0,4)), [0,0,0,0]);
  const at=(x,y)=>Array.from(out.data.slice((y*4+x)*4,(y*4+x)*4+4));
  assert.deepEqual(at(0,1),[255,0,0,255]);
  assert.deepEqual(at(3,2),[255,0,0,255]);
  assert.deepEqual(at(2,3),[0,0,0,0]);
});

test('smooth resize interpolates in premultiplied alpha to avoid transparent color halos', () => {
  const src=imageFrom(2,1,(x)=>x===0?[255,0,0,0]:[0,0,255,255]);
  const out=resizeFitImage(src,4,true);
  const at=(x,y)=>Array.from(out.data.slice((y*4+x)*4,(y*4+x)*4+4));
  const p=at(1,1);
  assert.ok(p[3] > 0 && p[3] < 255, `expected partial alpha, got ${p}`);
  assert.ok(p[0] <= 2, `transparent red leaked into visible color: ${p}`);
  assert.ok(p[2] >= 250, `blue should stay blue after premultiplied interpolation: ${p}`);
});


test('smooth downscale uses area averaging instead of a single bilinear sample', () => {
  const src=imageFrom(8,8,(x)=>x<3?[255,255,255,255]:[0,0,0,255]);
  const out=resizeFitImage(src,1,true);
  const p=Array.from(out.data.slice(0,4));
  assert.ok(p[0] >= 93 && p[0] <= 98, `expected area average near 96, got ${p}`);
  assert.equal(p[3],255);
});
test('rasterizeModel at a larger target samples gradients continuously like SVG objectBoundingBox gradients', () => {
  const model={width:2,height:1,regions:[{x:0,y:0,w:2,h:1,type:'gradient-x',stops:[
    {offset:0,color:[0,0,0,255]},{offset:1,color:[255,255,255,255]}
  ]}]};
  const out=rasterizeModel(model,4,1);
  const r=[0,1,2,3].map(x=>out.data[x*4]);
  assert.deepEqual(r,[32,96,159,223]);
});

test('search coverage is round-robin across resolutions before spending deeper compression levels', () => {
  const ref=imageFrom(16,16,(x,y)=>((x+y)&1)?[255,255,255,255]:[0,0,0,255]);
  const result=searchImage(ref,{preset:'custom',budget:1,reserve:0,resolutions:[8,16,32],bits:[8],encoderFamilies:['strips'],maxCandidates:6});
  assert.deepEqual([...new Set(result.candidates.map(c=>c.resolution))].sort((a,b)=>a-b),[8,16,32]);
});

test('SVG rendering scales against the actual rectangle path width while layer metadata keeps Rockstar slug width', () => {
  const model={width:1,height:1,regions:[{x:0,y:0,w:1,h:1,type:'solid',color:[255,255,255,255]}]};
  const out=serializeRegions(model,{precision:3,bits:8});
  assert.equal(ROCKSTAR.pathWidth,66.437);
  assert.match(out.svg,/matrix\(7\.70655,0,0,1\.70667,0,0\)/);
  const layers=JSON.parse(out.layersJson);
  assert.equal(layers[1].width,66.47);
});

test('preset search always includes the exact native max resolution between preset steps', () => {
  const ref=imageFrom(75,75,()=>[40,80,120,255]);
  const result=searchImage(ref,{preset:'fast',budget:1,reserve:0,encoderFamilies:['strips'],bits:[8],maxCandidates:12});
  const seen=new Set(result.candidates.map(c=>c.resolution));
  assert.ok(seen.has(75), `native 75px resolution was skipped: ${[...seen].join(', ')}`);
});

test('hard-edge gradient boundary uses the true pixel-cell boundary in SVG coordinates', async () => {
  const { simplifySamples } = await import('../src/codec/gradient.js');
  const black=[0,0,0,255], white=[255,255,255,255];
  const stops=simplifySamples([black,white,white,white],{tolerance:0,preserveEdges:true,edgeThreshold:96});
  const discontinuity=[];
  for(let i=1;i<stops.length;i++) if(stops[i].offset===stops[i-1].offset) discontinuity.push(stops[i].offset);
  assert.ok(discontinuity.some(v=>Math.abs(v-0.25)<1e-12), `expected edge at 0.25, got ${discontinuity}`);
});

test('gradient sample stops are anchored at pixel centers, not pixel-cell outer edges', async () => {
  const { simplifySamples } = await import('../src/codec/gradient.js');
  const stops=simplifySamples([[32,32,32,255],[96,96,96,255],[160,160,160,255],[224,224,224,255]],{tolerance:0,preserveEdges:false});
  assert.equal(stops[0].offset,0.125);
  assert.equal(stops.at(-1).offset,0.875);
});

test('adaptive tile fitter recognizes a sampled linear gradient as one exact gradient region', async () => {
  const { encodeTiles } = await import('../src/codec/tile-encoder.js');
  const values=[32,96,160,224];
  const ref=imageFrom(4,1,(x)=>[values[x],values[x],values[x],255]);
  const out=encodeTiles(ref,{bits:8,precision:5,modelTolerance:0.01,minTile:1,maxDepth:8,maxRegions:100});
  assert.equal(out.model.regions.length,1);
  assert.equal(out.model.regions[0].type,'gradient-x');
});

test('quality metric ignores hidden RGB differences when both pixels are fully transparent', async () => {
  const { scoreModels } = await import('../src/codec/metrics.js');
  const ref=imageFrom(1,1,()=>[255,0,0,0]);
  const model={width:1,height:1,regions:[{x:0,y:0,w:1,h:1,type:'solid',color:[0,0,255,0]}]};
  const scored=scoreModels(ref,model);
  assert.equal(scored.mse,0);
  assert.equal(scored.score,100);
});

test('same-size fit sanitizes hidden RGB in fully transparent pixels', () => {
  const ref=imageFrom(1,1,()=>[255,10,20,0]);
  const out=resizeFitImage(ref,1,true);
  assert.deepEqual(Array.from(out.data),[0,0,0,0]);
});

test('SVG transform scale keeps enough precision for one-pixel strips even when compact geometry precision is 3', () => {
  const model={width:512,height:512,regions:[{x:0,y:0,w:512,h:1,type:'solid',color:[255,255,255,255]}]};
  const out=serializeRegions(model,{precision:3,bits:8});
  assert.match(out.svg,/matrix\(7\.70655,0,0,0\.00333,0,0\)/);
});

test('search scores at the effective native source resolution instead of gratuitously upscaling to 512', () => {
  const ref=imageFrom(75,50,()=>[40,80,120,255]);
  const result=searchImage(ref,{preset:'fast',budget:1280000,reserve:0,encoderFamilies:['strips'],bits:[8],maxCandidates:2});
  assert.equal(result.metricSize,75);
});

test('serializer exposes a render model with gradient offsets rounded exactly like exported SVG', () => {
  const model={width:6,height:1,regions:[{x:0,y:0,w:6,h:1,type:'gradient-x',stops:[
    {offset:1/12,color:[0,0,0,255]},
    {offset:3/12,color:[50,50,50,255]},
    {offset:11/12,color:[255,255,255,255]}
  ]}]};
  const out=serializeRegions(model,{precision:3,bits:8});
  assert.ok(out.renderModel);
  assert.deepEqual(out.renderModel.regions[0].stops.map(s=>s.offset),[0.083,0.25,0.917]);
});
