/**
 * Neto — voice-first AI assistant
 * Creator: Macdonald Barasa
 */
import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { Menu, Settings, Plus, Clock, Mic, MicOff, X, Send, Volume2, VolumeX, Download, UserRound, ArrowLeft, ImagePlus } from "lucide-react";
import { GoogleGenAI, Modality } from "@google/genai";
import { uploadAttachment } from "./lib/firebase";

type Status = "idle" | "listening" | "thinking" | "speaking";
type Theme = "light" | "dark" | "midnight" | "warm" | "contrast";

type Message = { role: "user" | "model"; parts: { text: string }[] };
type ImageAttachment = { name: string; mimeType: string; url: string; storagePath: string; size: number; text?: string };

const CREATOR = { name: "Macdonald Barasa", role: "Creator of Neto" };
const APP_IDENTITY = { name: "Neto", company: "Neto", product: "Neto AI assistant", creator: CREATOR.name };
const THEMES: { id: Theme; label: string; description: string }[] = [
  { id: "light", label: "Light", description: "Clean GPT-style light interface" },
  { id: "dark", label: "Dark", description: "Low-light assistant interface" },
  { id: "midnight", label: "Midnight", description: "Deep blue-violet voice studio" },
  { id: "warm", label: "Warm", description: "Soft amber conversational mode" },
  { id: "contrast", label: "High contrast", description: "Maximum visual contrast" },
];


