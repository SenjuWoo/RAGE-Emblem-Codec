import { resizeFitImage } from './resample.js';
import { encodeStrips } from './strip-encoder.js';
import { encodeTiles } from './tile-encoder.js';
import { createMetricContext, scoreModels } from './metrics.js';
import { chooseBestCandidate, paretoFrontier } from './optimizer.js';

export const SAFE_STRIP_LEVELS = [
  [0,0],[1,0],[2,0],[4,0],[6,0],[8,0]
];
export const AGGRESSIVE_STRIP_LEVELS = [
  [12,0],[18,0],[28,0],[40,0],[18,2]
];
export const STRIP_LEVELS = [...SAFE_STRIP_LEVELS, ...AGGRESSIVE_STRIP_LEVELS];
const TILE_LEVELS = [0,2,4,6,10,16,24,36,52,72];

function defaultsForPreset(preset, maxSize) {
  const clamp = xs => [...new Set(xs.filter(x => x <= maxSize).concat([maxSize]))].sort((a,b)=>a-b);
  if (preset === 'deep') return {
    resolutions: clamp([64,96,128,160,192,256,320,384,512]),
    bits: [8,7,6,5,4], encoderFamilies: ['strips','tiles'], maxCandidates: 1800
  };
  return {
    resolutions: clamp([64,128,256]), bits: [8,6], encoderFamilies: ['strips','tiles'], maxCandidates: 300
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
  const alphaThreshold = Math.max(0, Math.min(64, Number(options.alphaThreshold ?? 8)));
  const alphaPad = Math.max(0, Math.min(3, Math.round(Number(options.alphaPad ?? 1))));
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
  const qualityTargetRaw = options.qualityTarget === undefined ? (preset === 'fast' ? 99.95 : null) : options.qualityTarget;
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
      baseQuality: metric.baseScore,
      mse: metric.mse,
      effectiveMse: metric.effectiveMse,
      artifactPenalty: metric.artifactPenalty,
      transparentLeakage: metric.transparentLeakage,
      directionalArtifact: metric.directionalArtifact,
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
    const artifactSafe = metric.artifactPenalty < 0.5;
    if (feasibleCandidate && artifactSafe && qualityTarget != null && Number.isFinite(qualityTarget) && metric.score >= qualityTarget) {
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
  const tileSizes = preset === 'deep' ? [1,2] : [2];
  const orientations = (options.stripOrientations?.length
    ? options.stripOrientations
    : ['rows', 'columns']
  ).filter(o => o === 'rows' || o === 'columns');
  const stripOrientations = orientations.length ? orientations : ['rows', 'columns'];

  const runStripLevels = (levels) => {
    if (stopped || !families.includes('strips')) return;
    bitOuter:
    for (const bits of bitDepths) {
      if (bestFull && (bestFull.bits ?? 8) > bits) break bitOuter;
      for (const [gradientTolerance, mergeTolerance] of levels) {
        for (const precision of precisions) {
          for (const orientation of stripOrientations) {
            for (const resolution of resolutions) {
              if (stopped) break bitOuter;
              const key = `${resolution}:${bits}:${precision}:${orientation}`;
              if (stripDone.has(key)) continue;
              const img = imageFor(resolution);
              const result = encodeStrips(img, {
                orientation, precision, bits, gradientTolerance, mergeTolerance,
                preserveEdges: true, edgeThreshold, alphaThreshold, alphaPad,
                maxGradientError: Number(options.maxGradientError ?? 18)
              });
              const c = evaluate(result, {
                encoder: `strips-${orientation}`, resolution, bits,
                variant: `p${precision}-g${gradientTolerance}-m${mergeTolerance}`,
                settings: {
                  orientation, precision, bits, gradientTolerance, mergeTolerance,
                  edgeThreshold, alphaThreshold, alphaPad,
                  maxGradientError: Number(options.maxGradientError ?? 18)
                }
              });
              if (c && c.payloadBytes <= effectiveBudget) stripDone.add(key);
            }
          }
        }
      }
    }
  };

  const runTiles = ({ levels = TILE_LEVELS, allowedResolutions = resolutions, allowedTileSizes = tileSizes } = {}) => {
    if (stopped || !families.includes('tiles')) return;
    tileOuter:
    for (const bits of bitDepths) {
      if (bestFull && (bestFull.bits ?? 8) > bits) break tileOuter;
      for (const modelTolerance of levels) {
        for (const precision of precisions) {
          for (const minTile of allowedTileSizes) {
            for (const resolution of allowedResolutions) {
              if (stopped) break tileOuter;
              const key = `${resolution}:${bits}:${precision}:${minTile}`;
              if (tileDone.has(key)) continue;
              const img = imageFor(resolution);
              let result;
              try {
                result = encodeTiles(img, {
                  precision, bits, modelTolerance, minTile,
                  maxDepth: 14, edgeThreshold, maxRegions, alphaThreshold
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
                settings: { precision, bits, modelTolerance, minTile, edgeThreshold, maxRegions, alphaThreshold }
              });
              if (c && c.payloadBytes <= effectiveBudget) tileDone.add(key);
            }
          }
        }
      }
    }
  };

  // Search clean strip representations first, then run a small 2D tile probe
  // before the high-compression 1D fallbacks. The probe prevents strip artifacts
  // from monopolizing Auto without paying the cost of a full tile sweep up front.
  runStripLevels(SAFE_STRIP_LEVELS);
  const probeResolutions = resolutions.filter(r => r <= 256);
  runTiles({
    levels: [10,16,24,36],
    allowedResolutions: probeResolutions.length ? probeResolutions : resolutions.slice(-1),
    allowedTileSizes: [2]
  });
  runStripLevels(AGGRESSIVE_STRIP_LEVELS);
  // Deep mode remains the exhaustive path. Fast/custom already sampled the most
  // useful tile operating points and avoids hundreds of redundant expensive fits.
  if (preset === 'deep') runTiles();

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
