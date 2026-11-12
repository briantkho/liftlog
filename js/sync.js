// Google sign-in and cloud sync with Firebase.
//
// Data layout in Firestore:
//   users/{uid}                  settings, exercises, routines, active workout, rest timer
//   users/{uid}/workouts/{id}    one doc per finished workout
//
// Firestore keeps an offline copy on the device, so the app opens and logs sets with no
// signal. Writes queue up and upload when the phone is back online.

import * as fb from './vendor/firebase.js';
import { firebaseConfig } from './firebase-config.js';

// Local testing against the Firebase emulators: http://localhost:8000/?emulator
const useEmulator = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emulator');
const config = useEmulator ? { apiKey: 'demo-key', authDomain: 'demo-liftlog.firebaseapp.com', projectId: 'demo-liftlog', appId: 'demo' } : firebaseConfig;

export const enabled = !!config;

let app, auth, db, user = null;
let userRef, workoutsCol;
let unsubs = [];
let lastUserJSON = null;
const lastWorkoutJSON = new Map();

// Key-sorted JSON so a doc read back from Firestore compares equal to what we wrote.
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}
const clean = (v) => JSON.parse(JSON.stringify(v)); // drops undefined, which Firestore rejects

function userPart(s) {
  return clean({ version: s.version, settings: s.settings, exercises: s.exercises, routines: s.routines, active: s.active, rest: s.rest, createdAt: s.createdAt });
}

export function init({ onSignedIn, onSignedOut, onError }) {
  app = fb.initializeApp(config);
  auth = fb.initializeAuth(app, {
    persistence: [fb.indexedDBLocalPersistence, fb.browserLocalPersistence],
    popupRedirectResolver: fb.browserPopupRedirectResolver,
  });
  db = fb.initializeFirestore(app, {
    localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  if (useEmulator) {
    fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    // Emulator-only shortcut for automated tests (the emulator accepts unsigned tokens).
    window.__testSignIn = (email) => fb.signInWithCredential(auth, fb.GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name: 'Test Lifter' })));
  }
  fb.getRedirectResult(auth).catch((err) => onError?.(friendlyError(err)));
  fb.onAuthStateChanged(auth, (u) => {
    if (u && (!user || u.uid !== user.uid)) { user = u; onSignedIn(u); }
    else if (!u) { user = null; onSignedOut(); }
  });
}

export async function signIn() {
  const provider = new fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await fb.signInWithPopup(auth, provider);
  } catch (err) {
    // Some installed-app contexts block popups. A full-page redirect works there.
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(err.code)) {
      return fb.signInWithRedirect(auth, provider);
    }
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
    throw new Error(friendlyError(err));
  }
}

function friendlyError(err) {
  const map = {
    'auth/unauthorized-domain': 'This site is not on the authorized domains list in Firebase (Authentication > Settings).',
    'auth/network-request-failed': 'No connection. Sign in once while online, then it works offline.',
    'auth/operation-not-allowed': 'Google sign-in is not turned on in Firebase (Authentication > Sign-in method).',
  };
  return map[err?.code] || err?.message || 'Sign-in failed. Try again.';
}

export const currentUser = () => user;

export async function signOutAndWipe() {
  unsubs.forEach((u) => u()); unsubs = [];
  await fb.signOut(auth);
  // Remove the offline copy so nothing stays on this device.
  try { await fb.terminate(db); await fb.clearIndexedDbPersistence(db); } catch (err) { console.warn(err); }
}

/**
 * Loads the signed-in user's data and keeps it in sync.
 * - local: data saved in this browser before sign-in existed, uploaded once.
 * - getState/applyRemote: how sync reads and replaces the app's state.
 * - isBusy: true while the app has unsaved edits, so remote snapshots don't clobber them.
 * Resolves with { state, migrated } once the first data is available.
 */
