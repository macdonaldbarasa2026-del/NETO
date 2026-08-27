const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  'import { Menu, Settings, Plus, Clock, Mic, MicOff, X, Send, Volume2, VolumeX, Download, UserRound, ArrowLeft, ImagePlus } from "lucide-react";',
  'import { Menu, Settings, Plus, Clock, Mic, MicOff, X, Send, Volume2, VolumeX, Download, UserRound, ArrowLeft, ImagePlus, Trash2 } from "lucide-react";'
);

code = code.replace(
  'import { uploadAttachment, signInWithGoogle, logout, onAuthChange, saveConversation, loadRecentConversations } from "./lib/firebase";',
  'import { uploadAttachment, signInWithGoogle, logout, onAuthChange, saveConversation, loadRecentConversations, clearAllConversations } from "./lib/firebase";'
);

code = code.replace(
  'const [historyOpen, setHistoryOpen] = useState(false);',
  'const [historyOpen, setHistoryOpen] = useState(false);\n  const [clearHistoryConfirmOpen, setClearHistoryConfirmOpen] = useState(false);'
);

// We need to find the history overlay header and add the trash button
const historyHeaderOld = '<div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">Conversation</h3><button onClick={()=>setHistoryOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{background:"var(--accent-soft)"}}><X className="w-4 h-4"/></button></div>';

const historyHeaderNew = `<div className="flex items-center justify-between mb-4">
  <h3 className="text-lg font-semibold">Conversation</h3>
  <div className="flex gap-2">
    {chatHistory.length > 0 && currentUser && (
      <button onClick={() => setClearHistoryConfirmOpen(true)} className="w-8 h-8 rounded-full flex items-center justify-center text-red-500" style={{background:"var(--accent-soft)"}}>
        <Trash2 className="w-4 h-4"/>
      </button>
    )}
    <button onClick={()=>setHistoryOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{background:"var(--accent-soft)"}}><X className="w-4 h-4"/></button>
  </div>
</div>`;

code = code.replace(historyHeaderOld, historyHeaderNew);

// Now we need to add the ClearHistoryConfirmOpen overlay just below the history overlay
const overlayToAdd = `
      <Overlay open={clearHistoryConfirmOpen} onClose={()=>setClearHistoryConfirmOpen(false)} bottom>
        <div className="mx-auto max-w-[560px] px-6 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] text-center">
          <div className="flex justify-center pb-4"><div className="w-9 h-1 rounded-full bg-black/10"/></div>
          <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center border" style={{background:"rgba(239,68,68,.12)",borderColor:"var(--border)"}}>
            <Trash2 className="w-6 h-6 text-red-500"/>
          </div>
          <h3 className="text-lg font-semibold mt-4">Clear all history?</h3>
          <p className="text-sm mt-2" style={{color:"var(--muted)"}}>This will permanently delete all your saved conversations. This action cannot be undone.</p>
          <div className="grid grid-cols-2 gap-2 mt-6">
            <button onClick={()=>setClearHistoryConfirmOpen(false)} className="h-12 rounded-full border font-semibold" style={{borderColor:"var(--border)",background:"var(--surface)"}}>Cancel</button>
            <button onClick={async () => {
              await clearAllConversations();
              setChatHistory([]);
              setClearHistoryConfirmOpen(false);
              setHistoryOpen(false);
            }} className="h-12 rounded-full text-white font-semibold bg-red-500">Delete all</button>
          </div>
        </div>
      </Overlay>
`;

code = code.replace(
  '</Overlay>\n\n      <Overlay open={aboutOpen}',
  '</Overlay>\n' + overlayToAdd + '\n      <Overlay open={aboutOpen}'
);

fs.writeFileSync('src/App.tsx', code);
