import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp, getApps, cert } from "firebase-admin/app";
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
  const PORT = Number(process.env.PORT) || 3000;
  const requestWindowMs = 10 * 60 * 1000;
  const requestLimit = 40;
  const requestBuckets = new Map<string, { count: number; startedAt: number }>();

  // The API is deliberately same-origin. API credentials stay on this server and
  // should never be exposed to arbitrary browser origins.
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
    next();
  });
  app.use(express.json({ limit: "2mb" }));

  const rateLimitChat = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim() || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const bucket = requestBuckets.get(ip);
    if (!bucket || now - bucket.startedAt > requestWindowMs) {
      requestBuckets.set(ip, { count: 1, startedAt: now });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > requestLimit) return res.status(429).json({ error: "Too many requests. Please wait a few minutes and try again." });
    next();
  };

  // --- API Routes ---
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // --- WebSocket Server for Live API ---
  const { WebSocketServer } = await import("ws");
  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/live" });

  const NETO_VOICE_INSTRUCTIONS = `You are Neto, the AI assistant inside the Neto app. You were created for Neto by Macdonald Barasa. Your product/company identity is Neto. Do not expose the underlying AI provider unless the user explicitly asks about the technical stack. Give brief, immediate conversational replies, normally 1-2 short sentences unless the user asks for detail. Never use markdown in voice replies. Be natural, clear, friendly, and fast.`;

  function resamplePcm16Base64(base64: string, fromRate: number, toRate: number) {
    if (fromRate === toRate) return base64;
    const input = Buffer.from(base64, "base64");
    const samples = new Int16Array(input.buffer, input.byteOffset, Math.floor(input.byteLength / 2));
    const outLength = Math.max(1, Math.floor(samples.length * toRate / fromRate));
    const out = new Int16Array(outLength);
    const ratio = fromRate / toRate;
    for (let i = 0; i < outLength; i++) {
      const pos = i * ratio;
      const left = Math.floor(pos);
      const right = Math.min(samples.length - 1, left + 1);
      const frac = pos - left;
      const value = samples[Math.min(left, samples.length - 1)] * (1 - frac) + samples[right] * frac;
      out[i] = Math.max(-32768, Math.min(32767, Math.round(value)));
    }
    return Buffer.from(out.buffer).toString("base64");
  }

  wss.on("connection", async (clientWs, req) => {
    const mode = new URL(req.url || "/live", "http://localhost").searchParams.get("mode") === "pro" ? "pro" : "normal";

    if (mode === "pro") {
      if (!process.env.OPENAI_API_KEY) {
        clientWs.send(JSON.stringify({ error: "Pro voice is not configured yet." }));
        clientWs.close();
        return;
      }

      let upstream: any;
      try {
        const WebSocket = (await import("ws")).default;
        const model = process.env.OPENAI_PRO_REALTIME_MODEL || "gpt-4o-mini-realtime-preview";
        upstream = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "OpenAI-Beta": "realtime=v1",
          },
        });

        upstream.on("open", () => {
          upstream.send(JSON.stringify({
            type: "session.update",
            session: {
              modalities: ["audio"],
              instructions: NETO_VOICE_INSTRUCTIONS,
              voice: process.env.OPENAI_PRO_VOICE || "alloy",
              input_audio_format: "pcm16",
              output_audio_format: "pcm16",
              input_audio_transcription: {
                model: "whisper-1",
              },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
                create_response: true,
              },
            },
          }));
          clientWs.send(JSON.stringify({ ready: true }));
        });

        upstream.on("message", (raw: Buffer) => {
          try {
            const event = JSON.parse(raw.toString());
            switch (event.type) {
              case "response.audio.delta":
              case "response.output_audio.delta":
                if (event.delta) clientWs.send(JSON.stringify({ audio: event.delta }));
                break;
              case "conversation.item.input_audio_transcription.delta":
                if (event.delta) clientWs.send(JSON.stringify({ inputTranscription: event.delta }));
                break;
              case "conversation.item.input_audio_transcription.completed":
                if (event.transcript) clientWs.send(JSON.stringify({ inputTranscription: event.transcript, inputTranscriptionFinal: true }));
                break;
              case "response.audio_transcript.delta":
              case "response.output_audio_transcript.delta":
                if (event.delta) clientWs.send(JSON.stringify({ outputTranscription: event.delta }));
                break;
              case "response.audio_transcript.done":
              case "response.output_audio_transcript.done":
                if (event.transcript) clientWs.send(JSON.stringify({ outputTranscription: event.transcript, outputTranscriptionFinal: true }));
                break;
              case "input_audio_buffer.speech_started":
                clientWs.send(JSON.stringify({ listening: true, interrupted: true }));
                break;
              case "input_audio_buffer.speech_stopped":
                clientWs.send(JSON.stringify({ thinking: true }));
                break;
              case "input_audio_buffer.cleared":
                break;
              case "response.created":
                clientWs.send(JSON.stringify({ thinking: true }));
                break;
              case "response.done":
                clientWs.send(JSON.stringify({ turnComplete: true }));
                break;
              case "response.cancelled":
              case "input_audio_buffer.committed":
                break;
              case "conversation.item.truncated":
                clientWs.send(JSON.stringify({ interrupted: true }));
                break;
              case "error":
                console.error("OpenAI Realtime error:", event.error || event);
                clientWs.send(JSON.stringify({ error: event.error?.message || "Pro voice is temporarily unavailable." }));
                break;
            }
          } catch (error) {
            console.error("Error processing Pro realtime event", error);
          }
        });

        upstream.on("error", (error: any) => {
          console.error("Pro realtime websocket error", error);
          try { clientWs.send(JSON.stringify({ error: "Pro voice connection failed." })); } catch {}
        });

        upstream.on("close", () => {
          try { if (clientWs.readyState === 1) clientWs.close(); } catch {}
        });

        clientWs.on("message", (data) => {
          try {
            const { audio, cancel, text } = JSON.parse(data.toString());
            if (cancel && upstream?.readyState === 1) {
              upstream.send(JSON.stringify({ type: "response.cancel" }));
              upstream.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
              return;
            }
            if (audio && upstream?.readyState === 1) {
              const pcm24 = resamplePcm16Base64(audio, 16000, 24000);
              upstream.send(JSON.stringify({ type: "input_audio_buffer.append", audio: pcm24 }));
            }
            if (text && upstream?.readyState === 1) {
              upstream.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } }));
              upstream.send(JSON.stringify({ type: "response.create" }));
            }
          } catch (error) {
            console.error("Error forwarding Pro voice input", error);
          }
        });

        clientWs.on("close", () => {
          try { if (upstream?.readyState === 1) upstream.close(); } catch {}
        });
      } catch (error) {
        console.error("Failed to connect to Pro realtime API", error);
        try { clientWs.send(JSON.stringify({ error: "Pro voice is unavailable right now." })); } catch {}
        try { clientWs.close(); } catch {}
      }
      return;
    }

    try {
      if (!ai) {
        clientWs.send(JSON.stringify({ error: "Normal voice is not configured." }));
        clientWs.close();
        return;
      }

      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: ["AUDIO"] as any,
          systemInstruction: NETO_VOICE_INSTRUCTIONS,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          thinkingConfig: { thinkingLevel: "minimal" as any },
        },
        callbacks: {
          onmessage: (message: any) => {
            const content = message.serverContent;
            const audio = content?.modelTurn?.parts?.find((part: any) => part?.inlineData?.data)?.inlineData?.data;
            if (audio) clientWs.send(JSON.stringify({ audio }));
            if (content?.interrupted) clientWs.send(JSON.stringify({ interrupted: true }));
            if (content?.inputTranscription?.text) clientWs.send(JSON.stringify({ inputTranscription: content.inputTranscription.text }));
            if (content?.outputTranscription?.text) clientWs.send(JSON.stringify({ outputTranscription: content.outputTranscription.text }));
            if (content?.turnComplete) clientWs.send(JSON.stringify({ turnComplete: true }));
          },
        },
      });

      clientWs.on("message", (data) => {
        try {
          const { audio, text } = JSON.parse(data.toString());
          if (audio) (session as any).sendRealtimeInput({ audio: { data: audio, mimeType: "audio/pcm;rate=16000" } as any });
          if (text) (session as any).sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: true });
        } catch (e) {
          console.error("Error processing normal voice websocket message", e);
        }
      });
      clientWs.on("close", () => {});
    } catch (e: any) {
      console.error("Failed to connect to Normal Live API", e);
      try { clientWs.send(JSON.stringify({ error: "Normal voice is unavailable right now." })); } catch {}
      setTimeout(() => { try { clientWs.close(); } catch {} }, 500);
    }
  });

  // Chat API stream route. Normal uses Gemini. Pro uses OpenAI.
  app.post("/api/chat-stream", rateLimitChat, async (req, res) => {
    try {
      const { message, history = [], clientContext = {}, attachment = null, mode = "normal" } = req.body || {};
      if (typeof message !== "string" || message.length > 12_000) return res.status(400).json({ error: "Message must be text shorter than 12,000 characters." });
      if (mode !== "normal" && mode !== "pro") return res.status(400).json({ error: "Unsupported AI mode." });
      const safeHistory = (Array.isArray(history) ? history : []).slice(-12).map((item: any) => ({
        role: item?.role === "model" ? "model" : "user",
        parts: [{ text: Array.isArray(item?.parts) ? item.parts.map((part: any) => typeof part?.text === "string" ? part.text : "").join("\n").slice(0, 6_000) : "" }],
      })).filter((item) => item.parts[0].text);
      const safeAttachment = attachment && typeof attachment === "object" ? {
        name: typeof attachment.name === "string" ? attachment.name.slice(0, 160) : "attachment",
        mimeType: typeof attachment.mimeType === "string" ? attachment.mimeType.slice(0, 128) : "application/octet-stream",
        url: typeof attachment.url === "string" ? attachment.url.slice(0, 4_096) : "",
        size: Number.isFinite(Number(attachment.size)) ? Number(attachment.size) : 0,
        text: typeof attachment.text === "string" ? attachment.text.slice(0, 12_000) : "",
      } : null;
      const safeClientContext = {
        installed: clientContext?.installed === true,
        nativeCapabilities: clientContext?.nativeCapabilities === true,
        theme: typeof clientContext?.theme === "string" ? clientContext.theme.slice(0, 32) : "default",
        mode,
      };

      if (mode === "pro") {
        if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "Pro is not configured yet." });
        const openAiMessages: any[] = [
          {
            role: "developer",
            content: `You are Neto, the AI assistant inside the Neto app. The product identity is Neto and the verified creator is Macdonald Barasa. Do not expose the underlying AI provider unless the user explicitly asks about the technical stack. Be concise by default, direct, natural, and helpful. Do not claim to execute device actions; the user must explicitly initiate and confirm them in the Device screen. Client context: ${JSON.stringify(safeClientContext)}`
          },
          ...safeHistory.map((item) => ({
            role: item.role === "model" ? "assistant" : "user",
            content: item.parts[0].text
          })).filter((item) => item.content)
        ];

        const userText = message || (safeAttachment?.mimeType.startsWith("image/") ? "Please analyze the attached image." : "Please analyze the attached file.");
        const userContent: any[] = [{ type: "text", text: userText }];
        if (safeAttachment?.text) userContent.push({ type: "text", text: `Attached file ${safeAttachment.name} contains:\n${safeAttachment.text}` });

        if (safeAttachment?.url && safeAttachment?.mimeType) {
          const allowedHosts = new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]);
          const parsedUrl = new URL(safeAttachment.url);
          if (parsedUrl.protocol !== "https:" || !allowedHosts.has(parsedUrl.hostname)) return res.status(400).json({ error: "Attachment URL is not supported." });
          if (safeAttachment.size > 10 * 1024 * 1024) return res.status(413).json({ error: "Files must be 10 MB or smaller." });
          const fileResponse = await fetch(safeAttachment.url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
          if (!fileResponse.ok) throw new Error("Could not read the uploaded file.");
          const buffer = Buffer.from(await fileResponse.arrayBuffer());
          if (buffer.length > 10 * 1024 * 1024) return res.status(413).json({ error: "Uploaded file is too large." });
          const mimeType = safeAttachment.mimeType.split(";")[0].toLowerCase();
          if (/^image\/(png|jpeg|jpg|webp|gif)$/.test(mimeType)) {
            const normalized = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
            userContent.push({ type: "image_url", image_url: { url: `data:${normalized};base64,${buffer.toString("base64")}` } });
          } else if (!safeAttachment.text) {
            userContent.push({ type: "text", text: `The uploaded file ${safeAttachment.name} is stored in the app. Its MIME type is ${mimeType}.` });
          }
        }
        openAiMessages.push({ role: "user", content: userContent });

        let openAiModel = process.env.OPENAI_PRO_MODEL || "gpt-4o-mini";
        let openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: JSON.stringify({ model: openAiModel, messages: openAiMessages, stream: true })
        });
        if (!openAiResponse.ok && openAiModel !== "gpt-4o-mini") {
          console.warn(`Pro API error with model ${openAiModel}, retrying with gpt-4o-mini...`);
          openAiModel = "gpt-4o-mini";
          openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
            body: JSON.stringify({ model: openAiModel, messages: openAiMessages, stream: true })
          });
        }
        if (!openAiResponse.ok) {
          const detail = await openAiResponse.text();
          console.error("Pro API error:", detail);
          const status = openAiResponse.status === 429 ? 429 : 502;
          return res.status(status).json({ error: status === 429 ? "Pro is temporarily unavailable. Please try again later." : "Pro is unavailable right now." });
        }

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Transfer-Encoding", "chunked");
        let fullText = "";
        const reader = openAiResponse.body?.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            pending += decoder.decode(value, { stream: true });
            const lines = pending.split("\n");
            pending = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") continue;
              try {
                const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
                if (delta) { fullText += delta; res.write(delta); }
              } catch {}
            }
          }
        }
        res.end();

        return;
      }

      if (!ai) return res.status(503).json({ error: "Normal service is not configured" });
      const userParts: any[] = [{ text: message || (safeAttachment?.mimeType.startsWith("image/") ? "Please analyze the attached image." : "Please analyze the attached file.") }];

      if (safeAttachment?.text) {
        userParts.push({ text: `Attached file ${safeAttachment.name} contains:\n${safeAttachment.text}` });
      }

      if (safeAttachment?.url && safeAttachment?.mimeType) {
        const allowedHosts = new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]);
        const parsedUrl = new URL(safeAttachment.url);
        if (parsedUrl.protocol !== "https:" || !allowedHosts.has(parsedUrl.hostname)) {
          return res.status(400).json({ error: "Attachment URL is not a supported Firebase Storage URL." });
        }
        if (safeAttachment.size > 10 * 1024 * 1024) {
          return res.status(413).json({ error: "Files must be 10 MB or smaller." });
        }

        const fileResponse = await fetch(safeAttachment.url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
        if (!fileResponse.ok) throw new Error("Could not read the uploaded Firebase file.");
        const buffer = Buffer.from(await fileResponse.arrayBuffer());
        if (buffer.length > 10 * 1024 * 1024) return res.status(413).json({ error: "Uploaded file is too large." });

        const mimeType = safeAttachment.mimeType.split(";")[0].toLowerCase();
        const supportedInline = /^(image\/(png|jpeg|jpg|webp|gif)|application\/pdf)$/.test(mimeType);
        if (supportedInline) {
          userParts.push({ inlineData: { mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType, data: buffer.toString("base64") } });
        } else if (!safeAttachment.text) {
          userParts.push({ text: `The file ${safeAttachment.name} was uploaded to Firebase Storage. Its MIME type is ${mimeType}. The app could not extract readable text from this file on the client.` });
        }
      }

      const contents = [...safeHistory, { role: "user", parts: userParts }];
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Transfer-Encoding", "chunked");

      const responseStream = await ai.models.generateContentStream({
        model: "gemini-3.1-flash",
        contents,
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction: `You are Neto, the AI assistant inside the Neto app.
Identity rules:
- Your name is Neto.
- The product/company identity is Neto.
- The verified creator is Macdonald Barasa.
- Do not claim you were created by OpenAI. OpenAI is not your creator identity for this app.
- The AI service is an internal implementation detail. Do not expose provider names unless the user explicitly asks about the technical stack.
- If asked who created you or the app, answer: "I was created for Neto by Macdonald Barasa."
- Do not invent biography, location, contact details, social links, achievements, ownership, or company history for Macdonald Barasa.
- Be honest about capabilities. You can analyze text, images, and supported PDF attachments supplied by the app. You also have access to Google Search for finding real-time information.
Conversation rules:
- Answer text messages normally and directly. Never require voice input for a text question.
- Keep replies concise by default, but give detail when requested.
- In voice mode, avoid markdown; in text mode, normal formatting is allowed.
Installation awareness:
- Neto is a Progressive Web App (PWA).
- If installed is false and the user asks to install, explain that the app's Install button or browser Add to Home Screen/Install option should be used.
- Never falsely claim installation succeeded.
Device action policy:
- Never claim to execute a device action. The user must explicitly initiate and confirm supported actions in the Device screen.
Client context: ${JSON.stringify(safeClientContext)}`,
        },
      });

      let fullText = "";
      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullText += chunk.text;
          res.write(chunk.text);
        }
      }
      res.end();

    } catch (error: any) {
      const isRateLimit = error?.status === 429 || String(error?.message || "").includes("429");
      if (!isRateLimit) {
        console.error("Error in /api/chat-stream:", error);
      }
      const errorMsg = isRateLimit ? "Sorry, you have reached the limit. Please try again later." : "Sorry, my systems are currently overloaded. Please try again in a moment.";
      if (!res.headersSent) res.status(isRateLimit ? 429 : 500).json({ error: errorMsg });
      else { res.write(errorMsg); res.end(); }
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
