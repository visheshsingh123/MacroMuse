(() => {
  const button = document.getElementById('cancel-pro-btn');
  const status = document.getElementById('cancel-pro-status');
  if (!button || !status) return;
  let busy = false;
  button.addEventListener('click', async () => {
    if (busy) return;
    const owner = window.NutriSecurity.resumeOwner();
    if (!window.NutriSecurity.isCurrent(owner)) return;
    busy = true;status.textContent = '';status.setAttribute('role', 'status');
    try {
      const confirmed = await window.NutriDialog.confirm(
        'Your Pro access will end immediately and Free limits will apply. This does not issue a refund. Your meals and saved recipes stay. You can activate Pro again with a valid code. Wait five seconds before confirming.',
        { title: 'Cancel MacroMuse Pro?', confirmLabel: 'Cancel Pro', cancelLabel: 'Keep Pro', danger: true, confirmDelaySeconds: 5 }
      );
      if (!confirmed || !window.NutriSecurity.isCurrent(owner)) return;
      button.disabled = true;button.textContent = 'Cancelling…';
      await window.NutriUsage.request('/api/pro', { method: 'DELETE' });
      if (window.NutriSecurity.isCurrent(owner)) {
        status.textContent = 'Pro cancelled. Your account is now on the Free plan.';
        // The cancelled action is now hidden. Keep keyboard focus in this card.
        const heading = document.getElementById('settings-account-heading');
        heading.tabIndex = -1;heading.focus({ preventScroll: true });
      }
    } catch (error) {
      if (window.NutriSecurity.isCurrent(owner)) {
        status.setAttribute('role', 'alert');
        status.textContent = error.message || 'Couldn’t cancel Pro. Please try again.';
      }
    } finally { busy = false;button.disabled = false;button.textContent = 'Cancel Pro'; }
  });
})();
