# RAGE Emblem Codec v0.1.5

## Project summary

**RAGE Emblem Codec** is a local-first GTA Online crew-emblem optimizer designed to push image quality as close as possible to the Rockstar emblem editor's effective **1,280,000-byte request budget**.

It began as an attempt to modernize and improve **Emblem Helper 1.1 by Flashback-GTA**, but evolved into a substantially different codec and optimization system.

The original tool was extremely clever for its time: it converted raster images into Rockstar-compatible SVG gradients and layer data, allowing custom artwork to be recreated inside the GTA Online crew emblem system.

RAGE Emblem Codec keeps that compatibility concept while replacing much of the image-processing, compression, optimization, quality evaluation, scheduling, and export pipeline.

The primary objective is no longer:

> Convert this image into an emblem.

It is:

> Find the highest-quality Rockstar-compatible representation of this image that fits within the available byte budget.

---

# Why this project exists

Rockstar's crew emblem editor does not simply accept an arbitrary PNG or JPEG.

The image has to be represented using SVG data and Rockstar's emblem-layer JSON format, and the resulting save request has a practical size ceiling.

A normal image can therefore become dramatically larger once represented as hundreds of SVG gradient stops and emblem layers.

The original Emblem Helper solved this by scanning the source image in horizontal or vertical strips and encoding pixel color changes as SVG gradients.

RAGE approaches the same problem as a constrained image-compression problem.

Formally, the objective is approximately:

```text
maximize perceptual image quality

subject to:

final Rockstar request <= 1,280,000 bytes
```

Instead of using one fixed conversion strategy, RAGE generates multiple candidate representations and searches for the best feasible result.

---

# Original Emblem Helper 1.1

Flashback-GTA's Emblem Helper provided the foundation and proved that this method was possible.

Its major features included:

- Raster image import
- 64 × 64 source resolution
- 128 × 128 source resolution
- 256 × 256 source resolution
- 512 × 512 source resolution
- Optional image-resize smoothing
- Full-color mode
- Low-color mode
- Horizontal row encoding
- Vertical column encoding
- Automatic row-vs-column selection
- Adjustable decimal precision
- SVG gradient generation
- Transparent-pixel support
- Identical adjacent-strip spanning
- Rockstar-compatible layer JSON
- Base64 SVG/layer encoding
- Estimated request-size calculation
- Generated `/emblems/save` browser-console code

The original tool also explicitly mentioned several ideas that were never completed, including better detection of actual gradients in the source image.

RAGE takes that original concept considerably further.

---

# High-level comparison

| Capability | Emblem Helper 1.1 | RAGE v0.1.5 |
|---|---|---|
| Rows | Yes | Yes, upgraded |
| Columns | Yes | Yes, upgraded |
| Auto rows/columns | Yes | Yes, plus broader candidate search |
| Adaptive rectangular regions | No | **Yes** |
| True gradient simplification | Limited | **Yes** |
| Hard-edge preservation | Limited | **Yes** |
| RGB bit-depth search | No | **Yes** |
| Multiple resolution search | Manual | **Automatic** |
| Native-resolution candidate | No | **Yes** |
| Automatic precision search | No | **Yes** |
| Perceptual quality scoring | No | **Yes** |
| Edge-weighted quality | No | **Yes** |
| Pareto candidate tracking | No | **Yes** |
| Exact payload-aware optimization | Limited | **Yes** |
| Runtime request byte guard | No | **Yes** |
| Premultiplied-alpha resizing | No | **Yes** |
| Area-average downsampling | No | **Yes** |
| Background worker | No | **Yes** |
| Fast / Deep search | No | **Yes** |
| Complexity fuse | No | **Yes** |
| Benchmark harness | No | **Yes** |
| Automated regression tests | No | **75 tests** |
| Tauri desktop scaffold | No | **Yes** |

---

# 1. Constrained quality optimization

The largest conceptual change is that RAGE does not simply convert the image once.

It performs a **candidate search**.

Different combinations of:

