import { makeImage } from '../src/codec/model.js';
import { resizeImage } from '../src/codec/resample.js';
import { encodeLegacyStrips } from '../src/codec/legacy-encoder.js';
import { createMetricContext, scoreModels } from '../src/codec/metrics.js';
import { chooseBestCandidate } from '../src/codec/optimizer.js';
import { searchImage } from '../src/codec/search.js';

function synthetic(size=128){
  const d=new Uint8ClampedArray(size*size*4);
  const cx=(size-1)/2,cy=(size-1)/2;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=(x-cx)/(size*.48),dy=(y-cy)/(size*.48),r=Math.hypot(dx,dy);
    let p=[0,0,0,0];
    if(r<1){
      const gx=x/(size-1),gy=y/(size-1);
      p=[Math.round(25+210*gx),Math.round(35+155*(1-gy)),Math.round(230-150*gx),255];
      // hard-edged cross + ring details
      if(Math.abs(dx)<.09 || Math.abs(dy)<.09) p=[245,248,250,255];
      if(r>.70 && r<.77) p=[10,12,14,255];
      if((x>size*.60&&x<size*.78&&y>size*.24&&y<size*.41)) p=[168,255,62,255];
    }
    d.set(p,(y*size+x)*4);
  }
  return makeImage(size,size,d);
}

const size=Number(process.env.SIZE||256);
const reference=synthetic(size);
const budget=Number(process.env.BUDGET||1280000);
const qualityTarget=Number(process.env.QUALITY_TARGET||99.995);
const ctx=createMetricContext(reference);
const legacy=[];
const resolutions=size<=128?[32,64,96,128]:size<=256?[32,64,128,192,256]:[64,128,256,384,512];
for(const res of resolutions)for(const bits of [8,4])for(const orientation of ['rows','columns']){
  const img=resizeImage(reference,res,true);
  const result=encodeLegacyStrips(img,{orientation,bits,precision:3});
  const quality=scoreModels(reference,result.renderModel ?? result.model,{context:ctx}).score;
  legacy.push({id:`${res}-${bits}-${orientation}`,quality,payloadBytes:result.payload.estimatedRequestBytes,res,bits,orientation,layers:result.stats.layers});
}
const legacyBest=chooseBestCandidate(legacy,budget);
const modern=searchImage(reference,{preset:'custom',budget,reserve:0,resolutions,bits:[8,6,4],encoderFamilies:['strips','tiles'],maxCandidates:240,precision:'auto',qualityTarget});
const modernBest=modern.best;
const summary={
  budget,
  qualityTarget,
  legacy:legacyBest,
  modern:modernBest?{id:modernBest.id,quality:modernBest.quality,payloadBytes:modernBest.payloadBytes,encoder:modernBest.encoder,resolution:modernBest.resolution,bits:modernBest.bits,layers:modernBest.layers,variant:modernBest.variant}:null,
  qualityGain:legacyBest&&modernBest?modernBest.quality-legacyBest.quality:null,
  payloadDeltaVsLegacy:legacyBest&&modernBest?modernBest.payloadBytes-legacyBest.payloadBytes:null,
  evaluated:modern.evaluated
};
console.log(JSON.stringify(summary,null,2));
if(!modernBest){
  console.error('benchmark failed: no modern candidate');
  process.exit(1);
}
if(modernBest.payloadBytes>budget){
  console.error(`benchmark failed: modern payload ${modernBest.payloadBytes} exceeds budget ${budget}`);
  process.exit(1);
}
if(legacyBest && modernBest.quality+1e-4<legacyBest.quality){
  console.error(`benchmark failed: modern quality ${modernBest.quality} is worse than legacy ${legacyBest.quality}`);
  process.exit(1);
}
