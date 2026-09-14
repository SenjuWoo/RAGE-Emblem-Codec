import test from 'node:test';
import assert from 'node:assert/strict';
import { makeImage } from '../src/codec/model.js';
import { encodeStrips } from '../src/codec/strip-encoder.js';
import { rasterizeModel } from '../src/codec/metrics.js';

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

function imageFrom(w,h,fn) {
  const data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) data.set(fn(x,y),(y*w+x)*4);
  return makeImage(w,h,data);
}

test('column strips split disconnected alpha islands instead of spanning transparent gaps', () => {
  const img=imageFrom(2,10,(x,y)=>{
    if(y>=2&&y<=3) return [230,230,230,255];
    if(y===5) return [230,230,230,4]; // isolated sub-threshold alpha noise
    if(y>=7&&y<=8) return [80,80,80,255];
    return [0,0,0,0];
  });
  const r=encodeStrips(img,{orientation:'columns',precision:5,bits:8,gradientTolerance:18,mergeTolerance:2,preserveEdges:true,alphaThreshold:8,alphaPad:0});
  assert.equal(r.model.regions.length,2);
  assert.deepEqual(r.model.regions.map(x=>({x:x.x,y:x.y,w:x.w,h:x.h})),[
    {x:0,y:2,w:2,h:2},
    {x:0,y:7,w:2,h:2}
  ]);
  const rendered=rasterizeModel(r.renderModel??r.model,2,10);
  assert.equal(rendered.data[(5*2)*4+3],0,'transparent gap must stay absent from the rasterized output');
});

test('segmented strips preserve one-pixel soft alpha padding without bridging distant islands', () => {
  const img=imageFrom(1,12,(x,y)=>{
    if(y===2||y===8) return [255,255,255,255];
    if(y===1||y===3||y===7||y===9) return [255,255,255,4];
    return [0,0,0,0];
  });
  const r=encodeStrips(img,{orientation:'columns',precision:5,bits:8,gradientTolerance:0,mergeTolerance:0,preserveEdges:true,alphaThreshold:8,alphaPad:1});
  assert.equal(r.model.regions.length,2);
  assert.deepEqual(r.model.regions.map(x=>[x.y,x.h]),[[1,3],[7,3]]);
});

test('aggressive strip simplification splits non-gradient structure instead of smearing it across a long run', () => {
  const img=imageFrom(64,1,(x)=>{
    // Repeated low-contrast detail stays below the hard-edge threshold, which is
    // exactly the kind of structure a high RDP tolerance used to smear into one band.
    const wave = (x % 8 < 4) ? 108 : 142;
    const ramp = Math.round(x * 0.45);
    const v = Math.min(220, wave + ramp);
    return [v, Math.round(v*0.82), Math.round(v*0.68), 255];
  });
  const r=encodeStrips(img,{
    orientation:'rows',precision:5,bits:8,gradientTolerance:40,mergeTolerance:8,
    preserveEdges:true,edgeThreshold:96,alphaThreshold:8,alphaPad:0
  });
  assert.ok(r.model.regions.length>1,
    `complex row was collapsed into ${r.model.regions.length} long gradient region`);
  const rendered=rasterizeModel(r.renderModel??r.model,64,1);
  let worst=0;
  for(let x=0;x<64;x++) {
    const i=x*4;
    const a=[img.data[i],img.data[i+1],img.data[i+2],img.data[i+3]];
    const b=[rendered.data[i],rendered.data[i+1],rendered.data[i+2],rendered.data[i+3]];
    const dr=a[0]-b[0],dg=a[1]-b[1],db=a[2]-b[2],da=a[3]-b[3];
    worst=Math.max(worst,Math.sqrt(0.22*dr*dr+0.52*dg*dg+0.16*db*db+0.75*da*da));
  }
  assert.ok(worst<=18,`structural guard allowed ${worst.toFixed(2)} visible error`);
});

test('neighboring gradients only merge when their serialized profiles are exact', () => {
  const img=imageFrom(16,2,(x,y)=>{
    const base=60+Math.round((x/15)*80)+(y?5:0);
    return [base,base,base,255];
  });
  const r=encodeStrips(img,{
    orientation:'rows',precision:5,bits:8,gradientTolerance:0,mergeTolerance:8,
    preserveEdges:true,edgeThreshold:96,alphaThreshold:8,alphaPad:0
  });
  assert.equal(r.model.regions.length,2,'approximate gradient merge turned two distinct rows into one horizontal band');
  assert.deepEqual(r.model.regions.map(x=>x.h),[1,1]);
});
