import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

const defaultConfig = {
  projectId: 'majestic-trees-st8c4',
  appId: '1:995924391934:web:1cea52a8753a4f365ff2af',
  apiKey: 'AIzaSyCg4mXvuIP4JwFkCMz6Ft7nvq95tLdkYwI',
  authDomain: 'majestic-trees-st8c4.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-lecturapulsefacu-31c85786-3bdf-46c6-9753-6732d567c142',
  storageBucket: 'majestic-trees-st8c4.firebasestorage.app',
  messagingSenderId: '995924391934',
};

const env = (import.meta as any).env || {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || defaultConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || defaultConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || defaultConfig.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || defaultConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || defaultConfig.appId,
  firestoreDatabaseId: env.VITE_FIREBASE_DATABASE_ID || defaultConfig.firestoreDatabaseId,
};

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Safely clean up any leftover corrupted firestore IndexedDB databases if browser site data was cleared
if (typeof window !== 'undefined' && window.indexedDB) {
  try {
    if ('databases' in window.indexedDB && typeof window.indexedDB.databases === 'function') {
      window.indexedDB.databases().then((dbs) => {
        dbs.forEach((dbInfo) => {
          if (dbInfo.name && dbInfo.name.toLowerCase().includes('firestore')) {
            try {
              window.indexedDB.deleteDatabase(dbInfo.name);
            } catch (err) {}
          }
        });
      }).catch(() => {});
    }
  } catch (err) {}
}

// Initialize Firestore with custom database ID and memoryLocalCache to prevent IndexedDB corruption issues
const databaseId =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: memoryLocalCache(),
    },
    databaseId
  );
} catch (e) {
  firestoreInstance = getFirestore(app, databaseId);
}

export const db = firestoreInstance;

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export const githubProvider = new GithubAuthProvider();
githubProvider.addScope('read:user');
githubProvider.addScope('user:email');

export {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
};
export type { FirebaseUser };
