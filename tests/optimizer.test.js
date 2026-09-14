import test from 'node:test';
import assert from 'node:assert/strict';
import { makeImage } from '../src/codec/model.js';
import { scoreModels } from '../src/codec/metrics.js';
import { chooseBestCandidate, paretoFrontier } from '../src/codec/optimizer.js';

const img=makeImage(2,2,new Uint8ClampedArray([
  0,0,0,255, 255,255,255,255,
  0,0,0,255, 255,255,255,255
]));

test('identity reconstruction gets a perfect metric score',()=>{
  const model={width:2,height:2,regions:[
    {x:0,y:0,w:1,h:2,type:'solid',color:[0,0,0,255]},
    {x:1,y:0,w:1,h:2,type:'solid',color:[255,255,255,255]}
  ]};
  const s=scoreModels(img,model);
  assert.ok(s.score>99.99);
});

test('optimizer rejects over-budget candidates',()=>{
  const best=chooseBestCandidate([
    {quality:99,payloadBytes:2000},
    {quality:90,payloadBytes:900},
    {quality:80,payloadBytes:500}
  ],1000);
  assert.equal(best.quality,90);
});

test('chooser prefers 8-bit rows over 4-bit columns when the metric gap is small', () => {
  const best = chooseBestCandidate([
    { id: 'c4', quality: 99.42, bits: 4, encoder: 'strips-columns', resolution: 512, payloadBytes: 1_262_384 },
    { id: 'r8', quality: 98.96, bits: 8, encoder: 'strips-rows', resolution: 512, payloadBytes: 1_259_456 }
  ], 1_277_952);
  assert.equal(best.id, 'r8');
  assert.equal(best.bits, 8);
});

test('pareto frontier removes candidates that are both larger and worse',()=>{
  const p=paretoFrontier([
    {quality:90,payloadBytes:900,id:'a'},
    {quality:80,payloadBytes:1000,id:'dominated'},
    {quality:95,payloadBytes:1200,id:'b'},
    {quality:70,payloadBytes:400,id:'c'}
  ]);
  assert.deepEqual(p.map(x=>x.id),['c','a','b']);
});

test('precomputed metric context produces the same score', async () => {
  const { createMetricContext } = await import('../src/codec/metrics.js');
  const model={width:2,height:2,regions:[
    {x:0,y:0,w:1,h:2,type:'solid',color:[0,0,0,255]},
    {x:1,y:0,w:1,h:2,type:'solid',color:[250,250,250,255]}
  ]};
  const a=scoreModels(img,model);
  const b=scoreModels(img,model,{context:createMetricContext(img)});
  assert.ok(Math.abs(a.score-b.score)<1e-9);
});

test('chooser does not punish clean column encoding merely for being vertical', () => {
  const best=chooseBestCandidate([
    {id:'col',quality:99.20,bits:8,encoder:'strips-columns',resolution:512,payloadBytes:900000},
    {id:'row',quality:99.00,bits:8,encoder:'strips-rows',resolution:512,payloadBytes:900000}
  ],1280000);
  assert.equal(best.id,'col');
});

test('chooser prefers a clean candidate over a slightly higher-scoring high-artifact candidate',()=>{
  const best=chooseBestCandidate([
    {id:'melt',quality:94.5,baseQuality:97.0,artifactPenalty:0.9,bits:8,resolution:256,payloadBytes:1_240_000},
    {id:'clean',quality:92.8,baseQuality:93.0,artifactPenalty:0.08,bits:8,resolution:256,payloadBytes:1_210_000}
  ],1_277_952);
  assert.equal(best.id,'clean');
});
