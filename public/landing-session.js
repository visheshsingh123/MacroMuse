// Restore Firebase's session before routing; local cache hints never authorize entry.
async function loadLandingAuth() {
  const [{ initializeApp }, { getAuth }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'),
  ]);
  const firebaseConfig = {
      apiKey:            'AIzaSyDKwXd1HXx0oNriqUOfiP4FOHmNc9L1jbA',
      authDomain:        'nutriglance.firebaseapp.com',
      projectId:         'nutriglance',
      storageBucket:     'nutriglance.firebasestorage.app',
      messagingSenderId: '878128108474',
      appId:             '1:878128108474:web:76ff47c291dd19593a4383',
      measurementId:     'G-C0B269SQFP',
    };
  return getAuth(initializeApp(firebaseConfig));
}

export async function routeReturningUser(location, loadAuth = loadLandingAuth) {
  const url = new URL(location.href);
  // Explicit visits and section links must remain accessible while signed in.
  if (url.searchParams.get('view') === 'home' || url.hash) return;
  try {
    const auth = await loadAuth();
    await auth.authStateReady();
    if (location.href !== url.href) return;
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
      location.replace('/dashboard');
    }
  } catch {
    // Keep the public page usable if Firebase is unavailable or offline.
  }
}

if (typeof window !== 'undefined') routeReturningUser(window.location);
