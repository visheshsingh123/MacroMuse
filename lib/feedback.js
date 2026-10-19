import { HttpError } from './api-security.js';
export const GOOGLE_FORM_ACTION='https://docs.google.com/forms/d/e/1FAIpQLScf7sXqf0CwxU6V1rr4ddZhcANGSawYvNs0NK426hJTrQq6Hw/formResponse';
export const FEEDBACK_FIELDS=Object.freeze({rating:'entry.1432228437',name:'entry.1568283615',email:'entry.165044864',review:'entry.1736432034'});
export function validateFeedback(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new HttpError(400,'Please complete the feedback form.');
  if(!Number.isInteger(raw.rating)||raw.rating<1||raw.rating>5)throw new HttpError(400,'Please choose a rating from 1 to 5 stars.');
  const text=(key,max)=>typeof raw[key]==='string'&&raw[key].trim().length>0&&raw[key].length<=max;
  if(!text('name',160))throw new HttpError(400,'Please enter your name (up to 160 characters).');
  if(!text('email',254)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.email.trim()))throw new HttpError(400,'Please enter a valid email address.');
  if(!text('review',1000))throw new HttpError(400,'Please write a review (up to 1,000 characters).');
  return {rating:raw.rating,name:raw.name.trim(),email:raw.email.trim(),review:raw.review.trim()};
}
export function googleFeedbackBody(feedback){
  const value=validateFeedback(feedback);
  return new URLSearchParams({[FEEDBACK_FIELDS.rating]:`${value.rating} star`,[FEEDBACK_FIELDS.name]:value.name,[FEEDBACK_FIELDS.email]:value.email,[FEEDBACK_FIELDS.review]:value.review});
}
