export { initializeApp } from 'firebase/app';
export {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged,
  signOut, connectAuthEmulator, signInWithCredential,
} from 'firebase/auth';
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, writeBatch, onSnapshot, getDocFromServer, getDocsFromServer,
  connectFirestoreEmulator, terminate, clearIndexedDbPersistence,
} from 'firebase/firestore';
