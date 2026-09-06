import 'dotenv/config';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const hasJsonCredentials = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
const hasEnvCredentials = Boolean(
  process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
);
const firebaseConfigured = Boolean(process.env.FIREBASE_PROJECT_ID)
  && (hasJsonCredentials || hasEnvCredentials);

let firestore = null;

if (firebaseConfigured) {
  const credential = hasJsonCredentials
    ? applicationDefault()
    : cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      });

  const app = getApps()[0] || initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID
  });

  firestore = getFirestore(app);
}

export { firebaseConfigured, firestore };