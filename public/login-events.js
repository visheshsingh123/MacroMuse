// Explicit handlers work under CSP without permitting arbitrary inline events.
document.querySelectorAll('[data-auth-tab]').forEach(button => {
  button.addEventListener('click', () => window.switchTab(button.dataset.authTab));
});
document.querySelectorAll('[data-password-input]').forEach(button => {
  button.addEventListener('click', () => window.togglePw(button.dataset.passwordInput, button));
});
document.getElementById('signin-btn').addEventListener('click', () => window.handleSignIn());
document.getElementById('signup-btn').addEventListener('click', () => window.handleSignUp());
document.getElementById('signup-password').addEventListener('input', event => window.updateStrength(event.target.value));
