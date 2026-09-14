import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/version.js';
import { generateConsoleCode } from '../src/codec/console-code.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tauri = JSON.parse(fs.readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const cargo = fs.readFileSync(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('version surfaces stay in lockstep', () => {
  assert.equal(pkg.version, VERSION);
  assert.equal(tauri.version, VERSION);
  assert.match(cargo, new RegExp(`^version = "${VERSION}"`, 'm'));
  assert.match(generateConsoleCode({ svg: '<svg/>', layersJson: '[]' }), new RegExp(`RAGE Emblem Codec v${VERSION}`));
});

test('empty-state hidden rule beats display:grid', () => {
  assert.match(css, /\.empty-state\[hidden\]\s*\{\s*display:\s*none/);
});

test('encoded preview SVG is forced to fill the square stage', () => {
  assert.match(css, /#encodedSvg svg\s*\{/);
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /withPreviewViewBox\(best\.result\.svg\)/);
  assert.match(main, /paintReferencePreview/);
});

test('UI exposes transparency guard and artifact diagnostics', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(html, /id="alphaThreshold"/);
  assert.match(html, /id="alphaPad"/);
  assert.match(html, /id="artifactMetric"/);
  assert.match(main, /alphaThreshold:Number\(els\.alphaThreshold\.value\)/);
  assert.match(main, /artifactMetric/);
});

test('portable release archive is a real ZIP', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const zipName = `rage-emblem-codec-${VERSION}-portable.zip`;
  const run = spawnSync(process.execPath, ['tools/package-release.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const bytes = fs.readFileSync(`${root}release/${zipName}`);
  assert.equal(bytes.subarray(0, 4).toString('latin1'), 'PK\u0003\u0004', 'a tar named .zip would fail every user unzip');
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(fs.readFileSync(`${root}release/SHA256SUMS.txt`, 'utf8').trim(), `${sha}  ${zipName}`);
});
