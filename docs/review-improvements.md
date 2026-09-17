# Review improvements (unreleased)

Baseline: `8c394f0` (v0.1.5 plus ZIP regression test).

## Scope and acceptance

Review codec/search, frontend/worker, native scaffold, tooling, and documentation. Change only demonstrated defects; preserve existing release assets and unrelated local changes. Run regression tests, integrity check, static build, server smoke, and extracted-package checks. Do not retag or replace published v0.1.5 assets.

## Packaging

- Fixed missing recursive traversal in the non-Windows `zip` invocation; the previous magic-byte check could pass for an archive missing application modules.
- Added an optional output-directory argument so automated tests package into a disposable directory rather than rewriting `release/`.
- Removed deletion of all previous portable versions during packaging.
- Expanded the archive check to extract the ZIP and byte-compare critical app files, verify SHA-256, and preserve a previous-version sentinel.
- Observed regression fail on ignored isolated output; observed pass after correction on Windows.

## Codec search

- `searchImage` now sorts caller-provided bit depths descending before the fit-based pruning, so unsorted input such as `[8,4,6]` no longer skips never-tried depths; the caller's array is not mutated.
- An empty `resolutions` list now reports invalid configuration instead of returning a silent empty search.
- Removed dead `regionPixel` from metrics; its half-cell gradient convention contradicted every live path.

## Server hardening

- Malformed percent-encoding (for example `/%ZZ`) crashed the local server via uncaught `URIError`; it now answers 400. Smoke coverage added and exercised.
- Regression test executes the real handler in a sandbox with a throwing decoder and asserts filesystem is never reached.

## Frontend

- Ctrl+Enter / Ctrl+O no longer fire while typing in inputs or the console textarea; Esc cancel still works everywhere.
- Cancel and worker-error now reset the progress bar and percentage.
- Reserve is clamped to the configured budget before search.
- Files with empty MIME type are accepted and decoded by `createImageBitmap`; picker accept list widened accordingly.
- Drop-zone copy now matches actual native-resolution behavior (cap 2048).

## Native scaffold

- Desktop CSP `connect-src` now includes `'self'` so the same-origin sample fetch is permitted in a packaged Tauri build; covered by a config test.
- Native build remains unverified: rustup has no configured default toolchain on this machine, and no global toolchain settings were changed. NSIS bundling, icons, and capabilities remain unexercised; `src-tauri` claims stay release-gated as documented.

## Worker

- Progress summaries now include artifact diagnostics (`artifactPenalty`, `transparentLeakage`, `directionalArtifact`) so live chips match the winner panel; regression test exercises the real worker handler.

## Validation

Windows: 81/81 tests, integrity/syntax check (38 modules), static build, server smoke, ZIP pack + CRC, diff check all passed after edits. ZIP content extraction checks pass. Linux packaging execution not verified in this review; native Rust build not run (no default toolchain).
