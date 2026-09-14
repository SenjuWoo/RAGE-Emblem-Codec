<p align="center">
  <img src="assets/favicon.svg" width="72" height="72" alt="RAGE Emblem Codec mark">
</p>

<h1 align="center">RAGE Emblem Codec</h1>

<p align="center"><strong>Push GTA Online crew emblems to the byte limit.</strong></p>

<p align="center">
  Local-first optimizer that searches Rockstar-compatible SVG / layer encodings<br>
  and keeps the highest-quality result under the <code>1,280,000</code>-byte request budget.
</p>

<p align="center">
  <a href="https://github.com/SenjuWoo/RAGE-Emblem-Codec/actions/workflows/ci.yml"><img src="https://github.com/SenjuWoo/RAGE-Emblem-Codec/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-a8ff3e?labelColor=0d0f11" alt="MIT License"></a>
  <a href="https://github.com/SenjuWoo/RAGE-Emblem-Codec/releases"><img src="https://img.shields.io/badge/release-v0.1.5-53d7ff?labelColor=0d0f11" alt="v0.1.5"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-8f9aa6?labelColor=0d0f11" alt="Node 20+">
</p>

<p align="center">
  <a href="https://senjuwoo.github.io/RAGE-Emblem-Codec/">Live demo</a>
  ·
  <a href="#run">Run locally</a>
  ·
  <a href="docs/benchmark-results.md">Benchmarks</a>
  ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <img src="docs/images/app-hero.png" alt="RAGE Emblem Codec after a Fast search: original and encoded previews, quality score, payload, and Pareto frontier" width="100%">
</p>

## Why it exists

Rockstar's crew emblem editor does not take a PNG. Artwork has to be represented as SVG gradients plus emblem-layer JSON, and the save request has a practical ceiling around **1,280,000 bytes**.

A clever converter is not enough. The job is:

```text
maximize perceptual quality
subject to  request size  <=  1,280,000 bytes
```

RAGE treats that as a small rate-distortion search: many candidates, one winner.

It grew out of [Emblem Helper 1.1 by Flashback-GTA](https://github.com/search?q=Emblem+Helper+Flashback-GTA), which proved the strip-to-gradient trick. This project keeps that compatibility path and replaces most of the rest.

## What you get

- Automatic maximum-quality search under a hard byte ceiling
- Upgraded row / column strip encoder with real gradient fitting
- Segmented-alpha strips: transparent gaps are omitted instead of being spanned by full-height/full-width paths
- Transparency Guard + soft-edge padding to kill Social Club background needles without wrecking antialiasing
- Adaptive rectangular tile encoder for flat vs detailed regions
- Hard-edge protection so logos and text stay sharp
- Premultiplied-alpha resampling (no colored transparency halos)
- Artifact-aware perceptual scoring: edge fidelity + transparent leakage + directional streak detection
- Pareto frontier, Fast and Deep modes
- Runtime request-size guard in the generated Social Club console code
- 75 automated tests (codec, artifact regressions, search, preview scaling, version / UI guards)
- Local-first: artwork never needs to leave your machine
- Tauri 2 desktop scaffold (optional; no fabricated Windows `.exe` is shipped)

<p align="center">
  <img src="docs/images/sample-crew-emblem.png" alt="Original synthetic crew emblem used for documentation screenshots" width="280">
</p>

<p align="center"><sub>Documentation sample only. Not a Rockstar or Take-Two asset.</sub></p>

## Run

Node.js 20 or newer. No other runtime dependencies for the portable web app.

```powershell
git clone https://github.com/SenjuWoo/RAGE-Emblem-Codec.git
cd RAGE-Emblem-Codec
npm install
npm run serve
```

On Windows you can also double-click `start.bat`.

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173), import an image (or **Load sample emblem**), and press **Auto Max Quality**.

Do not open `index.html` as a `file://` page. The worker and sample image need the local server.

### Export to Rockstar

1. Generate console code in the app.
2. Open the Social Club crew emblem editor while logged in.
3. Paste the snippet into the browser console.
4. The snippet reads the live editor token/hash, measures the real JSON body, and **aborts without sending** if it is over budget.

