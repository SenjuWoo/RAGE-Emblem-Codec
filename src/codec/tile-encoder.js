import { pixelAt } from './model.js';
import { quantizeRgba, rgbaDistance } from './color.js';
import { simplifySamples, sampleStops } from './gradient.js';
import { serializeRegions } from './rockstar.js';

function quantPixel(image, x, y, bits) {
  return quantizeRgba(pixelAt(image, x, y), bits, 8);
}

function meanColor(image, x, y, w, h, bits) {
  const sum = [0, 0, 0, 0];
  let count = 0;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const p = quantPixel(image, xx, yy, bits);
      sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; sum[3] += p[3];
      count++;
    }
  }
  return sum.map(v => Math.round(v / Math.max(1, count)));
}

function allTransparent(image, x, y, w, h) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const i = (yy * image.width + xx) * 4 + 3;
      if (image.data[i] !== 0) return false;
    }
  }
  return true;
}

function rmsError(image, region, predictor, bits) {
  let total = 0;
  let max = 0;
  let count = 0;
  for (let yy = region.y; yy < region.y + region.h; yy++) {
    for (let xx = region.x; xx < region.x + region.w; xx++) {
      const actual = quantPixel(image, xx, yy, bits);
      const expected = predictor(xx, yy);
      const d = rgbaDistance(actual, expected);
      total += d * d;
      if (d > max) max = d;
      count++;
    }
  }
  return { rms: Math.sqrt(total / Math.max(1, count)), max };
}

function averageAxisSamples(image, r, axis, bits) {
  const count = axis === 'x' ? r.w : r.h;
  const samples = new Array(count);
  for (let i = 0; i < count; i++) {
    const sum = [0, 0, 0, 0];
    const n = axis === 'x' ? r.h : r.w;
    for (let j = 0; j < n; j++) {
      const x = axis === 'x' ? r.x + i : r.x + j;
      const y = axis === 'x' ? r.y + j : r.y + i;
      const p = quantPixel(image, x, y, bits);
      sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; sum[3] += p[3];
    }
    samples[i] = sum.map(v => Math.round(v / Math.max(1, n)));
  }
  return samples;
}

function fitSolid(image, r, bits) {
  const color = meanColor(image, r.x, r.y, r.w, r.h, bits);
  const error = rmsError(image, r, () => color, bits);
  return { model: { ...r, type: 'solid', color }, ...error };
}

function fitGradient(image, r, axis, options) {
  const samples = averageAxisSamples(image, r, axis, options.bits);
  const stops = simplifySamples(samples, {
    tolerance: Math.max(0, options.modelTolerance * 0.7),
    edgeThreshold: options.edgeThreshold,
    preserveEdges: true
  });
  const error = rmsError(image, r, (xx, yy) => {
    // Samples are cell averages. SVG objectBoundingBox gradients are evaluated
    // at the pixel-cell centers when rasterized, so score the fitted gradient
    // in the same normalized coordinate system used by serialization.
    const t = axis === 'x'
      ? (xx - r.x + 0.5) / r.w
      : (yy - r.y + 0.5) / r.h;
    return sampleStops(stops, t);
  }, options.bits);
  return { model: { ...r, type: axis === 'x' ? 'gradient-x' : 'gradient-y', stops }, ...error };
}

function exactLeaf(image, r, bits, maxRegions) {
  const regions = [];
  for (let yy = r.y; yy < r.y + r.h; yy++) {
    for (let xx = r.x; xx < r.x + r.w; xx++) {
      const color = quantPixel(image, xx, yy, bits);
      if (color[3] === 0) continue;
      regions.push({ x: xx, y: yy, w: 1, h: 1, type: 'solid', color });
      if (regions.length > maxRegions) throw new Error('Adaptive encoder complexity limit exceeded');
    }
  }
  return regions;
}

function colorsEqual(a, b) {
  return a && b && a.length === b.length && a.every((v, i) => v === b[i]);
}

