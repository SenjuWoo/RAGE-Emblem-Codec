import test from 'node:test';
import assert from 'node:assert/strict';
import { generateConsoleCode } from '../src/codec/console-code.js';
import { measurePayload, utf8Length } from '../src/codec/payload.js';

function makeRockstarHarness({ hash = 'h'.repeat(64), response = { Status: 200, EmblemId: '123' } } = {}) {
  const alerts = [];
  const requests = [];
  const window = { location: { href: 'https://socialclub.rockstargames.com/emblems/edit' } };
  const document = {
    getElementsByName(name) {
      return name === '__RequestVerificationToken' ? [{ value: 'token-value' }] : [];
    },
    getElementById(id) {
      return id === 'editorField-hash' ? { value: hash } : null;
    }
  };

  class XHR {
    static DONE = 4;
    constructor() {
      this.headers = {};
      this.readyState = 0;
      this.responseText = '';
      requests.push(this);
    }
    open(method, url, async) { this.method = method; this.url = url; this.async = async; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) { this.body = body; this.sent = true; }
    complete(value = response) {
      this.responseText = JSON.stringify(value);
      this.readyState = XHR.DONE;
      this.onreadystatechange?.();
    }
  }

  return { document, alerts, requests, window, XMLHttpRequest: XHR };
}

function runGenerated(code, harness) {
  const fn = new Function('document', 'alert', 'XMLHttpRequest', 'TextEncoder', 'window', code);
  fn(harness.document, msg => harness.alerts.push(String(msg)), harness.XMLHttpRequest, TextEncoder, harness.window);
}

test('console code contains Rockstar save flow and runtime byte guard',()=>{
  const code=generateConsoleCode({svg:'<svg/>',layersJson:'[]',budget:1280000});
  assert.match(code,/\/emblems\/save/);
  assert.match(code,/TextEncoder/);
  assert.match(code,/1280000/);
  assert.match(code,/__RequestVerificationToken/);
  assert.match(code,/editorField-hash/);
  assert.match(code,/emblems\/edit/);
  assert.doesNotThrow(() => new Function(code));
});

test('payload estimator equals the real serialized request body for the reserved hash length', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>é</text></svg>';
  const layersJson = JSON.stringify([{ name: 'é' }]);
  const hash = 'H'.repeat(64);
  const svgData = Buffer.from(svg, 'utf8').toString('base64');
  const layerData = Buffer.from(layersJson, 'utf8').toString('base64');
  const body = JSON.stringify({ crewId: '0', emblemId: '', parentId: '', svgData, layerData, hash });
  assert.equal(measurePayload(svg, layersJson, { hashReserve: hash.length }).estimatedRequestBytes, utf8Length(body));
});

test('generated Rockstar code refuses an oversized real request before opening XHR', () => {
  const harness = makeRockstarHarness();
  const code = generateConsoleCode({ svg: '<svg/>', layersJson: '[]', budget: 1 });
  runGenerated(code, harness);
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.alerts.length, 1);
  assert.match(harness.alerts[0], /over the 1 byte budget/i);
});

test('generated Rockstar code sends the exact guarded request when it fits', () => {
  const hash = 'hash-123';
  const harness = makeRockstarHarness({ hash });
  const svg = '<svg/>';
  const layersJson = '[]';
  const code = generateConsoleCode({ svg, layersJson, budget: 1280000 });
  runGenerated(code, harness);
  assert.equal(harness.requests.length, 1);
  const req = harness.requests[0];
  assert.equal(req.method, 'POST');
  assert.equal(req.url, '/emblems/save');
  assert.equal(req.headers['Content-Type'], 'application/json');
  assert.equal(req.headers['__RequestVerificationToken'], 'token-value');
  assert.equal(req.headers['X-Requested-With'], 'XMLHttpRequest');
  assert.deepEqual(JSON.parse(req.body), {
    crewId: '0', emblemId: '', parentId: '',
    svgData: Buffer.from(svg, 'utf8').toString('base64'),
    layerData: Buffer.from(layersJson, 'utf8').toString('base64'),
    hash
  });
});

test('generated Rockstar code accepts numeric-string success status and redirects', () => {
  const harness = makeRockstarHarness({ response: { Status: '200', EmblemId: 'abc' } });
  const code = generateConsoleCode({ svg: '<svg/>', layersJson: '[]', budget: 1280000 });
  runGenerated(code, harness);
  harness.requests[0].complete();
  assert.equal(harness.window.location.href, 'https://socialclub.rockstargames.com/emblems/edit/abc');
  assert.deepEqual(harness.alerts, []);
});
