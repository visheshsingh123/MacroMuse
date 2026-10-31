import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function fixture(data = {}) {
  const storage = new Proxy({ getItem: key => data[key] ?? null, setItem: (key, value) => { data[key] = value; }, removeItem: key => { delete data[key]; } }, {
    ownKeys: () => Object.keys(data), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });
  const context = { window: { addEventListener() {}, nutriGlanceReminderAuth: { currentUser: { uid: 'alice' } } },
    localStorage: storage, location: { pathname: '/aichef', reload() {} },
    document: { documentElement: { classList: { add() {}, remove() {} }, dataset: {} } }, Headers, AbortSignal };
  for (const name of ['security', 'chef-chat-cache']) vm.runInNewContext(readFileSync(new URL(`../public/${name}.js`, import.meta.url), 'utf8'), context);
  return { data, cache: context.window.NutriChefChatCache, security: context.window.NutriSecurity };
}
const messages = [{ role: 'user', content: 'Chickpeas and rice?', context: true }, { role: 'assistant', content: '{"message":"Try a bowl","recipes":[]}', context: true }];
test('chat survives navigation and long absences only after the same account authenticates', () => {
  const first = fixture();first.security.bindSession({ uid: 'alice' });
  assert.equal(first.cache.write('alice', messages), true);
  const item = JSON.parse(first.data.nutriglance_cache_chef_chat);item.updatedAt -= 30 * 86400000;
  first.data.nutriglance_cache_chef_chat = JSON.stringify(item);
  const next = fixture(first.data);
  assert.equal(next.cache.read('alice').length, 0);
  next.security.bindSession({ uid: 'alice' });
  assert.deepEqual(JSON.parse(JSON.stringify(next.cache.read('alice'))), messages);
  assert.equal(next.cache.read('bob').length, 0);
  assert.equal(next.cache.write('bob', messages), false);
});
test('clearing, logout and account changes remove chat; stale requests cannot restore it', () => {
  const f = fixture();f.security.bindSession({ uid: 'alice' });f.cache.write('alice', messages);
  f.cache.clear('alice');assert.equal(f.cache.read('alice').length, 0);
  f.cache.write('alice', messages);f.security.bindSession(null);
  assert.equal(f.data.nutriglance_cache_chef_chat, undefined);
  assert.equal(f.cache.write('alice', messages), false);
  f.security.bindSession({ uid: 'alice' });f.cache.write('alice', messages);
  f.security.bindSession({ uid: 'bob' });assert.equal(f.data.nutriglance_cache_chef_chat, undefined);
});
test('cache is bounded, rejects corrupt records, and stores plain strings rather than markup', () => {
  const f = fixture();f.security.bindSession({ uid: 'alice' });
  f.cache.write('alice', Array.from({ length: 80 }, (_, i) => ({ role: 'user', content: String(i), context: false })));
  assert.equal(f.cache.read('alice').length, 60);assert.equal(f.cache.read('alice')[0].content, '20');
  f.cache.write('alice', Array.from({ length: 60 }, () => ({ role: 'user', content: 'a'.repeat(20000), context: false })));
  assert.equal(f.cache.read('alice').length, 12);
  for (const bad of ['not-json', JSON.stringify({ uid: 'alice', updatedAt: Date.now(), data: { version: 2, messages } }), JSON.stringify({ uid: 'alice', updatedAt: Date.now(), data: { version: 1, messages: [{ role: 'system', content: 'x', context: true }] } })]) {
    f.data.nutriglance_cache_chef_chat = bad;assert.equal(f.cache.read('alice').length, 0);
  }
  const literal = '<img src=x onerror=alert(1)>';
  f.cache.write('alice', [{ role: 'user', content: literal, context: false }]);
  assert.equal(f.cache.read('alice')[0].content, literal);
});
test('unavailable browser storage does not interrupt the chat', () => {
  const context = { window: { NutriSecurity: { readCache() { throw new Error('blocked'); }, writeCache() { throw new Error('full'); } } } };
  vm.runInNewContext(readFileSync(new URL('../public/chef-chat-cache.js', import.meta.url), 'utf8'), context);
  assert.equal(context.window.NutriChefChatCache.read('alice').length, 0);
  assert.equal(context.window.NutriChefChatCache.write('alice', messages), false);
});
