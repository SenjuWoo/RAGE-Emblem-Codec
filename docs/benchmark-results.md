# Synthetic codec benchmark — v0.1.1

These are deterministic synthetic tests, not a claim about every emblem. They verify that the audited optimizer improves reconstruction quality over an Emblem Helper 1.1-style strip baseline under the same request budget. Quality is the v0.1.1 edge-weighted perceptual proxy, where 100 is exact under that metric.

| Budget | Legacy-style winner | RAGE v0.1.1 winner | Quality gain | Payload delta |
| ---: | --- | --- | ---: | ---: |
| 120,000 B | 53.634 @ 116,928 B (32px, 8-bit, columns) | 55.210 @ 84,804 B (32px, 8-bit, optimized columns) | +1.577 | -32,124 B |
| 1,280,000 B | 98.782 @ 536,060 B (256px, 4-bit, rows) | 99.9995 @ 1,276,380 B (256px, 8-bit, optimized columns) | +1.218 | +740,320 B |

The payload delta is `RAGE - legacy`. At the real ceiling, using more of the available budget is intentional: the objective is maximum quality while remaining under the ceiling, not minimum byte count. Under the starved 120 KB budget, the optimized representation is both smaller and higher scoring.

## Actual 1,280,000-byte run

```json
{
  "budget": 1280000,
  "qualityTarget": 99.995,
  "legacy": {
    "id": "256-4-rows",
    "quality": 98.78192892554056,
    "payloadBytes": 536060,
    "res": 256,
    "bits": 4,
    "orientation": "rows",
    "layers": 207
  },
  "modern": {
    "id": "strips-columns-256-8-p4-g0-m0-28",
    "quality": 99.99950114800436,
    "payloadBytes": 1276380,
    "encoder": "strips-columns",
    "resolution": 256,
    "bits": 8,
    "layers": 227,
    "variant": "p4-g0-m0"
  },
  "qualityGain": 1.2175722224638008,
  "payloadDeltaVsLegacy": 740320,
  "evaluated": 29
}
```

## Constrained 120,000-byte run

256px synthetic source. The starved budget forces the search down to 32px.

```json
{
  "budget": 120000,
  "qualityTarget": 99.995,
  "legacy": {
    "id": "32-8-columns",
    "quality": 53.63370927008253,
    "payloadBytes": 116928,
    "res": 32,
    "bits": 8,
    "orientation": "columns",
    "layers": 31
  },
  "modern": {
    "id": "strips-columns-32-8-p3-g0-m0-69",
    "quality": 55.21023528418797,
    "payloadBytes": 84804,
    "encoder": "strips-columns",
    "resolution": 32,
    "bits": 8,
    "layers": 31,
    "variant": "p3-g0-m0"
  },
  "qualityGain": 1.576526014105447,
  "payloadDeltaVsLegacy": -32124,
  "evaluated": 240
}
```

Run the real-ceiling benchmark with `npm run benchmark`. The modern benchmark target is 99.995 by default so the release check terminates once it has a near-lossless fitting candidate; set `QUALITY_TARGET=100` for a much more expensive search that will only stop on an exact metric reconstruction or the candidate cap.