- resolution
- color precision
- encoder family
- orientation
- SVG decimal precision
- gradient simplification settings
- region complexity

can produce dramatically different quality-to-byte ratios.

RAGE evaluates multiple representations and rejects any candidate exceeding the effective byte budget.

Among the valid candidates, the highest-scoring representation wins.

This turns emblem generation into a primitive form of **rate-distortion optimization**.

---

# 2. Automatic resolution search

The original helper asks the user to select:

```text
64
128
256
512
```

RAGE searches useful resolutions automatically.

It also fixed an important edge case discovered during the v0.1.1 audit.

If the imported artwork is, for example:

```text
200 × 200
```

the optimizer will consider the actual **200px native resolution**, rather than unnecessarily forcing the image down to the next preset such as 128.

This prevents avoidable information loss.

---

# 3. Encoder-aware RGB precision search

The old Full/Low color choice was effectively a coarse global switch.

RAGE can search different RGB precision levels instead.

The optimizer can determine whether reducing color precision saves enough SVG/request data to justify the perceptual loss.

This allows the codec to make decisions based on the actual image rather than assuming one color mode is appropriate for everything.

For example:

```text
8-bit RGB
7-bit RGB
6-bit RGB
...
```

can be evaluated as different candidate representations.

The winning bit depth depends on the image and available byte budget.

---

# 4. Upgraded strip encoder

RAGE retains horizontal and vertical strip encoding because it remains highly effective and is one of the safest paths for Rockstar compatibility.

However, the implementation is significantly different.

The modern strip encoder includes:

- smoother gradient fitting
- gradient-stop simplification
- hard-edge preservation
- near-identical strip spanning
- improved alpha processing
- improved geometry precision
- multiple RGB bit depths
- multiple resolution candidates
- automatic precision search

The original architecture remains recognizable, but strip generation now behaves much more like a real image codec.

---

# 5. Piecewise-linear gradient simplification

The original helper can require many SVG stops to reproduce color changes across a strip.

RAGE attempts to recognize regions that behave like actual smooth gradients.

Instead of storing every sampled color transition, a smooth ramp can be approximated using a much smaller number of gradient stops.

Conceptually:

```text
Original representation:

color 1
color 2
color 3
color 4
color 5
color 6
...
color 80
```

may become something closer to:

```text
start
intermediate
end
```

when the visual error remains sufficiently small.

This can dramatically reduce the number of bytes needed for smooth:

- lighting
- shading
- backgrounds
- glows
- shadows
- color ramps

---

# 6. Hard-edge protection

Aggressive gradient simplification is dangerous around:

- text
- logos
- outlines
- eyes
- small symbols
- transparency boundaries

A normal interpolated gradient can blur these boundaries.

RAGE therefore generates paired gradient stops around discontinuities so that sharp changes remain sharp.

This allows smooth areas to be simplified heavily without sacrificing high-contrast boundaries.

---

# 7. Correct gradient geometry

During the v0.1.1 audit, the gradient coordinate system was found to contain subtle alignment errors.

Pixel sample positions and SVG object-space gradient positions were not perfectly equivalent.

This could shift boundaries by fractions of a pixel.

The gradient system was rewritten so:

- sample centers
- hard-edge boundaries
- normalized SVG offsets
- internal quality evaluation

all operate in the same coordinate system.

The adaptive gradient fitter was also updated so the representation being evaluated is the representation actually exported.

---

# 8. Adaptive tile encoder

RAGE introduces an entirely new encoder family in addition to rows and columns.

Instead of always encoding an entire image as full-width or full-height strips, the adaptive encoder recursively analyzes rectangular regions.

A region can become:

```text
transparent
solid
horizontal gradient
vertical gradient
subdivided region
```

If a large region is uniform or simple, it can be represented by a single Rockstar rectangle.

If the region contains significant detail, it is recursively divided into smaller regions.

Conceptually:

```text
┌─────────────────────────────┐
│         flat sky            │
│                             │
├───────────────┬─────────────┤
│ simple region │ detail      │
│               ├──────┬──────┤
│               │detail│detail│
└───────────────┴──────┴──────┘
```

