import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
function fixture(initial, blocked = false) {
  const data = initial === undefined ? {} : { macromuse_liquid_glass: initial };
  const attrs = {}, events = {}, clicks = {};
  const toggle = { setAttribute: (key, value) => { attrs[key] = value; }, addEventListener: (name, fn) => { clicks[name] = fn; } };
  const context = { localStorage: { getItem: key => { if (blocked) throw Error('blocked');return data[key] ?? null; }, setItem: (key, value) => { if (blocked) throw Error('blocked');data[key] = value; } },
    document: { documentElement: { setAttribute: (key, value) => { attrs[key] = value; } }, getElementById: () => toggle, addEventListener: (name, fn) => { events[name] = fn; } },
    window: { addEventListener: (name, fn) => { events[name] = fn; } } };
  vm.runInNewContext(readFileSync(new URL('../public/appearance.js', import.meta.url), 'utf8'), context);
  return { data, attrs, events, clicks };
}
test('glass preference restores before page rendering and switch stays in sync', () => {
  const on = fixture();assert.equal(on.attrs['data-liquid-glass'], 'on');
  const f = fixture('0');assert.equal(f.attrs['data-liquid-glass'], 'off');
  f.events.DOMContentLoaded();assert.equal(f.attrs['aria-checked'], 'false');
  f.clicks.click();assert.equal(f.attrs['aria-checked'], 'true');assert.equal(f.data.macromuse_liquid_glass, '1');
  f.clicks.click();assert.equal(f.data.macromuse_liquid_glass, '0');assert.equal(f.attrs['data-liquid-glass'], 'off');
  assert.equal(fixture(f.data.macromuse_liquid_glass).attrs['data-liquid-glass'], 'off');
});
test('storage changes and clearing local preferences sync other open tabs', () => {
  const f = fixture();f.events.DOMContentLoaded();
  f.data.macromuse_liquid_glass = '0';f.events.storage({ key: 'macromuse_liquid_glass' });
  assert.equal(f.attrs['data-liquid-glass'], 'off');assert.equal(f.attrs['aria-checked'], 'false');
  delete f.data.macromuse_liquid_glass;f.events.storage({ key: null });
  assert.equal(f.attrs['data-liquid-glass'], 'on');assert.equal(f.attrs['aria-checked'], 'true');
});
test('blocked storage still permits the toggle in the current page', () => {
  const f = fixture(undefined, true);f.events.DOMContentLoaded();f.clicks.click();
  assert.equal(f.attrs['data-liquid-glass'], 'off');assert.equal(f.attrs['aria-checked'], 'false');
});
test('all shared-style pages load the preference before styles and the PWA precaches it', () => {
  const root = new URL('../public/', import.meta.url);
  for (const path of readdirSync(root, { recursive: true }).filter(path => path.endsWith('.html'))) {
    const html = readFileSync(new URL(path, root), 'utf8');
    if (!html.includes('/design-system.css')) continue;
    assert.equal(html.match(/src="\/appearance.js"/g)?.length, 1, path);
    assert(html.indexOf('src="/appearance.js"') < html.search(/<style|<link[^>]*rel=["']stylesheet/), path);
  }
  assert(readFileSync(new URL('service-worker.js', root), 'utf8').includes("'/appearance.js'"));
});
