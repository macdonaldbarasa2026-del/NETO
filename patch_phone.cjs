const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Update Overlay component for top-tier mobile drawer/sheet behavior
const oldOverlay = `function Overlay({ open, onClose, children, side=false, bottom=false }: { open:boolean; onClose:()=>void; children:ReactNode; side?:boolean; bottom?:boolean }) {
  return <div className={\`fixed inset-0 z-[70] \${open?"visible":"invisible pointer-events-none"}\`}><div className={\`absolute inset-0 bg-black/25 backdrop-blur-sm transition-opacity \${open?"opacity-100":"opacity-0"}\`} onClick={onClose}/><div className={\`absolute \${side?"top-0 left-0 h-full w-[310px] max-w-[88vw] rounded-r-3xl":"bottom-0 left-0 right-0 rounded-t-3xl"} shadow-2xl transition-transform duration-300 \${open?"translate-x-0 translate-y-0":"-translate-x-2 translate-y-4"}\`} style={{background:"var(--surface-solid)",color:"var(--text)"}}>{children}</div></div>;
}`;

const newOverlay = `function Overlay({ open, onClose, children, side=false, bottom=false }: { open:boolean; onClose:()=>void; children:ReactNode; side?:boolean; bottom?:boolean }) {
  return (
    <div className={\`fixed inset-0 z-[70] \${open ? "visible" : "invisible pointer-events-none"}\`}>
      <div 
        className={\`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 \${open ? "opacity-100" : "opacity-0"}\`} 
        onClick={onClose}
      />
      <div 
        className={\`absolute \${
          side 
            ? "top-0 left-0 h-full w-[310px] max-w-[85vw] rounded-r-3xl smooth-scroll overflow-y-auto" 
            : "bottom-0 left-0 right-0 max-h-[90dvh] rounded-t-[28px] sm:rounded-t-3xl smooth-scroll overflow-y-auto"
        } shadow-2xl transition-all duration-300 ease-out \${
          open 
            ? "translate-x-0 translate-y-0 opacity-100" 
            : side ? "-translate-x-full opacity-0" : "translate-y-full opacity-0"
        }\`} 
        style={{ background: "var(--surface-solid)", color: "var(--text)" }}
      >
        {children}
      </div>
    </div>
  );
}`;

if (code.includes('function Overlay')) {
  code = code.replace(oldOverlay, newOverlay);
}

// 2. Update Top Header Bar
const oldHeader = `<div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-5 sm:px-8 pt-[max(16px,env(safe-area-inset-top))] pb-4">
        <button aria-label="Open menu" onClick={() => openPanel(setMenuOpen)} className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm border" style={{ background:"var(--surface-solid)", borderColor:"var(--border)" }}><Menu className="w-5 h-5" /></button>
        <div className="flex items-center gap-3">
          <button aria-label={isMuted ? "Unmute AI voice" : "Mute AI voice"} onClick={() => { setIsMuted(v => !v); if (!isMuted) window.speechSynthesis?.cancel(); }} className="w-12 h-12 rounded-full shadow-sm flex items-center justify-center border" style={{ background:isMuted?"rgba(239,68,68,.12)":"var(--surface-solid)", borderColor:"var(--border)" }}>{isMuted?<VolumeX className="w-5 h-5 text-red-500"/>:<Volume2 className="w-5 h-5"/>}</button>
          <button aria-label="Toggle captions" onClick={() => setCaptionsEnabled(v => !v)} className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm border" style={{ background:captionsEnabled?"var(--accent-soft)":"var(--surface-solid)", borderColor:"var(--border)" }}><span className="text-xs font-semibold">CC</span></button>
          <button aria-label="Open settings" onClick={() => openPanel(setSettingsOpen)} className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm border" style={{ background:"var(--surface-solid)", borderColor:"var(--border)" }}><Settings className="w-5 h-5"/></button>
        </div>
      </div>`;

