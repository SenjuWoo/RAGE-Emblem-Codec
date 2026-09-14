import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
