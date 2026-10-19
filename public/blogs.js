(() => {
 const toggle=document.getElementById('dark-toggle'),moon=document.getElementById('icon-moon'),sun=document.getElementById('icon-sun');
 function theme(on,persist=false){
  document.body.classList.toggle('dark',on);document.documentElement.classList.toggle('dark',on);
  toggle.setAttribute('aria-pressed',String(on));moon.classList.toggle('hidden',on);sun.classList.toggle('hidden',!on);
  if(persist){try{localStorage.setItem('nutriglance_darkmode',on?'1':'0');}catch{}}
 }
 theme(document.documentElement.classList.contains('dark'));
 toggle.addEventListener('click',()=>theme(!document.documentElement.classList.contains('dark'),true));
 window.addEventListener('storage',event=>{if(event.key==='nutriglance_darkmode')theme(event.newValue==='1');});
 const contents=document.querySelector('.blog-toc details');
 if(contents&&matchMedia('(max-width:900px)').matches)contents.open=false;
 for(const link of document.querySelectorAll('.blog-toc a[href^="#"]')){
  link.addEventListener('click',event=>{
   const heading=document.getElementById(link.hash.slice(1));if(!heading)return;
   event.preventDefault();history.replaceState(null,'',link.hash);heading.focus({preventScroll:true});heading.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
  });
 }
})();