const newHeader = `<div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 sm:px-6 pt-[max(12px,env(safe-area-inset-top))] pb-3 select-none pointer-events-auto">
        <button aria-label="Open menu" onClick={() => openPanel(setMenuOpen)} className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shadow-sm border active:scale-95 transition-transform" style={{ background:"var(--surface-solid)", borderColor:"var(--border)" }}><Menu className="w-5 h-5" /></button>
        <div className="flex items-center gap-2 sm:gap-3">
          <button aria-label={isMuted ? "Unmute AI voice" : "Mute AI voice"} onClick={() => { setIsMuted(v => !v); if (!isMuted) window.speechSynthesis?.cancel(); }} className="w-11 h-11 sm:w-12 sm:h-12 rounded-full shadow-sm flex items-center justify-center border active:scale-95 transition-transform" style={{ background:isMuted?"rgba(239,68,68,.12)":"var(--surface-solid)", borderColor:"var(--border)" }}>{isMuted?<VolumeX className="w-5 h-5 text-red-500"/>:<Volume2 className="w-5 h-5"/>}</button>
          <button aria-label="Toggle captions" onClick={() => setCaptionsEnabled(v => !v)} className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shadow-sm border active:scale-95 transition-transform" style={{ background:captionsEnabled?"var(--accent-soft)":"var(--surface-solid)", borderColor:"var(--border)" }}><span className="text-xs font-semibold">CC</span></button>
          <button aria-label="Open settings" onClick={() => openPanel(setSettingsOpen)} className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shadow-sm border active:scale-95 transition-transform" style={{ background:"var(--surface-solid)", borderColor:"var(--border)" }}><Settings className="w-5 h-5"/></button>
        </div>
      </div>`;

code = code.replace(oldHeader, newHeader);

// 3. Update Orb section to fit perfectly within dynamic phone height
const oldOrbSection = `<div className="flex flex-col items-center justify-center min-h-[100dvh] px-6 pt-20 pb-[132px]">
        <div className="h-6 mb-6 flex items-center justify-center">{statusText ? <span className="text-[13px] tracking-wide font-medium px-3 py-1 rounded-full backdrop-blur border" style={{background:"var(--surface)",borderColor:"var(--border)",color:"var(--muted)"}}>{statusText}</span> : <span className="text-[13px] opacity-0">idle</span>}</div>
        <div className="relative flex items-center justify-center orb-reactive" style={{ "--orb-energy": orbEnergy } as React.CSSProperties}>
          {(status === "listening" || status === "speaking") && [0,1,2].map(i => <div key={i} className="absolute w-[300px] h-[300px] sm:w-[320px] sm:h-[320px] rounded-full border" style={{borderColor:status==="speaking"?"rgba(16,163,127,.22)":"rgba(100,140,255,.25)",animation:\`pulseRing \${status==="speaking"?"1.25":"1.8"}s ease-out \${i*.3}s infinite\`}}/>) }
          <OrbSparkles status={status} energy={orbEnergy} />
          <div className="absolute rounded-full blur-[20px] transition-all duration-700" style={{width: status === "listening" ? 370 : 330, height: status === "listening" ? 370 : 330, background:"radial-gradient(circle,var(--orb-glow),transparent 70%)"}} />
          <button aria-label="Neto" onPointerDown={e=>{e.preventDefault();handleOrbTap()}} className="relative rounded-full overflow-hidden will-change-transform focus:outline-none touch-none" style={{width:"min(300px,78vw)",height:"min(300px,78vw)",background:"linear-gradient(180deg,var(--orb-top) 0%,var(--orb-mid) 48%,var(--orb-bottom) 100%)",boxShadow:"0 24px 64px var(--orb-glow), inset 0 1px 0 rgba(255,255,255,.95), inset 0 -18px 36px rgba(255,255,255,.65)",animation:status==="idle"?"breatheIdle 4s ease-in-out infinite":status==="listening"?"breatheListening 1.2s ease-in-out infinite":status==="thinking"?"breatheThinking 1.7s ease-in-out infinite":"breatheSpeaking 1.05s ease-in-out infinite"}}>`;

