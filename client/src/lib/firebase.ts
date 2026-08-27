import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAF6KhLk9CJvIbBjM0KHEzPO2dMAc1_OLY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "swans-ops-command-centre.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "swans-ops-command-centre",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "swans-ops-command-centre.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "875238693473",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:875238693473:web:fffefa9b2fe3e79412e820",
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey);
const firebaseApp = firebaseConfigured ? initializeApp(firebaseConfig) : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const firebaseDb = firebaseApp ? getFirestore(firebaseApp) : null;
