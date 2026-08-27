const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

code = code.replace(
  'export async function ensureAnonymousUser() {\n  if (auth.currentUser) return auth.currentUser;\n  const credential = await signInAnonymously(auth);\n  return credential.user;\n}',
  `export async function ensureAnonymousUser() {
  if (auth.currentUser) return auth.currentUser;
  try {
    const credential = await signInAnonymously(auth);
    return credential.user;
  } catch (error: any) {
    if (error?.code === 'auth/admin-restricted-operation' || error?.message?.includes('admin-restricted')) {
      console.error("CRITICAL: Anonymous Authentication is disabled. You MUST enable it in the Firebase Console: Build -> Authentication -> Sign-in method -> Add Provider -> Anonymous.");
      alert("Firebase Anonymous Auth is not enabled.\\n\\nPlease open your Firebase Console, navigate to Authentication -> Sign-in method, and enable 'Anonymous'.");
    }
    throw error;
  }
}`
);

fs.writeFileSync('src/lib/firebase.ts', code);