const newOrbSection = `<div className="flex flex-col items-center justify-center h-full min-h-[100dvh] px-4 pt-[max(64px,calc(env(safe-area-inset-top)+54px))] pb-[max(88px,calc(env(safe-area-inset-bottom)+76px))] select-none">
        <div className="h-6 mb-3 sm:mb-6 flex items-center justify-center">{statusText ? <span className="text-[12.5px] sm:text-[13px] tracking-wide font-medium px-3 py-1 rounded-full backdrop-blur border" style={{background:"var(--surface)",borderColor:"var(--border)",color:"var(--muted)"}}>{statusText}</span> : <span className="text-[13px] opacity-0">idle</span>}</div>
        <div className="relative flex items-center justify-center orb-reactive" style={{ "--orb-energy": orbEnergy } as React.CSSProperties}>
          {(status === "listening" || status === "speaking") && [0,1,2].map(i => <div key={i} className="absolute w-[min(290px,78vw)] h-[min(290px,78vw)] rounded-full border pointer-events-none" style={{borderColor:status==="speaking"?"rgba(16,163,127,.22)":"rgba(100,140,255,.25)",animation:\`pulseRing \${status==="speaking"?"1.25":"1.8"}s ease-out \${i*.3}s infinite\`}}/>) }
          <OrbSparkles status={status} energy={orbEnergy} />
          <div className="absolute rounded-full blur-[20px] transition-all duration-700 pointer-events-none" style={{width: status === "listening" ? "min(340px, 86vw)" : "min(300px, 80vw)", height: status === "listening" ? "min(340px, 86vw)" : "min(300px, 80vw)", background:"radial-gradient(circle,var(--orb-glow),transparent 70%)"}} />
          <button aria-label="Neto" onPointerDown={e=>{e.preventDefault();handleOrbTap()}} className="relative rounded-full overflow-hidden will-change-transform focus:outline-none touch-none active:scale-[0.98] transition-transform" style={{width:"min(270px, min(72vw, 34vh))",height:"min(270px, min(72vw, 34vh))",background:"linear-gradient(180deg,var(--orb-top) 0%,var(--orb-mid) 48%,var(--orb-bottom) 100%)",boxShadow:"0 20px 54px var(--orb-glow), inset 0 1px 0 rgba(255,255,255,.95), inset 0 -16px 32px rgba(255,255,255,.65)",animation:status==="idle"?"breatheIdle 4s ease-in-out infinite":status==="listening"?"breatheListening 1.2s ease-in-out infinite":status==="thinking"?"breatheThinking 1.7s ease-in-out infinite":"breatheSpeaking 1.05s ease-in-out infinite"}}>`;

code = code.replace(oldOrbSection, newOrbSection);

