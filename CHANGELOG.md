# Changelog

## 0.1.2 — 2026-09-14

### App

- Encoded preview now injects `viewBox="0 0 512 512"` so the 512 SVG scales to the card instead of cropping or sitting at 1 CSS pixel per user unit
- Original pane paints the same 512×512 letterboxed reference the codec scores against (`resizeFitImage`), so the two panes share framing
- Advanced **Strip direction** can lock search to rows or columns (Emblem Helper-style). Auto still tries both.

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
