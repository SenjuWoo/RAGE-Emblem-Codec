import { pixelAt } from './model.js';
import { quantizeRgba, rgbaDistance } from './color.js';
import { simplifySamples, sampleStops, stopsSignature } from './gradient.js';
import { serializeRegions } from './rockstar.js';

function stripSamples(image, orientation, index, bits) {
  const n = orientation === 'rows' ? image.width : image.height;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = orientation === 'rows' ? pixelAt(image, i, index) : pixelAt(image, index, i);
    out[i] = quantizeRgba(p, bits, 8);
  }
  return out;
}

function maxAlpha(samples) {
  let m = 0;
  for (const s of samples) m = Math.max(m, s[3]);
  return m;
}

function allSame(samples) {
  const a = samples[0];
  return samples.every(s => rgbaDistance(a, s) === 0);
}

function gradientSimilarity(a, b) {
  if (!a || !b || a.type !== b.type) return Infinity;
  if (a.type === 'solid') return rgbaDistance(a.color, b.color);
  let worst = 0;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    worst = Math.max(worst, rgbaDistance(sampleStops(a.stops, t), sampleStops(b.stops, t)));
  }
  return worst;
}

function makeStripRegion(image, orientation, index, options) {
  const samples = stripSamples(image, orientation, index, options.bits);
  const horizontal = orientation === 'rows';
  const base = horizontal
    ? { x: 0, y: index, w: image.width, h: 1 }
    : { x: index, y: 0, w: 1, h: image.height };

  if (maxAlpha(samples) === 0) return { ...base, type: 'transparent' };
  if (allSame(samples)) return { ...base, type: 'solid', color: samples[0] };

  const stops = simplifySamples(samples, {
    tolerance: options.gradientTolerance,
    edgeThreshold: options.edgeThreshold ?? 96,
    preserveEdges: options.preserveEdges
  });
  if (stops.length === 1 || stops.every(s => rgbaDistance(stops[0].color, s.color) === 0)) {
    return { ...base, type: 'solid', color: stops[0].color };
  }
  return { ...base, type: horizontal ? 'gradient-x' : 'gradient-y', stops };
}

export function encodeStrips(image, {
  orientation = 'rows', precision = 3, bits = 8, gradientTolerance = 0,
  preserveEdges = true, edgeThreshold = 96, mergeTolerance = 0
} = {}) {
  const count = orientation === 'rows' ? image.height : image.width;
  const regions = [];
  let previous = null;

  for (let index = 0; index < count; index++) {
    const region = makeStripRegion(image, orientation, index, {
      bits, gradientTolerance, preserveEdges, edgeThreshold
    });
    if (region.type === 'transparent') {
      previous = null;
      continue;
    }

    const sameExact = previous && (
      (region.type === 'solid' && previous.type === 'solid' && rgbaDistance(region.color, previous.color) === 0) ||
      (region.type.startsWith('gradient') && previous.type === region.type && stopsSignature(region.stops, precision) === stopsSignature(previous.stops, precision))
    );
    const closeEnough = previous && mergeTolerance > 0 && gradientSimilarity(previous, region) <= mergeTolerance;

    if (sameExact || closeEnough) {
      if (orientation === 'rows') previous.h += 1;
      else previous.w += 1;
    } else {
      regions.push(region);
      previous = region;
    }
  }

  const model = { width: image.width, height: image.height, regions };
  const serialized = serializeRegions(model, { precision, bits });
  return {
    ...serialized,
    model,
    options: { orientation, precision, bits, gradientTolerance, preserveEdges, edgeThreshold, mergeTolerance },
    stats: { ...serialized.stats, orientation }
  };
}