// 4. Update Bottom Input Bar
const oldBottom = `<div className="absolute bottom-0 left-0 right-0 z-20 px-4 sm:px-6 pb-[max(18px,env(safe-area-inset-bottom))] pt-4" style={{background:"linear-gradient(to top,var(--bg) 35%,transparent)"}}>
        <div className="mx-auto max-w-[560px] flex items-center gap-2.5">
          <div className="flex-1 h-[52px] rounded-full shadow-sm border flex items-center pl-2 pr-3 gap-2.5" style={{background:"var(--surface-solid)",borderColor:"var(--border)"}}>
            <button aria-label="Attach image or file" disabled={uploadingFile} onClick={()=>{
              const input=document.createElement("input");
              input.type="file";
              input.accept="image/*,.pdf,.txt,.md,.json,.csv,.xml,.html,text/plain,application/json,text/csv,application/pdf,text/html,application/xml";
              input.onchange=async()=>{
                const file=input.files?.[0];
                if(!file) return;
                if(file.size > 10 * 1024 * 1024){ setTranscript("Files must be 10 MB or smaller."); return; }
                setUploadingFile(true);
                setTranscript(\`Uploading \${file.name}…\`);
                try {
                  let text: string | undefined;
                  if(file.type.startsWith("text/") || /json|csv|xml/.test(file.type) || /\\.(txt|md|json|csv|xml|html)$/i.test(file.name)) {
                    text = await file.text();
                    if(text.length > 12000) text = text.slice(0,12000);
                  }
                  const uploaded = await uploadAttachment(file);
                  setImageAttachment({...uploaded, text});
                  setTranscript(\`\${file.name} uploaded.\`);
                } catch (error: any) {
                  setTranscript(error?.message || "Upload failed. Please try again.");
                } finally {
                  setUploadingFile(false);
                }
              };
              input.click();
            }} className="w-9 h-9 rounded-full flex items-center justify-center transition shrink-0 disabled:opacity-50" style={{background:"var(--accent-soft)"}}>{imageAttachment?<ImagePlus className="w-5 h-5"/>:<Plus className="w-5 h-5"/>}</button>
            <div className="flex-1 min-w-0 relative">{imageAttachment&&<div className="absolute bottom-[44px] left-0 flex items-center gap-2 rounded-xl border p-1.5 shadow-sm max-w-[280px]" style={{background:"var(--surface-solid)",borderColor:"var(--border)"}}>{imageAttachment.mimeType.startsWith("image/")?<img src={imageAttachment.url} alt={imageAttachment.name} className="w-12 h-12 rounded-lg object-cover"/>:<div className="w-12 h-12 rounded-lg flex items-center justify-center text-xs font-semibold" style={{background:"var(--accent-soft)"}}>FILE</div>}<span className="text-xs truncate max-w-[170px]">{imageAttachment.name}</span><button aria-label="Remove attachment" onClick={()=>setImageAttachment(null)} className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{background:"var(--accent-soft)"}}><X className="w-3.5 h-3.5"/></button></div>}<input aria-label="Message" value={draftText} onChange={e=>setDraftText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submitText()}} placeholder={uploadingFile?"Uploading…":status==="listening"?"Listening…":"Type a message…"} className="w-full bg-transparent outline-none text-[15px]" style={{color:"var(--text)"}} />{draftText.trim()&&<button aria-label="Send" onClick={submitText} className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-8 rounded-full flex items-center justify-center text-white" style={{background:"var(--accent)"}}><Send className="w-4 h-4"/></button>}</div>
          </div>
          <button aria-label={isMicMuted?"Unmute microphone":"Mute microphone"} onClick={toggleMic} className="w-[52px] h-[52px] rounded-full flex items-center justify-center shadow-sm border shrink-0" style={{background:isMicMuted?"rgba(239,68,68,.12)":"var(--surface-solid)",borderColor:"var(--border)",color:isMicMuted?"#ef4444":"var(--text)"}}>{isMicMuted?<MicOff className="w-5 h-5"/>:<Mic className="w-5 h-5"/>}</button>
          <button aria-label="End conversation" onClick={()=>setEndConfirmOpen(true)} className="w-[52px] h-[52px] rounded-full text-white flex items-center justify-center shadow-md shrink-0" style={{background:"var(--text)"}}><X className="w-5 h-5"/></button>
        </div>
      </div>`;