function OrbSparkles({ status, energy }: { status: Status; energy: number }) {
  const particles = useMemo(() => Array.from({ length: 34 }, (_, i) => ({
    id: i,
    x: 8 + ((i * 37) % 84),
    y: 7 + ((i * 61) % 86),
    size: 2 + (i % 4),
    delay: ((i * 0.17) % 2.8).toFixed(2),
    duration: (2.2 + (i % 5) * 0.45).toFixed(2),
    drift: ((i % 2 ? 1 : -1) * (8 + (i % 7) * 2)).toFixed(0),
  })), []);
  const active = status !== 'idle';
  const strength = Math.min(1, Math.max(0.08, energy));
  return (
    <div className={`orb-sparkles ${active ? 'is-active' : ''} status-${status}`} aria-hidden='true' style={{ '--spark-strength': strength } as React.CSSProperties}>
      {particles.map(p => <span key={p.id} className='orb-sparkle' style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, '--spark-drift': `${p.drift}px` } as React.CSSProperties} />)}
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [draftText, setDraftText] = useState("");
  const [imageAttachment, setImageAttachment] = useState<ImageAttachment | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [voice, setVoice] = useState("Sky");
  const [speed, setSpeed] = useState(1);
  const [ambientSounds, setAmbientSounds] = useState(false);
  const [voiceMode, setVoiceMode] = useState(true);
  const [liveConnected, setLiveConnected] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("voice-orb-theme") as Theme) || "light");
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(() => localStorage.getItem("voice-orb-install-dismissed") === "1");
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [orbEnergy, setOrbEnergy] = useState(0.12);
  const [manualInstallInfo, setManualInstallInfo] = useState<{ platform: string; steps: string[] } | null>(null);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const transcriptRef = useRef("");
  const requestAbortRef = useRef<AbortController | null>(null);
  const speakingRef = useRef(false);
  const ambientRef = useRef<AudioContext | null>(null);
  const ambientGainRef = useRef<GainNode | null>(null);
  const liveSessionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micLevelRafRef = useRef<number | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackTimeRef = useRef(0);
  const keepListeningRef = useRef(false);
  const intentionalStopRef = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("voice-orb-theme", theme);
  }, [theme]);

  useEffect(() => {
    const updateVoices = () => setVoices(window.speechSynthesis?.getVoices() || []);
    updateVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", updateVoices);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", updateVoices);
  }, []);

  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    setIsInstalled(standalone);
    // Chromium browsers (Chrome/Edge/Samsung Internet/Opera, on phone or laptop) fire
    // "beforeinstallprompt" below and get the automatic Install/Cancel popup.
    // Safari (iPhone AND Mac) and Firefox never fire that event — Apple and Mozilla don't
    // implement it, so no code can produce an automatic popup there. We detect those
    // platforms ourselves and show the correct manual steps instead.
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isSafari = /^((?!chrome|android|crios|fxios|edg\/).)*safari/i.test(ua);
    const isFirefox = /firefox|fxios/i.test(ua);
    let manual: { platform: string; steps: string[] } | null = null;
    if (isIOS && isSafari) manual = { platform: "iPhone / iPad (Safari)", steps: ["Tap the Share icon in Safari's toolbar", 'Scroll down and tap "Add to Home Screen"', 'Tap "Add" to confirm'] };
    else if (!isIOS && isSafari) manual = { platform: "Mac (Safari)", steps: ["Click the Share icon in Safari's toolbar", 'Choose "Add to Dock"', 'Click "Add" to confirm'] };
    else if (isFirefox) manual = { platform: "Firefox", steps: ["Open the Firefox menu", 'Look for "Install" or "Add to Home screen" (only on Firefox versions that support it)'] };
    setManualInstallInfo(!standalone ? manual : null);
    if (manual && !standalone && !installDismissed) setInstallOpen(true);
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
      if (!standalone) setInstallOpen(true);
    };
    const onInstalled = () => { setIsInstalled(true); setInstallPrompt(null); setInstallOpen(false); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall as EventListener);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall as EventListener);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [installDismissed]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined);
    }

    // Render free services can sleep. Warm the backend silently after the
    // cached UI is already visible so users never see a Render wake-up page.
    if (navigator.onLine) {
      const timer = window.setTimeout(() => {
        fetch("/api/health", { cache: "no-store", credentials: "same-origin", keepalive: true }).catch(() => undefined);
      }, 1200);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, []);

  const stopAmbient = useCallback(() => {
    try { ambientGainRef.current?.gain.exponentialRampToValueAtTime(0.0001, (ambientRef.current?.currentTime || 0) + 0.15); } catch {}
    setTimeout(() => { try { ambientRef.current?.close(); } catch {} ambientRef.current = null; ambientGainRef.current = null; }, 250);
  }, []);

  const startAmbient = useCallback(() => {
    if (!ambientSounds || ambientRef.current) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = 92; gain.gain.value = 0.018;
      osc.connect(gain).connect(ctx.destination); osc.start();
      ambientRef.current = ctx; ambientGainRef.current = gain;
    } catch {}
  }, [ambientSounds]);

  const decodeBase64 = useCallback((base64: string) => {
    const binary = atob(base64); const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }, []);

  const playLivePcm = useCallback((base64: string) => {
    if (isMuted) return;
    const bytes = decodeBase64(base64);
    const ctx = playbackContextRef.current || new AudioContext(); playbackContextRef.current = ctx;
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    let peak = 0; for (let i = 0; i < samples.length; i += Math.max(1, Math.floor(samples.length / 160))) peak = Math.max(peak, Math.abs(samples[i]) / 32768);
    setOrbEnergy(Math.min(1, Math.max(0.12, peak * 2.4)));
    const buffer = ctx.createBuffer(1, samples.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination);
    const start = Math.max(ctx.currentTime + 0.01, playbackTimeRef.current || 0);
    source.start(start); playbackTimeRef.current = start + buffer.duration;
    source.onended = () => { if (ctx.currentTime >= playbackTimeRef.current - 0.03) { speakingRef.current = false; setStatus("idle"); stopAmbient(); } };
    speakingRef.current = true; setStatus("speaking"); startAmbient();
  }, [decodeBase64, isMuted, startAmbient, stopAmbient]);

  const disconnectLive = useCallback(() => {
    try { liveSessionRef.current?.close(); } catch {}
    liveSessionRef.current = null;
    try { micProcessorRef.current?.disconnect(); } catch {}
    try { micSourceRef.current?.disconnect(); } catch {}
    try { if (micLevelRafRef.current) cancelAnimationFrame(micLevelRafRef.current); } catch {}
    try { micAnalyserRef.current?.disconnect(); } catch {}
    try { micContextRef.current?.close(); } catch {}
    try { micStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    micProcessorRef.current = null; micSourceRef.current = null; micAnalyserRef.current = null; micContextRef.current = null; micStreamRef.current = null; setOrbEnergy(0.12);
    setLiveConnected(false); isListeningRef.current = false;
  }, []);

  const startLiveVoice = useCallback(async () => {
    if (isMicMuted || !voiceMode) return;
    keepListeningRef.current = true;
    try {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${window.location.host}/live`;
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => { setLiveConnected(true); setStatus("listening"); isListeningRef.current = true; };
      
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.audio) playLivePcm(msg.audio);
        if (msg.interrupted) { playbackTimeRef.current = 0; speakingRef.current = false; setStatus("listening"); return; }
        if (msg.inputTranscription) { setTranscript(msg.inputTranscription); transcriptRef.current = msg.inputTranscription; }
        if (msg.outputTranscription) { setChatHistory(prev => [...prev, { role: "model", parts: [{ text: msg.outputTranscription }] }]); }
        if (msg.turnComplete) { isListeningRef.current = true; setStatus("listening"); }
      };
      
      ws.onerror = (e: any) => { console.error("Live API error", e); setTranscript("Voice connection error. Text chat is still available."); disconnectLive(); setStatus("idle"); };
      ws.onclose = () => {
        setLiveConnected(false); isListeningRef.current = false;
        // Keep the mic "awake" until the user mutes: if this close wasn't requested by the user
        // (e.g. the Live session timed out or the server dropped it), reconnect automatically.
        if (!intentionalStopRef.current && keepListeningRef.current && !isMicMuted && voiceMode) {
          setStatus("thinking");
          setTimeout(() => { if (keepListeningRef.current && !isMicMuted && voiceMode) void startLiveVoice(); }, 400);
        } else {
          setStatus("idle");
        }
        intentionalStopRef.current = false;
      };
      
      liveSessionRef.current = ws;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      micStreamRef.current = stream;
      const ctx = new AudioContext(); micContextRef.current = ctx; await ctx.resume();
      const source = ctx.createMediaStreamSource(stream); micSourceRef.current = source;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 256; micAnalyserRef.current = analyser; source.connect(analyser);
      const levelData = new Uint8Array(analyser.frequencyBinCount);
      const sampleMicLevel = () => { analyser.getByteTimeDomainData(levelData); let sum = 0; for (const value of levelData) { const n = (value - 128) / 128; sum += n * n; } setOrbEnergy(Math.min(1, Math.max(0.08, Math.sqrt(sum / levelData.length) * 3.5))); micLevelRafRef.current = requestAnimationFrame(sampleMicLevel); };
      micLevelRafRef.current = requestAnimationFrame(sampleMicLevel);
      const processor = ctx.createScriptProcessor(4096, 1, 1); micProcessorRef.current = processor;
      
      processor.onaudioprocess = (event) => {
        if (!liveSessionRef.current || isMicMuted || liveSessionRef.current.readyState !== WebSocket.OPEN) return;
        const input = event.inputBuffer.getChannelData(0); const ratio = ctx.sampleRate / 16000; const length = Math.floor(input.length / ratio); const pcm = new Int16Array(length);
        for (let i = 0; i < length; i++) { const sample = input[Math.min(input.length - 1, Math.floor(i * ratio))]; pcm[i] = Math.max(-1, Math.min(1, sample)) * 32767; }
        let binary = ""; const bytes = new Uint8Array(pcm.buffer); const step = 0x8000; for (let i=0;i<bytes.length;i+=step) binary += String.fromCharCode(...bytes.subarray(i,i+step));
        try { liveSessionRef.current.send(JSON.stringify({ audio: btoa(binary) })); } catch {}
      };
      source.connect(processor); processor.connect(ctx.destination); setStatus("listening");
    } catch (error) {
      console.error(error); disconnectLive(); setTranscript("Live voice is unavailable right now. You can still type messages."); setStatus("idle");
    }
  }, [disconnectLive, isInstalled, isMicMuted, playLivePcm, voiceMode]);

  const stopEverything = useCallback(() => {
    isListeningRef.current = false;
    try { recognitionRef.current?.abort(); } catch {}
    requestAbortRef.current?.abort(); requestAbortRef.current = null;
    window.speechSynthesis?.cancel();
    
    disconnectLive();
    playbackTimeRef.current = 0;
    speakingRef.current = false;
    stopAmbient();
    setStatus("idle");
  }, [disconnectLive, stopAmbient]);

  const pickVoice = useCallback(() => {
    if (!voices.length) return null;
    const patterns: Record<string, RegExp> = {
      Sky: /Samantha|Google US English|Aria|Jenny|Microsoft.*Online.*Natural/i,
      Cove: /Daniel|Google UK|George|Microsoft.*Male/i,
      Breeze: /Ava|Natural|Breeze|Guy|Microsoft.*Natural/i,
    };
    return voices.find(v => patterns[voice]?.test(v.name)) || voices.find(v => v.lang?.toLowerCase().startsWith("en")) || voices[0];
  }, [voices, voice]);

  const speakSentence = useCallback((text: string): Promise<void> => new Promise(resolve => {
    if (isMuted || !text.trim()) { resolve(); return; }
    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.rate = speed; utterance.pitch = 1;
    const selected = pickVoice(); if (selected) utterance.voice = selected;
    speakingRef.current = true;
    utterance.onstart = () => { setStatus("speaking"); startAmbient(); };
    utterance.onend = () => { speakingRef.current = false; stopAmbient(); resolve(); };
    utterance.onerror = () => { speakingRef.current = false; stopAmbient(); resolve(); };
    window.speechSynthesis?.speak(utterance);
  }), [isMuted, speed, pickVoice, startAmbient, stopAmbient]);

  const handleMessage = useCallback(async (text: string, attachment?: ImageAttachment | null) => {
    if (!text.trim()) return;
    stopEverything();
    setStatus("thinking");
    setChatHistory(prev => [...prev, { role: "user", parts: [{ text: attachment ? `${text || "Image attached"} [${attachment.name}]` : text }] }]);
    const controller = new AbortController(); requestAbortRef.current = controller;
    const clientContext = {
      creator: CREATOR,
      app: "Neto",
      installed: isInstalled,
      canOfferInstallPrompt: !!installPrompt,
      platform: navigator.platform,
      theme,
    };
    try {
      const response = await fetch("/api/chat-stream", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({
          message: text,
          history: chatHistory.slice(-20),
          attachment: attachment ? {
            name: attachment.name,
            mimeType: attachment.mimeType,
            url: attachment.url,
            storagePath: attachment.storagePath,
            size: attachment.size,
            text: attachment.text || null,
          } : null,
          clientContext,
        }),
      });
      if (!response.ok) {
        let serverMessage = "";
        try { const body = await response.json(); serverMessage = body?.error || ""; } catch {}
        throw new Error(serverMessage || `Request failed (${response.status})`);
      }
      const reader = response.body?.getReader(); const decoder = new TextDecoder();
      let buffer = "", fullResponse = "", spoken = false;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          const chunk = decoder.decode(value, { stream: true }); buffer += chunk; fullResponse += chunk;
          const match = buffer.match(/^([\s\S]*?[.!?](?:\s|$))/);
          if (match) {
            const sentence = match[1].trim(); buffer = buffer.slice(match[1].length);
            if (sentence) { spoken = true; await speakSentence(sentence); }
          }
          if (isMuted) break;
        }
        if (!isMuted && buffer.trim()) await speakSentence(buffer.trim());
      }
      setChatHistory(prev => [...prev, { role: "model", parts: [{ text: fullResponse || buffer }] }]);
      setStatus("idle");
      void spoken;
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        setStatus("idle");
        const spokenError = error?.message || "Sorry, I couldn't reach the AI service.";
        setTranscript(spokenError);
        if (!isMuted) await speakSentence(spokenError);
      }
    } finally { requestAbortRef.current = null; }
  }, [chatHistory, isInstalled, installPrompt, isMuted, theme, stopEverything, speakSentence]);

  const startListening = useCallback(async () => {
    if (isMicMuted) return;
    if (voiceMode) { await startLiveVoice(); return; }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { setTranscript("Voice input is not supported in this browser."); setStatus("idle"); return; }
    try { await navigator.mediaDevices?.getUserMedia({ audio: true }); } catch { setIsMicMuted(true); setTranscript("Microphone permission is required."); setStatus("idle"); return; }
    try { recognitionRef.current?.abort(); } catch {}
    intentionalStopRef.current = false;
    keepListeningRef.current = true;
    const recognition = new SpeechRecognition(); recognitionRef.current = recognition;
    // continuous:true + auto-restart below keeps the mic "awake" through natural pauses,
    // instead of the browser closing the session after the first thing the user says.
    recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 1; recognition.lang = "en-US";
    isListeningRef.current = true; transcriptRef.current = ""; setTranscript(""); setStatus("listening"); startAmbient();
    recognition.onstart = () => { isListeningRef.current = true; setStatus("listening"); };
    recognition.onresult = (event: any) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript + " ";
      transcriptRef.current = text.trim(); setTranscript(text.trim());
    };
    recognition.onerror = (event: any) => {
      isListeningRef.current = false; stopAmbient();
      if (["not-allowed", "service-not-allowed"].includes(event.error)) {
        intentionalStopRef.current = true; keepListeningRef.current = false;
        setIsMicMuted(true); setTranscript("Microphone access was denied."); setStatus("idle");
      }
      // Other errors (e.g. "no-speech", "network", "aborted") are handled by onend, which
      // decides whether to auto-restart — the browser fires onend right after onerror.
    };
    recognition.onend = () => {
      isListeningRef.current = false; stopAmbient();
      const text = transcriptRef.current.trim(); transcriptRef.current = "";
      if (text) {
        setTranscript(""); void handleMessage(text);
      } else if (keepListeningRef.current && !intentionalStopRef.current && !isMicMuted) {
        // The browser ended the session on its own (silence timeout) — restart so the
        // orb stays listening until the user actually mutes it.
        try { recognition.start(); } catch { setStatus("idle"); }
      } else {
        setStatus("idle");
      }
    };
    try { recognition.start(); } catch { setStatus("idle"); }
  }, [handleMessage, isMicMuted, startAmbient, stopAmbient, startLiveVoice, voiceMode]);

  const handleOrbTap = useCallback(() => {
    if (status === "listening" || isListeningRef.current) {
      const text = transcriptRef.current.trim(); stopEverything(); if (text) void handleMessage(text); setTranscript(""); transcriptRef.current = "";
    } else if (status === "speaking" || status === "thinking") { intentionalStopRef.current = true; keepListeningRef.current = false; stopEverything(); }
    else void startListening();
  }, [status, stopEverything, handleMessage, startListening]);

  const toggleMic = useCallback(() => {
    setIsMicMuted(prev => {
      const next = !prev;
      if (next) { intentionalStopRef.current = true; keepListeningRef.current = false; try { recognitionRef.current?.abort(); } catch {}  disconnectLive(); isListeningRef.current = false; stopAmbient(); if (status === "listening") setStatus("idle"); }
      return next;
    });
  }, [disconnectLive, status, stopAmbient]);

  const submitText = useCallback(() => {
    const text = draftText.trim();
    if (text || imageAttachment) {
      const attachment = imageAttachment;
      setDraftText("");
      setImageAttachment(null);
      void handleMessage(text || (attachment?.mimeType.startsWith("image/") ? "Please analyze this image." : `Please analyze this file: ${attachment?.name || "attachment"}.`), attachment);
    }
  }, [draftText, imageAttachment, handleMessage]);

  const installApp = useCallback(async () => {
    if (installPrompt) {
      const result = await installPrompt.prompt();
      if (result?.outcome === "accepted") setIsInstalled(true);
      setInstallPrompt(null); setInstallOpen(false); return;
    }
    setInstallOpen(false);
  }, [installPrompt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenuOpen(false); setSettingsOpen(false); setHistoryOpen(false); setAboutOpen(false); setInstallOpen(false); } if (e.key === "Enter" && e.ctrlKey) submitText(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [submitText]);

  const statusText = status === "listening" ? "You are speaking..." : status === "thinking" ? "Neto is thinking..." : status === "speaking" ? "Neto is speaking..." : "";
  const themeData = THEMES.find(t => t.id === theme)!;

  return (
    <div className="relative w-full min-h-[100dvh] overflow-hidden select-none" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <style>{`
        @keyframes breatheIdle {0%,100%{transform:scale(1)}50%{transform:scale(1.025)}}
        @keyframes breatheListening {0%,100%{transform:scale(1.035)}50%{transform:scale(1.105)}}
        @keyframes breatheThinking {0%,100%{transform:scale(1.02) rotate(-1deg)}50%{transform:scale(1.07) rotate(1deg)}}
        @keyframes breatheSpeaking {0%,100%{transform:scale(1.015)}18%{transform:scale(1.085)}35%{transform:scale(1.035)}54%{transform:scale(1.10)}76%{transform:scale(1.05)}}
        @keyframes pulseRing {0%{transform:scale(.88);opacity:.55}100%{transform:scale(1.55);opacity:0}}
        @keyframes cloudDrift {0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(8px,-6px) scale(1.07)}}
        @keyframes cloudDrift2 {0%,100%{transform:translate(0,0) rotate(0)}50%{transform:translate(-10px,5px) rotate(4deg)}}
        @keyframes shimmer {0%,100%{transform:translateX(-8%) rotate(-2deg);opacity:.42}50%{transform:translateX(10%) rotate(3deg);opacity:.78}}
        @keyframes speakingWave {0%,100%{transform:scale(.95);opacity:.16}50%{transform:scale(1.28);opacity:.38}}
      `}</style>

      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-5 sm:px-8 pt-[max(16px,env(safe-area-inset-top))] pb-4">
        <button aria-label="Open menu" onClick={() => setMenuOpen(true)} className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm border" style={{ background:"var(--surface-solid)", borderColor:"var(--border)" }}><Menu className="w-5 h-5" /></button>
        <div className="flex items-center gap-3">
          <button aria-label={isMuted ? "Unmute AI voice" : "Mute AI voice"} onClick={() => { setIsMuted(v => !v); if (!isMuted) window.speechSynthesis?.cancel(); }} className="w-12 h-12 rounded-full shadow-sm flex items-center justify-center border" style={{ background:isMuted?"rgba(239,68,68,.12)":"var(--surface-solid)", borderColor:"var(--border)" }}>{isMuted?<VolumeX className="w-5 h-5 text-red-500"/>:<Volume2 className="w-5 h-5"/>}</button>
          <button aria-label="Toggle captions" onClick={() => setCaptionsEnabled(v => !v)} className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm border" style={{ background:captionsEnabled?"var(--accent-soft)":"var(--surface-solid)", borderColor:"var(--border)" }}><span className="text-xs font-semibold">CC</span></button>
          <button aria-label="Open settings" onClick={() => setSettingsOpen(true)} className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm border" style={{ background:"var(--surface-solid)", borderColor:"var(--border)" }}><Settings className="w-5 h-5"/></button>
        </div>
      </div>

      {!isInstalled && (installPrompt || manualInstallInfo) && !installDismissed && (
        <div className="absolute top-[84px] left-4 right-4 z-40 mx-auto max-w-[520px] rounded-2xl p-4 shadow-xl border backdrop-blur" style={{background:"var(--surface)",borderColor:"var(--border)"}}>
          <div className="flex items-start gap-3"><Download className="w-5 h-5 mt-0.5" style={{color:"var(--accent)"}}/><div className="flex-1"><p className="font-semibold text-sm">Install Neto</p><p className="text-xs mt-1" style={{color:"var(--muted)"}}>{manualInstallInfo && !installPrompt ? `A couple of taps on ${manualInstallInfo.platform}.` : "Install it like an app for faster access and a standalone window."}</p></div><button onClick={()=>{setInstallDismissed(true);localStorage.setItem("voice-orb-install-dismissed","1")}} aria-label="Dismiss" className="text-sm opacity-60">×</button></div>
          <button onClick={()=>installPrompt ? installApp() : setInstallOpen(true)} className="mt-3 w-full h-10 rounded-full text-sm font-semibold text-white" style={{background:"var(--accent)"}}>{installPrompt ? "Install app" : "Show me how"}</button>
        </div>
      )}

      <div className="flex flex-col items-center justify-center min-h-[100dvh] px-6 pt-20 pb-[132px]">
        <div className="h-6 mb-6 flex items-center justify-center">{statusText ? <span className="text-[13px] tracking-wide font-medium px-3 py-1 rounded-full backdrop-blur border" style={{background:"var(--surface)",borderColor:"var(--border)",color:"var(--muted)"}}>{statusText}</span> : <span className="text-[13px] opacity-0">idle</span>}</div>
        <div className="relative flex items-center justify-center orb-reactive" style={{ "--orb-energy": orbEnergy } as React.CSSProperties}>
          {(status === "listening" || status === "speaking") && [0,1,2].map(i => <div key={i} className="absolute w-[300px] h-[300px] sm:w-[320px] sm:h-[320px] rounded-full border" style={{borderColor:status==="speaking"?"rgba(16,163,127,.22)":"rgba(100,140,255,.25)",animation:`pulseRing ${status==="speaking"?"1.25":"1.8"}s ease-out ${i*.3}s infinite`}}/>) }
          <OrbSparkles status={status} energy={orbEnergy} />
          <div className="absolute rounded-full blur-[20px] transition-all duration-700" style={{width: status === "listening" ? 370 : 330, height: status === "listening" ? 370 : 330, background:"radial-gradient(circle,var(--orb-glow),transparent 70%)"}} />
          <button aria-label="Neto" onPointerDown={e=>{e.preventDefault();handleOrbTap()}} className="relative rounded-full overflow-hidden will-change-transform focus:outline-none touch-none" style={{width:"min(300px,78vw)",height:"min(300px,78vw)",background:"linear-gradient(180deg,var(--orb-top) 0%,var(--orb-mid) 48%,var(--orb-bottom) 100%)",boxShadow:"0 24px 64px var(--orb-glow), inset 0 1px 0 rgba(255,255,255,.95), inset 0 -18px 36px rgba(255,255,255,.65)",animation:status==="idle"?"breatheIdle 4s ease-in-out infinite":status==="listening"?"breatheListening 1.2s ease-in-out infinite":status==="thinking"?"breatheThinking 1.7s ease-in-out infinite":"breatheSpeaking 1.05s ease-in-out infinite"}}>
            <div className="absolute inset-0">
              <div className="absolute left-1/2 -translate-x-1/2 bottom-[-6%] w-[92%] h-[58%] rounded-[50%] blur-[12px] bg-white/80" />
              <div className="absolute w-[58%] h-[28%] left-[12%] top-[46%] rounded-full blur-[16px] bg-white/70" style={{animation:`cloudDrift ${status==="speaking"?"2.8":"7"}s ease-in-out infinite`}} />
              <div className="absolute w-[46%] h-[24%] right-[14%] top-[56%] rounded-full blur-[14px] bg-white/60" style={{animation:`cloudDrift2 ${status==="speaking"?"2.3":"6"}s ease-in-out .3s infinite`}} />
              <div className="absolute w-[42%] h-[22%] left-[28%] bottom-[18%] rounded-full blur-[18px] bg-white/65" style={{animation:`cloudDrift ${status==="speaking"?"3.1":"8"}s ease-in-out .6s infinite`}} />
              <div className="absolute top-[-8%] left-1/2 -translate-x-1/2 w-[78%] h-[48%] rounded-full blur-[18px] opacity-60" style={{background:"radial-gradient(60% 60% at 50% 40%,rgba(255,255,255,.9),rgba(160,190,255,.35) 60%,transparent 85%)",animation:`shimmer ${status==="speaking"?"2.2":"5"}s ease-in-out infinite`}} />
              {status === "speaking" && <><div className="absolute inset-[18%] rounded-full border border-white/30" style={{animation:"speakingWave .8s ease-in-out infinite"}}/><div className="absolute inset-[28%] rounded-full border border-white/35" style={{animation:"speakingWave .8s ease-in-out .25s infinite"}}/></>}
              <div className="absolute inset-[1px] rounded-full shadow-[inset_0_0_24px_rgba(255,255,255,.9),inset_0_0_64px_rgba(255,255,255,.45)]"/>
            </div>
          </button>
          {captionsEnabled && (transcript || (status === "speaking" && chatHistory.length > 0)) && <div className="orb-caption" role="status">{transcript || chatHistory[chatHistory.length - 1]?.parts?.[0]?.text}</div>}
        </div>
        <div className="mt-10 text-center max-w-[300px]"><p className="text-[13px] leading-[18px] font-medium" style={{color:"var(--muted)"}}>{status==="idle"?"Tap the orb to speak":status==="listening"?"Listening — speak now":status==="thinking"?"Processing your voice":"Speaking — tap to interrupt"}</p></div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-20 px-4 sm:px-6 pb-[max(18px,env(safe-area-inset-bottom))] pt-4" style={{background:"linear-gradient(to top,var(--bg) 35%,transparent)"}}>
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
                setTranscript(`Uploading ${file.name}…`);
                try {
                  let text: string | undefined;
                  if(file.type.startsWith("text/") || /json|csv|xml/.test(file.type) || /\.(txt|md|json|csv|xml|html)$/i.test(file.name)) {
                    text = await file.text();
                    if(text.length > 12000) text = text.slice(0,12000);
                  }
                  const uploaded = await uploadAttachment(file);
                  setImageAttachment({...uploaded, text});
                  setTranscript(`${file.name} uploaded.`);
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
      </div>

      <Overlay open={menuOpen} onClose={()=>setMenuOpen(false)} side>
        <div className="px-7 pt-[max(24px,env(safe-area-inset-top))] pb-6 border-b" style={{borderColor:"var(--border)"}}><div className="w-10 h-10 rounded-full mb-4" style={{background:"linear-gradient(180deg,var(--orb-top),var(--orb-bottom))"}}/><h2 className="text-lg font-semibold">Neto</h2><p className="text-sm mt-1" style={{color:"var(--muted)"}}>Voice-first AI assistant</p></div>
        <nav className="p-3 flex flex-col gap-1.5"><Action icon={<Plus/>} text="New chat" onClick={()=>{setMenuOpen(false);intentionalStopRef.current=true;keepListeningRef.current=false;stopEverything();setTranscript("");setChatHistory([])}}/><Action icon={<Clock/>} text="History" onClick={()=>{setMenuOpen(false);setHistoryOpen(true)}}/><Action icon={<Settings/>} text="Settings" onClick={()=>{setMenuOpen(false);setSettingsOpen(true)}}/><Action icon={<UserRound/>} text="About creator" onClick={()=>{setMenuOpen(false);setAboutOpen(true)}}/><Action icon={<Download/>} text={isInstalled?"App installed":"Install app"} disabled={isInstalled} onClick={()=>{setMenuOpen(false);setInstallOpen(true)}}/></nav>
      </Overlay>

      <Overlay open={settingsOpen} onClose={()=>setSettingsOpen(false)} bottom>
        <div className="mx-auto max-w-[560px] px-6 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]"><div className="flex justify-center pt-1 pb-4"><div className="w-9 h-1 rounded-full bg-black/10"/></div><div className="flex items-center justify-between mb-6"><button aria-label="Back to home" onClick={()=>setSettingsOpen(false)} className="h-10 px-3 rounded-full flex items-center gap-2 font-semibold" style={{background:"var(--accent-soft)"}}><ArrowLeft className="w-4 h-4"/>Back</button><h3 className="text-lg font-semibold">Settings</h3><button aria-label="Close settings" onClick={()=>setSettingsOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{background:"var(--accent-soft)"}}><X className="w-4 h-4"/></button></div>
          <div className="space-y-6">
            <section><label className="text-xs font-semibold tracking-wide uppercase" style={{color:"var(--muted)"}}>Theme</label><div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">{THEMES.map(t=><button key={t.id} onClick={()=>setTheme(t.id)} className="p-3 rounded-2xl border text-left" style={{background:theme===t.id?"var(--accent-soft)":"var(--surface)",borderColor:theme===t.id?"var(--accent)":"var(--border)"}}><span className="text-sm font-semibold">{t.label}</span><span className="block text-[11px] mt-1" style={{color:"var(--muted)"}}>{t.description}</span></button>)}</div></section>
            <section><label className="text-xs font-semibold tracking-wide uppercase" style={{color:"var(--muted)"}}>Voice</label><div className="mt-3 grid grid-cols-3 gap-2">{["Sky","Cove","Breeze"].map(v=><button key={v} onClick={()=>setVoice(v)} className="h-12 rounded-full border text-sm font-semibold" style={{background:voice===v?"var(--text)":"var(--surface)",color:voice===v?"var(--bg)":"var(--text)",borderColor:"var(--border)"}}>{v}</button>)}</div></section>
            <section><div className="flex items-center justify-between h-14 px-4 rounded-full border" style={{background:"var(--surface)",borderColor:"var(--border)"}}><div><p className="text-sm font-semibold">Captions</p><p className="text-xs" style={{color:"var(--muted)"}}>Show spoken input and Neto replies above the orb</p></div><button aria-label="Toggle captions" onClick={()=>setCaptionsEnabled(v=>!v)} className="relative w-12 h-7 rounded-full" style={{background:captionsEnabled?"var(--accent)":"var(--border)"}}><span className="absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-all" style={{left:captionsEnabled?25:3}}/></button></div></section><section><div className="flex items-center justify-between h-14 px-4 rounded-full border" style={{background:"var(--surface)",borderColor:"var(--border)"}}><div><p className="text-sm font-semibold">Live voice</p><p className="text-xs" style={{color:"var(--muted)"}}>Gemini native audio-to-audio conversation</p></div><button aria-label="Toggle live voice" onClick={()=>{setVoiceMode(v=>!v); if (voiceMode) { intentionalStopRef.current=true; keepListeningRef.current=false; disconnectLive(); }}} className="relative w-12 h-7 rounded-full" style={{background:voiceMode?"var(--accent)":"var(--border)"}}><span className="absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-all" style={{left:voiceMode?25:3}}/></button></div></section><section><div className="flex items-center justify-between"><label className="text-xs font-semibold tracking-wide uppercase" style={{color:"var(--muted)"}}>Speed</label><span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{background:"var(--accent-soft)"}}>{speed.toFixed(1)}×</span></div><input aria-label="Voice speed" className="mt-4 w-full" type="range" min="0.7" max="1.4" step="0.1" value={speed} onChange={e=>setSpeed(parseFloat(e.target.value))}/></section>
            <div className="flex items-center justify-between h-14 px-4 rounded-full border" style={{background:"var(--surface)",borderColor:"var(--border)"}}><div><p className="text-sm font-semibold">Background sounds</p><p className="text-xs" style={{color:"var(--muted)"}}>Soft ambient hum while listening</p></div><button aria-label="Toggle background sounds" onClick={()=>setAmbientSounds(v=>!v)} className="relative w-12 h-7 rounded-full" style={{background:ambientSounds?"var(--accent)":"var(--border)"}}><span className="absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-all" style={{left:ambientSounds?25:3}}/></button></div>
            <button onClick={()=>setInstallOpen(true)} className="w-full h-12 rounded-full text-sm font-semibold border" style={{background:"var(--accent-soft)",borderColor:"var(--accent)"}}>{isInstalled?"Neto is installed":"Install Neto"}</button>
          </div>
        </div>
      </Overlay>

      <Overlay open={historyOpen} onClose={()=>setHistoryOpen(false)} bottom>
        <div className="mx-auto max-w-[560px] px-6 pt-3 pb-6" style={{maxHeight:"80vh",overflowY:"auto"}}><div className="flex justify-center pb-4"><div className="w-9 h-1 rounded-full bg-black/10"/></div><div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">Conversation</h3><button onClick={()=>setHistoryOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{background:"var(--accent-soft)"}}><X className="w-4 h-4"/></button></div>{chatHistory.length===0?<p className="text-sm text-center py-12" style={{color:"var(--muted)"}}>No messages yet.</p>:<div className="space-y-4">{chatHistory.map((m,i)=><div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}><div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px]" style={{background:m.role==="user"?"var(--accent)":"var(--accent-soft)",color:m.role==="user"?"#fff":"var(--text)"}}>{m.parts[0].text}</div></div>)}</div>}</div>
      </Overlay>

      <Overlay open={aboutOpen} onClose={()=>setAboutOpen(false)} bottom>
        <div className="mx-auto max-w-[560px] px-6 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]"><div className="flex justify-center pb-4"><div className="w-9 h-1 rounded-full bg-black/10"/></div><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{background:"linear-gradient(180deg,var(--orb-top),var(--orb-bottom))"}}><UserRound className="w-6 h-6"/></div><div><h3 className="text-lg font-semibold">About Neto</h3><p className="text-sm" style={{color:"var(--muted)"}}>Created by {CREATOR.name}</p></div></div><div className="mt-6 rounded-2xl p-4 border" style={{background:"var(--surface)",borderColor:"var(--border)"}}><p className="text-sm leading-relaxed">Neto is the AI assistant and product identity of the app. The company/product identity is <strong>Neto</strong>, and the verified creator is <strong>{CREATOR.name}</strong>. Neto should describe itself using these verified facts and should never claim that it was created by OpenAI, Gemini, or another unrelated organization.</p></div></div>
      </Overlay>

      <Overlay open={endConfirmOpen} onClose={()=>setEndConfirmOpen(false)} bottom>
        <div className="mx-auto max-w-[560px] px-6 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] text-center"><div className="flex justify-center pb-4"><div className="w-9 h-1 rounded-full bg-black/10"/></div><div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center border" style={{background:"var(--accent-soft)",borderColor:"var(--border)"}}><X className="w-6 h-6"/></div><h3 className="text-lg font-semibold mt-4">End conversation?</h3><p className="text-sm mt-2" style={{color:"var(--muted)"}}>Neto will stop speaking, close the microphone session, cancel pending work, and return the orb to idle.</p><div className="grid grid-cols-2 gap-2 mt-6"><button onClick={()=>setEndConfirmOpen(false)} className="h-12 rounded-full border font-semibold" style={{borderColor:"var(--border)",background:"var(--surface)"}}>Keep talking</button><button onClick={()=>{stopEverything();setDraftText("");setTranscript("");transcriptRef.current="";setEndConfirmOpen(false)}} className="h-12 rounded-full text-white font-semibold" style={{background:"var(--text)"}}>End conversation</button></div></div>
      </Overlay>

      <Overlay open={installOpen} onClose={()=>setInstallOpen(false)} bottom>
        <div className="mx-auto max-w-[560px] px-6 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]"><div className="flex justify-center pb-4"><div className="w-9 h-1 rounded-full bg-black/10"/></div><div className="flex items-center gap-3"><Download className="w-6 h-6" style={{color:"var(--accent)"}}/><div><h3 className="text-lg font-semibold">Install Neto</h3><p className="text-sm" style={{color:"var(--muted)"}}>{isInstalled?"The app is already installed on this device.":manualInstallInfo?`${manualInstallInfo.platform} doesn't support one-tap install — add it manually:`:installPrompt?"Install Neto as a standalone app.":"Your browser will show its supported installation option when available."}</p></div></div>
        {!isInstalled && manualInstallInfo && (
          <ol className="mt-4 space-y-2 text-sm list-decimal list-inside" style={{color:"var(--text)"}}>
            {manualInstallInfo.steps.map((step, i) => <li key={i}>{step}</li>)}
          </ol>
        )}
        {!isInstalled && !manualInstallInfo && <button disabled={!installPrompt} onClick={installApp} className="mt-6 w-full h-12 rounded-full text-white font-semibold disabled:opacity-40" style={{background:"var(--accent)"}}>{installPrompt?"Install now":"Use your browser's Install / Add to Home Screen option"}</button>}
        <button onClick={()=>setInstallOpen(false)} className="mt-2 w-full h-11 rounded-full text-sm" style={{color:"var(--muted)"}}>Close</button></div>
      </Overlay>
    </div>
  );
}

function Action({ icon, text, onClick, disabled=false }: { icon: ReactNode; text: string; onClick:()=>void; disabled?:boolean }) { return <button disabled={disabled} onClick={onClick} className="w-full text-left h-11 px-4 rounded-full flex items-center gap-3 text-sm font-medium disabled:opacity-50" style={{color:"var(--text)"}}>{icon}<span className="[&>svg]:w-4 [&>svg]:h-4" style={{color:"var(--muted)"}}>{text}</span></button>; }

function Overlay({ open, onClose, children, side=false, bottom=false }: { open:boolean; onClose:()=>void; children:ReactNode; side?:boolean; bottom?:boolean }) {
  return <div className={`fixed inset-0 z-[70] ${open?"visible":"invisible pointer-events-none"}`}><div className={`absolute inset-0 bg-black/25 backdrop-blur-sm transition-opacity ${open?"opacity-100":"opacity-0"}`} onClick={onClose}/><div className={`absolute ${side?"top-0 left-0 h-full w-[310px] max-w-[88vw] rounded-r-3xl":"bottom-0 left-0 right-0 rounded-t-3xl"} shadow-2xl transition-transform duration-300 ${open?"translate-x-0 translate-y-0":"-translate-x-2 translate-y-4"}`} style={{background:"var(--surface-solid)",color:"var(--text)"}}>{children}</div></div>;
}
