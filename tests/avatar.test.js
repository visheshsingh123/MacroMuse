import test from 'node:test';
import assert from 'node:assert/strict';
import {createAvatarHandler} from '../api/avatar.js';
import {AVATAR_OPTIONS} from '../public/avatar-options.js';
import {HttpError} from '../lib/api-security.js';
function fixture(){
 const records=new Map();let fail=false;
 const ref=path=>({collection:name=>ref(path+'/'+name),doc:id=>ref(path+'/'+id),get:async()=>({data:()=>records.get(path)}),set:async value=>{if(fail)throw Error('private credential detail');records.set(path,value);}});
 const db={collection:name=>ref(name)};
 const handler=createAvatarHandler({getServices:()=>({db,auth:{verifyIdToken:async(token,revoked)=>{assert.equal(revoked,true);if(token==='invalid')throw Error('expired');return {uid:token,firebase:{sign_in_provider:token==='anonymous'?'anonymous':'password'}};}}}),quota:async(_db,uid,purpose)=>{assert.equal(purpose,'avatar');if(uid==='limited')throw new HttpError(429,'Try later.');}});
 const request=async(body,token='alice',method=body?'POST':'GET')=>{const res={headers:{},code:200,setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method,headers:token?{authorization:'Bearer '+token}:{},body},res);return res;};
 return {records,request,fail:()=>{fail=true;}};
}
test('avatar choices require verified ownership and allow only predefined options',async()=>{
 const {request}=fixture();for(const token of [null,'invalid','anonymous'])assert.equal((await request(null,token)).code,401);
 assert.equal((await request(null,'limited')).code,429);assert.equal((await request(null,'alice','DELETE')).code,405);
 for(const choice of ['<img src=x>', 'https://image.example/avatar',{},1,'random',null])assert.equal((await request({choice})).code,400);
 assert.equal((await request('{')).code,400);assert.equal((await request('x'.repeat(1025))).code,413);
});
test('each emoji and initial persist per account without overwriting profile data',async()=>{
 const {request,records}=fixture();records.set('users/alice',{profile:{name:'Taylor'}});assert.deepEqual((await request()).body,{choice:'initial'});
 for(const option of AVATAR_OPTIONS){assert.equal((await request({choice:option.id,uid:'bob'})).body.choice,option.id);assert.equal((await request()).body.choice,option.id);assert.equal((await request(null,'bob')).body.choice,'initial');}
 assert.deepEqual(records.get('users/alice'),{profile:{name:'Taylor'}});assert(!records.has('users/bob/preferences/avatar'));assert.equal((await request()).headers['Cache-Control'],'no-store');
});
test('failed avatar writes retain the previous selection and hide server details',async()=>{
 const f=fixture();await f.request({choice:'fox'});f.fail();const response=await f.request({choice:'cat'});assert.equal(response.code,503);assert(!JSON.stringify(response.body).includes('private credential'));assert.equal((await f.request()).body.choice,'fox');
});
