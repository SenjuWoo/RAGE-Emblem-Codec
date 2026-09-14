import { makeImage } from './model.js';

function lerp(a, b, t) { return a + (b - a) * t; }

function sanitizeTransparentRgb(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; }
  }
  return data;
}

function readPixel(image, x, y) {
  const xx = Math.max(0, Math.min(image.width - 1, x));
  const yy = Math.max(0, Math.min(image.height - 1, y));
  const i = (yy * image.width + xx) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
}

function bilinearPremultiplied(image, fx, fy) {
  const x0 = Math.max(0, Math.min(image.width - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(image.height - 1, Math.floor(fy)));
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, fx - Math.floor(fx)));
  const ty = Math.max(0, Math.min(1, fy - Math.floor(fy)));
  const ps = [readPixel(image,x0,y0), readPixel(image,x1,y0), readPixel(image,x0,y1), readPixel(image,x1,y1)];
  const weights = [(1-tx)*(1-ty), tx*(1-ty), (1-tx)*ty, tx*ty];
  let a=0, pr=0, pg=0, pb=0;
  for (let k=0;k<4;k++) {
    const alpha=ps[k][3]/255;
    a += alpha*weights[k];
    pr += ps[k][0]*alpha*weights[k];
    pg += ps[k][1]*alpha*weights[k];
    pb += ps[k][2]*alpha*weights[k];
  }
  if (a <= 1e-8) return [0,0,0,0];
  return [Math.round(pr/a),Math.round(pg/a),Math.round(pb/a),Math.round(a*255)];
}

function areaPremultiplied(image, x0, y0, x1, y1) {
  const ax0=Math.max(0,Math.min(image.width,x0));
  const ay0=Math.max(0,Math.min(image.height,y0));
  const ax1=Math.max(ax0,Math.min(image.width,x1));
  const ay1=Math.max(ay0,Math.min(image.height,y1));
  let total=0,aSum=0,pr=0,pg=0,pb=0;
  for(let sy=Math.floor(ay0); sy<Math.ceil(ay1); sy++) {
    const wy=Math.max(0,Math.min(sy+1,ay1)-Math.max(sy,ay0));
    if(wy<=0) continue;
    for(let sx=Math.floor(ax0); sx<Math.ceil(ax1); sx++) {
      const wx=Math.max(0,Math.min(sx+1,ax1)-Math.max(sx,ax0));
      const w=wx*wy;
      if(w<=0) continue;
      const p=readPixel(image,sx,sy);
      const a=p[3]/255;
      total+=w; aSum+=a*w; pr+=p[0]*a*w; pg+=p[1]*a*w; pb+=p[2]*a*w;
    }
  }
  if(total<=1e-12 || aSum<=1e-12) return [0,0,0,0];
  return [Math.round(pr/aSum),Math.round(pg/aSum),Math.round(pb/aSum),Math.round((aSum/total)*255)];
}

export function resizeImage(image, targetSize, smoothing = true) {
  const size = Math.max(1, Math.round(targetSize));
  if (image.width === size && image.height === size) return makeImage(size, size, sanitizeTransparentRgb(new Uint8ClampedArray(image.data)));
  const out = new Uint8ClampedArray(size * size * 4);
  const sx = image.width / size;
  const sy = image.height / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const oi = (y * size + x) * 4;
      if (!smoothing) {
        const ix = Math.max(0, Math.min(image.width - 1, Math.floor((x + 0.5) * sx)));
        const iy = Math.max(0, Math.min(image.height - 1, Math.floor((y + 0.5) * sy)));
        out.set(readPixel(image,ix,iy), oi);
      } else if (sx > 1 || sy > 1) {
        out.set(areaPremultiplied(image, x*sx, y*sy, (x+1)*sx, (y+1)*sy), oi);
      } else {
        const fx = Math.max(0, Math.min(image.width - 1, (x + 0.5) * sx - 0.5));
        const fy = Math.max(0, Math.min(image.height - 1, (y + 0.5) * sy - 0.5));
        out.set(bilinearPremultiplied(image,fx,fy),oi);
      }
    }
  }
  return makeImage(size, size, sanitizeTransparentRgb(out));
}

export function resizeFitImage(image, targetSize, smoothing = true) {
  const size=Math.max(1,Math.round(targetSize));
  if (image.width === size && image.height === size) return makeImage(size,size,sanitizeTransparentRgb(new Uint8ClampedArray(image.data)));
  const out=new Uint8ClampedArray(size*size*4);
  const scale=Math.min(size/image.width,size/image.height);
  const fitW=image.width*scale;
  const fitH=image.height*scale;
  const ox=(size-fitW)/2;
  const oy=(size-fitH)/2;
  for(let y=0;y<size;y++) {
    const cy=y+0.5;
    if(cy<oy || cy>=oy+fitH) continue;
    for(let x=0;x<size;x++) {
      const cx=x+0.5;
      if(cx<ox || cx>=ox+fitW) continue;
      const u=(cx-ox)/fitW;
      const v=(cy-oy)/fitH;
      const oi=(y*size+x)*4;
      if(!smoothing) {
        const sx=Math.max(0,Math.min(image.width-1,Math.floor(u*image.width)));
        const sy=Math.max(0,Math.min(image.height-1,Math.floor(v*image.height)));
        out.set(readPixel(image,sx,sy),oi);
      } else if (scale < 1) {
        const dx0=Math.max(x,ox), dx1=Math.min(x+1,ox+fitW);
        const dy0=Math.max(y,oy), dy1=Math.min(y+1,oy+fitH);
        const sx0=((dx0-ox)/fitW)*image.width;
        const sx1=((dx1-ox)/fitW)*image.width;
        const sy0=((dy0-oy)/fitH)*image.height;
        const sy1=((dy1-oy)/fitH)*image.height;
        const p=areaPremultiplied(image,sx0,sy0,sx1,sy1);
        const coverage=Math.max(0,dx1-dx0)*Math.max(0,dy1-dy0);
        p[3]=Math.round(p[3]*Math.min(1,coverage));
        out.set(p,oi);
      } else {
        const fx=Math.max(0,Math.min(image.width-1,u*image.width-0.5));
        const fy=Math.max(0,Math.min(image.height-1,v*image.height-0.5));
        out.set(bilinearPremultiplied(image,fx,fy),oi);
      }
    }
  }
  return makeImage(size,size,sanitizeTransparentRgb(out));
}
