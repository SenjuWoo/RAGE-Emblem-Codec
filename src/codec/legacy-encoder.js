import { pixelAt } from './model.js';
import { quantizeRgba, rgbaDistance } from './color.js';
import { serializeRegions } from './rockstar.js';

function same(a,b){return rgbaDistance(a,b)===0;}
function stripSamples(image, orientation, index, bits){
  const n=orientation==='rows'?image.width:image.height;
  const out=[];
  for(let i=0;i<n;i++){
    const p=orientation==='rows'?pixelAt(image,i,index):pixelAt(image,index,i);
    out.push(quantizeRgba(p,bits,8));
  }
  return out;
}
function legacyStops(samples){
  const n=samples.length;
  if(!n)return[];
  const stops=[];
  let runStart=0;
  for(let i=0;i<n;i++){
    const end=i===n-1 || !same(samples[i],samples[i+1]);
    if(!end)continue;
    const c=samples[i];
    if(runStart>0) stops.push({offset:runStart/n,color:[...c]});
    stops.push({offset:(i+1)/n,color:[...c]});
    runStart=i+1;
  }
  return stops;
}
function signature(region){
  if(region.type==='solid') return `s:${region.color.join('.')}`;
  return `${region.type}:${region.stops.map(s=>`${s.offset}:${s.color.join('.')}`).join('|')}`;
}
export function encodeLegacyStrips(image,{orientation='rows',bits=8,precision=3}={}){
  const count=orientation==='rows'?image.height:image.width;
  const regions=[]; let prev=null;
  for(let idx=0;idx<count;idx++){
    const samples=stripSamples(image,orientation,idx,bits);
    if(samples.every(p=>p[3]===0)){prev=null;continue;}
    const base=orientation==='rows'?{x:0,y:idx,w:image.width,h:1}:{x:idx,y:0,w:1,h:image.height};
    const stops=legacyStops(samples);
    let region;
    if(stops.length===1) region={...base,type:'solid',color:stops[0].color};
    else region={...base,type:orientation==='rows'?'gradient-x':'gradient-y',stops};
    if(prev && signature(prev)===signature(region)){
      if(orientation==='rows')prev.h++; else prev.w++;
    }else{regions.push(region);prev=region;}
  }
  const model={width:image.width,height:image.height,regions};
  const serialized=serializeRegions(model,{precision,bits});
  return {...serialized,model,stats:{...serialized.stats,encoder:'legacy-strips',orientation}};
}
