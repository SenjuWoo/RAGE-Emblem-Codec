import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs', 'images');
const port = Number(process.env.PORT || 4173);
const sample = path.join(root, 'assets', 'sample-crew-emblem.png');
const edgeCandidates = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);

const browserPath = edgeCandidates.find(p => fs.existsSync(p));
if (!browserPath) {
  console.error('No Edge/Chrome executable found');
  process.exit(1);
}
if (!fs.existsSync(sample)) {
  console.error('missing sample emblem');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const playwright = require('playwright-core');
const server = spawn(process.execPath, ['tools/serve.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});
const shutdown = () => { if (!server.killed) server.kill(); };
process.on('exit', shutdown);

function ping() {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/', timeout: 1000 }, res => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

async function waitReady() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      if (await ping() === 200) return;
    } catch {
      await new Promise(r => setTimeout(r, 120));
    }
  }
  throw new Error('server did not start');
}

try {
  await waitReady();
  const browser = await playwright.chromium.launch({ executablePath: browserPath, headless: true });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  desktop.setDefaultTimeout(180000);
  desktop.on('console', msg => console.log('browser', msg.type(), msg.text()));
  desktop.on('pageerror', err => console.error('pageerror', err.message));
  await desktop.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await desktop.waitForSelector('#sampleBtn');
  await desktop.screenshot({ path: path.join(outDir, 'app-empty.png'), fullPage: true });

  await desktop.setInputFiles('#fileInput', sample);
  await desktop.waitForFunction(() => !document.querySelector('#runBtn')?.disabled, null, { timeout: 20000 });
  const meta = await desktop.textContent('#fileMeta');
  console.log('loaded', meta);
  await desktop.click('#runBtn');
  await desktop.waitForFunction(() => {
    const score = document.getElementById('qualityScore')?.textContent;
    const status = document.getElementById('runStatus')?.textContent || '';
    if (status.includes('error') || status.includes('Error')) throw new Error(status);
    return score && score !== '--';
  }, null, { timeout: 180000 });
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: path.join(outDir, 'app-hero.png'), fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await mobile.waitForSelector('#sampleBtn');
  await mobile.screenshot({ path: path.join(outDir, 'app-mobile.png'), fullPage: true });

  await browser.close();
  console.log('captured ok');
} finally {
  shutdown();
}
