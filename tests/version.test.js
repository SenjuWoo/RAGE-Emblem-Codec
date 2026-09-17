import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
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

test('desktop CSP permits the same-origin sample image fetch', () => {
  const connect = tauri.app.security.csp.split(';').map(s => s.trim()).find(s => s.startsWith('connect-src '));
  assert.ok(connect.split(/\s+/).includes("'self'"));
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

test('portable ZIP contains the app and preserves previous releases', t => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rage-package-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const previous = path.join(out, 'rage-emblem-codec-previous-portable.zip');
  fs.writeFileSync(previous, 'previous release');
  const zipName = `rage-emblem-codec-${VERSION}-portable.zip`;
  const run = spawnSync(process.execPath, ['tools/package-release.mjs', out], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const zipPath = path.join(out, zipName);
  assert.ok(fs.existsSync(zipPath), 'packager must use the isolated output directory');
  const bytes = fs.readFileSync(zipPath);
  assert.equal(bytes.subarray(0, 4).toString('latin1'), 'PK\u0003\u0004');
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(fs.readFileSync(path.join(out, 'SHA256SUMS.txt'), 'utf8').trim(), `${sha}  ${zipName}`);
  assert.equal(fs.readFileSync(previous, 'utf8'), 'previous release');
  const extracted = path.join(out, 'extracted');
  fs.mkdirSync(extracted);
  const unpack = process.platform === 'win32'
    ? spawnSync(path.join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-xf', zipPath, '-C', extracted], { encoding: 'utf8' })
    : spawnSync('unzip', ['-q', zipPath, '-d', extracted], { encoding: 'utf8' });
  assert.equal(unpack.status, 0, unpack.error?.message || unpack.stderr);
  for (const rel of ['index.html', 'start.bat', 'src/main.js', 'src/worker.js', 'src/codec/search.js', 'src/codec/gradient.js', 'assets/sample-crew-emblem.png', 'tools/serve.mjs']) {
    assert.deepEqual(fs.readFileSync(path.join(extracted, rel)), fs.readFileSync(path.join(root, rel)), rel);
  }
});
