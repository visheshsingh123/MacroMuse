import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/quota-db.js';
const meal=(id,entryDate)=>({meal:{_id:id,name:'Lunch',kcal:400,protein:20,carbs:50,fat:12,entryDate}});
test('dated history additions persist the chosen day and charge current-day usage idempotently',async()=>{
 const f=fixture(),date='2026-10-18T06:30:00.000Z';
 const res=await f.call(f.meals,meal('dated',date));
 assert.equal(res.code,200);assert.equal(res.body.meal.loggedAt,date);assert.equal(res.body.usage.meals.used,1);
 assert.equal(f.db.data.get('users/alice/meals/dated').createdAt.toISOString(),new Date(f.now()).toISOString());
 const retry=await f.call(f.meals,meal('dated','2026-10-19T06:30:00.000Z'));
 assert.equal(retry.body.meal.loggedAt,date);assert.equal(retry.body.usage.meals.used,1);
 for(let i=1;i<3;i++)assert.equal((await f.call(f.meals,meal('dated-'+i,date))).code,200);
 assert.equal((await f.call(f.meals,meal('fourth',date))).code,429);
});
test('invalid, normalized-overflow, ancient and future dates cannot be saved',async()=>{
 const f=fixture();
 for(const date of ['bad','2026-02-30T12:00:00.000Z','1999-12-31T12:00:00.000Z','2027-01-01T12:00:00.000Z',123])assert.equal((await f.call(f.meals,meal('bad',date))).code,400);
 assert(!f.db.data.has('users/alice/meals/bad'));
});
