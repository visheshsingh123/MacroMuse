import test from 'node:test';
import assert from 'node:assert/strict';
import { createSavedRecipesHandler } from '../api/saved-recipes.js';
import { validateRecipe, recipeId } from '../lib/saved-recipes.js';
import { HttpError } from '../lib/api-security.js';
const recipe = { name:'Chickpea salad',perServing:{kcal:400,protein:25,carbs:40,fat:15},ingredients:['150g chickpeas','Half a cucumber'],steps:['Chop cucumber.','Mix together.'] };
function fixture(pro = false) {
  const data = new Map();let queue = Promise.resolve();
  if (pro) data.set('users/alice/privateState/pro', { plan: 'pro', expiresAt: '2026-12-19T12:00:00.000Z' });
  const snapshot = ref => {
    if (!ref.query) return { exists: data.has(ref.path), data: () => data.get(ref.path) };
    let rows = [...data].filter(([key]) => key.startsWith(ref.path+'/') && key.split('/').length === ref.path.split('/').length + 1);
    if (ref.ordered) rows.sort(([a], [b]) => a.localeCompare(b));
    if (ref.after) rows = rows.filter(([key]) => key.split('/').at(-1) > ref.after);
    const docs = rows.slice(0, ref.count).map(([key,value]) => ({ id:key.split('/').at(-1),data:()=>value }));
    return { docs, size: docs.length };
  };
  function collection(path, count = Infinity, ordered = false, after) {
    const query = {path,count,ordered,after,query:true,get:async()=>snapshot(query),
      doc(id){return {path:path+'/'+id,collection:name=>collection(path+'/'+id+'/'+name),delete:async()=>data.delete(path+'/'+id)};},
      limit(next){return collection(path,next,ordered,after);},orderBy(){return collection(path,count,true,after);},startAfter(next){return collection(path,count,ordered,next);}};
    return query;
  }
  const db = {collection,runTransaction(fn){const result=queue.then(()=>fn({get:async ref=>snapshot(ref),set:(ref,value)=>data.set(ref.path,value)}));queue=result.catch(()=>{});return result;}};
  const handler=createSavedRecipesHandler({getServices:()=>({db,auth:{verifyIdToken:async token=>{if(['invalid','revoked'].includes(token))throw Error('private token');return {uid:token,firebase:{sign_in_provider:token==='anonymous'?'anonymous':'password'}};}}}),quota:async(_db,uid,purpose)=>{assert.equal(purpose.replace(/^pro-/,''),'recipes');if(uid==='limited')throw new HttpError(429,'Try later.');},clock:()=>new Date('2026-10-19T12:00:00Z')});
  const request=async(body,token='alice',method=body?'POST':'GET',query={})=>{const res={headers:{},code:200,setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method,headers:token?{authorization:'Bearer '+token}:{},body,query},res);return res;};return {data,request};
}
test('saved recipes require a verified non-anonymous session and enforce quotas',async()=>{
 const {request}=fixture();for(const token of [null,'invalid','revoked','anonymous']) assert.equal((await request(null,token)).code,401);
 assert.equal((await request(null,'limited')).code,429);assert.equal((await request(null,'alice','DELETE')).code,405);
});
test('recipe collection persists canonical recipes idempotently and isolates accounts',async()=>{
 const {data,request}=fixture();const first=await request({action:'save',recipe,uid:'victim'});assert.equal(first.code,200);assert.equal(first.headers['Cache-Control'],'no-store');assert.equal(first.body.item.id,recipeId(recipe));
 await Promise.all(Array.from({length:5},()=>request({action:'save',recipe})));assert.equal([...data.keys()].filter(key=>key.includes('/savedRecipes/')).length,1);assert.equal((await request()).body.recipes.length,1);assert.equal((await request(null,'bob')).body.recipes.length,0);
 await request({action:'remove',id:first.body.item.id},'bob');assert.equal([...data.keys()].filter(key=>key.includes('/savedRecipes/')).length,1);
 assert.equal((await request({action:'remove',id:first.body.item.id})).code,200);assert.equal((await request()).body.recipes.length,0);
});
test('recipe validation rejects incomplete data, malformed requests and unsafe document paths',async()=>{
 const {request}=fixture();for(const value of [{...recipe,steps:[]},{...recipe,name:'x'.repeat(161)},{...recipe,perServing:{...recipe.perServing,kcal:0}},{...recipe,ingredients:[123]}]){assert.throws(()=>validateRecipe(value));assert.equal((await request({action:'save',recipe:value})).code,400);}
 for(const body of ['{',{}, {action:'remove',id:'../../bob'}, {action:'save',recipe:null}])assert.equal((await request(body)).code,400);
 assert.equal((await request('x'.repeat(16001))).code,413);
 assert.deepEqual(validateRecipe({...recipe,name:' Chickpea salad ',uid:'bob'}),recipe);
});
test('Free accounts save one recipe under concurrent requests and can still read/remove it',async()=>{
 const {request}=fixture();
 const results=await Promise.all([request({action:'save',recipe}),request({action:'save',recipe:{...recipe,name:'Second recipe'}})]);
 assert.deepEqual(results.map(result=>result.code),[200,403]);assert.equal(results[1].body.error.code,'PRO_REQUIRED');
 assert.equal((await request()).body.recipes.length,1);
 assert.equal((await request({action:'save',recipe})).code,200);
 await request({action:'remove',id:recipeId(recipe)});
 assert.equal((await request({action:'save',recipe:{...recipe,name:'Replacement'}})).code,200);
});
test('Pro collections have no 50-recipe cap and paginate; expiry preserves existing recipes',async()=>{
 const {data,request}=fixture(true);
 for(let i=0;i<56;i++) assert.equal((await request({action:'save',recipe:{...recipe,name:'Recipe '+i}})).code,200);
 const first=await request();assert.equal(first.body.recipes.length,50);assert(first.body.nextCursor);
 const second=await request(null,'alice','GET',{after:first.body.nextCursor});assert.equal(second.body.recipes.length,6);assert.equal(second.body.nextCursor,null);
 assert.equal(new Set([...first.body.recipes,...second.body.recipes].map(item=>item.id)).size,56);
 data.set('users/alice/privateState/pro',{plan:'pro',expiresAt:'2026-10-18T12:00:00.000Z'});
 assert.equal((await request()).body.recipes.length,50);
 assert.equal((await request({action:'save',recipe:{...recipe,name:'New after expiry'}})).code,403);
 assert.equal((await request({action:'save',recipe:{...recipe,name:'Recipe 0'}})).code,200);
 assert.equal((await request(null,'alice','GET',{after:'../bad'})).code,400);
});
