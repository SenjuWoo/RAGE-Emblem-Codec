import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Check rejection without sending malformed requests to a running server.
test('URL decoding failure returns 400 rather than escaping the handler', () => {
  let handler;
  const source = fs.readFileSync(new URL('../tools/serve.mjs', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace('import.meta.url', JSON.stringify(new URL('../tools/serve.mjs', import.meta.url).href));
  const context = {
    http: { createServer: fn => { handler = fn; return { listen() {} }; } },
    fs: { readFile() { assert.fail('invalid URL must not reach filesystem'); } },
    path, fileURLToPath: () => path.resolve('tools/serve.mjs'), URL,
    process: { env: {} }, console,
    decodeURIComponent() { throw new URIError('decode failed'); }
  };
  vm.runInNewContext(source, context);
  let status, body;
  assert.doesNotThrow(() => handler({ url: '/' }, {
    writeHead(code) { status = code; }, end(text) { body = text; }
  }));
  assert.equal(status, 400);
  assert.equal(body, 'Bad request');
});
