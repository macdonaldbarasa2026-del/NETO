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
  const PORT = 3000;

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

  // --- WebSocket Server for Live API ---
  const { WebSocketServer } = await import("ws");
  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/live" });

  wss.on("connection", async (clientWs, req) => {
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
        // cleanup session if possible
      });
    } catch (e: any) {
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

  // Chat API stream route integrating Gemini & Firestore
  app.post("/api/chat-stream", async (req, res) => {
    try {
      if (!ai) {
        return res.status(503).json({ error: "Gemini API is not configured" });
      }

      const { message, history = [], sessionId = "default-session", clientContext = {} } = req.body;
      
      const contents = [...history, { role: "user", parts: [{ text: message }] }];

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      const responseStream = await ai.models.generateContentStream({
        model: "gemini-1.5-flash",
        contents,
        config: {
          systemInstruction: `You are Neto, the AI assistant inside the Voice Orb app. Give brief, immediate conversational replies, normally 1-2 short sentences unless the user asks for detail. Never use markdown in voice replies. Be natural, friendly, and fast.

Verified AI identity: Your name is Neto. You are the AI assistant inside the Voice Orb app. The app was created by Macdonald Barasa. If the user asks your name, who you are, or what they should call you, answer that your name is Neto. Do not call yourself Voice Orb; Voice Orb is the application name. Do not say your name is Gemini unless the user specifically asks which underlying AI technology powers you.
Do not invent additional biography, location, occupation, contact details, social links, or achievements for Macdonald Barasa. If asked who created the app, say it was created by Macdonald Barasa.

Installation awareness: the client sends an installed flag. If installed is false and the user asks how to install Voice Orb, or asks whether it is installed, explain that it is a PWA and can be installed when the browser offers installation. If installed is false and the user explicitly asks about installing it, tell them to use the app's Install button or their browser's Add to Home Screen/Install option. Do not falsely claim that installation succeeded. Client context: ${JSON.stringify(clientContext)}`,
        }
      });

      let fullText = "";
      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullText += chunk.text;
          res.write(chunk.text);
        }
      }
      res.end();

      // Attempt to save to Firestore
      if (getApps().length) {
        try {
          const db = getFirestore();
          const sessionRef = db.collection("conversations").doc(sessionId);
          await sessionRef.collection("messages").add({
            role: "user",
            text: message,
            timestamp: FieldValue.serverTimestamp()
          });
          await sessionRef.collection("messages").add({
            role: "model",
            text: fullText,
            timestamp: FieldValue.serverTimestamp()
          });
        } catch (dbError) {
          console.error("Failed to save to Firestore:", dbError);
        }
      }
    } catch (error: any) {
      console.error("Error in /api/chat-stream:", error);
      const isRateLimit = error?.status === 429 || (error?.message && error.message.includes("429"));
      const errorMsg = isRateLimit
        ? "Sorry, you have reached the limit. Please try again later."
        : "Sorry, my systems are currently overloaded. Please try again in a moment.";
      if (!res.headersSent) {
        res.status(isRateLimit ? 429 : 500).json({ error: errorMsg, details: error.message });
      } else {
        res.write(errorMsg);
        res.end();
      }
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
