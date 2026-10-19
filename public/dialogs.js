(() => {
  const queue=[];let active=false, dialog;
  function element(tag,className,text){const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function mount(){
    dialog=element('dialog','app-dialog');dialog.id='app-dialog';dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','app-dialog-title');dialog.setAttribute('aria-describedby','app-dialog-message');
    const content=element('div','app-dialog-content');
    const icon=element('span','app-dialog-icon','!');icon.setAttribute('aria-hidden','true');
    const title=element('h2','app-dialog-title');title.id='app-dialog-title';
    const message=element('p','app-dialog-message');message.id='app-dialog-message';
    const actions=element('div','app-dialog-actions');
    const cancel=element('button','ng-button ng-button-secondary','Cancel');cancel.id='app-dialog-cancel';cancel.type='button';
    const confirm=element('button','ng-button ng-button-primary','OK');confirm.id='app-dialog-confirm';confirm.type='button';
    cancel.addEventListener('click',()=>dialog.close('cancel'));confirm.addEventListener('click',()=>{if(!confirm.disabled)dialog.close('confirm');});
    dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close('cancel');});
    dialog.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const buttons=[...dialog.querySelectorAll('button')].filter(button=>!button.hidden&&!button.disabled);
      if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1).focus();}
      else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0].focus();}
    });
    let pressedOutside=false;
    const outside=event=>{const rect=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom);};
    dialog.addEventListener('pointerdown',event=>{pressedOutside=outside(event);});
    dialog.addEventListener('click',event=>{if(pressedOutside&&outside(event))dialog.close('cancel');pressedOutside=false;});
    actions.append(cancel,confirm);content.append(icon,title,message,actions);dialog.append(content);document.body.append(dialog);
  }
  function next(){
    if(active||!queue.length)return;if(!dialog)mount();
    active=true;const {message,options,confirming,resolve}=queue.shift(),previous=document.activeElement;
    dialog.setAttribute('role',confirming?'dialog':'alertdialog');
    document.getElementById('app-dialog-title').textContent=options.title||(confirming?'Are you sure?':'Notice');
    document.getElementById('app-dialog-message').textContent=String(message);
    const cancel=document.getElementById('app-dialog-cancel'),confirm=document.getElementById('app-dialog-confirm');
    const confirmLabel=options.confirmLabel||(confirming?'Continue':'OK');
    cancel.hidden=!confirming;cancel.textContent=options.cancelLabel||'Cancel';confirm.textContent=confirmLabel;confirm.disabled=false;
    const seconds=Number(options.confirmDelaySeconds);
    let countdown;
    if(confirming&&Number.isFinite(seconds)&&seconds>0){
      const deadline=performance.now()+Math.min(seconds,60)*1000;
      const tick=()=>{
        const remaining=Math.max(0,Math.ceil((deadline-performance.now())/1000));
        confirm.disabled=remaining>0;confirm.textContent=remaining?`${confirmLabel} (${remaining}s)`:confirmLabel;
        if(!remaining)clearInterval(countdown);
      };
      tick();countdown=setInterval(tick,100);
    }
    confirm.classList.toggle('app-dialog-danger',Boolean(options.danger));dialog.querySelector('.app-dialog-icon').textContent=options.danger?'!':confirming?'?':'i';
    const finish=()=>{
      const accepted=dialog.returnValue==='confirm'&&!confirm.disabled;clearInterval(countdown);confirm.disabled=false;active=false;
      if(previous?.isConnected&&!previous.disabled)previous.focus({preventScroll:true});
      resolve(accepted);queueMicrotask(next);
    };
    dialog.addEventListener('close',finish,{once:true});dialog.returnValue='cancel';dialog.showModal();
    // Destructive actions never receive the initial keyboard focus.
    (confirming?cancel:confirm).focus({preventScroll:true});
  }
  function ask(message,options,confirming){return new Promise(resolve=>{queue.push({message,options,confirming,resolve});next();});}
  window.NutriDialog={alert:(message,options={})=>ask(message,options,false),confirm:(message,options={})=>ask(message,options,true)};
})();
