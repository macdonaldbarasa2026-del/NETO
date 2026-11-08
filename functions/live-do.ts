// Cloudflare Durable Object: NetoLiveSession
// Handles WebSocket connections for the /live endpoint
// Proxies between client and Gemini Live API (normal mode)
// or OpenAI Realtime API (pro mode)

function resamplePcm16Base64(base64: string, fromRate: number, toRate: number): string {
  if (fromRate === toRate) return base64;
  // Decode base64 to ArrayBuffer
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const samples = new Int16Array(bytes.buffer);
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
  const outBytes = new Uint8Array(out.buffer);
  let binary = "";
  for (let i = 0; i < outBytes.length; i++) binary += String.fromCharCode(outBytes[i]);
  return btoa(binary);
}

const NETO_VOICE_INSTRUCTIONS = `You are Neto, a senior technology professor and product mentor inside the Neto app. You were created for Neto by Macdonald Barasa. Your product/company identity is Neto. Think like a highly experienced engineering professor: precise, clear, structured, and deeply practical. Explain technical ideas with confidence, stay mobile-first, favour direct device actions when the user is on a phone, and never expose the underlying AI provider unless the user explicitly asks about the technical stack. Give brief, immediate conversational replies, normally 1-2 short sentences unless the user asks for detail. Never use markdown in voice replies. Be natural, clear, friendly, and fast.`;

export class NetoLiveSession {
  state: DurableObjectState;
  env: any;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") === "pro" ? "pro" : "normal";

    const { 0: clientWs, 1: serverWs } = new WebSocketPair();
    serverWs.accept();

    if (mode === "pro") {
      await this.handleProMode(serverWs);
    } else {
      await this.handleNormalMode(serverWs);
    }