This means spatial complexity is no longer distributed uniformly across the entire image.

Flat portions of an emblem may cost almost nothing while detailed regions receive more layers.

---

# 9. Solid-region collapsing

A large rectangular area containing one color does not need dozens or hundreds of strip fragments.

The adaptive encoder can collapse such a region into a single rectangle.

Fully transparent regions can be omitted entirely.

Adjacent identical solid regions can subsequently be coalesced as well.

This is particularly effective for:

- clean logos
- flat-color illustrations
- transparent emblems
- icons
- geometric artwork
- simple backgrounds

---

# 10. Adaptive gradient regions

Adaptive regions are not limited to solid colors.

A rectangular region may also be represented by one horizontal or vertical gradient if the approximation error is sufficiently low.

This allows the codec to represent something such as a smooth shaded background using one region instead of many independent strips.

If neither a solid nor gradient approximation is acceptable, the region is split recursively.

---

# 11. Complexity fuse

Recursive partitioning can become pathological on:

- noisy images
- photographs
- dithering
- high-frequency texture

Without protection, an adaptive encoder could theoretically create an enormous number of tiny regions.

RAGE therefore includes a **complexity fuse**.

The adaptive encoder has explicit limits preventing candidate generation from becoming an uncontrolled region explosion.

This keeps Deep search aggressive without allowing a single pathological image to consume unlimited time or memory.

---

# 12. Premultiplied-alpha image processing

One of the more important fixes discovered during the v0.1.1 audit concerned transparency.

Normal RGB interpolation can create colored halos around transparent edges because fully transparent pixels may still contain arbitrary RGB values.

RAGE resampling uses **premultiplied alpha**.

Instead of interpolating RGB independently from transparency, color is weighted by alpha during resampling.

This dramatically reduces edge contamination around:

- transparent logos
- hair
- antialiased outlines
- transparent PNG artwork

Fully transparent RGB values are also sanitized so invisible color information does not influence quality scoring or consume compression budget.

---

# 13. Proper area-average downsampling

Large images should not simply be sampled at sparse points when reduced in size.

RAGE uses area-based averaging while shrinking images.

This improves:

- anti-aliasing
- thin-line preservation
- texture stability
- logo-edge quality
- high-frequency artwork

and avoids some of the aliasing that simpler resize methods can introduce.

---

# 14. Real smoothing control

An earlier version of the RAGE UI accidentally performed preprocessing that effectively introduced smoothing before the user-configured setting was applied.

This was removed during the audit.

**Smoothing Off now genuinely remains unsmoothed**, which is important for:

- pixel art
- hard-edged logos
- retro graphics
- intentionally aliased artwork

---

# 15. Perceptual quality scoring

The old helper's primary optimization metric was encoded request size.

RAGE also evaluates **reconstruction quality**.

Every candidate receives a quality score relative to the source.

The current v0.1.5 scorer is an edge-weighted, alpha-aware perceptual proxy with explicit transparent-leakage and directional-artifact penalties rather than a simple raw-RGB mean squared error.

High-frequency edges receive more importance because small distortions around text and outlines are usually more noticeable than small errors inside flat areas.

A score of:

```text
100
```

represents an exact reconstruction under the current metric.

---

# 16. Alpha-aware quality metric

Another audit finding was that invisible RGB values inside transparent pixels could incorrectly affect the quality metric.

The scorer now evaluates using **premultiplied linear RGB plus alpha**.

This means the optimizer does not waste effort reproducing color values that cannot actually be seen.

---

# 17. Pareto frontier tracking

RAGE records non-dominated candidate solutions.

A candidate is considered dominated if another candidate is:

```text
higher quality AND smaller
```

or otherwise strictly better in both important dimensions.

The remaining candidates form a simple **Pareto frontier** of quality versus payload size.

This provides useful visibility into the codec's trade-offs.

Conceptually:

