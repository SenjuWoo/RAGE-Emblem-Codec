import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/version.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const tauri = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const cargo = fs.readFileSync(path.join(root, 'src-tauri', 'Cargo.toml'), 'utf8');
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

const mismatches = [];
if (pkg.version !== VERSION) mismatches.push(`package.json ${pkg.version} != src/version.js ${VERSION}`);
if (tauri.version !== VERSION) mismatches.push(`tauri.conf.json ${tauri.version} != ${VERSION}`);
if (cargoVersion !== VERSION) mismatches.push(`Cargo.toml ${cargoVersion} != ${VERSION}`);
if (!html.includes(`RAGE Emblem Codec`)) mismatches.push('index.html missing product name');
if (!css.includes('.empty-state[hidden]')) mismatches.push('styles.css missing empty-state[hidden] override');
if (mismatches.length) {
  console.error('Version / integrity check failed:');
  for (const line of mismatches) console.error(' -', line);
  process.exit(1);
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'target') continue;
      walk(full, acc);
    } else if (entry.isFile() && /\.(js|mjs)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const files = [
  ...walk(path.join(root, 'src')),
  ...walk(path.join(root, 'tests')),
  ...walk(path.join(root, 'tools'))
];

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed++;
    console.error(result.stderr || result.stdout || `check failed: ${file}`);
  }
}

if (failed) {
  console.error(`Syntax check failed for ${failed} file(s).`);
  process.exit(1);
}

console.log(`check ok · v${VERSION} · ${files.length} modules`);
