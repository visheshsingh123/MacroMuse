import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import assetlinks from '../api/assetlinks.js';

function response() {
  return {
    code: 200, headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; },
  };
}

test('Chrome can retrieve the installed MacroMuse certificate without cookies or authentication', () => {
  const res = response();
  assetlinks({ method: 'GET', headers: {} }, res);
  assert.equal(res.code, 200);
  assert.match(res.headers['Content-Type'], /^application\/json/);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  const app = res.body.find(row => row.target.package_name === 'app.vercel.macromuse.twa');
  assert(app);
  assert(app.relation.includes('delegate_permission/common.handle_all_urls'));
  assert.equal(app.target.namespace, 'android_app');
  assert(app.target.sha256_cert_fingerprints.includes('4E:61:85:05:A8:1D:1D:93:D1:45:B5:99:C0:4B:41:5C:96:D9:E1:30:02:0B:C1:0D:A6:E2:DC:34:C4:B9:4D:17'));
  assert(res.body.some(row => row.target.package_name === 'app.vercel.nutriglance.twa'));
  assert.deepEqual(res.body, JSON.parse(readFileSync(new URL('../public/.well-known/assetlinks.json', import.meta.url), 'utf8')));
});

test('verification responds to HEAD and rejects writes without changing associations', () => {
  const head = response();
  assetlinks({ method: 'HEAD' }, head);
  assert.equal(head.code, 200);
  assert.equal(head.ended, true);
  assert.equal(head.body, undefined);
  const post = response();
  assetlinks({ method: 'POST', body: [] }, post);
  assert.equal(post.code, 405);
  assert.equal(post.headers.Allow, 'GET, HEAD');
});

test('Android verification has an explicit route before static page rewrites', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.rewrites[0], {
    source: '/.well-known/assetlinks.json',
    destination: '/api/assetlinks',
  });
  assert(!config.redirects.some(row => row.source === '/.well-known/assetlinks.json'));
});
