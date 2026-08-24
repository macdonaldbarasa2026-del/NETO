import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Initialize Firebase Admin (Only initialize if credentials exist to prevent crashing on boot)
// In production on Render, you should provide a FIREBASE_SERVICE_ACCOUNT_KEY env var
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (serviceAccountKey) {
  try {
    const serviceAccount = JSON.parse(serviceAccountKey);
    if (!getApps().length) {
      initializeApp({
        credential: cert(serviceAccount)
      });
      console.log("Firebase Admin initialized");
    }
  } catch (error) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY or initialize admin", error);
  }
} else {
  console.warn("FIREBASE_SERVICE_ACCOUNT_KEY not found. Firebase Admin is not initialized.");
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(cors());
  app.use(express.json());

  // --- API Routes ---
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Example API route interacting with Firestore
  app.get("/api/data", async (req, res) => {
    try {
      if (!getApps().length) {
        return res.status(503).json({ error: "Firebase Admin is not configured" });
      }
      
      const db = getFirestore();
      const snapshot = await db.collection("items").limit(10).get();
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      res.json({ items });
    } catch (error) {
      console.error("Error fetching from Firestore", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- Capacity protection / request scheduling ---
  // Keep each Render instance bounded so bursts do not create thousands of
  // simultaneous Gemini calls. Render can scale instances horizontally.
  const MAX_CHAT_CONCURRENCY = Number(process.env.MAX_CHAT_CONCURRENCY || 24);
  const MAX_CHAT_QUEUE = Number(process.env.MAX_CHAT_QUEUE || 120);
  const MAX_LIVE_CONNECTIONS = Number(process.env.MAX_LIVE_CONNECTIONS || 80);
  const chatQueue: Array<{ run: () => Promise<void>; reject: (error: Error) => void }> = [];
  let activeChats = 0;
  let activeLiveConnections = 0;

  const pumpChatQueue = () => {
    while (activeChats < MAX_CHAT_CONCURRENCY && chatQueue.length) {
      const job = chatQueue.shift()!;
      activeChats += 1;
      void job.run().catch(job.reject).finally(() => {
        activeChats -= 1;
        pumpChatQueue();
      });
    }
  };

  const enqueueChat = <T>(run: () => Promise<T>) => new Promise<T>((resolve, reject) => {
    if (chatQueue.length >= MAX_CHAT_QUEUE) {
      reject(Object.assign(new Error('Neto is handling many conversations right now. Please try again in a moment.'), { code: 'QUEUE_FULL' }));
      return;
    }
    chatQueue.push({
      run: async () => { try { resolve(await run()); } catch (error) { reject(error); } },
      reject,
    });
    pumpChatQueue();
  });

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const isRateLimitError = (error: any) => error?.status === 429 || /429|rate.?limit|resource.?exhausted/i.test(String(error?.message || ''));

  // --- WebSocket Server for Live API ---
  const { WebSocketServer } = await import("ws");
  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/live" });

  wss.on("connection", async (clientWs, req) => {
    if (activeLiveConnections >= MAX_LIVE_CONNECTIONS) {
      clientWs.send(JSON.stringify({ error: "VOICE_CAPACITY", outputTranscription: "Neto is handling many voice conversations right now. Please try again in a moment.", turnComplete: true }));
      clientWs.close(1013, "voice capacity");
      return;
    }
    activeLiveConnections += 1;
    try {
      if (!ai) {
        clientWs.send(JSON.stringify({ error: "Gemini API is not configured" }));
        clientWs.close();
        return;
      }
      
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: ["AUDIO"],
          systemInstruction: `You are Neto, the AI assistant inside the Voice Orb app. Give brief, immediate conversational replies, normally 1-2 short sentences unless the user asks for detail. Never use markdown in voice replies. Be natural, friendly, and fast.`,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (message: any) => {
            const content = message.serverContent;
            const audio = content?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio) clientWs.send(JSON.stringify({ audio }));
            if (content?.interrupted)
              clientWs.send(JSON.stringify({ interrupted: true }));
            if (content?.inputTranscription?.text)
              clientWs.send(JSON.stringify({ inputTranscription: content.inputTranscription.text }));
            if (content?.outputTranscription?.text)
              clientWs.send(JSON.stringify({ outputTranscription: content.outputTranscription.text }));
            if (content?.turnComplete)
              clientWs.send(JSON.stringify({ turnComplete: true }));
          },
        },
      });

      clientWs.on("message", (data) => {
        try {
          const { audio } = JSON.parse(data.toString());
          if (audio) {
            session.sendRealtimeInput({
              audio: { data: audio, mimeType: "audio/pcm;rate=16000" },
            });
          }
        } catch (e) {
          console.error("Error processing websocket message", e);
        }
      });
      
      clientWs.on("close", () => {
        activeLiveConnections = Math.max(0, activeLiveConnections - 1);
        try { session.close?.(); } catch {}
      });
    } catch (e: any) {
      activeLiveConnections = Math.max(0, activeLiveConnections - 1);
      console.error("Failed to connect to Live API", e);
      try {
        const isRateLimit = e?.status === 429 || (e?.message && e.message.includes("429"));
        const errorMsg = isRateLimit 
          ? "Sorry, you have reached the limit. Please try again later."
          : "Sorry, my voice systems are overloaded. Please try again in a moment.";
        clientWs.send(JSON.stringify({ 
          outputTranscription: errorMsg,
          turnComplete: true
        }));
      } catch (err) {}
      setTimeout(() => clientWs.close(), 500);
    }
  });

  // --- Chat API with bounded concurrency, retries and streaming ---
  app.post("/api/chat-stream", async (req, res) => {
    const { message, history = [], sessionId = "default-session", clientContext = {} } = req.body || {};
    const cleanMessage = typeof message === "string" ? message.trim().slice(0, 12000) : "";
    if (!cleanMessage) return res.status(400).json({ error: "Message is required." });
    if (!ai) return res.status(503).json({ error: "Gemini API is not configured" });

    let disconnected = false;
    req.on("close", () => { disconnected = true; });

    try {
      await enqueueChat(async () => {
        let lastError: any = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          if (disconnected) return;
          try {
            const contents = [...(Array.isArray(history) ? history.slice(-20) : []), { role: "user", parts: [{ text: cleanMessage }] }];
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.setHeader("Cache-Control", "no-cache, no-transform");
            res.setHeader("X-Neto-Queue", "bounded");

            const responseStream = await ai!.models.generateContentStream({
              model: process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash-lite",
              contents,
              config: {
                systemInstruction: `You are Neto, the AI assistant inside Voice Orb. Be fast, natural and concise by default. Normally answer in 1-2 short sentences unless the user asks for detail. Avoid markdown in voice replies. Your name is Neto. Voice Orb was created by Macdonald Barasa. Do not invent biography or personal details about the creator. If asked about installation, explain that Voice Orb is a PWA and only claim installation when the client says it is installed. Client context: ${JSON.stringify(clientContext).slice(0, 4000)}`,
              },
            });

            let fullText = "";
            for await (const chunk of responseStream) {
              if (disconnected) break;
              if (chunk.text) { fullText += chunk.text; res.write(chunk.text); }
            }
            if (!disconnected && !res.writableEnded) res.end();

            if (getApps().length && fullText) {
              try {
                const db = getFirestore();
                const batch = db.batch();
                const sessionRef = db.collection("conversations").doc(sessionId);
                batch.set(sessionRef.collection("messages").doc(), { role: "user", text: cleanMessage, timestamp: FieldValue.serverTimestamp() });
                batch.set(sessionRef.collection("messages").doc(), { role: "model", text: fullText, timestamp: FieldValue.serverTimestamp() });
                await batch.commit();
              } catch (dbError) { console.error("Failed to save conversation:", dbError); }
            }
            return;
          } catch (error: any) {
            lastError = error;
            if (!isRateLimitError(error) || attempt === 2) break;
            await sleep(250 * (2 ** attempt) + Math.floor(Math.random() * 150));
          }
        }

        const rateLimited = isRateLimitError(lastError);
        const errorMsg = rateLimited ? "Neto is busy right now. Your request was protected from overload; please try again shortly." : "Neto could not complete that request. Please try again.";
        if (!disconnected && !res.headersSent) res.status(rateLimited ? 429 : 500).json({ error: errorMsg });
        else if (!disconnected && !res.writableEnded) { res.write(errorMsg); res.end(); }
      });
    } catch (error: any) {
      if (error?.code === "QUEUE_FULL") return res.status(429).json({ error: error.message, retryAfterMs: 1500 });
      if (!res.headersSent) return res.status(500).json({ error: "Neto is temporarily unavailable. Please try again." });
    }
  });

  // --- Vite / Static Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

startServer();