### Preview vs console / in-game

Original is the 512×512 letterboxed reference the codec scores against. Encoded is the same 512×512 SVG the console snippet uploads; the card only *displays* it (a viewBox is added in the page, not in the Rockstar payload).

v0.1.5 hardens both directions of the old scanline failure. Transparent gaps are still split into compact alpha-supported runs, but complex visible runs now have a separate structural-error ceiling: if a long row/column stops behaving like a real gradient, it is split into smaller local pieces instead of being smeared across the subject. Approximate gradient-to-gradient merging is disabled, and Auto demotes High-artifact candidates before comparing scalar quality.

Advanced → **Transparency guard** controls how aggressively sub-visible alpha noise is discarded (Auto = 8/255), while **Soft-edge padding** keeps one neighboring sample by default so antialiased silhouettes still fade naturally. **Strip direction** remains available for diagnosis, but Auto no longer applies a blanket penalty to either orientation: rows and columns can both win when they remain structurally clean.

## Search modes

| Mode | Behavior |
| --- | --- |
| **Fast** | High-value strip/tile space. Stops once an artifact-aware feasible candidate reaches `99.95 / 100`. |
| **Deep** | No quality target. Continues until an exact reconstruction, exhaustion, or the candidate cap. |
| **Auto precision** | Tries 5, then 4, then 3 decimal geometry. Transform scales keep at least 5 decimals so 512-strip emblems stay opaque. |

## Benchmarks

Deterministic synthetic artwork, not a claim about every photo. Quality is the v0.1.5 artifact-aware proxy (`100` = exact under that metric), so values are not directly comparable with pre-v0.1.5 benchmark scores.

| Budget | Legacy-style | RAGE | Quality | Payload |
| ---: | --- | --- | ---: | ---: |
| 1,280,000 B | 98.449 @ 536,060 B | **99.954 @ 532,424 B** | **+1.505** | **−3,636 B** |
| 120,000 B | 50.406 @ 116,928 B | **52.060 @ 80,608 B** | **+1.654** | **−36,320 B** |

At the real ceiling, spending leftover bytes is intentional. The objective is maximum quality under the cap, not the smallest file. Full JSON: [`docs/benchmark-results.md`](docs/benchmark-results.md).

```powershell
npm run benchmark
```

Override with `SIZE`, `BUDGET`, or `QUALITY_TARGET`.

## Project map

```text
src/codec/     pure encoder / search / payload math
src/worker.js  off-thread optimizer
src/main.js    browser / Tauri UI
tests/         deterministic Node tests
tools/         static server, builder, benchmark, release zip
src-tauri/     optional Tauri 2 shell (NSIS)
```

## Development

```powershell
npm test          # codec tests
npm run check     # version lock + syntax
npm run build     # static frontend -> dist/
npm run package   # portable ZIP + SHA256SUMS.txt
```

### Optional desktop app

The source is laid out for Tauri 2. On a Windows machine with the Rust stable toolchain and the MSVC build tools:

```powershell
npm install
npm run build
npm run tauri -- build
```

The bundle target is NSIS only. This repository does **not** ship a prebuilt `.exe`.

## Compatibility boundary

Strict mode uses the known-safe subset:

- legacy rectangle slug
- transformed SVG paths
- linear gradients
- established emblem layer JSON

Not enabled until proven against the live editor: `<use>`, arbitrary primitives, shared CSS, radial gradients, parser-specific shortcuts.

## Honest status

Verified in this tree:

- 75 automated tests
- static frontend build
- 1,280,000-byte and 120,000-byte benchmarks
- runtime request-size guard tests
- independent SVG geometry checks from the original geometry audit

Not claimed:

- an authenticated live Rockstar save from this environment
- a compiled Windows Tauri installer from this environment
- Butteraugli / LPIPS / AI saliency / vector tracing / CUDA

## Credits

Flashback-GTA's Emblem Helper 1.1 demonstrated the core technique. See [`NOTICE.md`](NOTICE.md).

GTA, GTA Online, Social Club, and Rockstar are trademarks of their owners. This project is unofficial.

## License

[MIT](LICENSE)
