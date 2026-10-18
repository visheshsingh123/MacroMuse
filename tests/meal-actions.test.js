import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../public/meal-actions.js', import.meta.url), 'utf8');
const meal = id => ({ _id: id, name: 'Same salad', kcal: 250, protein: 12, carbs: 20, fat: 14, loggedAt: '2026-10-19T08:00:00Z' });
function fixture() {
  let uid = 'alice', refreshes = 0;
  const local = new Map([['nutriglance_meals', JSON.stringify([meal('one'), meal('two')])]]);
  const cloud = new Map([['one', meal('one')], ['two', meal('two')]]);
  const notifications = [], buttons = [], calls = [];
  const context = {
    localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, value) },
    navigator: { onLine: true },
    document: {
      createElement: () => ({ dataset: {}, attrs: {}, classList: { add() {}, remove() {} }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, addEventListener(event, fn) { this[event] = fn; }, focus() {} }),
      querySelectorAll: () => buttons,
    },
    window: {
      NutriSecurity: { isCurrent: user => uid === user, readMeals: value => value },
      NutriFeedback: { show: (message, options) => notifications.push({ message, ...options }) },
    },
  };
  vm.runInNewContext(code, context);
  const actions = context.window.NutriMeals;
  const config = {
    uid,
    remove: async id => { calls.push(['remove', id]); cloud.delete(id); },
    restore: async (id, value) => { calls.push(['restore', id]); cloud.set(id, value); },
    refresh: () => refreshes++,
  };
  actions.configure(config);
  function button(id) {
    actions.addDeleteButton({ appendChild: b => buttons.push(b) }, meal(id));
    return buttons.at(-1);
  }
  return { actions, config, cloud, notifications, button, calls, context, localMeals: () => JSON.parse(local.get('nutriglance_meals')), changeAccount: () => uid = 'bob', refreshes: () => refreshes };
}

test('individual deletion distinguishes identical meals, updates totals input, and Undo restores the same document', async () => {
  const f = fixture(); await f.button('one').click();
  assert.deepEqual(f.localMeals().map(m => m._id), ['two']);
  assert(!f.cloud.has('one'));assert(f.cloud.has('two'));assert.equal(f.refreshes(), 1);
  await f.notifications[0].action();
  assert.deepEqual(f.localMeals().map(m => m._id), ['one', 'two']);
  assert(f.cloud.has('one'));assert.equal(f.refreshes(), 2);
  assert.deepEqual(f.calls, [['remove', 'one'], ['restore', 'one']]);
});

test('a failed or offline delete preserves the meal and releases its button', async () => {
  const f = fixture();f.config.remove = async () => { throw new Error('permission-denied'); };
  const button = f.button('one');await button.click();
  assert.equal(f.localMeals().length, 2);assert(f.cloud.has('one'));assert.equal(button.disabled, false);
  assert.match(f.notifications[0].message, /Couldn’t delete/);
  f.context.navigator.onLine = false;await button.click();
  assert.match(f.notifications.at(-1).message, /offline/);assert.equal(f.calls.length, 0);
});

test('delete waits for a pending save, so a late write cannot resurrect a removed meal', async () => {
  const f = fixture();let resolve;
  f.actions.trackWrite('one', new Promise(done => resolve = done));
  const pending = f.button('one').click();
  assert.equal(f.calls.length, 0);resolve();await pending;
  assert.deepEqual(f.calls, [['remove', 'one']]);assert(!f.cloud.has('one'));
});

test('a late delete and an Undo from a previous account cannot write to the new account cache', async () => {
  const f = fixture();let finish;
  f.config.remove = () => new Promise(resolve => finish = resolve);
  const pending = f.button('one').click();f.changeAccount();finish();await pending;
  assert.equal(f.localMeals().length, 2);assert.equal(f.notifications.length, 0);
  const other = fixture();await other.button('one').click();other.changeAccount();
  await assert.rejects(other.notifications[0].action(), /same account/);
  assert.equal(other.calls.filter(([kind]) => kind === 'restore').length, 0);
});

test('a failed Undo does not claim a local restore and can be retried', async () => {
  const f = fixture();await f.button('one').click();
  const restore = f.config.restore;f.config.restore = async () => { throw new Error('offline'); };
  await assert.rejects(f.notifications[0].action());
  assert.equal(f.localMeals().length, 1);
  f.config.restore = restore;await f.notifications[0].action();assert.equal(f.localMeals().length, 2);
});
