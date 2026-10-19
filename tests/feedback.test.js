import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFeedbackHandler} from '../api/feedback.js';
import {FEEDBACK_FIELDS,GOOGLE_FORM_ACTION,googleFeedbackBody,validateFeedback} from '../lib/feedback.js';
import {HttpError} from '../lib/api-security.js';
const valid={rating:4,name:' Taylor & Co ',email:' taylor+review@example.com ',review:' Helpful tracker. Please add more salad recipes! '};
function fixture({provider,getServices,quota}={}){
 const forwards=[],limits=[];const db={};
 const handler=createFeedbackHandler({getServices:getServices||(()=>({db})),quota:quota|| (async(store,key,purpose)=>{assert.equal(store,db);limits.push({key,purpose});}),request:async(url,options)=>{forwards.push({url,options});return provider?provider():{ok:true,url:GOOGLE_FORM_ACTION,text:async()=>'<html>Your response has been recorded.</html>'};}});
 const request=async(body=valid,{method='POST',headers={}}={})=>{const res={code:200,headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method,headers:{'content-type':'application/json',host:'nutriglance.vercel.app',origin:'https://nutriglance.vercel.app','x-forwarded-for':'203.0.113.25',...headers},body},res);return res;};
 return {request,forwards,limits};
}
test('feedback maps the provided entry IDs and existing QR rating choices to the same Google Form',async()=>{
 assert.deepEqual(FEEDBACK_FIELDS,{rating:'entry.1432228437',name:'entry.1568283615',email:'entry.165044864',review:'entry.1736432034'});
 assert(readFileSync(new URL('../public/qr.html',import.meta.url),'utf8').includes(GOOGLE_FORM_ACTION));
 for(let rating=1;rating<=5;rating++)assert.equal(googleFeedbackBody({...valid,rating}).get(FEEDBACK_FIELDS.rating),`${rating} star`);
 const f=fixture(),response=await f.request();assert.equal(response.code,200);assert.deepEqual(response.body,{sent:true});assert.equal(response.headers['Cache-Control'],'no-store');assert.equal(f.forwards.length,1);
 const {url,options}=f.forwards[0],data=new URLSearchParams(options.body);assert.equal(url,GOOGLE_FORM_ACTION);assert.equal(options.method,'POST');assert.equal(data.get(FEEDBACK_FIELDS.name),'Taylor & Co');assert.equal(data.get(FEEDBACK_FIELDS.email),'taylor+review@example.com');assert.equal(data.get(FEEDBACK_FIELDS.review),valid.review.trim());assert.equal([...data.keys()].length,4);assert(options.signal instanceof AbortSignal);
 assert.equal(f.limits[0].purpose,'feedback');assert(!f.limits[0].key.includes('203.0.113.25'));assert.equal(f.limits[0].key.length,'feedback:'.length+64);
});
test('feedback validates every required field and size before forwarding',async()=>{
 const f=fixture();for(const bad of [{...valid,rating:0},{...valid,rating:6},{...valid,rating:'4'},{...valid,name:' '},{...valid,email:'not-an-email'},{...valid,review:''},{...valid,review:'x'.repeat(1001)},{...valid,name:'x'.repeat(161)},[]]){assert.throws(()=>validateFeedback(bad));assert.equal((await f.request(bad)).code,400);}
 assert.equal((await f.request('{')).code,400);assert.equal((await f.request('x'.repeat(8001))).code,413);assert.equal(f.forwards.length,0);
});
test('public feedback checks method, content type, origin, and durable quotas',async()=>{
 const f=fixture();assert.equal((await f.request(valid,{method:'GET'})).code,405);assert.equal((await f.request(valid,{headers:{'content-type':'text/plain'}})).code,415);assert.equal((await f.request(valid,{headers:{origin:'https://another.example'}})).code,403);assert.equal(f.forwards.length,0);
 const limited=fixture({quota:async()=>{throw new HttpError(429,'Please try again later.',60);}});const response=await limited.request();assert.equal(response.code,429);assert.equal(response.headers['Retry-After'],'60');assert.equal(limited.forwards.length,0);
});
test('feedback never reports success for provider failures, closed forms, login redirects, or missing setup',async()=>{
 for(const provider of [async()=>{throw Error('private upstream failure');},async()=>({ok:false,url:GOOGLE_FORM_ACTION}),async()=>({ok:true,url:'https://accounts.google.com/login'}),async()=>({ok:true,url:GOOGLE_FORM_ACTION,text:async()=>'<h1>This form is no longer accepting responses.</h1>'})]){
  const response=await fixture({provider}).request();assert.equal(response.code,502);assert(!JSON.stringify(response.body).includes('private upstream failure'));assert(!response.body.sent);
 }
 const f=fixture({getServices:()=>{throw Error('private service credential');}}),response=await f.request();assert.equal(response.code,503);assert(!JSON.stringify(response.body).includes('private service credential'));assert.equal(f.forwards.length,0);
});
test('feedback and API routes survive the public catch-all, and every existing footer links feedback',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 for(const path of ['/api/feedback','/api/avatar','/api/saved-recipes','/feedback']){const index=config.rewrites.findIndex(rule=>rule.source===path);assert(index>=0&&index<config.rewrites.findIndex(rule=>rule.source==='/(.*)'));}
 for(const name of ['index','about','privacy','download','premium','qr','feedback']){const html=readFileSync(new URL(`../public/${name}.html`,import.meta.url),'utf8'),footer=html.match(/<footer\b[\s\S]*?<\/footer>/)[0];assert(footer.includes('href="/feedback"'),name);}
});