export async function attach({ local, isBusy, applyRemote }) {
  userRef = fb.doc(db, 'users', user.uid);
  workoutsCol = fb.collection(db, 'users', user.uid, 'workouts');

  // Ask the server whether this account has data yet. Offline, fall back to the cache.
  let serverUser = null, serverChecked = false;
  try {
    serverUser = await withTimeout(fb.getDocFromServer(userRef), 8000);
    serverChecked = true;
  } catch { /* offline: use cache below */ }

  let migrated = 0;
  if (serverChecked && !serverUser.exists()) {
    // New account. Upload whatever was saved in this browser, or start fresh.
    const start = local || {};
    const workouts = start.workouts || [];
    migrated = workouts.length;
    await pushAll({ ...start, workouts }, { force: true });
  }
  // For an existing account, read workouts straight from the server too, so a fresh
  // device never starts from an empty cache and overwrites the cloud.
  let serverWorkouts = null;
  if (serverChecked && serverUser.exists()) {
    const cloud = await withTimeout(fb.getDocsFromServer(workoutsCol), 10000).catch(() => null);
    if (cloud) serverWorkouts = cloud.docs.map((d) => d.data());
    if (cloud && local?.workouts?.length) {
      // This browser also has workouts saved before sign-in: add any the cloud lacks.
      const have = new Set(cloud.docs.map((d) => d.id));
      const extra = local.workouts.filter((w) => !have.has(w.id));
      if (extra.length) {
        const batch = fb.writeBatch(db);
        extra.forEach((w) => batch.set(fb.doc(workoutsCol, w.id), clean(w)));
        await batch.commit();
        migrated = extra.length;
        serverWorkouts.push(...extra.map(clean));
      }
    }
  }

  // Live listeners. The first snapshot of each (cache or server) fills the initial state.
  let userData = undefined, workouts = undefined, resolveReady;
  const ready = new Promise((r) => (resolveReady = r));
  const maybeReady = () => { if (userData !== undefined && workouts !== undefined) resolveReady(); };
  let initial = true;

  unsubs.push(fb.onSnapshot(userRef, (snap) => {
    const data = snap.exists() ? snap.data() : null;
    if (initial) {
      userData = data ?? (serverUser?.exists() ? serverUser.data() : null);
      lastUserJSON = userData ? stable(userData) : null;
      return maybeReady();
    }
    if (snap.metadata.hasPendingWrites || !data || isBusy()) return;
    const j = stable(data);
    if (j === lastUserJSON) return;
    lastUserJSON = j;
    applyRemote({ user: data });
  }, (err) => console.error('user sync', err)));

  unsubs.push(fb.onSnapshot(workoutsCol, (snap) => {
    const list = snap.docs.map((d) => d.data());
    if (initial) {
      workouts = serverWorkouts && serverWorkouts.length >= list.length ? serverWorkouts : list;
      lastWorkoutJSON.clear();
      workouts.forEach((w) => lastWorkoutJSON.set(w.id, stable(w)));
      return maybeReady();
    }
    if (snap.metadata.hasPendingWrites || isBusy()) return;
    const changed = list.length !== lastWorkoutJSON.size || list.some((w) => lastWorkoutJSON.get(w.id) !== stable(w));
    if (!changed) return;
    lastWorkoutJSON.clear();
    list.forEach((w) => lastWorkoutJSON.set(w.id, stable(w)));
    applyRemote({ workouts: list });
  }, (err) => console.error('workout sync', err)));

  await ready;
  initial = false;
  return { state: { ...(userData || {}), workouts: workouts || [] }, migrated };
}

/** Persister for the store: writes only what changed since the last sync. */
export function push(state) {
  return pushAll(state).catch((err) => console.error('sync write failed', err));
}

async function pushAll(state, { force = false } = {}) {
  if (!user) return;
  const ops = [];
  const u = userPart(state);
  const uj = stable(u);
  if (force || uj !== lastUserJSON) { ops.push((b) => b.set(userRef, u)); lastUserJSON = uj; }
  const seen = new Set();
  for (const w of state.workouts || []) {
    seen.add(w.id);
    const j = stable(w);
    if (force || lastWorkoutJSON.get(w.id) !== j) { const data = clean(w); ops.push((b) => b.set(fb.doc(workoutsCol, w.id), data)); lastWorkoutJSON.set(w.id, j); }
  }
  for (const id of [...lastWorkoutJSON.keys()]) {
    if (!seen.has(id)) { ops.push((b) => b.delete(fb.doc(workoutsCol, id))); lastWorkoutJSON.delete(id); }
  }
  // Batches cap at 500 writes. Commits resolve when the server confirms; offline they queue.
  const commits = [];
  for (let i = 0; i < ops.length; i += 450) {
    const batch = fb.writeBatch(db);
    ops.slice(i, i + 450).forEach((op) => op(batch));
    commits.push(batch.commit());
  }
  if (force) await Promise.all(commits);
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}
