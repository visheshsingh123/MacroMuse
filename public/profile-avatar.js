import { AVATAR_OPTIONS, avatarOption } from './avatar-options.js';
const cacheKey='nutriglance_avatar', ids=['avatar-initial','avatar-initial-mobile','profile-avatar-display'];
let uid=null, version=0, choice='initial', draft='initial', busy=false, loading=false, loadFailed=false;
const picker=document.getElementById('avatar-picker');
const current=owner=>Boolean(owner && owner===uid && window.NutriSecurity?.isCurrent(owner));
const initial=()=>{try {const profile=JSON.parse(localStorage.getItem('nutriglance_profile')||'null');return profile?.name?.trim().slice(0,1).toUpperCase()||'?';}catch{return '?';}};
const status=(message,error=false)=>{const node=document.getElementById('avatar-picker-status');if(node){node.setAttribute('role',error?'alert':'status');node.textContent=message;}};
function cached(owner){try{const item=JSON.parse(localStorage.getItem(cacheKey)||'null');return item?.uid===owner && avatarOption(item.choice) ? item : null;}catch{return null;}}
function remember(owner,value){try{localStorage.setItem(cacheKey,JSON.stringify({uid:owner,choice:value,updatedAt:Date.now()}));}catch{}}
function visibleChoice(){
 if(current(uid))return choice;
 const owner=window.NutriSecurity?.resumeOwner?.();
 return owner ? cached(owner)?.choice||'initial' : 'initial';
}
function symbol(fallback){return avatarOption(visibleChoice())?.emoji || fallback;}
function render(){
 const option=avatarOption(visibleChoice());
 for(const id of ids){const node=document.getElementById(id);if(!node)continue;node.textContent=option.emoji||initial();node.classList.toggle('emoji-avatar',Boolean(option.emoji));node.setAttribute('role','img');node.setAttribute('aria-label',option.emoji?`${option.label} profile picture`:'Profile picture: your initial');}
 if(!picker)return;
 picker.querySelectorAll('input[name=avatar-choice]').forEach(input=>{input.checked=input.value===draft;input.disabled=!current(uid)||busy||loading;});
 const save=document.getElementById('avatar-save');save.disabled=!current(uid)||busy||loading||draft===choice;save.textContent=busy?'Saving…':'Save picture';save.classList.toggle('inline-loading',busy);save.setAttribute('aria-busy',String(busy));
 document.getElementById('avatar-retry').hidden=!loadFailed;
 picker.setAttribute('aria-busy',String(loading||busy));
}
async function request(value){
 const response=await window.NutriSecurity.apiFetch('/api/avatar',value?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({choice:value})}:{method:'GET'});
 const data=await response.json().catch(()=>null);if(!data)throw new Error('Couldn’t update your profile picture. Please try again.');if(!response.ok)throw new Error(data.error?.message||'Couldn’t update your profile picture. Please try again.');
 if(!avatarOption(data.choice))throw new Error('Couldn’t load your profile picture. Please try again.');return data.choice;
}
async function load(){
 const owner=uid;if(!current(owner)||busy||loading)return;
 const generation=++version;loading=true;loadFailed=false;status('Loading profile pictures…');render();
 try{
  const value=await request();if(!current(owner)||generation!==version)return;
  choice=value;draft=value;remember(owner,value);status('Choose an emoji for your profile.');
 }catch(error){if(current(owner)&&generation===version){loadFailed=true;status(error.message,true);}}
 finally{if(current(owner)&&generation===version){loading=false;render();}}
}
function connect(owner){
 if(uid===owner&&owner)return;
 uid=owner;version++;busy=false;loading=false;loadFailed=false;
 const cache=owner&&cached(owner);choice=cache?.choice||'initial';draft=choice;render();
 if(current(owner)&&(!cache||!Number.isFinite(cache.updatedAt)||Date.now()-cache.updatedAt<0||Date.now()-cache.updatedAt>5*60*1000))load();
}
if(picker){
 const grid=document.getElementById('avatar-options');
 for(const option of AVATAR_OPTIONS.filter(option=>option.selectable!==false)){
  const label=document.createElement('label');label.className='avatar-option';
  const input=document.createElement('input');input.type='radio';input.name='avatar-choice';input.value=option.id;input.className='sr-only';input.setAttribute('aria-label',option.label);input.disabled=true;
  const face=document.createElement('span');face.className='avatar-option-face';face.textContent=option.emoji||'Aa';face.setAttribute('aria-hidden','true');
  const name=document.createElement('span');name.className='avatar-option-label';name.textContent=option.label;
  label.append(input,face,name);grid.append(label);
  input.addEventListener('change',()=>{draft=option.id;status(draft===choice?'This is your current profile picture.':`${option.label} selected. Save to update your picture.`);render();});
 }
 document.getElementById('avatar-retry').addEventListener('click',load);
 document.getElementById('avatar-save').addEventListener('click',async()=>{
  const owner=uid;if(!current(owner)||busy||loading||draft===choice)return;
  if(navigator.onLine===false){status('Reconnect to save your profile picture.',true);return;}
  const generation=version,value=draft;busy=true;status('Saving your profile picture…');render();
  try{
   const saved=await request(value);if(!current(owner)||generation!==version)return;
   choice=saved;draft=saved;loadFailed=false;remember(owner,saved);status('Profile picture saved across your account.');window.NutriFeedback?.show('Profile picture updated.');
  }catch(error){if(current(owner)&&generation===version)status(error.message,true);}
  finally{if(current(owner)&&generation===version){busy=false;render();}}
 });
}
window.addEventListener('storage',event=>{
 if(event.key==='nutriglance_session_uid'||event.key===null){if(!current(uid)||localStorage.getItem('nutriglance_session_uid')!==uid)connect(null);}
 if(event.key===cacheKey&&current(uid)){const item=cached(uid);if(item){const dirty=draft!==choice;choice=item.choice;if(!dirty)draft=choice;render();}}
});
window.NutriAvatar={connect,symbol};
const owner=window.NutriSecurity?.resumeOwner?.();
if(window.NutriSecurity?.isCurrent(owner))connect(owner);
else render();
