import { makeImage } from './codec/model.js';
import { searchImage } from './codec/search.js';

function summary(candidate) {
  if (!candidate) return null;
  if (candidate.skipped) return { skipped: true, reason: candidate.reason };
  return {
    id:candidate.id, encoder:candidate.encoder, resolution:candidate.resolution,
    bits:candidate.bits, variant:candidate.variant, quality:candidate.quality,
    payloadBytes:candidate.payloadBytes, layers:candidate.layers
  };
}

self.onmessage = event => {
  const msg = event.data;
  if (msg?.type !== 'search') return;
  try {
    const data = new Uint8ClampedArray(msg.buffer);
    const image = makeImage(msg.width, msg.height, data);
    const result = searchImage(image, msg.options, progress => {
      self.postMessage({
        type:'progress',
        progress:{
          evaluated:progress.evaluated,
          maxCandidates:progress.maxCandidates,
          candidate:summary(progress.candidate),
          best:summary(progress.best)
        }
      });
    });
    self.postMessage({ type:'done', result });
  } catch (error) {
    self.postMessage({ type:'error', message:error?.stack || error?.message || String(error) });
  }
};
