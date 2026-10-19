import test from 'node:test';
import assert from 'node:assert/strict';
import { createSavedRecipesHandler } from '../api/saved-recipes.js';
import { validateRecipe, recipeId } from '../lib/saved-recipes.js';
import { HttpError } from '../lib/api-security.js';
const recipe = { name:'Chickpea salad',perServing:{kcal:400,protein:25,carbs:40,fat:15},ingredients:['150g chickpeas','Half a cucumber'],steps:['Chop cucumber.','Mix together.'] };
function fixture() {
  const data = new Map();let queue = Promise.resolve();
  const snapshot = ref => ref.query ? {docs:[...data].filter(([key])=>key.startsWith(ref.path+'/')).slice(0,ref.count).map(([key,value])=>({id:key.split('/').at(-1),data:()=>value})),get size(){return this.docs.length;}} : {exists:data.has(ref.path),data:()=>data.get(ref.path)};
  function collection(path) { return {path,doc(id){const ref={path:path+'/'+id,collection:name=>collection(path+'/'+id+'/'+name),delete:async()=>data.delete(path+'/'+id)};return ref;},limit(count){const ref={path,count,query:true,get:async()=>snapshot(ref)};return ref;}}; }
  const db = {collection,runTransaction(fn){const result=queue.then(()=>fn({get:async ref=>snapshot(ref),set:(ref,value)=>data.set(ref.path,value)}));queue=result.catch(()=>{});return result;}};
  const handler=createSavedRecipesHandler({getServices:()=>({db,auth:{verifyIdToken:async token=>{if(['invalid','revoked'].includes(token))throw Error('private token');return {uid:token,firebase:{sign_in_provider:token==='anonymous'?'anonymous':'password'}};}}}),quota:async(_db,uid,purpose)=>{assert.equal(purpose,'recipes');if(uid==='limited')throw new HttpError(429,'Try later.');},clock:()=>new Date('2026-10-19T12:00:00Z')});
  const request=async(body,token='alice',method=body?'POST':'GET')=>{const res={headers:{},code:200,setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method,headers:token?{authorization:'Bearer '+token}:{},body},res);return res;};return {data,request};
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
test('collection cap holds during concurrent saves while existing recipes remain accessible',async()=>{
 const {data,request}=fixture();for(let i=0;i<49;i++)await request({action:'save',recipe:{...recipe,name:'Salad '+i}});
 const results=await Promise.all([request({action:'save',recipe:{...recipe,name:'Salad 49'}}),request({action:'save',recipe:{...recipe,name:'Salad 50'}})]);
 assert.deepEqual(results.map(result=>result.code),[200,409]);assert.equal([...data.keys()].filter(key=>key.includes('/savedRecipes/')).length,50);assert.equal((await request({action:'save',recipe:{...recipe,name:'Salad 0'}})).code,200);
});
