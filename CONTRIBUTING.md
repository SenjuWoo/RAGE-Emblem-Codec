# Contributing

## Requirements

- Node.js 20 or newer
- npm 10 or newer

Rust is only required if you are building the optional Tauri 2 desktop shell.

## Setup

```powershell
npm install
npm run check
npm test
npm run serve
```

Open `http://127.0.0.1:4173`. Do not open `index.html` as a `file://` page; the sample emblem and worker modules need the local server.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm test` | Codec + version/UI regression tests |
| `npm run check` | Version sync + `node --check` on source |
| `npm run build` | Copy the static frontend to `dist/` |
| `npm run benchmark` | Compare the optimizer with a legacy-style baseline |
| `npm run package` | Build the portable ZIP and `SHA256SUMS.txt` |
| `npm run smoke` | Boot the static server and fetch the app |

## Pull requests

- Keep codec changes covered by a failing-then-passing test when behavior changes.
- Do not enable unverified Rockstar SVG shortcuts (`<use>`, radial gradients, shared CSS) in Strict mode.
- Do not add runtime dependencies without a strong reason. The portable web app is meant to run with Node's standard library.
- After UI changes, confirm empty states actually hide once an image is loaded. `.empty-state { display: grid }` must not override `[hidden]`.
