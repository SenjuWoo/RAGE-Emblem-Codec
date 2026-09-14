# RAGE Emblem Codec v0.1 Design

## Goal
Build a local-first GTA Online crew emblem optimizer that maximizes perceptual image quality while keeping Rockstar-compatible emblem payload data below a configurable default budget of 1,280,000 bytes.

## Product shape
Windows-first desktop architecture with a browser-runnable frontend and a codec core that is independent of the UI. The frontend is runnable without a build tool today and is compatible with later Tauri packaging. A native Rust/CUDA backend is an acceleration path, not a correctness dependency.

## Compatibility baseline
Strict mode uses the same known-compatible Rockstar rectangle slug and layer schema as Emblem Helper 1.1:
- slug: `rectangles/21`
- slug path: `M0,0H66.437V300H0V148.125C0,148.125,0.04,147.744,0,147.625C-0.063,147.437,0,147.062,0,147.062V0Z`
- 512x512 emblem coordinate space
- SVG gradients and transformed rectangle paths
- base64 `svgData` and `layerData`
- `/emblems/save` console request flow

The application never silently emits an experimental SVG construct in Strict mode.

## Codec architecture
Two compatible encoders compete:

1. **Strip encoder**
   - Horizontal or vertical strips.
   - Adjacent equivalent strips span into one layer.
   - Piecewise-linear RGBA simplification reduces gradient stops.
   - Hard-edge preservation can insert paired stops at discontinuities.
   - Encoder-aware RGB quantization and near-identical strip merging are tunable.

2. **Adaptive tile encoder**
   - Recursively partitions the image.
   - Transparent regions emit no layer.
   - Flat regions emit one solid rectangle.
   - Low-error horizontal/vertical gradient regions emit one gradient rectangle.
   - Complex regions split until the configured minimum tile size.
   - Uses the same known rectangle slug/layer schema as the strip encoder.

## Optimizer
Auto Max Quality evaluates a bounded search space of resolution, RGB quantization, gradient tolerance, edge preservation, strip merge tolerance, precision, orientation, and encoder family. It measures the exact generated base64 data length and uses a configurable reserve so the generated browser-side request can validate the final body before POST.

Candidates over budget are rejected. Feasible candidates are ranked primarily by perceptual proxy score and secondarily by payload utilization. The search reports a Pareto set for quality/bytes inspection.

## Quality metric
v0.1 uses a deterministic perceptual proxy designed for fast local search:
- linear-light luma-weighted RGB error
- alpha error
- source-edge-weighted error so text/outline boundaries matter more
- multi-scale sampling for gameplay-sized fidelity

The interface is intentionally isolated so Butteraugli/LPIPS/ONNX can replace or supplement the proxy later without changing encoders.

## Exact budget behavior
The app reports:
- raw SVG bytes
- layer JSON bytes
- base64 emblem data bytes
- estimated request-body bytes
- configured ceiling and reserve

Generated console code reconstructs the actual request body on the Rockstar page and measures it with `TextEncoder` before sending. It aborts locally if the true body exceeds the configured ceiling.

## UI
One-screen codec lab:
- drag/drop and file picker
- original preview and encoded SVG preview
- Auto Max Quality as the primary action
- Fast / Deep search presets
- budget and reserve controls
- advanced controls for encoder family and search dimensions
- live progress and candidate log
- quality, byte use, layer count, dimensions, encoder, orientation, palette and tolerance summary
- Generate Code / Copy Code / Download SVG / Download report

No account credentials are requested or stored.

## Native acceleration boundary
A future Tauri command surface may expose candidate generation and metrics from Rust, wgpu, CUDA or ONNX. The browser worker remains a reference implementation and fallback. Native acceleration must preserve deterministic serialization and compatibility tests.

## Testing
Pure codec modules are covered by Node tests using synthetic RGBA images. Browser-only behavior is kept in thin UI adapters. Golden tests verify known layer schema, SVG structure, budget rejection, deterministic candidate ordering, simplification behavior and adaptive region collapse.
