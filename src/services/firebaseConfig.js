/* Imports
Imports firebase app initializer and auth functions from the modular Firebase v9+ SDK

Imports Firestore initialization and a list of Firestore helpers
initializeFirestore lets you configure a Firestore instance
serverTimestamp produces a server-side timestamp sentinel which is a set of special instructions from Firestore that doesn't represent actual data
*/
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  initializeFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  deleteField,
  getDocFromServer,
} from "firebase/firestore";

/*
Builds the config object required by initializeApp
Values are taken from .env file
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/*
Initializes the Firebase app instance using the above config object.
This app is the root Firebase application that other Firebase services attach to.
*/
const app = initializeApp(firebaseConfig);

/*
Creates a Firebase Auth instance bound to the above app.
Exporting this allows our app to read auth.currentUser, sign users in and out.
 */
const auth = getAuth(app);

/*
Initializes Firestore and assigns it to db.
experimentalAutoDetectLongPolling helps Firestore fall back to long-polling in environments
where WebSockets/normal streaming are blocked.
useFetchStreams uses the Fetch streaming API for snapshots where available.
This can help with reliability in some browsers and environments
*/
const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: true,
});

/**
 Exports the created app, auth, and db instances and
 re-exports all the Firebase helper functions
 */
export {
  app,
  auth,
  db,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  deleteField,
  getDocFromServer,
};

// // Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
// // TODO: Add SDKs for Firebase products that you want to use
// // https://firebase.google.com/docs/web/setup#available-libraries

// // Your web app's Firebase configuration
// // For Firebase JS SDK v7.20.0 and later, measurementId is optional
// const firebaseConfig = {
//     apiKey: "AIzaSyATaRP_xJNbvKsIJE_qLnwNLD8pXFvpqME",
//     authDomain: "dtc-13.firebaseapp.com",
//     projectId: "dtc-13",
//     storageBucket: "dtc-13.firebasestorage.app",
//     messagingSenderId: "526487767721",
//     appId: "1:526487767721:web:29f17d936f5bf2d9b7f7b8",
//     measurementId: "G-X13ZDNYM57"
// };

// // Initialize Firebase
// const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);