const newBottom = `<div className="absolute bottom-0 left-0 right-0 z-20 px-3 sm:px-6 pb-[max(12px,env(safe-area-inset-bottom))] pt-2" style={{background:"linear-gradient(to top,var(--bg) 60%,transparent)"}}>
        <div className="mx-auto max-w-[560px] flex items-center gap-2 sm:gap-2.5">
          <div className="flex-1 h-12 sm:h-[52px] rounded-full shadow-sm border flex items-center pl-1.5 sm:pl-2 pr-2.5 sm:pr-3 gap-2" style={{background:"var(--surface-solid)",borderColor:"var(--border)"}}>
            <button aria-label="Attach image or file" disabled={uploadingFile} onClick={()=>{
              const input=document.createElement("input");
              input.type="file";
              input.accept="image/*,.pdf,.txt,.md,.json,.csv,.xml,.html,text/plain,application/json,text/csv,application/pdf,text/html,application/xml";
              input.onchange=async()=>{
                const file=input.files?.[0];
                if(!file) return;
                if(file.size > 10 * 1024 * 1024){ setTranscript("Files must be 10 MB or smaller."); return; }
                setUploadingFile(true);
                setTranscript(\`Uploading \${file.name}…\`);
                try {
                  let text: string | undefined;
                  if(file.type.startsWith("text/") || /json|csv|xml/.test(file.type) || /\\.(txt|md|json|csv|xml|html)$/i.test(file.name)) {
                    text = await file.text();
                    if(text.length > 12000) text = text.slice(0,12000);
                  }
                  const uploaded = await uploadAttachment(file);
                  setImageAttachment({...uploaded, text});
                  setTranscript(\`\${file.name} uploaded.\`);
                } catch (error: any) {
                  setTranscript(error?.message || "Upload failed. Please try again.");
                } finally {
                  setUploadingFile(false);
                }
              };
              input.click();
            }} className="w-9 h-9 rounded-full flex items-center justify-center transition shrink-0 disabled:opacity-50 active:scale-95" style={{background:"var(--accent-soft)"}}>{imageAttachment?<ImagePlus className="w-4 h-4 sm:w-5 sm:h-5"/>:<Plus className="w-4 h-4 sm:w-5 sm:h-5"/>}</button>
            <div className="flex-1 min-w-0 relative">
              {imageAttachment && (
                <div className="absolute bottom-[44px] left-0 flex items-center gap-2 rounded-xl border p-1.5 shadow-sm max-w-[260px] sm:max-w-[280px]" style={{background:"var(--surface-solid)",borderColor:"var(--border)"}}>
                  {imageAttachment.mimeType.startsWith("image/")?<img src={imageAttachment.url} alt={imageAttachment.name} className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover"/>:<div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center text-xs font-semibold" style={{background:"var(--accent-soft)"}}>FILE</div>}
                  <span className="text-xs truncate max-w-[150px] sm:max-w-[170px]">{imageAttachment.name}</span>
                  <button aria-label="Remove attachment" onClick={()=>setImageAttachment(null)} className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{background:"var(--accent-soft)"}}><X className="w-3.5 h-3.5"/></button>
                </div>
              )}
              <input aria-label="Message" value={draftText} onChange={e=>setDraftText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submitText()}} placeholder={uploadingFile?"Uploading…":status==="listening"?"Listening…":"Type a message…"} className="w-full bg-transparent outline-none text-base sm:text-[15px]" style={{color:"var(--text)"}} />
              {draftText.trim() && (
                <button aria-label="Send" onClick={submitText} className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-8 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform" style={{background:"var(--accent)"}}>
                  <Send className="w-4 h-4"/>
                </button>
              )}
            </div>
          </div>
          <button aria-label={isMicMuted?"Unmute microphone":"Mute microphone"} onClick={toggleMic} className="w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-full flex items-center justify-center shadow-sm border shrink-0 active:scale-95 transition-transform" style={{background:isMicMuted?"rgba(239,68,68,.12)":"var(--surface-solid)",borderColor:"var(--border)",color:isMicMuted?"#ef4444":"var(--text)"}}>{isMicMuted?<MicOff className="w-5 h-5"/>:<Mic className="w-5 h-5"/>}</button>
          <button aria-label="End conversation" onClick={()=>setEndConfirmOpen(true)} className="w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-full text-white flex items-center justify-center shadow-md shrink-0 active:scale-95 transition-transform" style={{background:"var(--text)"}}><X className="w-5 h-5"/></button>
        </div>
      </div>`;

code = code.replace(oldBottom, newBottom);

// 5. Ensure text margin above bottom
const oldOrbText = `<div className="mt-10 text-center max-w-[300px]"><p className="text-[13px] leading-[18px] font-medium" style={{color:"var(--muted)"}}>{status==="idle"?"Tap the orb to speak":status==="listening"?"Listening — speak now":status==="thinking"?"Processing your voice":"Speaking — tap to interrupt"}</p></div>`;
const newOrbText = `<div className="mt-6 sm:mt-10 text-center max-w-[300px]"><p className="text-[12.5px] sm:text-[13px] leading-[18px] font-medium" style={{color:"var(--muted)"}}>{status==="idle"?"Tap the orb to speak":status==="listening"?"Listening — speak now":status==="thinking"?"Processing your voice":"Speaking — tap to interrupt"}</p></div>`;
code = code.replace(oldOrbText, newOrbText);

fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx patched for phone responsiveness successfully.');
