import { resizeFitImage } from './resample.js';
import { encodeStrips } from './strip-encoder.js';
import { encodeTiles } from './tile-encoder.js';
import { createMetricContext, scoreModels } from './metrics.js';
import { chooseBestCandidate, paretoFrontier } from './optimizer.js';

const STRIP_LEVELS = [
  [0,0],[1,0],[2,0],[4,0],[2,2],[6,0],[4,2],[8,2],[12,3],[18,4],[28,6],[40,8]
];
const TILE_LEVELS = [0,2,4,6,10,16,24,36,52,72];

function defaultsForPreset(preset, maxSize) {
  const clamp = xs => [...new Set(xs.filter(x => x <= maxSize).concat([maxSize]))].sort((a,b)=>a-b);
  if (preset === 'deep') return {
    resolutions: clamp([64,96,128,160,192,256,320,384,512]),
    bits: [8,7,6,5,4], encoderFamilies: ['strips','tiles'], maxCandidates: 1800
  };
  return {
    resolutions: clamp([64,128,256]), bits: [8,6,4], encoderFamilies: ['strips','tiles'], maxCandidates: 300
  };
}

export function searchImage(reference, options = {}, onProgress = null) {
  const preset = options.preset ?? 'fast';
  const maxSourceSize = Math.min(512, Math.max(reference.width, reference.height));
  const d = defaultsForPreset(preset, maxSourceSize);
  const budget = Number(options.budget ?? 1280000);
  const reserve = Math.max(0, Number(options.reserve ?? 2048));
  const effectiveBudget = Math.max(0, budget - reserve);
  const resolutions = [...(options.resolutions ?? d.resolutions)].sort((a,b)=>b-a);
  const bitDepths = options.bits ?? d.bits;
  const families = options.encoderFamilies ?? d.encoderFamilies;
  const maxCandidates = Math.max(1, Number(options.maxCandidates ?? d.maxCandidates));
  const precisionOption = options.precision ?? 'auto';
  const precisions = precisionOption === 'auto'
    ? [5,4,3]
    : [Math.max(3, Math.min(5, Number(precisionOption) || 3))];
  const edgeThreshold = Number(options.edgeThreshold ?? 96);
  const smoothing = options.smoothing ?? true;
  const maxRegions = Number(options.maxRegions ?? 4500);
  const metricSize = maxSourceSize;
  const metricReference = resizeFitImage(reference, metricSize, smoothing);
  const context = createMetricContext(metricReference);
  const imageCache = new Map();
  const imageFor = resolution => {
    if (!imageCache.has(resolution)) imageCache.set(resolution, resizeFitImage(reference, resolution, smoothing));
    return imageCache.get(resolution);
  };
  const candidates = [];
  let bestFull = null;
  let evaluated = 0;
  let stopped = false;
  let hitCandidateLimit = false;
  let optimalFound = false;
  let targetReached = false;
  const qualityTargetRaw = options.qualityTarget === undefined ? (preset === 'fast' ? 99.995 : null) : options.qualityTarget;
  const qualityTarget = qualityTargetRaw == null ? null : Math.max(0, Math.min(100, Number(qualityTargetRaw)));

  const report = (candidate = null) => {
    if (!onProgress) return;
    const best = bestFull ? { ...bestFull, result: undefined } : null;
    onProgress({ evaluated, maxCandidates, candidate, best });
  };

  const evaluate = (result, meta) => {
    if (stopped) return null;
    const metric = scoreModels(metricReference, result.renderModel ?? result.model, { context });
    const candidate = {
      id: `${meta.encoder}-${meta.resolution}-${meta.bits}-${meta.variant}-${evaluated}`,
      encoder: meta.encoder,
      resolution: meta.resolution,
      bits: meta.bits,
      variant: meta.variant,
      quality: metric.score,
      mse: metric.mse,
      payloadBytes: result.payload.estimatedRequestBytes,
      base64DataBytes: result.payload.base64DataBytes,
      layers: result.stats.layers,
      settings: meta.settings
    };
    candidates.push(candidate);
    if (candidate.payloadBytes <= effectiveBudget) {
      const currentSummary = bestFull ? { ...bestFull, result: undefined } : null;
      const winner = chooseBestCandidate(currentSummary ? [currentSummary, candidate] : [candidate], effectiveBudget);
      if (winner && winner.id === candidate.id) bestFull = { ...candidate, result };
    }
    evaluated++;
    const feasibleCandidate = candidate.payloadBytes <= effectiveBudget;
    if (feasibleCandidate && qualityTarget != null && Number.isFinite(qualityTarget) && metric.score >= qualityTarget) {
      targetReached = true;
      stopped = true;
    } else if (feasibleCandidate && metric.mse < 1e-12) {
      optimalFound = true;
      stopped = true;
    } else if (evaluated >= maxCandidates) {
      hitCandidateLimit = true;
      stopped = true;
    }
    report(candidate);
    return candidate;
  };

  const stripDone = new Set();
  const tileDone = new Set();
  const tileSizes = preset === 'deep' ? [1,2,4] : [2,4];
  const orientations = (options.stripOrientations?.length
    ? options.stripOrientations
    : ['rows', 'columns']
  ).filter(o => o === 'rows' || o === 'columns');
  const stripOrientations = orientations.length ? orientations : ['rows', 'columns'];

  // Search cheap strip candidates first. Within each compression level, sweep every
  // requested resolution before spending work on another precision/bit-depth pair.
  // This prevents a candidate cap from being consumed entirely at one resolution.
  outer:
  for (let level = 0; level < STRIP_LEVELS.length && families.includes('strips'); level++) {
    const [gradientTolerance, mergeTolerance] = STRIP_LEVELS[level];
    for (const precision of precisions) {
      for (const bits of bitDepths) {
        for (const orientation of stripOrientations) {
          for (const resolution of resolutions) {
            if (stopped) break outer;
            const key = `${resolution}:${bits}:${precision}:${orientation}`;
            if (stripDone.has(key)) continue;
            const img = imageFor(resolution);
            const result = encodeStrips(img, {
              orientation, precision, bits, gradientTolerance, mergeTolerance,
              preserveEdges: true, edgeThreshold
            });
            const c = evaluate(result, {
              encoder: `strips-${orientation}`, resolution, bits,
              variant: `p${precision}-g${gradientTolerance}-m${mergeTolerance}`,
              settings: { orientation, precision, bits, gradientTolerance, mergeTolerance, edgeThreshold }
            });
            if (c && c.payloadBytes <= effectiveBudget) stripDone.add(key);
          }
        }
      }
    }
  }

  // Adaptive tiling is more expensive, so only search it after the strip baseline.
  if (!stopped && families.includes('tiles')) {
    tileOuter:
    for (let level = 0; level < TILE_LEVELS.length; level++) {
      const modelTolerance = TILE_LEVELS[level];
      for (const precision of precisions) {
        for (const bits of bitDepths) {
          for (const minTile of tileSizes) {
            for (const resolution of resolutions) {
              if (stopped) break tileOuter;
              const key = `${resolution}:${bits}:${precision}:${minTile}`;
              if (tileDone.has(key)) continue;
              const img = imageFor(resolution);
              let result;
              try {
                result = encodeTiles(img, {
                  precision, bits, modelTolerance, minTile,
                  maxDepth: 14, edgeThreshold, maxRegions
                });
              } catch (error) {
                if (/complexity limit/i.test(String(error?.message))) {
                  evaluated++;
                  if (evaluated >= maxCandidates) { hitCandidateLimit = true; stopped = true; }
                  report({ skipped: true, reason: 'complexity-limit', resolution, bits, precision, minTile, modelTolerance });
                  if (stopped) break tileOuter;
                  continue;
                }
                throw error;
              }
              const c = evaluate(result, {
                encoder: 'adaptive-tiles', resolution, bits,
                variant: `p${precision}-t${modelTolerance}-min${minTile}`,
                settings: { precision, bits, modelTolerance, minTile, edgeThreshold, maxRegions }
              });
              if (c && c.payloadBytes <= effectiveBudget) tileDone.add(key);
            }
          }
        }
      }
    }
  }

  const best = bestFull;
  const feasible = candidates.filter(c => c.payloadBytes <= effectiveBudget);
  return {
    best,
    candidates,
    frontier: paretoFrontier(feasible),
    budget,
    reserve,
    effectiveBudget,
    evaluated,
    stoppedAtLimit: hitCandidateLimit,
    optimalFound,
    targetReached,
    qualityTarget,
    metricSize
  };
}
