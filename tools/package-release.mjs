import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/version.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'release');
const zipName = `rage-emblem-codec-${VERSION}-portable.zip`;
const zipPath = path.join(outDir, zipName);
const sumsPath = path.join(outDir, 'SHA256SUMS.txt');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const files = [
  'index.html',
  'start.bat',
  'package.json',
  'LICENSE',
  'README.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'NOTICE.md',
  'CONTRIBUTING.md',
  'src',
  'assets',
  'tools/serve.mjs',
  'tools/build-static.mjs',
  'docs/benchmark-results.md',
  'docs/images/sample-crew-emblem.png'
];

for (const rel of files) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`missing ${rel}`);
}

const tar = spawnSync('tar', ['-a', '-cf', zipPath, ...files], { cwd: root, encoding: 'utf8' });
if (tar.status !== 0) {
  console.error(tar.stderr || tar.stdout);
  process.exit(tar.status || 1);
}

const bytes = fs.readFileSync(zipPath);
if (bytes.length < 1024) throw new Error(`zip too small: ${bytes.length}`);
const sha = crypto.createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(sumsPath, `${sha}  ${zipName}\n`);
console.log(JSON.stringify({ zip: zipName, bytes: bytes.length, sha256: sha }, null, 2));
