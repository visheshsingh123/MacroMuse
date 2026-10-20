import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function worker() {
  const events = {}, records = new Map(), requests = [];
  let offline = false, unavailable = '', policy = '';
  const cache = name => {
    if (!records.has(name)) records.set(name, new Map());
    const rows = records.get(name);
    return { put: async (key, response) => rows.set(String(key), response.clone()), match: async key => rows.get(String(key))?.clone() };
  };
  const context = { URL, Response, console,
    self: { location: { origin: 'https://example.com' }, addEventListener: (name, fn) => events[name] = fn, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async name => cache(name), keys: async () => [...records.keys()], delete: async name => records.delete(name) },
    fetch: async input => {
      const url = new URL(typeof input === 'string' ? input : input.url, 'https://example.com');requests.push(url.href);
      if (offline) throw new TypeError('Offline');
      return new Response('Saved file: ' + url.pathname, { status: url.pathname === unavailable ? 503 : 200, headers: { 'Cache-Control': policy } });
    },
  };
  vm.runInNewContext(readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8'), context);
  const lifecycle = async name => { let done;events[name]({ waitUntil: promise => done = promise });await done; };
  const fetch = async (path, options = {}) => {
    let response;
    events.fetch({ request: { url: new URL(path, 'https://example.com').href, method: 'GET', headers: new Headers(), mode: 'navigate', cache: 'default', ...options }, respondWith: promise => response = promise });
    return response === undefined ? null : await response;
  };
  return { records, requests, lifecycle, fetch, setOffline: value => offline = value, setUnavailable: value => unavailable = value, setPolicy: value => policy = value };
}

test('PWA installation caches all page styles and scripts even if one optional page is unavailable', async () => {
  const fixture = worker();fixture.setUnavailable('/qr');await fixture.lifecycle('install');
  const cache = fixture.records.get('nutriglance-v52');
  for (const path of ['/offline','/dashboard','/settings','/premium','/privacy','/site-shell.css','/site-shell.js','/dashboard.css','/progress-layout.css','/progress-print.css','/workspace-pages.css','/manifest.json']) assert(cache.has('https://example.com'+path), path);
  assert(!cache.has('https://example.com/qr'));
  const publicCode = fixture.records.get('nutriglance-public-libraries-v1');
  assert(publicCode.has('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'));
  assert(!fixture.requests.some(url => url.includes('/api/')));
});

test('offline navigation finds query-string and .html variants and falls back to a useful offline page', async () => {
  const fixture = worker();await fixture.lifecycle('install');fixture.setOffline(true);
  for (const [path, saved] of [['/?view=home','/'],['/dashboard.html?from=phone','/dashboard'],['/privacy-policy','/privacy'],['/blogs?source=pwa','/blogs'],['/not-saved','/offline']]) {
    const response = await fixture.fetch(path);assert.equal(response.status,200);assert.equal(await response.text(),'Saved file: '+saved);
  }
  assert.equal(await (await fixture.fetch('/dashboard.css?v=phone',{mode:'cors'})).text(),'Saved file: /dashboard.css');
});

test('only pinned public library files are intercepted; user APIs and Firebase data stay uncached', async () => {
  const fixture = worker();await fixture.lifecycle('install');fixture.setOffline(true);
  assert.equal((await fixture.fetch('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',{mode:'cors'})).status,200);
  for (const url of ['/api/meals','/api/pro','https://firestore.googleapis.com/v1/projects/private','https://identitytoolkit.googleapis.com/v1/accounts:lookup','https://www.gstatic.com/firebasejs/other-file.js']) assert.equal(await fixture.fetch(url),null,url);
  assert.equal(await fixture.fetch('/dashboard',{headers:new Headers({Authorization:'Bearer token'})}),null);
  assert.equal(await fixture.fetch('/dashboard',{method:'POST'}),null);
  assert.equal(await fixture.fetch('/dashboard',{cache:'no-store'}),null);
});

test('no-store and private responses are not persisted and server errors use an existing saved page', async () => {
  for (const policy of ['no-store','private']) {
    const fixture=worker();fixture.setPolicy(policy);await fixture.fetch('/dashboard');
    assert.equal(fixture.records.get('nutriglance-v52').size,0);
  }
  const fixture=worker();await fixture.lifecycle('install');fixture.setUnavailable('/dashboard');
  assert.equal((await fixture.fetch('/dashboard')).status,200);
});

test('activation removes only old NutriGlance app caches and retains the public code cache', async () => {
  const fixture=worker();await fixture.lifecycle('install');
  fixture.records.set('nutriglance-v51',new Map());fixture.records.set('another-app',new Map());
  await fixture.lifecycle('activate');
  assert(!fixture.records.has('nutriglance-v51'));assert(fixture.records.has('nutriglance-v52'));
  assert(fixture.records.has('nutriglance-public-libraries-v1'));assert(fixture.records.has('another-app'));
});
