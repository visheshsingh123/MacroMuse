import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function adminServices() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('Server credentials are not configured');
  const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId = process.env.FIREBASE_PROJECT_ID || 'nutriglance';
  if (account.project_id !== projectId) throw new Error('Unexpected Firebase project');
  const app = getApps().find(app => app.name === 'nutriglance-server') ||
    initializeApp({ credential: cert(account), projectId }, 'nutriglance-server');
  return { auth: getAuth(app), db: getFirestore(app) };
}
