// Shared first-time setup for every authenticated page.
(() => {
  document.body.insertAdjacentHTML('beforeend', `
  <!-- First-time profile setup, shown by the Firebase auth listener. -->
  <div id="onboarding-overlay" class="hidden fixed inset-0 z-[100]"
       role="dialog" aria-modal="true" aria-labelledby="onboarding-title" aria-describedby="onboarding-description">
    <div class="onboarding-card">
      <aside class="onboarding-intro">
        <div class="onboarding-brand"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 4C9 2 3 8 5 15s15 5 15-11Z"/><path d="M4 21 15 10"/></svg>NutriGlance</div>
        <div class="onboarding-intro-copy">
          <p class="onboarding-eyebrow">LET’S MAKE IT PERSONAL</p>
          <h2>Your goals.<br> Your pace.</h2>
          <p>A few details to build a daily nutrition target around you.</p>
        </div>
        <div class="onboarding-art" aria-hidden="true">
          <svg viewBox="0 0 240 220" fill="none">
            <circle cx="120" cy="96" r="76" stroke="currentColor" stroke-opacity=".13" stroke-dasharray="3 7"/>
            <circle cx="120" cy="96" r="54" stroke="currentColor" stroke-opacity=".12" stroke-width="13"/>
            <path d="M120 42a54 54 0 1 1-51 72" stroke="currentColor" stroke-width="13" stroke-linecap="round"/>
            <path d="M140 76c-27-4-43 10-37 27s37 12 37-27Z" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="2"/>
            <path d="m99 116 28-29" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M32 52h12m-6-6v12m157 62h12m-6-6v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <div class="onboarding-goal-preview"><span>Your daily goals</span><i></i><i></i><i></i></div>
        </div>
        <p class="onboarding-intro-note">One quick setup.<br>Room to adjust as you go.</p>
      </aside>

      <div class="onboarding-content">
        <header class="onboarding-heading">
          <p class="onboarding-eyebrow">YOUR STARTING POINT</p>
          <h2 id="onboarding-title" tabindex="-1">Hello, <span id="onb-greeting-name">there</span>!</h2>
          <p id="onboarding-description">Let’s find the daily goals that fit you.</p>
        </header>
        <div id="onboarding-load-error" class="hidden" role="alert">
          <p>We couldn’t load your profile. Check your connection and try again.</p>
          <button id="onboarding-retry" type="button">Try again</button>
        </div>
        <form id="onboarding-form" novalidate>
          <div class="onboarding-form-section">
            <div class="onboarding-section-title"><span>01</span><h3>A little about you</h3></div>
            <div class="onboarding-name-field">
              <label for="onb-name">Your name</label>
              <input id="onb-name" class="onboarding-input" type="text" placeholder="What should we call you?" autocomplete="given-name" maxlength="160" required />
            </div>
            <fieldset class="onboarding-gender">
              <legend>Gender</legend>
              <p id="onb-gender-help">Used to estimate your daily energy needs.</p>
              <div class="onboarding-choices">
                <label class="onboarding-choice"><input type="radio" name="onb-gender" value="male" class="sr-only" checked aria-describedby="onb-gender-help" /><span>Male<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg></span></label>
                <label class="onboarding-choice"><input type="radio" name="onb-gender" value="female" class="sr-only" aria-describedby="onb-gender-help" /><span>Female<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg></span></label>
              </div>
            </fieldset>
          </div>
          <div class="onboarding-form-section">
            <div class="onboarding-section-title"><span>02</span><h3>Your measurements</h3></div>
            <div class="onboarding-measurements">
              <div><label for="onb-age">Age</label><div class="onboarding-field"><input id="onb-age" type="number" inputmode="numeric" min="10" max="100" step="1" placeholder="28" required /><span aria-hidden="true">yrs</span></div></div>
              <div><label for="onb-weight">Weight <span class="sr-only">in kilograms</span></label><div class="onboarding-field"><input id="onb-weight" type="number" inputmode="decimal" min="20" max="300" step="0.1" placeholder="68" required /><span aria-hidden="true">kg</span></div></div>
              <div><label for="onb-height">Height <span class="sr-only">in centimeters</span></label><div class="onboarding-field"><input id="onb-height" type="number" inputmode="numeric" min="100" max="250" step="1" placeholder="172" required /><span aria-hidden="true">cm</span></div></div>
            </div>
          </div>
          <div class="onboarding-form-section">
            <div class="onboarding-section-title"><span>03</span><h3>Your lifestyle</h3></div>
            <label for="onb-activity">Activity level</label>
            <select id="onb-activity" class="onboarding-input" aria-describedby="onb-activity-help" required>
              <option value="" disabled selected>Choose your activity level</option>
              <option value="sedentary">Sedentary</option>
              <option value="lightly_active">Lightly active</option>
              <option value="moderately_active">Moderately active</option>
              <option value="very_active">Very active</option>
            </select>
            <p id="onb-activity-help" class="onboarding-activity-help">Include your work, walking, and exercise in a typical week.</p>
            <div class="onboarding-goal-field">
              <label for="onb-goal">Your goal</label>
              <select id="onb-goal" class="onboarding-input" aria-describedby="onb-goal-help" required>
                <option value="maintenance" selected>Maintain weight</option>
                <option value="weight_loss">Lose weight</option>
                <option value="weight_gain">Gain weight</option>
              </select>
              <p id="onb-goal-help" class="onboarding-activity-help">An estimate of the calories needed to maintain your current weight.</p>
            </div>
          </div>
          <p id="onboarding-error" role="alert" class="hidden"></p>
          <div class="onboarding-submit">
            <button type="submit">Create my daily goals<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>
            <p>You can adjust these later in Settings.</p>
          </div>
        </form>
      </div>
    </div>
  </div>

  `);
  const overlay = document.getElementById('onboarding-overlay');
  const form = document.getElementById('onboarding-form');
  const error = document.getElementById('onboarding-error');
  const loadError = document.getElementById('onboarding-load-error');
  const retry = document.getElementById('onboarding-retry');
  let context = null;
  let active = false;
  let previousFocus;
  let bodyWasLocked = false;
  let background = [];

  // Old profiles do not need the newly added lifestyle field to remain valid.
  function isCompleteProfile(profile) {
    return Boolean(profile && typeof profile.name === 'string' && profile.name.trim() &&
      ['male', 'female'].includes(profile.gender) &&
      ['age', 'weight', 'height', 'targetKcal'].every(key => typeof profile[key] === 'number' && Number.isFinite(profile[key]) && profile[key] > 0));
  }
  const isCurrent = current => context === current && window.NutriSecurity.isCurrent(current.uid);

  function syncFocus() {
    const open = !overlay.classList.contains('hidden');
    if (open === active) return;
    active = open;
    if (open) {
      previousFocus = document.activeElement;
      background = [...document.body.children].filter(node => node !== overlay && !['SCRIPT','STYLE','LINK'].includes(node.tagName)).map(node => [node, node.inert]);
      background.forEach(([node]) => { node.inert = true; });
      document.getElementById('onboarding-title').focus({ preventScroll: true });
    } else {
      background.forEach(([node, inert]) => { node.inert = inert; });
      background = [];
      if (previousFocus && previousFocus !== document.body && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    }
  }
  function open() {
    if (!overlay.classList.contains('hidden')) return;
    bodyWasLocked = document.body.classList.contains('overflow-hidden');
    overlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    syncFocus();
  }
  function settle(current, profile) {
    if (context !== current) return;
    context = null;
    const wasOpen = !overlay.classList.contains('hidden');
    overlay.classList.add('hidden');
    if (wasOpen && !bodyWasLocked) document.body.classList.remove('overflow-hidden');
    syncFocus();
    current.resolve(profile);
  }
  function prefill(profile, user) {
    const authName = user.displayName?.trim().split(/\s+/)[0] || user.email?.split('@')[0] || '';
    document.getElementById('onb-greeting-name').textContent = authName || 'there';
    document.getElementById('onb-name').value = typeof profile?.name === 'string' ? profile.name : authName;
    for (const key of ['age', 'weight', 'height']) {
      document.getElementById(`onb-${key}`).value = typeof profile?.[key] === 'number' && Number.isFinite(profile[key]) ? profile[key] : '';
    }
    form.querySelector(`input[name="onb-gender"][value="${profile?.gender === 'female' ? 'female' : 'male'}"]`).checked = true;
    const activity = document.getElementById('onb-activity');
    activity.value = window.NutriGoals.hasActivityLevel(profile?.activityLevel) ? profile.activityLevel : '';
    activity.dispatchEvent(new Event('change'));
    const goal = document.getElementById('onb-goal');
    goal.value = window.NutriGoals.hasGoalPreference(profile?.goalPreference) ? profile.goalPreference : 'maintenance';
    goal.dispatchEvent(new Event('change'));
  }
  async function readProfile(current) {
    retry.disabled = true;
    retry.textContent = 'Checking…';
    retry.classList.add('inline-loading');
    try {
      const snapshot = await current.getDoc(current.doc(current.db, 'users', current.uid));
      if (!isCurrent(current)) { settle(current, null); return; }
      const profile = snapshot.exists() ? snapshot.data()?.profile : null;
      if (isCompleteProfile(profile)) {
        localStorage.setItem('nutriglance_profile', JSON.stringify(profile));
        settle(current, profile);
        return;
      }
      prefill(profile, current.user);
      loadError.classList.add('hidden');
      form.classList.remove('hidden');
      open();
    } catch {
      if (!isCurrent(current)) { settle(current, null); return; }
      // A failed read is not evidence that a returning user's profile is absent.
      prefill(null, current.user);
      form.classList.add('hidden');
      loadError.classList.remove('hidden');
      open();
    } finally {
      retry.disabled = false;
      retry.textContent = 'Try again';
      retry.classList.remove('inline-loading');
    }
  }
  function ensureProfile(options) {
    if (!window.NutriSecurity.isCurrent(options.user.uid)) return Promise.resolve(null);
    if (context?.uid === options.user.uid) return context.promise;
    if (context) settle(context, null);
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    context = { ...options, uid: options.user.uid, promise, resolve };
    error.classList.add('hidden');
    void readProfile(context);
    return promise;
  }

  retry.addEventListener('click', () => { if (context) void readProfile(context); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const current = context;
    if (!current || !isCurrent(current)) return;
    const name = document.getElementById('onb-name').value.trim();
    const gender = form.querySelector('input[name="onb-gender"]:checked')?.value || 'male';
    const age = parseFloat(document.getElementById('onb-age').value);
    const weight = parseFloat(document.getElementById('onb-weight').value);
    const height = parseFloat(document.getElementById('onb-height').value);
    const activityLevel = document.getElementById('onb-activity').value;
    const goalPreference = document.getElementById('onb-goal').value;
    const validations = [
      ['onb-name', !name || name.length > 160, 'Please enter your name (up to 160 characters).'],
      ['onb-age', !Number.isInteger(age) || age < 10 || age > 100, 'Enter an age between 10 and 100 years.'],
      ['onb-weight', !Number.isFinite(weight) || weight < 20 || weight > 300 || !document.getElementById('onb-weight').checkValidity(), 'Enter a weight between 20 and 300 kg.'],
      ['onb-height', !Number.isInteger(height) || height < 100 || height > 250, 'Enter a height between 100 and 250 cm.'],
      ['onb-activity', !window.NutriGoals.hasActivityLevel(activityLevel), 'Please choose your activity level.'],
      ['onb-goal', !window.NutriGoals.hasGoalPreference(goalPreference) || (age < 18 && goalPreference !== 'maintenance'), 'Please choose a valid goal for your age.'],
    ];
    for (const [id] of validations) {
      const field = document.getElementById(id);
      field.removeAttribute('aria-invalid');
      if (id === 'onb-activity' || id === 'onb-goal') field.setAttribute('aria-describedby', `${id}-help`);
      else field.removeAttribute('aria-describedby');
    }
    const invalid = validations.find(([, failed]) => failed);
    if (invalid) {
      const [id, , message] = invalid;
      error.textContent = message;
      error.classList.remove('hidden');
      const field = document.getElementById(id);
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', ['onb-activity', 'onb-goal'].includes(id) ? `${id}-help onboarding-error` : 'onboarding-error');
      field.focus();
      return;
    }
    error.classList.add('hidden');
    const profile = { name, gender, age, weight, height, activityLevel, goalPreference,
      ...window.NutriGoals.calculateTargets({ gender, age, weight, height, activityLevel, goalPreference }) };
    const submit = form.querySelector('button[type="submit"]');
    const label = submit.innerHTML;
    submit.disabled = true;
    submit.textContent = 'Saving your goals…';
    submit.classList.add('inline-loading');
    try {
      await current.setDoc(current.doc(current.db, 'users', current.uid), { profile }, { merge: true });
      if (!isCurrent(current)) { settle(current, null); return; }
      localStorage.setItem('nutriglance_profile', JSON.stringify(profile));
      settle(current, profile);
    } catch {
      if (!isCurrent(current)) { settle(current, null); return; }
      error.textContent = 'Couldn’t save your profile. Please try again.';
      error.classList.remove('hidden');
    } finally {
      submit.disabled = false;
      submit.innerHTML = label;
      submit.classList.remove('inline-loading');
    }
  });

  overlay.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const fields = [...overlay.querySelectorAll('input,select,button,a[href]')].filter(node => !node.disabled && node.getClientRects().length);
    const first = fields[0], last = fields.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === document.getElementById('onboarding-title'))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
  window.NutriOnboarding = { ensureProfile };
})();