```text
Quality
100 |                   ●
 99 |              ●
 98 |         ●
 95 |    ●
    +-------------------------
       Payload size
```

---

# 18. Byte-budget optimization

The objective is not necessarily to produce the smallest emblem.

If the budget is:

```text
1,280,000 bytes
```

and an image currently uses:

```text
500,000 bytes
```

then hundreds of kilobytes remain available for improving fidelity.

RAGE intentionally uses available budget when doing so produces better image quality.

This is an important distinction.

The goal is:

```text
maximum quality below the ceiling
```

not:

```text
minimum possible file size
```

---

# 19. Exact request-size accounting

The original helper estimated encoded size based mainly on SVG and layer data.

RAGE performs more complete accounting of the data that will actually be sent.

This includes:

- serialized SVG
- layer JSON
- Base64 expansion
- request structure
- effective byte budget
- configurable safety reserve

Candidate validity is determined using the same serialization logic used for export.

---

# 20. Runtime Rockstar request guard

RAGE does not rely solely on the optimizer's internal estimate.

The generated Rockstar console code performs a second verification inside the actual Social Club emblem page.

Immediately before sending `/emblems/save`, the generated code:

1. reads the current editor verification token;
2. reads the current editor hash;
3. creates the real JSON request body;
4. measures it using `TextEncoder`;
5. compares that size with the configured maximum;
6. aborts if the request is too large;
7. only then sends the request.

This creates two layers of size protection:

```text
optimizer validation
+
runtime request validation
```

---

# 21. Hardened Rockstar export behavior

The Rockstar console-code generator is tested at execution level.

Tests verify that generated code:

- refuses oversized requests;
- creates no XHR when oversized;
- produces the expected request body;
- sends the expected request headers;
- uses the live verification token;
- uses the live editor hash;
- handles Rockstar response status values defensively.

This is considerably stronger than merely checking generated JavaScript using regular expressions.

---

# 22. Automatic SVG precision search

The original helper offered:

```text
3 decimals
4 decimals
5 decimals
```

as a manual setting.

RAGE can search precision automatically.

The preferred order is:

```text
5
→ 4
→ 3
```

Higher precision is attempted first because it more accurately reproduces geometry.

Lower precision is used when its byte savings are useful for remaining under budget.

---

# 23. Independent transform-scale precision

A serious issue discovered during the audit concerned one-pixel strip rendering.

At 512 rows, a vertical transform scale is approximately:

```text
0.003333...
```

Rounding that value to three decimals produces:

```text
0.003
```

That small error accumulates into under-coverage.

Independent CairoSVG testing showed that an all-white 512-strip emblem using insufficient transform precision could render at only approximately:

```text
221 / 255 alpha
```

rather than fully opaque.

RAGE therefore retains at least five decimal places for critical transform scale values even when other SVG geometry uses lower precision.

The corrected 512-row test renders:

```text
255 / 255 alpha
```

with no strip-thinning artifact.

---

# 24. Serialization-normalized scoring

A codec should evaluate what it actually writes, not an idealized internal model.

During the audit, RAGE was modified so quality evaluation reflects values after serialization-related normalization and precision changes.

This prevents situations where:

```text
internal model = 100/100
```

but:

```text
serialized SVG < 100/100
```

because offsets or geometry were rounded during export.

---

# 24.1. Segmented transparency and artifact guard (v0.1.5)

Transparent artwork is no longer encoded as a full-width/full-height strip merely because one pixel in that strip is visible. RAGE now detects contiguous alpha-supported runs, pads each run by one sample by default to retain antialiasing, and emits separate SVG regions. Large transparent gaps therefore have **no SVG path at all** instead of relying on long gradients to remain perfectly transparent.

The default Transparency Guard ignores isolated alpha values at or below 8/255 when discovering visible support. Adaptive tiles use the same threshold for fully transparent-region decisions.

The quality metric also exposes two artifact diagnostics in addition to its normal reconstruction error:

- **transparent leakage** — visible energy invented where the source is transparent;
- **directional artifact** — coherent signed residuals aligned into horizontal or vertical streaks.

