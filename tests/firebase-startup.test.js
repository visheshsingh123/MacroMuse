import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('server routes start and Firebase signing keys work without require(ESM)', async () => {
  // Reproduce Vercel loaders without Node's synchronous require(ESM) support.
  // Run in a fresh process to catch dependency failures before handlers load.
  const { stdout } = await run(process.execPath, [
    '--no-experimental-require-module', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { generateKeyPairSync, sign, verify } from 'node:crypto';
    const { default: handler } = await import('./api/groq.js');
    await import('./api/reminders.js');
    await import('./api/reminder-cron.js');

    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler({ method: 'POST', headers: {}, body: {} }, res);
    assert.equal(res.code, 401);

    const require = createRequire(new URL('./package.json', import.meta.url));
    const firebaseRequire = createRequire(require.resolve('firebase-admin/auth'));
    const jwksClient = firebaseRequire('jwks-rsa');
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture', use: 'sig', alg: 'RS256' };
    const client = jwksClient({ jwksUri: 'https://fixture.invalid/jwks', fetcher: async () => ({ keys: [jwk] }) });
    const key = (await client.getSigningKey('fixture')).getPublicKey();
    const message = Buffer.from('local signing-key compatibility check');
    const signature = sign('RSA-SHA256', message, privateKey);
    assert(verify('RSA-SHA256', message, key, signature));
    assert(!verify('RSA-SHA256', Buffer.from('tampered'), key, signature));
    await assert.rejects(client.getSigningKey('unknown'), { name: 'SigningKeyNotFoundError' });
    console.log('Server startup and signing-key verification passed');
  `], { cwd: new URL('../', import.meta.url), timeout: 30000 });
  assert.match(stdout, /Server startup and signing-key verification passed/);
});
