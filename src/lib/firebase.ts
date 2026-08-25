import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getDownloadURL, getStorage, ref, uploadBytesResumable } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCZq9wcZUb3Bqsuj_8pxeR_y7KFyQ7JTV4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "project-bcceb490-51e7-4695-b98.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "project-bcceb490-51e7-4695-b98",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "project-bcceb490-51e7-4695-b98.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "296925004216",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:296925004216:web:a41aae2ca1cc5280d68f4d",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function ensureAnonymousUser() {
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}

export async function uploadAttachment(file: File) {
  if (file.size > MAX_FILE_SIZE) throw new Error("Files must be 10 MB or smaller.");
  const user = await ensureAnonymousUser();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const storagePath = `uploads/${user.uid}/${crypto.randomUUID()}-${safeName}`;
  const storageRef = ref(storage, storagePath);
  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type || "application/octet-stream",
    cacheControl: "public,max-age=3600",
  });

  await new Promise<void>((resolve, reject) => {
    task.on("state_changed", undefined, reject, () => resolve());
  });

  const url = await getDownloadURL(storageRef);
  return { name: file.name, mimeType: file.type || "application/octet-stream", url, storagePath, size: file.size };
}