These terms are included in candidate quality, so the optimizer rejects the vertical-melt / gray-needle failure mode based on what it actually renders rather than by applying a blanket tax to the column encoder.

---

# 24.2. Structural scanline guard (v0.1.5)

The segmented-alpha work removed paths across empty background, but detailed artwork exposed a second failure mode: a row or column containing real content could still be approximated by one long high-tolerance gradient, and neighboring gradient strips could be approximately merged. That produced horizontal or vertical "melting" even when no transparency leak existed.

v0.1.5 adds a separate structural reconstruction cap that is independent of the compression tolerance. A candidate may ask for aggressive gradient simplification, but if the resulting gradient exceeds the hard visible-error ceiling, the strip is recursively split at the worst-fitting sample and each local piece is fit independently. This keeps gradients cheap where the source is genuinely smooth while preventing a long scanline from painting through faces, hair, text, chains, armor, or similar non-gradient structure.

Gradient strips now merge across neighboring rows/columns only when their serialized stop profiles are exactly identical. Approximate merging is retained only as a tiny last-resort allowance for nearly identical solid fills. Auto also removes merge tolerances above 2 and demotes High/severe artifact candidates as a class before comparing quality.

The scheduler performs a targeted adaptive-tile probe before aggressive strip fallbacks so a clean 2D representation can compete without forcing Fast mode through the entire expensive tile search space. Deep mode still performs the exhaustive tile sweep.

---

# 25. Fast search mode

Fast mode searches the highest-value candidate space while attempting to remain practical for normal usage.

Its current artifact-aware near-lossless target is:

```text
99.95 / 100
```

Once a fitting candidate reaches that level, Fast mode can terminate because further candidate evaluation is unlikely to produce meaningful visible improvement.

This prevents simple logos and gradients from wasting time after they are already reconstructed essentially perfectly.

---

# 26. Deep search mode

Deep mode removes the Fast quality target.

It keeps exploring the configured candidate space until:

- an exact reconstruction is found;
- the candidate space is exhausted;
- or the candidate cap is reached.

Deep mode is intended for users willing to spend substantially more computation for extremely small potential improvements.

Detailed 256–512px artwork can take considerably longer.

---

# 27. Fair candidate scheduling

An earlier search implementation could spend too much of its candidate budget exploring variations of a lower resolution before ever testing higher-resolution possibilities.

The scheduler was changed so candidate search proceeds more fairly across resolutions and strategies.

This prevents one candidate family from monopolizing the search.

---

# 28. Staged strip / tile scheduling

Search is staged instead of exhausting one encoder family in isolation. RAGE first tries the clean, low-tolerance strip levels, then runs a small adaptive-tile probe before the high-compression strip fallbacks. This ensures a 2D representation can compete before a risky 1D fallback consumes the remaining budget.

Fast/custom search keeps the probe intentionally small (useful tile tolerances, one non-redundant tile size, resolutions up to 256) so the UI stays responsive. Deep mode retains the exhaustive tile sweep after the strip fallbacks for users who explicitly choose maximum search depth.

---

# 29. Native image resolution preservation

Preset resolution search alone can accidentally undersample images whose dimensions lie between standard levels.

RAGE explicitly includes the effective native source resolution when useful.

Example:

```text
source: 200 × 200

candidate set can include:
64
128
200
256
...
```

rather than jumping directly from 128 to 256 or forcing the image down to 128.

---

# 30. Search-resolution optimization

Quality evaluation does not blindly render everything at 512 × 512.

When the source image contains less native information, evaluation can occur at the effective native resolution.

A 128 × 128 source does not magically acquire new information merely because it is enlarged to 512 × 512.

This substantially reduces unnecessary quality-analysis work.

---

# 31. Proof-based early termination

If the codec finds a representation with mathematically zero distortion under the normalized quality model while remaining under budget, no candidate can produce a better result.

RAGE can therefore terminate immediately.

This is particularly useful for:

