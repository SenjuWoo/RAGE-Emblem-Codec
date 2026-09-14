import { pixelAt } from './model.js';
import { sampleStops } from './gradient.js';

function regionPixel(region, x, y) {
  if (region.type === 'solid') return region.color;
  if (region.type === 'gradient-x') {
    const t = region.w <= 1 ? 0 : (x - region.x) / (region.w - 1);
    return sampleStops(region.stops, Math.max(0, Math.min(1, t)));
  }
  if (region.type === 'gradient-y') {
    const t = region.h <= 1 ? 0 : (y - region.y) / (region.h - 1);
    return sampleStops(region.stops, Math.max(0, Math.min(1, t)));
  }
  return [0, 0, 0, 0];
}

export function rasterizeModel(model, targetWidth = model.width, targetHeight = model.height) {
  const width = Math.max(1, Math.round(targetWidth));
  const height = Math.max(1, Math.round(targetHeight));
  const data = new Uint8ClampedArray(width * height * 4);
  const sx = width / model.width;
  const sy = height / model.height;

  for (const r of model.regions) {
    const left = r.x * sx;
    const right = (r.x + r.w) * sx;
    const top = r.y * sy;
    const bottom = (r.y + r.h) * sy;
    const x0 = Math.max(0, Math.floor(left));
    const x1 = Math.min(width, Math.ceil(right));
    const y0 = Math.max(0, Math.floor(top));
    const y1 = Math.min(height, Math.ceil(bottom));
    for (let y = y0; y < y1; y++) {
      const cy = y + 0.5;
      if (cy < top || cy >= bottom) continue;
      for (let x = x0; x < x1; x++) {
        const cx = x + 0.5;
        if (cx < left || cx >= right) continue;
        let p;
        if (r.type === 'solid') p = r.color;
        else if (r.type === 'gradient-x') p = sampleStops(r.stops, Math.max(0, Math.min(1, (cx - left) / Math.max(1e-12, right - left))));
        else if (r.type === 'gradient-y') p = sampleStops(r.stops, Math.max(0, Math.min(1, (cy - top) / Math.max(1e-12, bottom - top))));
        else continue;
        const i = (y * width + x) * 4;
        data[i] = Math.round(p[0]); data[i + 1] = Math.round(p[1]);
        data[i + 2] = Math.round(p[2]); data[i + 3] = Math.round(p[3]);
      }
    }
  }
  return { width, height, data };
}

function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function sourceLinearAt(image, x, y) {
  const i = (y * image.width + x) * 4;
  return [
    srgbToLinear(image.data[i]), srgbToLinear(image.data[i + 1]),
    srgbToLinear(image.data[i + 2]), image.data[i + 3] / 255
  ];
}

export function createMetricContext(reference, { edgeWeight = 2.5 } = {}) {
  const n = reference.width * reference.height;
  const linear = new Float32Array(n * 4);
  const weights = new Float32Array(n);
  const lumAt = (x, y) => {
    const i = (y * reference.width + x) * 4;
    const a = linear[i + 3];
    return (0.2126 * linear[i] + 0.7152 * linear[i + 1] + 0.0722 * linear[i + 2]) * a;
  };
  for (let y = 0; y < reference.height; y++) {
    for (let x = 0; x < reference.width; x++) {
      const p = sourceLinearAt(reference, x, y);
      const i = (y * reference.width + x) * 4;
      linear.set(p, i);
    }
  }
  for (let y = 0; y < reference.height; y++) {
    for (let x = 0; x < reference.width; x++) {
      const xr = Math.min(reference.width - 1, x + 1);
      const yd = Math.min(reference.height - 1, y + 1);
      const i = y * reference.width + x;
      const ir = y * reference.width + xr;
      const id = yd * reference.width + x;
      const ai = i * 4, ar = ir * 4, ad = id * 4;
      const e = Math.abs(lumAt(x, y) - lumAt(xr, y)) + Math.abs(lumAt(x, y) - lumAt(x, yd)) +
        Math.abs(linear[ai + 3] - linear[ar + 3]) + Math.abs(linear[ai + 3] - linear[ad + 3]);
      weights[i] = 1 + edgeWeight * Math.min(1, e);
    }
  }
  return { width: reference.width, height: reference.height, linear, weights, edgeWeight };
}

export function scoreModels(reference, model, { edgeWeight = 2.5, context = null } = {}) {
  const ctx = context ?? createMetricContext(reference, { edgeWeight });
  if (ctx.width !== reference.width || ctx.height !== reference.height) throw new Error('Metric context size mismatch');
  const rendered = rasterizeModel(model, reference.width, reference.height);
  let weightedError = 0;
  let weightTotal = 0;
  for (let y = 0; y < reference.height; y++) {
    for (let x = 0; x < reference.width; x++) {
      const ai = (y * reference.width + x) * 4;
      const bi = (y * rendered.width + x) * 4;
      const aa = ctx.linear[ai + 3];
      const ar = ctx.linear[ai] * aa, ag = ctx.linear[ai + 1] * aa, ab = ctx.linear[ai + 2] * aa;
      const ba = rendered.data[bi + 3] / 255;
      const br = srgbToLinear(rendered.data[bi]) * ba, bg = srgbToLinear(rendered.data[bi + 1]) * ba, bb = srgbToLinear(rendered.data[bi + 2]) * ba;
      const rgb = 0.22 * (ar - br) ** 2 + 0.62 * (ag - bg) ** 2 + 0.16 * (ab - bb) ** 2;
      const alpha = (aa - ba) ** 2;
      const w = ctx.weights[y * reference.width + x];
      weightedError += w * (rgb + 0.8 * alpha);
      weightTotal += w;
    }
  }
  const mse = weightedError / Math.max(1e-12, weightTotal);
  const score = 100 / (1 + 18 * mse);
  return { score, mse };
}
