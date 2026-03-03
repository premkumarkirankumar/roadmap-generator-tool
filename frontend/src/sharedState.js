import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

let auth = null;
let firestore = null;

if (hasFirebaseConfig) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  firestore = getFirestore(app);
}

function getSnapshotDoc(userId) {
  if (!firestore || !userId) {
    return null;
  }

  return doc(firestore, "roadmapSnapshots", userId);
}

export function isSharedStorageConfigured() {
  return Boolean(auth && firestore);
}

export function subscribeToSharedAuth(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, callback);
}

export async function signInToSharedMode() {
  if (!auth) {
    throw new Error("Firebase is not configured.");
  }

  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);

  return result.user;
}

export async function signOutFromSharedMode() {
  if (!auth) {
    return;
  }

  await signOut(auth);
}

export async function loadSharedRoadmapState(userId) {
  const snapshotDoc = getSnapshotDoc(userId);

  if (!snapshotDoc) {
    return null;
  }

  const snapshot = await getDoc(snapshotDoc);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data()?.state || null;
}

export async function saveSharedRoadmapState(userId, state) {
  const snapshotDoc = getSnapshotDoc(userId);

  if (!snapshotDoc) {
    return false;
  }

  await setDoc(
    snapshotDoc,
    {
      state,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return true;
}