- flat-color logos
- simple gradients
- geometric artwork

that can be represented exactly.

---

# 32. Web Worker optimization

The original Emblem Helper performs image conversion directly in the page.

RAGE moves the expensive search into a Web Worker.

This prevents candidate evaluation from unnecessarily freezing the interface.

The UI and codec engine therefore remain logically separated.

---

# 33. Local-first design

RAGE performs the codec work locally.

Imported artwork does not need to be uploaded to a third-party optimization service.

The application handles:

- image analysis
- resampling
- candidate generation
- SVG creation
- quality evaluation
- payload calculation

locally.

---

# 34. Portable browser build

The project currently includes a dependency-light local web version.

On Windows:

```text
start.bat
```

launches the local server.

The frontend can also be started using:

```bash
npm run serve
```

Node.js 20 or newer is currently recommended.

---

# 35. Tauri 2 desktop architecture

The project is structured so the frontend can become a native Windows desktop application using **Tauri 2**.

The current source includes:

```text
src-tauri/
```

and the required Tauri scaffold.

The v0.1.1 sandbox did not contain Rust/Cargo, so no fabricated `.exe` is distributed or claimed.

A Windows development machine with the Rust toolchain can build the desktop version.

---

# 36. NSIS Windows packaging

The desktop configuration targets **NSIS** rather than requesting every available Windows bundle format.

This avoids unnecessarily pulling in the MSI/VBSCRIPT packaging route and keeps the Windows packaging requirements narrower.

---

# 37. Modular codec architecture

The project is intentionally separated into focused modules.

```text
src/codec/
```

contains the core codec/search logic.

```text
src/worker.js
```

handles off-thread optimization.

```text
src/main.js
```

acts as the browser/Tauri UI adapter.

```text
tests/
```

contains deterministic automated tests.

```text
tools/
```

contains the static server, builder and benchmark tooling.

```text
src-tauri/
```

contains the desktop shell.

The codec is therefore not tightly coupled to the current interface.

---

# 38. Benchmark harness

RAGE contains a deterministic benchmark comparing the modern optimizer against an Emblem Helper-style strip baseline.

Run:

```bash
npm run benchmark
```

The default benchmark uses:

```text
256px synthetic reference image
1,280,000-byte budget
99.95 modern quality target
```

The parameters can be changed using:

```text
SIZE
BUDGET
QUALITY_TARGET
```

environment variables.

---

# Audited benchmark results

These benchmarks use deterministic synthetic artwork.

They are not a claim that every possible emblem will achieve the same improvement.

Quality is measured using the current RAGE edge-weighted perceptual proxy.

## Full Rockstar budget

Budget:

```text
1,280,000 bytes
```

### Legacy-style result

```text
Quality:      98.4486761
Payload:      536,060 bytes
Resolution:   256
RGB:          4-bit
Orientation:  rows
Layers:       207
```

### RAGE v0.1.5 result

```text
Quality:      99.9537653
Payload:      532,424 bytes
Resolution:   256
RGB:          8-bit
Encoder:      optimized rows
Layers:       217
Variant:      p5-g1-m0
```

### Difference

```text
Quality improvement:
+1.50509 points

Payload difference vs legacy:
-3,636 bytes
```

Under the stricter artifact-aware scorer, the modern search reaches its 99.95 Fast target while remaining slightly smaller than the legacy-style baseline.

---

# Constrained benchmark

Budget:

```text
120,000 bytes
```

### Legacy-style result

```text
Quality:      50.4057668
Payload:      116,928 bytes
Resolution:   32
RGB:          8-bit
Orientation:  columns
Layers:       31
```

### RAGE v0.1.5 result

```text
Quality:      52.0602544
Payload:      80,608 bytes
Resolution:   32
RGB:          8-bit
Encoder:      optimized columns
Layers:       31
Variant:      p3-g0-m0
```

In this constrained scenario RAGE was simultaneously:

```text
higher quality
AND
36,320 bytes smaller
```

than the legacy-style result.

---

