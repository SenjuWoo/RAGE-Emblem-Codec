import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const child = spawn(process.execPath, ['tools/serve.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });

function shutdown() {
  if (!child.killed) child.kill();
}

process.on('exit', shutdown);
process.on('SIGINT', () => { shutdown(); process.exit(1); });

function get(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: urlPath, timeout: 4000 }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error(`timeout ${urlPath}`)); });
  });
}

async function waitReady() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const res = await get('/');
      if (res.status === 200) return res;
    } catch {
      await new Promise(r => setTimeout(r, 150));
    }
  }
  throw new Error(`server did not become ready\n${output}`);
}

try {
  const home = await waitReady();
  const html = home.body.toString('utf8');
  if (!html.includes('RAGE Emblem Codec')) throw new Error('index.html missing product name');
  for (const p of ['/src/main.js', '/src/styles.css', '/src/worker.js', '/src/version.js', '/assets/favicon.svg', '/assets/sample-crew-emblem.png']) {
    const res = await get(p);
    if (res.status !== 200 || res.body.length < 16) throw new Error(`${p} -> ${res.status} (${res.body.length} bytes)`);
  }
  const missing = await get('/no-such-file-rage-codec');
  if (missing.status !== 404) throw new Error(`missing file should 404, got ${missing.status}`);
  const escaped = await get('/..%2F..%2F..%2FWindows/win.ini');
  if (escaped.status === 200) throw new Error('static server served an escaped path');
  console.log('serve smoke ok');
  shutdown();
  process.exit(0);
} catch (error) {
  console.error(error.message || error);
  shutdown();
  process.exit(1);
}
