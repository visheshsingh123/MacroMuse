import test from 'node:test';
import assert from 'node:assert/strict';
import { createProHandler } from '../api/pro.js';
import { createGroqHandler } from '../api/groq.js';
import { getPlan, oneMonthAfter } from '../lib/pro.js';
import { consumeQuota, HttpError } from '../lib/api-security.js';
import { fixture, database } from './helpers/quota-db.js';
const meal = id => ({ meal: { _id: id, name: 'Lunch', kcal: 400, protein: 25, carbs: 40, fat: 12 } });
const payload = { model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: 'Help me cook.' }] };
const providerReply = () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"message":"Try a rice bowl.","recipes":[]}' } }] }) });
// Test codes are fixtures, never the configured activation secret.
const setup = () => {
  const f = fixture();let attempts = 0;
  const pro = createProHandler({ ...f.options, getCode: () => 'test-activation-code', quota: async () => { attempts++; } });
  return { ...f, pro, attempts: () => attempts };
};
test('activation requires an authenticated account and never trusts requested user or expiry', async () => {
  const f = setup();
  for (const uid of [null, 'invalid', 'anonymous']) assert.equal((await f.call(f.pro, { code: 'test-activation-code' }, uid)).code, 401);
  assert.equal(f.attempts(), 0);
  const res = await f.call(f.pro, { code: 'test-activation-code', uid: 'victim', expiresAt: '2099-01-01', plan: 'pro' });
  assert.equal(res.code, 200);assert.deepEqual(res.body, { plan: 'pro', expiresAt: '2026-11-20T20:00:00.000Z' });
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal((await getPlan(f.db, 'victim', f.now())).plan, 'free');
  assert(!JSON.stringify([...f.db.data.values()]).includes('test-activation-code'));
});
test('incorrect, malformed and unconfigured codes fail without granting Pro and all attempts are rate limited', async () => {
  const f = setup();
  for (const code of ['wrong', 'TEST-ACTIVATION-CODE', '', 'x'.repeat(129), null]) {
    const res = await f.call(f.pro, { code });assert([400,403].includes(res.code));
  }
  assert.equal(f.attempts(), 5);assert.equal((await getPlan(f.db,'alice',f.now())).plan,'free');
  const missing=createProHandler({...f.options,getCode:()=>undefined});
  assert.equal((await f.call(missing,{code:'test-activation-code'})).code,503);
  const blocked=createProHandler({...f.options,getCode:()=> 'test-activation-code',quota:async()=>{throw new HttpError(429,'Try again later.',60);}});
  assert.equal((await f.call(blocked,{code:'test-activation-code'})).code,429);
  assert.equal((await f.call(f.pro,null,'alice','DELETE')).code,405);
});
test('concurrent/repeated activation cannot stack months or reuse an expired code; accounts are independent', async () => {
  const f=setup();
  const results=await Promise.all(Array.from({length:8},()=>f.call(f.pro,{code:'test-activation-code'})));
  assert(results.every(result=>result.code===200));assert.equal(new Set(results.map(result=>result.body.expiresAt)).size,1);
  const expiresAt=results[0].body.expiresAt;f.advance(86400_000);
  assert.equal((await f.call(f.pro,{code:'test-activation-code'})).body.expiresAt,expiresAt);
  assert.equal((await f.call(f.pro,{code:'test-activation-code'},'bob')).code,200);
  f.advance(Date.parse(expiresAt)-f.now());
  assert.equal((await f.call(f.pro)).body.plan,'free');
  assert.equal((await f.call(f.pro,{code:'test-activation-code'})).code,409);
  const rotated=createProHandler({...f.options,getCode:()=> 'different-test-code'});
  assert.equal((await f.call(rotated,{code:'different-test-code'})).code,200);
});
test('one-month expiry clamps month ends and handles leap years in UTC',()=>{
 assert.equal(oneMonthAfter(Date.parse('2026-01-31T23:20:00Z')),'2026-02-28T23:20:00.000Z');
 assert.equal(oneMonthAfter(Date.parse('2028-01-31T23:20:00Z')),'2028-02-29T23:20:00.000Z');
 assert.equal(oneMonthAfter(Date.parse('2026-10-31T08:00:00Z')),'2026-11-30T08:00:00.000Z');
});
test('Pro removes daily meal/Chef caps, expiry restores Free limits, and old usage cannot grant entitlement',async()=>{
 const f=setup();await f.call(f.pro,{code:'test-activation-code'});
 for(let i=0;i<12;i++)assert.equal((await f.call(f.meals,meal('meal-'+i))).code,200);
 const status=(await f.call(f.usage)).body.usage;
 assert.equal(status.plan,'pro');assert.equal(status.meals.limit,null);assert.equal(status.meals.remaining,null);
 process.env.GROQ_API_KEY='test-only-provider-key';
 const purposes=[];
 const chef=createGroqHandler({...f.options,mode:'chef',quota:async(_db,_uid,purpose)=>purposes.push(purpose),request:async()=>providerReply()});
 for(let i=0;i<9;i++)assert.equal((await f.call(chef,payload)).code,200);
 assert(purposes.every(purpose=>purpose==='pro-ai'));
 assert.equal((await f.call(f.usage)).body.usage.chef.used,9);
 const expiration=Date.parse(status.expiresAt);f.advance(expiration-f.now());
 assert.equal((await f.call(f.usage)).body.usage.plan,'free');
 for(let i=0;i<3;i++)assert.equal((await f.call(f.meals,meal('free-'+i))).code,200);
 assert.equal((await f.call(f.meals,meal('free-fourth'))).code,429);
 assert.equal((await f.call(f.usage)).body.usage.meals.limit,3);
 for(let i=0;i<5;i++)assert.equal((await f.call(chef,payload)).code,200);
 assert.equal((await f.call(chef,payload)).code,429);
 assert.equal(purposes.at(-1),'ai');
});
test('PDF entitlement is checked server-side for Free, active and expired accounts',async()=>{
 const f=setup();
 const check=async()=>{
  const res={code:200,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await f.pro({method:'GET',headers:{authorization:'Bearer alice'},query:{feature:'pdf'}},res);return res;
 };
 assert.equal((await check()).code,403);assert.equal((await check()).body.error.code,'PRO_REQUIRED');
 const active=await f.call(f.pro,{code:'test-activation-code'});assert.equal((await check()).code,200);
 f.advance(Date.parse(active.body.expiresAt)-f.now());assert.equal((await check()).code,403);
});
test('Pro removes the user daily request cap while preserving short-term and shared limits',async()=>{
 const db=database(),now=Date.UTC(2026,9,20,6);
 for(let i=0;i<120;i++)await consumeQuota(db,'alice','pro-ai',now+i*61000);
 const shared=database();
 for(let i=0;i<10;i++)await consumeQuota(shared,'alice','pro-ai',now);
 await assert.rejects(consumeQuota(shared,'alice','pro-ai',now),e=>e.status===429);
 const global=database();
 for(let i=0;i<100;i++)await consumeQuota(global,'account-'+i,i%2?'pro-ai':'ai',now);
 await assert.rejects(consumeQuota(global,'another','ai',now),e=>e.status===429);
});
