const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  'import { uploadAttachment } from "./lib/firebase";',
  'import { uploadAttachment, signInWithGoogle, logout, onAuthChange, saveConversation, loadRecentConversations } from "./lib/firebase";'
);

code = code.replace(
  'const [chatHistory, setChatHistory] = useState<Message[]>([]);',
  `const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setCurrentUser(user);
      if (user) {
        loadRecentConversations().then((conversations) => {
          if (conversations && conversations.length > 0) {
            setChatHistory(conversations[0].messages || []);
          }
        });
      } else {
        setChatHistory([]);
      }
    });
    return () => unsubscribe();
  }, []);`
);

// Add sign in section to Settings overlay (after Theme section)
code = code.replace(
  '<section><label className="text-xs font-semibold tracking-wide uppercase" style={{color:"var(--muted)"}}>Theme</label>',
  `<section><label className="text-xs font-semibold tracking-wide uppercase" style={{color:"var(--muted)"}}>Account</label>
<div className="mt-3 p-4 rounded-2xl border flex items-center justify-between" style={{background:"var(--surface)",borderColor:"var(--border)"}}>
  <div>
    <p className="text-sm font-semibold">{currentUser ? currentUser.displayName || "Signed In" : "Not Signed In"}</p>
    <p className="text-xs" style={{color:"var(--muted)"}}>{currentUser ? currentUser.email : "Sign in to save chat history and upload files."}</p>
  </div>
  <button onClick={currentUser ? logout : signInWithGoogle} className="px-4 py-2 rounded-full text-xs font-semibold border" style={{background:currentUser?"var(--surface)":"var(--text)",color:currentUser?"var(--text)":"var(--bg)",borderColor:"var(--border)"}}>
    {currentUser ? "Sign Out" : "Sign in with Google"}
  </button>
</div></section>
<section><label className="text-xs font-semibold tracking-wide uppercase" style={{color:"var(--muted)"}}>Theme</label>`
);

// Update endAndSaveConversation
code = code.replace(
  'const stopEverything = useCallback(() => {',
  `const endAndSaveConversation = async () => {
    stopEverything();
    setDraftText("");
    setTranscript("");
    transcriptRef.current = "";
    setEndConfirmOpen(false);
    if (chatHistory.length > 0 && currentUser) {
      await saveConversation(chatHistory);
    }
  };

  const stopEverything = useCallback(() => {`
);

code = code.replace(
  'onClick={()=>{stopEverything();setDraftText("");setTranscript("");transcriptRef.current="";setEndConfirmOpen(false)}}',
  'onClick={endAndSaveConversation}'
);

fs.writeFileSync('src/App.tsx', code);
