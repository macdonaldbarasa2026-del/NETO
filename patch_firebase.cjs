const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

code = code.replace(
  'import { getFirestore, collection, addDoc, query, orderBy, getDocs, serverTimestamp, limit } from "firebase/firestore";',
  'import { getFirestore, collection, addDoc, query, orderBy, getDocs, serverTimestamp, limit, deleteDoc, doc } from "firebase/firestore";'
);

code += `\n
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
`;

fs.writeFileSync('src/lib/firebase.ts', code);