    return new Response(null, { status: 101, webSocket: clientWs });
  }

  async handleProMode(clientWs: WebSocket) {
    const env = this.env;
    if (!env.OPENAI_API_KEY) {
      clientWs.send(JSON.stringify({ error: "Pro voice is not configured yet." }));
      clientWs.close();
      return;
    }

    const model = env.OPENAI_PRO_REALTIME_MODEL || "gpt-4o-mini-realtime-preview";
    const upstream = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`);

    // We can't set custom headers with the native WebSocket API in Workers.
    // OpenAI Realtime requires auth headers — use a workaround via the Sec-WebSocket-Protocol header trick.
    // For now, proxy via fetch with Upgrade header:
    // Note: Cloudflare Workers support WebSocket client via fetch()
    const upstreamResponse = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
        Upgrade: "websocket",
        Connection: "Upgrade",
      },
    });

    if (upstreamResponse.status !== 101) {
      clientWs.send(JSON.stringify({ error: "Pro voice connection failed." }));
      clientWs.close();
      return;
    }

    const upstreamWs = (upstreamResponse as any).webSocket as WebSocket;
    upstreamWs.accept();

    // Session init
    upstreamWs.addEventListener("open", () => {
      upstreamWs.send(JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio"],
          instructions: NETO_VOICE_INSTRUCTIONS,
          voice: env.OPENAI_PRO_VOICE || "alloy",
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: { model: "whisper-1" },
          turn_detection: { type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500, create_response: true },
        },
      }));
      clientWs.send(JSON.stringify({ ready: true }));
    });

    upstreamWs.addEventListener("message", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);
        switch (data.type) {
          case "response.audio.delta":
          case "response.output_audio.delta":
            if (data.delta) clientWs.send(JSON.stringify({ audio: data.delta }));
            break;
          case "conversation.item.input_audio_transcription.delta":
            if (data.delta) clientWs.send(JSON.stringify({ inputTranscription: data.delta, inputTranscriptionDelta: true }));
            break;
          case "conversation.item.input_audio_transcription.completed":
            if (data.transcript) clientWs.send(JSON.stringify({ inputTranscription: data.transcript, inputTranscriptionFinal: true, inputTranscriptionDelta: false }));
            break;
          case "response.audio_transcript.delta":
          case "response.output_audio_transcript.delta":
            if (data.delta) clientWs.send(JSON.stringify({ outputTranscription: data.delta, outputTranscriptionDelta: true }));
            break;
          case "response.audio_transcript.done":
          case "response.output_audio_transcript.done":
            if (data.transcript) clientWs.send(JSON.stringify({ outputTranscription: data.transcript, outputTranscriptionFinal: true, outputTranscriptionDelta: false }));
            break;
          case "input_audio_buffer.speech_started":
            clientWs.send(JSON.stringify({ listening: true, interrupted: true }));
            break;
          case "input_audio_buffer.speech_stopped":
            clientWs.send(JSON.stringify({ thinking: true }));
            break;
          case "response.created":
            clientWs.send(JSON.stringify({ thinking: true }));
            break;
          case "response.done":
            clientWs.send(JSON.stringify({ turnComplete: true }));
            break;
          case "conversation.item.truncated":
            clientWs.send(JSON.stringify({ interrupted: true }));
            break;
          case "error":
            clientWs.send(JSON.stringify({ error: data.error?.message || "Pro voice is temporarily unavailable." }));
            break;
        }
      } catch {}
    });

    upstreamWs.addEventListener("close", () => {
      try { clientWs.close(); } catch {}
    });

    clientWs.addEventListener("message", (event: MessageEvent) => {
      try {
        const { audio, cancel, text } = JSON.parse(event.data as string);
        if (cancel) {
          upstreamWs.send(JSON.stringify({ type: "response.cancel" }));
          upstreamWs.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
          return;
        }
        if (audio) {
          const pcm24 = resamplePcm16Base64(audio, 16000, 24000);
          upstreamWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: pcm24 }));
        }
        if (text) {
          upstreamWs.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } }));
          upstreamWs.send(JSON.stringify({ type: "response.create" }));
        }
      } catch {}
    });

    clientWs.addEventListener("close", () => {
      try { upstreamWs.close(); } catch {}
    });
  }

  async handleNormalMode(clientWs: WebSocket) {
    const env = this.env;
    if (!env.GEMINI_API_KEY) {
      clientWs.send(JSON.stringify({ error: "Normal voice is not configured." }));
      clientWs.close();
      return;
    }

    // Connect to Gemini Live API via WebSocket
    const liveModel = env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
    const geminiWsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${env.GEMINI_API_KEY}`;
    
    const geminiResponse = await fetch(geminiWsUrl, {
      headers: { Upgrade: "websocket", Connection: "Upgrade" },
    });

    if (geminiResponse.status !== 101) {
      clientWs.send(JSON.stringify({ error: "Normal voice is unavailable right now." }));
      setTimeout(() => { try { clientWs.close(); } catch {} }, 500);
      return;
    }

    const geminiWs = (geminiResponse as any).webSocket as WebSocket;
    geminiWs.accept();

    // Send setup message
    geminiWs.addEventListener("open", () => {
      geminiWs.send(JSON.stringify({
        setup: {
          model: `models/${liveModel}`,
          generation_config: {
            response_modalities: ["AUDIO"],
            system_instruction: { parts: [{ text: NETO_VOICE_INSTRUCTIONS }] },
            input_audio_transcription: {},
            output_audio_transcription: {},
            thinking_config: { thinking_level: "minimal" },
          },
        }
      }));
    });

    geminiWs.addEventListener("message", (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data as string);
        const content = message.serverContent;
        if (!content) {
          if (message.setupComplete) clientWs.send(JSON.stringify({ ready: true }));
          return;
        }
        const audio = content?.modelTurn?.parts?.find((part: any) => part?.inlineData?.data)?.inlineData?.data;
        if (audio) clientWs.send(JSON.stringify({ audio }));
        if (content?.interrupted) clientWs.send(JSON.stringify({ interrupted: true }));
        if (content?.inputTranscription?.text) clientWs.send(JSON.stringify({ inputTranscription: content.inputTranscription.text, inputTranscriptionDelta: false }));
        if (content?.outputTranscription?.text) clientWs.send(JSON.stringify({ outputTranscription: content.outputTranscription.text, outputTranscriptionDelta: false }));
        if (content?.turnComplete) clientWs.send(JSON.stringify({ turnComplete: true }));
      } catch {}
    });

    geminiWs.addEventListener("close", () => {
      try { clientWs.close(); } catch {}
    });

    clientWs.addEventListener("message", (event: MessageEvent) => {
      try {
        const { audio, video, text } = JSON.parse(event.data as string);
        if (audio) geminiWs.send(JSON.stringify({ realtimeInput: { audio: { data: audio, mimeType: "audio/pcm;rate=16000" } } }));
        if (video) geminiWs.send(JSON.stringify({ realtimeInput: { video: { data: video, mimeType: "image/jpeg" } } }));
        if (text) geminiWs.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } }));
      } catch {}
    });

    clientWs.addEventListener("close", () => {
      try { geminiWs.close(); } catch {}
    });
  }
}
