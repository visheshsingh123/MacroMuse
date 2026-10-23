import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {adminServices} from '../lib/firebase-admin.js';
import {consumeQuota,HttpError,sendError} from '../lib/api-security.js';
import {GOOGLE_FORM_ACTION,googleFeedbackBody,validateFeedback} from '../lib/feedback.js';

export function createFeedbackHandler({getServices=adminServices,quota=consumeQuota,request=fetch}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:{message:'Method not allowed.'}});}
  try{
   if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))throw new HttpError(415,'Please submit feedback using the form.');
   if(req.headers?.origin){
    let origin;try{origin=new URL(req.headers.origin);}catch{throw new HttpError(403,'Please submit feedback from MacroMuse.');}
    if(!['https:','http:'].includes(origin.protocol)||origin.host!==req.headers.host)throw new HttpError(403,'Please submit feedback from MacroMuse.');
   }
   let body=req.body;
   if(typeof body==='string'){if(Buffer.byteLength(body)>8000)throw new HttpError(413,'This review is too large.');try{body=JSON.parse(body);}catch{throw new HttpError(400,'Please complete the feedback form.');}}
   if(body&&Buffer.byteLength(JSON.stringify(body))>8000)throw new HttpError(413,'This review is too large.');
   const feedback=validateFeedback(body);
   const {db}=getServices();
   // The forwarded address is supplied by Vercel; only its digest enters quota keys.
   const forwarded=req.headers?.['x-forwarded-for'];
   const address=typeof forwarded==='string'?forwarded.split(',')[0].trim():'';
   const digest=createHash('sha256').update(isIP(address)?address:'unknown').digest('hex');
   await quota(db,`feedback:${digest}`,'feedback');
   let response;
   try{
    response=await request(GOOGLE_FORM_ACTION,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:googleFeedbackBody(feedback).toString(),signal:AbortSignal.timeout(12000)});
    const target=new URL(response.url||GOOGLE_FORM_ACTION);
    if(!response.ok||target.hostname!=='docs.google.com'||!target.pathname.endsWith('/formResponse'))throw new Error('Form unavailable');
    const html=await response.text();
    if(/no longer accepting responses|not accepting responses|you need permission|sign in to continue/i.test(html))throw new Error('Form unavailable');
   }catch{throw new HttpError(502,'We couldn’t send your feedback to Google Forms. Please try again.');}
   return res.status(200).json({sent:true});
  }catch(error){return sendError(res,error);}
 };
}
export default createFeedbackHandler();