function coalesceSolids(regions) {
  let list = [...regions];
  // Horizontal pass.
  list.sort((a, b) => a.y - b.y || a.h - b.h || a.x - b.x);
  const h = [];
  for (const r of list) {
    const p = h.at(-1);
    if (p && p.type === 'solid' && r.type === 'solid' &&
        p.y === r.y && p.h === r.h && p.x + p.w === r.x && colorsEqual(p.color, r.color)) {
      p.w += r.w;
    } else h.push({ ...r, color: r.color ? [...r.color] : undefined, stops: r.stops });
  }
  // Vertical pass.
  h.sort((a, b) => a.x - b.x || a.w - b.w || a.y - b.y);
  const v = [];
  for (const r of h) {
    const p = v.at(-1);
    if (p && p.type === 'solid' && r.type === 'solid' &&
        p.x === r.x && p.w === r.w && p.y + p.h === r.y && colorsEqual(p.color, r.color)) {
      p.h += r.h;
    } else v.push(r);
  }
  return v;
}

function recurse(image, r, depth, options, out) {
  if (allTransparent(image, r.x, r.y, r.w, r.h)) return;

  const solid = fitSolid(image, r, options.bits);
  if (solid.max === 0 || (solid.rms <= options.modelTolerance && solid.max <= options.modelTolerance * 2.25)) {
    out.push(solid.model);
    if (out.length > options.maxRegions) throw new Error('Adaptive encoder complexity limit exceeded');
    return;
  }

  const gx = r.w > 1 ? fitGradient(image, r, 'x', options) : null;
  const gy = r.h > 1 ? fitGradient(image, r, 'y', options) : null;
  const gradientFits = [gx, gy].filter(Boolean).sort((a, b) => a.rms - b.rms || a.max - b.max);
  const bestGradient = gradientFits[0];
  if (bestGradient && bestGradient.rms <= options.modelTolerance && bestGradient.max <= options.modelTolerance * 2.5) {
    out.push(bestGradient.model);
    if (out.length > options.maxRegions) throw new Error('Adaptive encoder complexity limit exceeded');
    return;
  }

  if (depth >= options.maxDepth || (r.w <= options.minTile && r.h <= options.minTile)) {
    const leaf = exactLeaf(image, r, options.bits, options.maxRegions);
    out.push(...leaf);
    if (out.length > options.maxRegions) throw new Error('Adaptive encoder complexity limit exceeded');
    return;
  }

  if ((r.w >= r.h && r.w > 1) || r.h <= 1) {
    const a = Math.max(1, Math.floor(r.w / 2));
    const b = r.w - a;
    recurse(image, { x: r.x, y: r.y, w: a, h: r.h }, depth + 1, options, out);
    if (b > 0) recurse(image, { x: r.x + a, y: r.y, w: b, h: r.h }, depth + 1, options, out);
  } else {
    const a = Math.max(1, Math.floor(r.h / 2));
    const b = r.h - a;
    recurse(image, { x: r.x, y: r.y, w: r.w, h: a }, depth + 1, options, out);
    if (b > 0) recurse(image, { x: r.x, y: r.y + a, w: r.w, h: b }, depth + 1, options, out);
  }
}

export function encodeTiles(image, {
  precision = 3,
  bits = 8,
  modelTolerance = 6,
  minTile = 2,
  maxDepth = 10,
  edgeThreshold = 96,
  maxRegions = 5000
} = {}) {
  const options = {
    precision,
    bits,
    modelTolerance: Math.max(0, modelTolerance),
    minTile: Math.max(1, Math.round(minTile)),
    maxDepth: Math.max(1, Math.round(maxDepth)),
    edgeThreshold,
    maxRegions: Math.max(1, Math.round(maxRegions))
  };
  const regions = [];
  recurse(image, { x: 0, y: 0, w: image.width, h: image.height }, 0, options, regions);
  const compact = coalesceSolids(regions);
  const model = { width: image.width, height: image.height, regions: compact };
  const serialized = serializeRegions(model, { precision, bits });
  return {
    ...serialized,
    model,
    options,
    stats: { ...serialized.stats, encoder: 'adaptive-tiles' }
  };
}
