# Synthetic codec benchmark — v0.1.5

These are deterministic synthetic tests, not a claim about every emblem. They verify that the current optimizer improves reconstruction quality over an Emblem Helper 1.1-style strip baseline under the same request budget. v0.1.5 uses an **artifact-aware** quality proxy: edge-weighted reconstruction error plus explicit penalties for transparent-background leakage and coherent directional streaking. `100` is exact under that metric. Scores are therefore not directly comparable with older pre-v0.1.5 benchmark numbers.

| Budget | Legacy-style winner | RAGE v0.1.5 winner | Quality gain | Payload delta |
| ---: | --- | --- | ---: | ---: |
| 120,000 B | 50.406 @ 116,928 B (32px, 8-bit, columns) | **52.060 @ 80,608 B** (32px, 8-bit, segmented columns) | **+1.654** | **−36,320 B** |
| 1,280,000 B | 98.449 @ 536,060 B (256px, 4-bit, rows) | **99.954 @ 532,424 B** (256px, 8-bit, segmented rows) | **+1.505** | **−3,636 B** |

The payload delta is `RAGE - legacy`. The benchmark now stops at `99.95` because the stricter artifact-aware scorer intentionally charges for directional and alpha-leak artifacts that the older metric largely ignored. Deep mode remains available when you want to keep searching beyond that practical near-lossless threshold.

## Actual 1,280,000-byte run

```json
{
  "budget": 1280000,
  "qualityTarget": 99.95,
  "legacy": {
    "id": "256-4-rows",
    "quality": 98.44867608558475,
    "payloadBytes": 536060,
    "res": 256,
    "bits": 4,
    "orientation": "rows",
    "layers": 207
  },
  "modern": {
    "id": "strips-rows-256-8-p5-g1-m0-30",
    "quality": 99.95376526772927,
    "payloadBytes": 532424,
    "encoder": "strips-rows",
    "resolution": 256,
    "bits": 8,
    "layers": 217,
    "variant": "p5-g1-m0"
  },
  "qualityGain": 1.5050891821445163,
  "payloadDeltaVsLegacy": -3636,
  "evaluated": 31
}
```

## Constrained 120,000-byte run

```json
{
  "budget": 120000,
  "qualityTarget": 99.95,
  "legacy": {
    "id": "32-8-columns",
    "quality": 50.40576683719276,
    "payloadBytes": 116928,
    "res": 32,
    "bits": 8,
    "orientation": "columns",
    "layers": 31
  },
  "modern": {
    "id": "strips-columns-32-8-p3-g0-m0-29",
    "quality": 52.060254445626995,
    "payloadBytes": 80608,
    "encoder": "strips-columns",
    "resolution": 32,
    "bits": 8,
    "layers": 31,
    "variant": "p3-g0-m0"
  },
  "qualityGain": 1.6544876084342377,
  "payloadDeltaVsLegacy": -36320,
  "evaluated": 240
}
```

Run the real-ceiling benchmark with `npm run benchmark`. Override `SIZE`, `BUDGET`, or `QUALITY_TARGET` for custom stress runs. `QUALITY_TARGET=100` can be dramatically more expensive because it only stops on an exact metric reconstruction or the candidate cap.
