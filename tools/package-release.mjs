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

fs.mkdirSync(outDir, { recursive: true });
for (const name of fs.readdirSync(outDir)) {
  if (name === 'SHA256SUMS.txt' || /^rage-emblem-codec-.*-portable\.zip$/i.test(name)) {
    fs.rmSync(path.join(outDir, name), { force: true });
  }
}

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

// A .zip must be a real ZIP. PATH `tar` may be GNU tar, which ignores -a for
// unknown suffixes and silently emits a plain tar named .zip, so pick an
// archiver explicitly and verify the magic bytes.
function buildZip() {
  const winTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  const attempts = process.platform === 'win32'
    ? [[winTar, ['-a', '-cf', zipPath, ...files]], ['tar', ['-a', '-cf', zipPath, ...files]]]
    : [['zip', ['-q', '-X', zipPath, ...files]], ['tar', ['-a', '-cf', zipPath, ...files]]];
  for (const [cmd, args] of attempts) {
    fs.rmSync(zipPath, { force: true });
    const run = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
    if (run.error) continue;
    if (run.status !== 0) {
      console.error(run.stderr || run.stdout);
      continue;
    }
    const head = fs.existsSync(zipPath) ? fs.readFileSync(zipPath).subarray(0, 4).toString('latin1') : '';
    if (head === 'PK\u0003\u0004') return cmd;
  }
  throw new Error('no zip-capable archiver produced a valid .zip');
}

buildZip();

const bytes = fs.readFileSync(zipPath);
if (bytes.length < 1024) throw new Error(`zip too small: ${bytes.length}`);
const sha = crypto.createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(sumsPath, `${sha}  ${zipName}\n`);
console.log(JSON.stringify({ zip: zipName, bytes: bytes.length, sha256: sha }, null, 2));
