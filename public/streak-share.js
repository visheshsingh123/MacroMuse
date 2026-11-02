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
    ctx.fillStyle = '#0b2922';ctx.fillRect(0, 0, 1080, 1920);
    ctx.strokeStyle = '#59cbaa28';ctx.lineWidth = 2;
    for (let r = 280; r < 1400; r += 120) { ctx.beginPath();ctx.arc(1040, 80, r, 0, Math.PI * 2);ctx.stroke(); }
    ctx.fillStyle = '#59cbaa';ctx.beginPath();ctx.roundRect(72, 72, 936, 1776, 64);ctx.fill();
    ctx.fillStyle = '#0b2922';ctx.font = 'bold 52px sans-serif';ctx.fillText('MacroMuse', 132, 180);
    ctx.font = '24px sans-serif';ctx.fillText('SMALL STEPS. STRONGER HABITS.', 132, 235);
    ctx.save();ctx.translate(540, 510);ctx.fillStyle = '#0b2922';
    ctx.beginPath();ctx.moveTo(0,-130);ctx.bezierCurveTo(100,-30,130,20,95,100);ctx.bezierCurveTo(55,190,-100,165,-115,65);ctx.bezierCurveTo(-130,-10,-65,-65,-55,-90);ctx.bezierCurveTo(-55,-20,-15,-15,0,-130);ctx.fill();
    ctx.fillStyle = '#59cbaa';ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(65,65,50,120,0,125);ctx.bezierCurveTo(-55,120,-60,70,0,0);ctx.fill();ctx.restore();
    ctx.textAlign = 'center';ctx.fillStyle = '#0b2922';ctx.font = 'bold 27px sans-serif';ctx.fillText('MY CURRENT STREAK', 540, 805);
    ctx.font = `bold ${count > 9999 ? 180 : 260}px sans-serif`;ctx.fillText(String(count), 540, 1090);
    ctx.font = 'bold 64px sans-serif';ctx.fillText(count === 1 ? 'DAY ON MACROMUSE' : 'DAYS ON MACROMUSE', 540, 1190);
    ctx.font = '34px sans-serif';ctx.fillText(count ? 'Showing up, one day at a time.' : 'Every streak starts with day one.', 540, 1320);
    ctx.fillStyle = '#0b2922';ctx.beginPath();ctx.roundRect(132, 1450, 816, 252, 36);ctx.fill();
    ctx.fillStyle = '#eff7f4';ctx.font = 'bold 42px sans-serif';ctx.fillText('Build your own streak.', 540, 1540);
    ctx.fillStyle = '#59cbaa';ctx.font = '30px sans-serif';ctx.fillText('macromuse.vercel.app', 540, 1615);
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
      const url = URL.createObjectURL(file), link = document.createElement('a');
      link.href = url;link.download = file.name;document.body.append(link);link.click();link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = 'Banner saved. Instagram: + → Story → choose the saved image. WhatsApp: Updates → Add status → choose the saved image.';
    } catch (error) {
      if (error.name !== 'AbortError') status.textContent = 'Couldn’t save this banner. Please try again.';
    } finally { busy = false;button.disabled = !prepared; }
  });
  new MutationObserver(prepare).observe(stat, { childList: true, characterData: true, subtree: true });
  prepare();
})();
