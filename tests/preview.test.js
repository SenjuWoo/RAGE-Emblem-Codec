import test from 'node:test';
import assert from 'node:assert/strict';
import { makeImage } from '../src/codec/model.js';
import { serializeRegions } from '../src/codec/rockstar.js';
import { scoreModels } from '../src/codec/metrics.js';
import { encodeStrips } from '../src/codec/strip-encoder.js';
import { searchImage } from '../src/codec/search.js';
import { resizeFitImage } from '../src/codec/resample.js';
import { withPreviewViewBox } from '../src/codec/preview-svg.js';

function imageFrom(w, h, fn) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(fn(x, y), (y * w + x) * 4);
  return makeImage(w, h, d);
}

test('exported SVG keeps the Flashback-compatible 512 root so Rockstar payloads do not gain extra attributes', () => {
  const model = { width: 8, height: 8, regions: [{ x: 0, y: 0, w: 8, h: 8, type: 'solid', color: [255, 255, 255, 255] }] };
  const out = serializeRegions(model, { precision: 3, bits: 8 });
  assert.match(out.svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="512" height="512" version="1.1">/);
  assert.equal(/viewBox/.test(out.svg), false);
});

test('withPreviewViewBox is idempotent and fills in a missing viewBox on older payloads', () => {
  const bare = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" version="1.1"><rect/></svg>';
  const once = withPreviewViewBox(bare);
  const twice = withPreviewViewBox(once);
  assert.equal(once, twice);
  assert.match(once, /viewBox="0 0 512 512"/);
  assert.match(once, /preserveAspectRatio="xMidYMid meet"/);
});

test('metric prefers a flat bias over equal-magnitude column scanlines', () => {
  const ref = imageFrom(8, 8, () => [128, 128, 128, 255]);
  const striped = {
    width: 8, height: 8,
    regions: Array.from({ length: 8 }, (_, x) => ({
      x, y: 0, w: 1, h: 8, type: 'solid',
      color: x % 2 ? [130, 130, 130, 255] : [126, 126, 126, 255]
    }))
  };
  const flat = {
    width: 8, height: 8,
    regions: [{ x: 0, y: 0, w: 8, h: 8, type: 'solid', color: [126, 126, 126, 255] }]
  };
  const sStripe = scoreModels(ref, striped);
  const sFlat = scoreModels(ref, flat);
  assert.ok(
    sStripe.score < sFlat.score,
    `scanlines scored ${sStripe.score.toFixed(4)} vs flat ${sFlat.score.toFixed(4)}; columns should lose`
  );
});

test('half-resolution column strips of a smooth 2D image score worse than row strips', () => {
  const ref = imageFrom(32, 32, (x, y) => {
    const gx = x / 31;
    const gy = y / 31;
    const v = Math.round(48 + gx * 140 + gy * 50);
    return [v, Math.round(v * 0.82), Math.round(v * 0.64), 255];
  });
  const low = resizeFitImage(ref, 16, true);
  const cols = encodeStrips(low, {
    orientation: 'columns', precision: 5, bits: 5,
    gradientTolerance: 18, mergeTolerance: 4, preserveEdges: true
  });
  const rows = encodeStrips(low, {
    orientation: 'rows', precision: 5, bits: 5,
    gradientTolerance: 18, mergeTolerance: 4, preserveEdges: true
  });
  const sCols = scoreModels(ref, cols.renderModel ?? cols.model);
  const sRows = scoreModels(ref, rows.renderModel ?? rows.model);
  assert.ok(
    sRows.score > sCols.score,
    `rows ${sRows.score.toFixed(4)} should beat columns ${sCols.score.toFixed(4)} on a smooth 2D field`
  );
});

test('search at half resolution does not crown column scanlines on a smooth 2D field', () => {
  const ref = imageFrom(32, 32, (x, y) => {
    const gx = x / 31;
    const gy = y / 31;
    const v = Math.round(48 + gx * 140 + gy * 50);
    return [v, Math.round(v * 0.82), Math.round(v * 0.64), 255];
  });
  const result = searchImage(ref, {
    preset: 'custom',
    budget: 1280000,
    reserve: 0,
    resolutions: [16],
    bits: [5],
    encoderFamilies: ['strips'],
    precision: 5,
    maxCandidates: 20
  });
  assert.ok(result.best, 'expected a feasible winner');
  assert.notEqual(
    result.best.encoder,
    'strips-columns',
    `columns won (${result.best.encoder} ${result.best.variant} q=${result.best.quality.toFixed(3)})`
  );
});

test('lossless column encode of a true vertical field is not punished', () => {
  const ref = imageFrom(8, 8, (x) => {
    const v = x < 4 ? 20 : 220;
    return [v, v, v, 255];
  });
  const encoded = encodeStrips(ref, { orientation: 'columns', precision: 5, bits: 8, gradientTolerance: 0, mergeTolerance: 0 });
  const scored = scoreModels(ref, encoded.renderModel ?? encoded.model);
  assert.ok(scored.score > 99.9, `true vertical structure scored ${scored.score}`);
});

test('metric exposes and penalizes visible leakage into fully transparent background', () => {
  const ref=imageFrom(16,16,()=>[0,0,0,0]);
  const leaked={width:16,height:16,regions:[{x:7,y:0,w:1,h:16,type:'solid',color:[220,220,220,20]}]};
  const s=scoreModels(ref,leaked);
  assert.ok(s.transparentLeakage>0,'expected transparent leakage diagnostic');
  assert.ok(s.artifactPenalty>0,'expected leakage to lower the final score');
  assert.ok(s.score<s.baseScore,'artifact-aware score should be below raw reconstruction score');
});

test('metric detects coherent vertical residual streaks more strongly than isotropic checker noise', () => {
  const ref=imageFrom(16,16,()=>[128,128,128,255]);
  const stripes={width:16,height:16,regions:Array.from({length:16},(_,x)=>({
    x,y:0,w:1,h:16,type:'solid',color:x%2?[136,136,136,255]:[120,120,120,255]
  }))};
  const checker={width:16,height:16,regions:Array.from({length:256},(_,i)=>{
    const x=i%16,y=Math.floor(i/16),v=(x+y)%2?136:120;
    return {x,y,w:1,h:1,type:'solid',color:[v,v,v,255]};
  })};
  const sv=scoreModels(ref,stripes);
  const si=scoreModels(ref,checker);
  assert.ok(sv.directionalArtifact>si.directionalArtifact*2,
    `vertical ${sv.directionalArtifact} vs isotropic ${si.directionalArtifact}`);
  assert.ok(sv.artifactPenalty>si.artifactPenalty,
    `vertical penalty ${sv.artifactPenalty} vs isotropic ${si.artifactPenalty}`);
});

test('lossless reconstruction reports zero artifact diagnostics', () => {
  const ref=imageFrom(8,8,(x,y)=>x<4?[20,20,20,255]:[220,220,220,255]);
  const encoded=encodeStrips(ref,{orientation:'columns',precision:5,bits:8,gradientTolerance:0,mergeTolerance:0,alphaThreshold:8,alphaPad:1});
  const s=scoreModels(ref,encoded.renderModel??encoded.model);
  assert.ok(s.artifactPenalty<1e-5,`unexpected artifact penalty ${s.artifactPenalty}`);
  assert.ok(s.directionalArtifact<1e-6,`unexpected directional artifact ${s.directionalArtifact}`);
  assert.ok(s.transparentLeakage<1e-10,`unexpected leakage ${s.transparentLeakage}`);
});
