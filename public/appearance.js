// Device-wide presentation preference; never contains account data.
(() => {
  const key = 'macromuse_liquid_glass';
  let enabled = true;
  const read = () => { try { return localStorage.getItem(key) !== '0'; } catch { return enabled; } };
  function apply(value) {
    enabled = value;
    document.documentElement.setAttribute('data-liquid-glass', value ? 'on' : 'off');
    document.getElementById('liquid-glass-toggle')?.setAttribute('aria-checked', String(value));
  }
  apply(read());
  document.addEventListener('DOMContentLoaded', () => {
    apply(enabled);
    document.getElementById('liquid-glass-toggle')?.addEventListener('click', () => {
      apply(!enabled);
      try { localStorage.setItem(key, enabled ? '1' : '0'); } catch {}
    });
  });
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) apply(read()); });
})();
