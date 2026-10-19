(() => {
 const form=document.getElementById('feedback-form'),button=document.getElementById('feedback-submit'),error=document.getElementById('feedback-error');
 const ratings=[...form.querySelectorAll('input[name=rating]')],labels=['Poor','Fair','Good','Great','Excellent'];
 const fields=['name','email','review'].map(name=>document.getElementById(`feedback-${name}`));
 let busy=false;
 function fieldError(name,bad){
  const controls=name==='rating'?ratings:[document.getElementById(`feedback-${name}`)];controls.forEach(control=>control.setAttribute('aria-invalid',String(bad)));
  document.getElementById(`feedback-${name}-error`).hidden=!bad;
 }
 function paint(value){ratings.forEach(input=>{input.parentElement.dataset.filled=String(Number(input.value)<=value);});}
 ratings.forEach(input=>{
  input.addEventListener('change',()=>{const value=Number(input.value);paint(value);fieldError('rating',false);document.getElementById('feedback-rating-label').textContent=`${value} out of 5 — ${labels[value-1]}`;});
  input.parentElement.addEventListener('pointerenter',()=>{if(!busy)paint(Number(input.value));});
 });
 document.querySelector('.feedback-stars').addEventListener('pointerleave',()=>paint(Number(form.querySelector('input[name=rating]:checked')?.value)||0));
 fields.forEach(field=>field.addEventListener('input',()=>{fieldError(field.name,false);error.hidden=true;if(field.name==='review')document.getElementById('feedback-review-count').textContent=`${field.value.length.toLocaleString()} / 1,000`;}));
 function setBusy(value){busy=value;[...fields,...ratings].forEach(field=>field.disabled=value);button.disabled=value;button.classList.toggle('inline-loading',value);button.setAttribute('aria-busy',String(value));form.setAttribute('aria-busy',String(value));button.replaceChildren(document.createTextNode(value?'Sending feedback…':'Submit feedback'));}
 function showError(message){error.textContent=message;error.hidden=false;error.focus();}
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;error.hidden=true;
  const rating=Number(form.querySelector('input[name=rating]:checked')?.value)||0;
  const name=fields[0].value.trim(),email=fields[1].value.trim(),review=fields[2].value.trim();
  const invalid=[['rating',!rating],['name',!name||name.length>160],['email',!fields[1].checkValidity()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)],['review',!review||review.length>1000]];
  invalid.forEach(([key,bad])=>fieldError(key,bad));
  const first=invalid.find(([,bad])=>bad);if(first){(first[0]==='rating'?ratings[0]:document.getElementById(`feedback-${first[0]}`)).focus();return;}
  if(navigator.onLine===false){showError('You’re offline. Reconnect and try again. Your review is still here.');return;}
  setBusy(true);
  try{
   const response=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating,name,email,review}),signal:AbortSignal.timeout(18000)});
   const data=await response.json().catch(()=>null);
   if(!response.ok||data?.sent!==true)throw new Error(data?.error?.message||'We couldn’t send your feedback. Please try again.');
   document.getElementById('feedback-form-wrap').hidden=true;document.getElementById('feedback-success').hidden=false;document.getElementById('feedback-success-title').focus({preventScroll:true});
  }catch(failure){showError(failure.name==='TimeoutError'||failure.name==='AbortError'?'Sending took too long. Your review is still here—please try again.':failure.message||'We couldn’t send your feedback. Please try again.');}
  finally{setBusy(false);}
 });
 const toggle=document.getElementById('dark-toggle'),moon=document.getElementById('icon-moon'),sun=document.getElementById('icon-sun');
 function theme(on){document.body.classList.toggle('dark',on);document.documentElement.classList.toggle('dark',on);toggle.setAttribute('aria-pressed',String(on));moon.classList.toggle('hidden',on);sun.classList.toggle('hidden',!on);try{localStorage.setItem('nutriglance_darkmode',on?'1':'0');}catch{}}
 theme(document.documentElement.classList.contains('dark'));toggle.addEventListener('click',()=>theme(!document.documentElement.classList.contains('dark')));
})();
