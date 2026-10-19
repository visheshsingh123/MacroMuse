import test from 'node:test';
import assert from 'node:assert/strict';
import { routeReturningUser } from '../public/landing-session.js';

function location(path = '/') {
  return { href: `https://nutriglance.vercel.app${path}`, redirects: [], replace(path) { this.redirects.push(path); } };
}

test('landing redirects a restored signed-in user only after Firebase is ready', async () => {
  for (const path of ['/', '/index', '/index.html']) {
    const page = location(path);
    const auth = { currentUser: null, async authStateReady() {
      assert.deepEqual(page.redirects, []);
      this.currentUser = { uid: 'signed-in', isAnonymous: false };
    } };
    await routeReturningUser(page, async () => auth);
    assert.deepEqual(page.redirects, ['/dashboard']);
  }
});

test('new users, anonymous sessions and unavailable Firebase keep the landing page', async () => {
  for (const user of [null, { uid: 'guest', isAnonymous: true }]) {
    const page = location();
    await routeReturningUser(page, async () => ({ currentUser: user, async authStateReady() {} }));
    assert.deepEqual(page.redirects, []);
  }
  const page = location();
  await routeReturningUser(page, async () => { throw new Error('offline'); });
  await routeReturningUser(page, async () => ({ async authStateReady() { throw new Error('auth unavailable'); } }));
  assert.deepEqual(page.redirects, []);
});

test('intentional home and section visits remain accessible without initializing auth', async () => {
  for (const path of ['/?view=home', '/?view=home#faq', '/#faq', '/#features', '/index.html#how-it-works']) {
    const page = location(path);
    let loads = 0;
    await routeReturningUser(page, async () => { loads++; throw new Error('should not load'); });
    assert.equal(loads, 0);
    assert.deepEqual(page.redirects, []);
  }
});


test('a section selected while restoring the session is not interrupted', async () => {
  const page = location();
  await routeReturningUser(page, async () => ({
    currentUser: { uid: 'signed-in', isAnonymous: false },
    async authStateReady() { page.href += '#faq'; },
  }));
  assert.deepEqual(page.redirects, []);
});
