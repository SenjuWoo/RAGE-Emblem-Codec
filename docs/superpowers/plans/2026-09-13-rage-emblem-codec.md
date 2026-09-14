# RAGE Emblem Codec v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a runnable local emblem codec lab with a strict-compatible strip encoder, adaptive tile encoder, byte-budget optimizer, Rockstar console-code export, and automated tests.

**Architecture:** Pure ES modules implement image models, gradient fitting, serialization, metrics and optimization. A Web Worker runs search off the UI thread. A dependency-free static frontend visualizes source/encoded output and exposes export controls. Tauri scaffolding documents the Windows packaging boundary without making native compilation a runtime requirement.

**Tech Stack:** JavaScript ES modules, Web Worker, Canvas/ImageData, SVG, Node built-in test runner, static HTML/CSS, Tauri 2 scaffolding.

**Spec:** `docs/superpowers/specs/2026-09-13-rage-emblem-codec-design.md`

## Global Constraints
- Default payload ceiling is exactly 1,280,000 bytes.
- Strict mode only emits known legacy-compatible SVG/layer primitives.
- No cloud dependency and no Rockstar credentials stored.
- CPU reference path must be deterministic and testable under Node.
- Generated console code must validate actual request-body bytes before POST.

---

### Task 1: Core math, color, gradient fitting, and payload accounting
**Files:** `src/codec/color.js`, `src/codec/gradient.js`, `src/codec/payload.js`, `tests/core.test.js`
**Produces:** deterministic RGBA distance/quantization, line simplification, base64/payload accounting.
- [ ] Write failing tests for quantization, linear-gradient collapse, hard-edge retention, and base64 byte accounting.
- [ ] Run tests and confirm missing-module failure.
- [ ] Implement minimal modules.
- [ ] Run tests to green.

### Task 2: Rockstar-compatible serializer and strip encoder
**Files:** `src/codec/model.js`, `src/codec/rockstar.js`, `src/codec/strip-encoder.js`, `tests/strip.test.js`
**Produces:** `encodeStrips(image, options)` returning SVG, layer JSON, reconstruction model and stats.
- [ ] Write failing tests for one-layer solid strips, spanning, transparent omission and deterministic layer schema.
- [ ] Run tests red.
- [ ] Implement serializer and strip encoder.
- [ ] Run tests green.

### Task 3: Adaptive tile encoder
**Files:** `src/codec/tile-encoder.js`, `tests/tile.test.js`
**Produces:** `encodeTiles(image, options)` with recursive solid/gradient/partition decisions.
- [ ] Write failing tests for solid collapse, transparent collapse and detail partitioning.
- [ ] Run tests red.
- [ ] Implement recursive model selection.
- [ ] Run tests green.

### Task 4: Reconstruction metric and constrained optimizer
**Files:** `src/codec/metrics.js`, `src/codec/optimizer.js`, `tests/optimizer.test.js`
**Produces:** perceptual proxy scoring, feasible-candidate ranking and Pareto frontier.
- [ ] Write failing tests for perfect-score identity, edge-weighting behavior, budget rejection and best-feasible selection.
- [ ] Run tests red.
- [ ] Implement metrics and search orchestration.
- [ ] Run tests green.

### Task 5: Rockstar console export
**Files:** `src/codec/console-code.js`, `tests/console.test.js`
**Produces:** browser console script with exact request-body byte guard.
- [ ] Write failing tests checking endpoint, anti-CSRF header, TextEncoder budget guard and redirect behavior.
- [ ] Run tests red.
- [ ] Implement code generator.
- [ ] Run tests green.

### Task 6: Worker and runnable codec-lab UI
**Files:** `index.html`, `src/styles.css`, `src/main.js`, `src/worker.js`, `tools/serve.mjs`
**Produces:** drag/drop workflow, search presets, previews, stats, logs and exports.
- [ ] Build thin UI around tested modules.
- [ ] Validate syntax and static-server startup.
- [ ] Exercise import/search/export manually with a generated PNG fixture.

### Task 7: Desktop packaging scaffold and documentation
**Files:** `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, `README.md`, `start.bat`
**Produces:** documented local run path and Tauri packaging boundary.
- [ ] Add Tauri 2 shell configuration pointing at the static app.
- [ ] Document current sandbox limitation: Rust packaging not compiled here.
- [ ] Run full Node test/check suite and package the source tree.
