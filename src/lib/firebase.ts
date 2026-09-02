import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import { getDownloadURL, getStorage, ref, uploadBytesResumable } from "firebase/storage";
import { getFirestore, collection, addDoc, query, orderBy, getDocs, serverTimestamp, limit, deleteDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCZq9wcZUb3Bqsuj_8pxeR_y7KFyQ7JTV4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "project-bcceb490-51e7-4695-b98.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "project-bcceb490-51e7-4695-b98",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "project-bcceb490-51e7-4695-b98.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "296925004216",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:296925004216:web:a41aae2ca1cc5280d68f4d",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
const storage = getStorage(app);
const db = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Google Sign-in Error:", error);
    throw error;
  }
}

export async function logout() {
  return signOut(auth);
}

export function onAuthChange(callback: (user: any) => void) {
  return onAuthStateChanged(auth, callback);
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function ensureAuthenticatedUser() {
  if (auth.currentUser) return auth.currentUser;
  throw new Error("Authentication required. Please sign in with Google in the app settings.");
}

export async function uploadAttachment(file: File) {
  if (file.size > MAX_FILE_SIZE) throw new Error("Files must be 10 MB or smaller.");
  const user = await ensureAuthenticatedUser();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const storagePath = `uploads/${user.uid}/${crypto.randomUUID()}-${safeName}`;
  const storageRef = ref(storage, storagePath);

  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type || "application/octet-stream",
    // Download URLs are bearer URLs, so shared caches must not retain uploads.
    cacheControl: "private,no-store",
  });

  await new Promise<void>((resolve, reject) => {
    task.on("state_changed", undefined, reject, () => resolve());
  });

  const url = await getDownloadURL(storageRef);
  return { name: file.name, mimeType: file.type || "application/octet-stream", url, storagePath, size: file.size };
}

// Firestore Automation: Save and Load Chat History
export async function saveConversation(messages: any[]) {
  try {
    const user = await ensureAuthenticatedUser();
    await addDoc(collection(db, "users", user.uid, "conversations"), {
      messages,
      createdAt: serverTimestamp(),
    });
    console.log("Conversation saved to Firestore!");
  } catch (error) {
    console.error("Error saving conversation:", error);
  }
}

export async function loadRecentConversations() {
  try {
    const user = await ensureAuthenticatedUser();
    const q = query(
      collection(db, "users", user.uid, "conversations"),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error loading conversations:", error);
    return [];
  }
}


export async function clearAllConversations() {
  try {
    const user = await ensureAuthenticatedUser();
    const q = query(collection(db, "users", user.uid, "conversations"));
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(document => deleteDoc(doc(db, "users", user.uid, "conversations", document.id)));
    await Promise.all(deletePromises);
    console.log("All conversations deleted from Firestore!");
  } catch (error) {
    console.error("Error clearing conversations:", error);
  }
}
