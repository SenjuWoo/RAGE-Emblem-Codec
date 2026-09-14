# Changelog

## 0.1.5 — 2026-09-14

### Codec

- Added a hard **structural gradient error cap**. High compression tolerances can no longer smear complex faces, hair, text, or armor across an entire scanline; non-gradient structure is split into local segments automatically.
- Removed approximate merging for gradient strips. Neighboring gradients only span together when their serialized profiles are exactly identical.
- Capped approximate solid merging to a tiny tolerance and removed the dangerous `m3+` Auto levels that produced broad horizontal/vertical bands.
- Auto winner ranking now demotes **High / severe artifact** candidates as a class instead of allowing a slightly higher scalar quality score to hide visible scanline tearing.
- Search runs a targeted adaptive-tile probe before aggressive strip compression, while Deep keeps the exhaustive tile sweep.
- Fast/custom tile probes use a smaller non-redundant tile-size set to avoid needless repeated work.

### Regression fixes

- Fixed the horizontal counterpart of the old vertical-melt failure (`strips-rows / g28 / m6`) seen on detailed character emblems.
- Added regression coverage for low-contrast non-gradient structure, unsafe gradient-row merging, artifact-aware winner selection, and tile-vs-aggressive-strip scheduling.
- Screenshot-derived local regression testing now selects the clean lower-resolution candidate instead of the higher-resolution scanline-melt candidate under the same 1,280,000-byte ceiling.

### Tests / release

- 75 automated tests.
- Version surfaces, portable packaging, benchmark docs, and release notes updated for v0.1.5.

## 0.1.4 — 2026-09-14

### Codec

- Reworked strip encoding around **segmented alpha runs**. Transparent gaps are omitted from the SVG instead of being represented by full-height/full-width gradient paths.
- Added a configurable **Transparency Guard** (default 8/255 alpha) with one-pixel soft-edge padding. Isolated low-alpha noise can no longer grow into long Social Club background needles.
- Adaptive tiles now treat sub-threshold alpha-only regions as transparent too.
- Added artifact-aware quality diagnostics: transparent-background leakage and directional residual streaking are penalized in addition to reconstruction error.
- Removed the old blanket column-encoder tax. Clean columns can win; only measured artifacts are penalized.
- Fast search target is now 99.95 under the stricter artifact-aware metric. Deep remains untargeted.

### App

- Advanced controls expose Transparency Guard and Soft-edge Padding.
- Winner panel now reports an **Artifact Guard** status, and candidate chips warn when a candidate carries a material artifact penalty.
- Downloaded reports include base quality, artifact penalty, transparent leakage, directional artifact score, and effective MSE.

### Tests / release

- 71 automated tests, including regressions for disconnected alpha islands, soft-edge padding, low-alpha tile noise, transparent leakage, directional streak detection, and clean-column selection.
- Release benchmark updated to the v0.1.4 artifact-aware scorer and a practical 99.95 Fast target.

## 0.1.3 — 2026-09-14

### Codec

- Fast search no longer sweeps 4-bit RGB. Once an 8-bit candidate fits, lower bit depths are not searched.
- Winner ranking penalizes posterized bit depths and column scanlines, so a 4-bit column encode cannot beat a slightly lower-scoring 8-bit row encode.
- Sample emblem Fast search now wins **512×512 8-bit rows** (`p3-g18-m2`, quality 99.72) instead of 4-bit columns
- Strip search tries merge-2 at high gradient tolerance before merge-3 so adjacent-row tearing is a last resort

### Tests

- 62 automated tests

## 0.1.2 — 2026-09-14

### App

- Encoded preview now injects `viewBox="0 0 512 512"` so the 512 SVG scales to the card instead of cropping or sitting at 1 CSS pixel per user unit
- Original pane paints the same 512×512 letterboxed reference the codec scores against (`resizeFitImage`), so the two panes share framing
- Advanced **Strip direction** can lock search to rows or columns (Emblem Helper-style). Auto still tries both.
- Recaptured README hero / empty / mobile screenshots at v0.1.2
- Live demo URL is `https://senjuwoo.github.io/RAGE-Emblem-Codec/` after the GitHub transfer

### Tests

- Preview scaling helper, strip-orientation lock, and regression coverage that the Rockstar payload SVG is unchanged (no extra root attributes)
- 58 automated tests

## 0.1.1 — 2026-09-13

First public GitHub release of the audited codec.

### Codec

- Candidate search across resolution, RGB bit depth, strip and adaptive-tile encoders, and SVG precision
- Piecewise-linear gradient simplification with paired hard-edge stops
- Premultiplied-alpha resampling and area-average downsampling
- Edge-weighted perceptual quality scoring
- Exact payload accounting plus a runtime Rockstar request-size guard
- Fast (near-lossless 99.995 target) and Deep search modes
- 50 automated tests (48 codec tests plus version / empty-state guards)

### App

- Local-first web UI with Web Worker search
- Sample emblem, keyboard shortcuts, and a visible error toast
- Empty-state overlay no longer sits on top of loaded previews
- Skipped adaptive-tile candidates no longer crash the progress UI
- Tauri 2 desktop scaffold with a restrictive CSP (Windows NSIS target; no fabricated `.exe` is shipped)

### Project

- MIT license, security policy, CI, Dependabot, and CodeQL-ready layout
- Portable ZIP release asset with SHA-256 checksums
