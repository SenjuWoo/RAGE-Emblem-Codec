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

function gradientFitError(samples, stops) {
  let worst = 0;
  let worstIndex = 0;
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const t = n <= 0 ? 0 : (i + 0.5) / n;
    const d = rgbaDistance(samples[i], sampleStops(stops, t));
    if (d > worst) {
      worst = d;
      worstIndex = i;
    }
  }
  return { worst, worstIndex };
}

function encodeRunSegments(samples, absoluteStart, options, depth = 0, out = []) {
  if (!samples.length) return out;
  if (allSame(samples)) {
    out.push({ start: absoluteStart, length: samples.length, type: 'solid', color: samples[0] });
    return out;
  }

  const stops = simplifySamples(samples, {
    tolerance: options.gradientTolerance,
    edgeThreshold: options.edgeThreshold ?? 96,
    preserveEdges: options.preserveEdges
  });
  if (stops.length === 1 || stops.every(s => rgbaDistance(stops[0].color, s.color) === 0)) {
    out.push({ start: absoluteStart, length: samples.length, type: 'solid', color: stops[0].color });
    return out;
  }

  // RDP tolerance is a compression knob, not permission to erase structure.
  // A separate hard reconstruction cap prevents a long row/column gradient from
  // painting through faces, hair, text, outlines, etc. When the cap is exceeded,
  // recursively split at the worst-fitting sample and fit the local pieces.
  const { worst, worstIndex } = gradientFitError(samples, stops);
  const structuralLimit = Math.max(1, Number(options.maxGradientError ?? 18));
  if (worst <= structuralLimit || samples.length <= 2 || depth >= 12) {
    out.push({ start: absoluteStart, length: samples.length, type: 'gradient', stops });
    return out;
  }

  let cut = Math.max(1, Math.min(samples.length - 1, worstIndex));
  // If the worst sample lies at an endpoint, isolate one cell rather than
  // repeatedly choosing the same degenerate split.
  if (worstIndex <= 0) cut = 1;
  else if (worstIndex >= samples.length - 1) cut = samples.length - 1;
  encodeRunSegments(samples.slice(0, cut), absoluteStart, options, depth + 1, out);
  encodeRunSegments(samples.slice(cut), absoluteStart + cut, options, depth + 1, out);
  return out;
}

function visibleRuns(samples, alphaThreshold = 8, alphaPad = 1) {
  const threshold = Math.max(0, Math.min(255, Number(alphaThreshold) || 0));
  const pad = Math.max(0, Math.round(Number(alphaPad) || 0));
  const raw = [];
  let start = -1;

  for (let i = 0; i < samples.length; i++) {
    const visible = samples[i][3] > threshold;
    if (visible && start < 0) start = i;
    if (!visible && start >= 0) {
      raw.push([start, i - 1]);
      start = -1;
    }
  }
  if (start >= 0) raw.push([start, samples.length - 1]);
  if (!raw.length) return [];

  // Include a tiny halo around real content so sub-threshold antialias samples
  // immediately touching the silhouette can still provide a smooth fade. Distant
  // low-alpha noise is intentionally excluded so it cannot become a long SVG strip.
  const expanded = raw.map(([a, b]) => [
    Math.max(0, a - pad),
    Math.min(samples.length - 1, b + pad)
  ]);

  const merged = [];
  for (const run of expanded) {
    const prev = merged.at(-1);
    if (prev && run[0] <= prev[1] + 1) prev[1] = Math.max(prev[1], run[1]);
    else merged.push([...run]);
  }
  return merged;
}

function makeStripRegions(image, orientation, index, options) {
  const samples = stripSamples(image, orientation, index, options.bits);
  const horizontal = orientation === 'rows';
  const runs = visibleRuns(samples, options.alphaThreshold, options.alphaPad);
  const out = [];

  for (const [start, end] of runs) {
    const runSamples = samples.slice(start, end + 1);
    const segments = encodeRunSegments(runSamples, start, options);
    for (const segment of segments) {
      const base = horizontal
        ? { x: segment.start, y: index, w: segment.length, h: 1 }
        : { x: index, y: segment.start, w: 1, h: segment.length };
      if (segment.type === 'solid') out.push({ ...base, type: 'solid', color: segment.color });
      else out.push({ ...base, type: horizontal ? 'gradient-x' : 'gradient-y', stops: segment.stops });
    }
  }
  return out;
}

function spanKey(region, orientation) {
  return orientation === 'rows'
    ? `${region.x}:${region.w}`
    : `${region.y}:${region.h}`;
}

function adjacent(previous, region, orientation) {
  return orientation === 'rows'
    ? previous.y + previous.h === region.y
    : previous.x + previous.w === region.x;
}

function canMerge(previous, region, orientation, precision, mergeTolerance) {
  if (!previous || !adjacent(previous, region, orientation) || previous.type !== region.type) return false;
  if (region.type === 'solid') {
    const d = rgbaDistance(previous.color, region.color);
    // Approximate merging across scanlines creates broad banding. Keep a tiny
    // allowance for nearly-identical flat fills, but never let a large search
    // merge tolerance turn distinct rows/columns into one painted stripe.
    const safeTolerance = Math.min(2, Math.max(0, Number(mergeTolerance) || 0));
    return d === 0 || (safeTolerance > 0 && d <= safeTolerance);
  }
  const exact = stopsSignature(region.stops, precision) === stopsSignature(previous.stops, precision);
  // Gradient profiles may be merged only when their serialized representation
  // is identical. Approximate gradient merging was the direct cause of the
  // horizontal/vertical "melt" bands seen on detailed character artwork.
  return exact;
}

export function encodeStrips(image, {
  orientation = 'rows', precision = 3, bits = 8, gradientTolerance = 0,
  preserveEdges = true, edgeThreshold = 96, mergeTolerance = 0,
  alphaThreshold = 8, alphaPad = 1, maxGradientError = 18
} = {}) {
  const count = orientation === 'rows' ? image.height : image.width;
  const regions = [];
  let previousBySpan = new Map();

  for (let index = 0; index < count; index++) {
    const stripRegions = makeStripRegions(image, orientation, index, {
      bits, gradientTolerance, preserveEdges, edgeThreshold, alphaThreshold, alphaPad, maxGradientError
    });
    const currentBySpan = new Map();

    for (const region of stripRegions) {
      const key = spanKey(region, orientation);
      const previous = previousBySpan.get(key);
      if (canMerge(previous, region, orientation, precision, mergeTolerance)) {
        if (orientation === 'rows') previous.h += region.h;
        else previous.w += region.w;
        currentBySpan.set(key, previous);
      } else {
        regions.push(region);
        currentBySpan.set(key, region);
      }
    }
    previousBySpan = currentBySpan;
  }

  const model = { width: image.width, height: image.height, regions };
  const serialized = serializeRegions(model, { precision, bits });
  return {
    ...serialized,
    model,
    options: {
      orientation, precision, bits, gradientTolerance, preserveEdges, edgeThreshold,
      mergeTolerance, alphaThreshold, alphaPad, maxGradientError
    },
    stats: { ...serialized.stats, orientation, segmentedRegions: regions.length }
  };
}
