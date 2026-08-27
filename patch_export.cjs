const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Add exportConversation function right before stopEverything
const exportFn = `
  const exportConversation = useCallback((format: 'txt' | 'json') => {
    if (chatHistory.length === 0) return;
    
    let content = "";
    let mimeType = "";
    let extension = "";
    
    if (format === 'txt') {
      content = chatHistory.map(m => \`\${m.role === 'user' ? 'You' : 'Neto'}:\\n\${m.parts[0].text}\`).join('\\n\\n');
      mimeType = 'text/plain';
      extension = 'txt';
    } else {
      content = JSON.stringify(chatHistory, null, 2);
      mimeType = 'application/json';
      extension = 'json';
    }
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = \`neto_conversation_\${new Date().toISOString().split('T')[0]}.\${extension}\`;
    a.click();
    URL.revokeObjectURL(url);
  }, [chatHistory]);

  const endAndSaveConversation`;

code = code.replace('const endAndSaveConversation', exportFn);

// Update history header
const historyHeaderOld = `<div className="flex items-center justify-between mb-4">
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

const historyHeaderNew = `<div className="flex items-center justify-between mb-4">
  <h3 className="text-lg font-semibold">Conversation</h3>
  <div className="flex gap-2">
    {chatHistory.length > 0 && (
      <>
        <button onClick={() => exportConversation('txt')} title="Export as TXT" className="h-8 px-3 rounded-full flex items-center justify-center text-xs font-semibold border" style={{background:"var(--surface)", borderColor:"var(--border)"}}>
          TXT
        </button>
        <button onClick={() => exportConversation('json')} title="Export as JSON" className="h-8 px-3 rounded-full flex items-center justify-center text-xs font-semibold border" style={{background:"var(--surface)", borderColor:"var(--border)"}}>
          JSON
        </button>
      </>
    )}
    {chatHistory.length > 0 && currentUser && (
      <button onClick={() => setClearHistoryConfirmOpen(true)} className="w-8 h-8 rounded-full flex items-center justify-center text-red-500" style={{background:"var(--accent-soft)"}}>
        <Trash2 className="w-4 h-4"/>
      </button>
    )}
    <button onClick={()=>setHistoryOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{background:"var(--accent-soft)"}}><X className="w-4 h-4"/></button>
  </div>
</div>`;

code = code.replace(historyHeaderOld, historyHeaderNew);

fs.writeFileSync('src/App.tsx', code);
