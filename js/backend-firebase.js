// Firebase-backed data layer. The demo backend (backend-demo.js) implements the same interface.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  collection,
  onSnapshot,
  setDoc,
  updateDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

export function createFirebaseBackend(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const toUser = (u) =>
    u && {
      uid: u.uid,
      name: u.displayName || u.email,
      email: (u.email || '').toLowerCase(),
      photoURL: u.photoURL || null,
      emailVerified: u.emailVerified,
    };

  async function deleteCollection(name) {
    const snap = await getDocs(collection(db, name));
    let batch = writeBatch(db);
    let n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      if (++n % 400 === 0) {
        await batch.commit();
        batch = writeBatch(db);
      }
    }
    await batch.commit();
  }

  return {
    mode: 'firebase',

    onAuth: (cb) => onAuthStateChanged(auth, (u) => cb(toUser(u))),
    signIn: () => signInWithPopup(auth, provider),
    signOut: () => signOut(auth),

    upsertUser: (u) =>
      setDoc(doc(db, 'users', u.uid), {
        name: u.name,
        email: u.email,
        photoURL: u.photoURL || null,
        lastSeen: serverTimestamp(),
      }),

    watchConfig: (cb, onError) =>
      onSnapshot(doc(db, 'config', 'app'), (s) => cb(s.exists() ? s.data() : null), onError),

    watchCollection: (name, cb, onError) =>
      onSnapshot(
        collection(db, name),
        (qs) => {
          const out = {};
          qs.forEach((d) => (out[d.id] = d.data()));
          cb(out);
        },
        onError
      ),

    saveRound1: (uid, votes) => setDoc(doc(db, 'round1Votes', uid), { votes, updatedAt: serverTimestamp() }),
    saveRound2: (uid, badges) => setDoc(doc(db, 'round2Votes', uid), { badges, updatedAt: serverTimestamp() }),

    setConfig: (data) => setDoc(doc(db, 'config', 'app'), data),
    updateConfig: (patch) => updateDoc(doc(db, 'config', 'app'), patch),

    clearRound1: () => deleteCollection('round1Votes'),
    clearRound2: () => deleteCollection('round2Votes'),
  };
}
