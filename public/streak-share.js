// Render locally: no account details or images leave the device until sharing.
(() => {
  const button = document.getElementById('share-streak-btn');
  const stat = document.getElementById('stat-streak');
  if (!button || !stat) return;
  const status = document.getElementById('streak-share-status');
  let prepared = null, generation = 0, busy = false;
  function prepare() {
    const revision = ++generation;
    prepared = null;button.disabled = true;
    const count = Number(stat.textContent);
    if (!Number.isSafeInteger(count) || count < 0) return;
    const canvas = document.createElement('canvas');canvas.width = 1080;canvas.height = 1920;
    const ctx = canvas.getContext('2d');if (!ctx) return;
    const background = ctx.createRadialGradient(520, 750, 40, 540, 900, 1250);
    background.addColorStop(0, '#14664d');background.addColorStop(.6, '#034c3b');background.addColorStop(1, '#002e26');
    ctx.fillStyle = background;ctx.fillRect(0, 0, 1080, 1920);
    function path(d, fill) { ctx.fillStyle = fill;ctx.fill(new Path2D(d)); }
    const mint = ctx.createLinearGradient(0, 0, 900, 400);
    mint.addColorStop(0, '#b3ffe1');mint.addColorStop(.5, '#59cbaa');mint.addColorStop(1, '#14855f');
    path('M0 0H540C370 130 140 70 0 250Z', mint);
    path('M0 0H180C90 50 45 105 0 155Z', '#94f2cf');
    ctx.save();ctx.translate(1080,1920);ctx.rotate(Math.PI);
    path('M0 0H650C430 170 170 80 0 290Z', mint);
    path('M0 0H240C110 80 65 135 0 190Z', '#94f2cf');ctx.restore();
    ctx.textAlign = 'center';ctx.fillStyle = '#fff9e8';ctx.font = 'bold 64px sans-serif';ctx.fillText('MacroMuse', 580, 290);
    ctx.save();ctx.translate(278,260);ctx.rotate(-.35);
    path('M0 30C-50 10-47-34-42-48C5-35 17-3 0 30Z', mint);
    path('M12 28C5-17 33-52 72-48C69-4 45 25 12 28Z', mint);ctx.restore();
    const glow = ctx.createRadialGradient(540, 680, 20, 540, 680, 300);
    glow.addColorStop(0, '#ffca4b70');glow.addColorStop(1, '#ffca4b00');ctx.fillStyle = glow;ctx.fillRect(220,340,640,640);
    const fire = ctx.createLinearGradient(380, 400, 650, 850);
    fire.addColorStop(0, '#ffb531');fire.addColorStop(.5, '#ff6412');fire.addColorStop(1, '#ffb21c');
    ctx.save();ctx.shadowColor='#ffb01b';ctx.shadowBlur=28;
    path('M535 375C610 420 663 495 639 580C625 640 660 650 679 570C772 680 773 844 641 884C536 925 363 891 352 759C340 656 406 570 471 520C442 620 479 636 509 564C541 495 552 434 535 375Z', fire);ctx.restore();
    const inner = ctx.createLinearGradient(460,550,590,900);inner.addColorStop(0,'#ffad18');inner.addColorStop(1,'#fff3a0');
    path('M588 530C625 655 512 682 595 748C624 771 662 751 661 735C703 838 611 909 532 891C413 863 406 777 443 711C441 787 470 789 484 716C499 639 583 615 588 530Z', inner);
    path('M524 710C507 789 607 792 568 862C543 908 464 859 484 805C493 773 512 743 524 710Z', '#fff2a1');
    function sparkle(x,y,size) { ctx.save();ctx.translate(x,y);ctx.scale(size,size);path('M0-1Q.16-.16 1 0Q.16.16 0 1Q-.16.16-1 0Q-.16-.16 0-1Z','#fff0a0');ctx.restore(); }
    sparkle(820,490,24);sparkle(240,720,20);
    for (const side of [-1,1]) {
      ctx.save();ctx.translate(540,0);ctx.scale(side,1);
      ctx.strokeStyle='#34ae80';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(260,1190);ctx.bezierCurveTo(390,1110,420,970,355,840);ctx.stroke();
      for (let i=0;i<6;i++) {
        const y=880+i*48, x=362+Math.sin(i/5*Math.PI)*35-i*10;
        ctx.save();ctx.translate(x,y);ctx.rotate(-.35+i*.12);
        path('M0 0C-65-15-65-65-58-85C-5-65 8-28 0 0Z',mint);
        path('M0 10C40 5 65-25 67-52C20-55-4-20 0 10Z',mint);ctx.restore();
      }
      ctx.restore();
    }
    ctx.fillStyle='#fff9e8';let size=350;ctx.font=`bold ${size}px sans-serif`;
    while(ctx.measureText(String(count)).width>600 && size>55){size-=5;ctx.font=`bold ${size}px sans-serif`;}
    ctx.save();ctx.shadowColor='#001f1980';ctx.shadowBlur=18;ctx.shadowOffsetY=10;ctx.fillText(String(count),540,1180);ctx.restore();
    const ribbon=ctx.createLinearGradient(0,1200,0,1390);ribbon.addColorStop(0,'#b7ffe4');ribbon.addColorStop(.5,'#64deb0');ribbon.addColorStop(1,'#28a777');
    ctx.save();ctx.shadowColor='#001f1980';ctx.shadowBlur=24;
    path('M120 1240Q540 1135 960 1240L920 1310L952 1390Q540 1310 128 1390L155 1310Z',ribbon);ctx.restore();
    ctx.fillStyle='#003e30';ctx.font='italic bold 72px sans-serif';ctx.fillText('DAY STREAK',540,1325);
    ctx.fillStyle='#fff9e8';ctx.font='italic 38px sans-serif';ctx.fillText(count?'Showing up, one day at a time.':'Every streak starts with day one.',540,1500);
    ctx.strokeStyle='#88ecc5';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(350,1555);ctx.quadraticCurveTo(540,1515,730,1555);ctx.stroke();
    ctx.font='bold 46px sans-serif';ctx.fillText('Build your own streak.',540,1660);
    ctx.fillStyle='#88ecc5';ctx.font='38px sans-serif';ctx.fillText('macromuse.vercel.app',540,1730);
    canvas.toBlob(blob => {
      if (revision !== generation || !blob) return;
      prepared = new File([blob], `MacroMuse-${count}-day-streak.png`, { type: 'image/png' });
      button.disabled = busy;
    }, 'image/png');
  }
  button.addEventListener('click', async () => {
    if (!prepared || busy) return;
    const file = prepared;
    busy = true;button.disabled = true;status.textContent = '';
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(file), link = document.createElement('a');
        link.href = url;link.download = file.name;document.body.append(link);link.click();link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        status.textContent = 'Banner downloaded. Share it in your favorite app.';
      }
    } catch (error) {
      if (error.name !== 'AbortError') status.textContent = 'Couldn’t share this banner. Please try again.';
    } finally { busy = false;button.disabled = !prepared; }
  });
  new MutationObserver(prepare).observe(stat, { childList: true, characterData: true, subtree: true });
  prepare();
})();
