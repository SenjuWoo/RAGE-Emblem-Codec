# Changelog

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