# 39. Independent SVG rendering validation

Independent SVG rendering validation introduced during the v0.1.1 audit remains part of the v0.1.5 release discipline rather than trusting only the codec's own reconstruction model.

Tests included:

## 512-strip opacity test

Expected:

```text
fully opaque white
```

Result:

```text
255 / 255 alpha
```

The transform-scale seam issue discovered during development is therefore fixed.

## Adaptive logo test

The independently rendered SVG matched the codec's expected render model:

```text
pixel-for-pixel
```

## Smooth gradient test

Differences were limited to ordinary renderer rounding of at most approximately:

```text
±1 RGB channel value
```

---

# 40. Automated testing

The audited v0.1.5 release currently contains:

```text
71 passing tests
```

The final release process included verification from a **fresh extraction of the generated ZIP**, not only from the development working directory.

This catches packaging mistakes such as:

- missing source files
- missing configuration
- files accidentally excluded from the release
- builds relying on unshipped artifacts

---

# Strict Rockstar compatibility mode

RAGE v0.1.5 intentionally remains conservative regarding the SVG features sent to Rockstar.

Strict mode currently uses known-compatible concepts such as:

- the legacy rectangle slug
- transformed SVG paths
- linear gradients
- the established emblem layer JSON schema

Potentially smaller SVG constructs are deliberately **not enabled yet**, including unverified techniques such as:

```text
<use>
arbitrary SVG primitives
shared CSS
radial gradients
parser-specific shortcuts
```

These could produce significant additional compression, but they should only be enabled after testing against the live Rockstar editor.

Compatibility is more important than shaving bytes using an unsupported trick.

---

# What RAGE does NOT claim yet

The following should not be advertised as completed functionality.

They are future engineering targets.

## Butteraugli

A stronger psychovisual quality metric designed specifically around visible image differences.

Current RAGE uses its own edge-weighted perceptual proxy.

## LPIPS

Optional learned perceptual similarity scoring.

Not currently part of v0.1.5.

## AI saliency

Automatic detection of semantically important image regions such as:

- faces
- eyes
- text
- logos
- subjects

Not implemented yet.

## Manual importance masks

User-painted regions that receive a larger share of the byte budget.

Planned, not implemented.

## True vector tracing

Potential integration with a vector tracer such as VTracer.

Not implemented yet.

## Hybrid vector/raster encoding

Combining:

```text
vector regions
+
gradient regions
+
adaptive raster-like regions
```

inside one emblem.

The architecture supports future work in this direction, but v0.1.5 does not yet include a general vector-tracing encoder.

## CUDA acceleration

No CUDA kernels are currently required or shipped.

GPU acceleration is a future optimization.

## wgpu compute

Also planned, not currently required.

## Neural optimization

AI is not currently required for emblem generation.

Future AI components should act primarily as quality/saliency assistants rather than redrawing the source artwork.

---

# Future codec roadmap

The most interesting next-generation work includes:

### Region-level rate-distortion allocation

Instead of simply choosing one global candidate, allow different portions of the image to receive different quality budgets.

A detailed face may receive more bytes than an empty background.

### Byte reclamation

After obtaining a valid representation, repeatedly ask:

```text
Which possible local upgrade gives the largest visible improvement per additional byte?
```

Apply that upgrade and repeat until the remaining budget is exhausted.

### Better perceptual metrics

Potential combination of:

```text
Butteraugli
edge fidelity
alpha fidelity
color fidelity
optional LPIPS
```

### Vector tracing

Convert appropriate artwork into real vector geometry rather than simulated raster strips.

Particularly promising for:

- logos
- symbols
- anime/cartoon artwork
- flat illustrations
- text-like graphics

### Hybrid encoding

Allow one emblem to contain:

```text
solid vectors
true gradients
adaptive tiles
high-detail strips
```

depending on which representation is cheapest for each region.

### Importance maps

Automatic or manual masks could instruct the optimizer to protect specific portions of the image.

Example:

```text
background     1× importance
hair           2×
face           4×
eyes           8×
logo text     10×
```

