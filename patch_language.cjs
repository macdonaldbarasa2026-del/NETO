const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Add language state
code = code.replace(
  'const [speed, setSpeed] = useState(1);',
  'const [speed, setSpeed] = useState(1);\n  const [language, setLanguage] = useState(() => localStorage.getItem("voice-orb-lang") || "en-US");'
);

// 2. Add language to startListening dependencies
code = code.replace(
  'recognition.lang = "en-US";',
  'recognition.lang = language;'
);

code = code.replace(
  '}, [handleMessage, isMicMuted, startAmbient, stopAmbient, startLiveVoice, voiceMode]);',
  '}, [handleMessage, isMicMuted, startAmbient, stopAmbient, startLiveVoice, voiceMode, language]);'
);

// 3. Add language selector UI to Settings
const langSelector = `
            <section>
              <label className="text-xs font-semibold tracking-wide uppercase" style={{color:"var(--muted)"}}>Input Language</label>
              <div className="mt-3 relative">
                <select 
                  value={language} 
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    localStorage.setItem("voice-orb-lang", e.target.value);
                  }}
                  className="w-full h-12 px-4 rounded-xl border appearance-none text-sm font-medium outline-none focus:ring-2 focus:ring-black/5" 
                  style={{background:"var(--surface)",borderColor:"var(--border)", color:"var(--text)"}}
                >
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="es-ES">Español (Spain)</option>
                  <option value="es-MX">Español (Mexico)</option>
                  <option value="fr-FR">Français</option>
                  <option value="de-DE">Deutsch</option>
                  <option value="it-IT">Italiano</option>
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="ja-JP">日本語 (Japanese)</option>
                  <option value="ko-KR">한국어 (Korean)</option>
                  <option value="zh-CN">中文 (Simplified)</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
            </section>
`;

code = code.replace(
  '<section><label className="text-xs font-semibold tracking-wide uppercase" style={{color:"var(--muted)"}}>Theme</label>',
  langSelector + '\n            <section><label className="text-xs font-semibold tracking-wide uppercase" style={{color:"var(--muted)"}}>Theme</label>'
);

fs.writeFileSync('src/App.tsx', code);
