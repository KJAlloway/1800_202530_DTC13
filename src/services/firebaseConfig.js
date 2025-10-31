import { initializeApp } from "firebase/app";
import {
    getAuth, onAuthStateChanged,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from "firebase/auth";
import {
    initializeFirestore, doc, setDoc, getDoc, updateDoc, addDoc, deleteDoc,
    collection, onSnapshot, serverTimestamp, query, where, orderBy, getDocs,
    deleteField, getDocFromServer
} from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    useFetchStreams: true
});

export {
    app, auth, db,
    onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
    doc, setDoc, getDoc, updateDoc, addDoc, deleteDoc,
    collection, onSnapshot, serverTimestamp, query, where, orderBy, getDocs,
    deleteField, getDocFromServer
};