### GPU search

wgpu and/or CUDA could evaluate significantly more candidates in parallel.

The GPU should accelerate the search rather than define the format.

The codec must remain capable of producing equivalent results on non-NVIDIA hardware.

### Rockstar parser research

Experimentally determine whether the live editor accepts more efficient SVG constructs.

Potential research targets include:

```text
<use>
shared path definitions
shorter path representations
shared gradients
alternative primitives
more aggressive numeric syntax
```

Every optimization should be tested against the actual Rockstar editor before entering Strict mode.

---

# Design philosophy

RAGE is built around several principles.

## Quality first

Unused byte budget has no value if spending it can produce a visibly better emblem.

## Compatibility first

A theoretically brilliant SVG optimization is worthless if Rockstar rejects it.

## Measure instead of guess

Every encoding decision should eventually be evaluated using:

```text
actual byte cost
+
actual visual distortion
```

## AI is optional

AI should help identify important visual information, not hallucinate or redraw user artwork.

## GPU is acceleration

CUDA should make searches faster.

It should not be necessary for basic codec correctness.

## Determinism matters

Given the same input and settings, codec behavior should be reproducible and testable.

---

# Suggested GitHub description

> High-quality GTA Online crew emblem optimizer that searches Rockstar-compatible SVG/layer encodings to maximize visual fidelity under the 1,280,000-byte request budget.

---

# Suggested short tagline

> **Push GTA Online crew emblems to the byte limit.**

Alternative:

> **Maximum emblem quality. Every usable byte.**

Alternative:

> **A rate-distortion codec for Rockstar crew emblems.**

---

# Suggested repository topics

```text
gta5
gta-online
rockstar-games
crew-emblem
emblem-generator
svg
image-compression
image-optimization
tauri
javascript
typescript
image-processing
codec
rate-distortion
```

---

# Suggested feature summary for the top of the README

- 🚀 Automatic maximum-quality search
- 🎯 Strict 1,280,000-byte optimization target
- 🧬 Upgraded row/column encoding
- 🧩 Adaptive rectangular tile encoder
- 🌈 Real gradient simplification
- ✒️ Hard-edge protection for logos and text
- 🫥 Premultiplied-alpha transparency handling
- 🔬 Perceptual quality scoring
- 📈 Pareto quality/payload analysis
- ⚙️ Fast and Deep optimization modes
- 🛡️ Runtime Rockstar request-size guard
- 🧪 48-test audited codec core
- 🖥️ Tauri 2 desktop-ready architecture
- 🔒 Local-first image processing

---

# Credits / origin

RAGE Emblem Codec would not exist without the original work by **Flashback-GTA**.

Emblem Helper 1.1 demonstrated the core technique of recreating raster artwork using Rockstar-compatible SVG gradients and emblem layers and provided the compatibility foundation that inspired the strict encoder path in this project.

RAGE is not merely a visual redesign of that application.

Its modern codec/search architecture introduces separate optimization strategies, adaptive rectangular encoding, quality-aware candidate evaluation, safer serialization, improved resampling, automatic precision and color search, exact byte-budget handling, and extensive automated validation.

The project should therefore preserve clear credit to the original technique while documenting the substantial engineering changes made on top of it.

---

# Current release status

## v0.1.5

Current audited baseline.

Verified:

```text
75 / 75 automated tests passing
static frontend build passing
real 1,280,000-byte benchmark passing
120,000-byte constrained benchmark passing
fresh-ZIP extraction verification passing
independent SVG rendering checks passing
runtime request-size guard tested
```

Not independently certified yet:

```text
authenticated live Rockstar save using the developer's account
compiled Windows Tauri executable from this build environment
```

The portable local application and complete Tauri project source are included.

---

# One-sentence technical summary

**RAGE Emblem Codec converts raster artwork into Rockstar-compatible SVG/layer data using competing strip and adaptive-region encoders, then performs perceptual constrained search to select the highest-quality representation that fits inside the available emblem request budget.**