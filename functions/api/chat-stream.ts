// Cloudflare Pages Function: /api/chat-stream
// Handles both normal (Gemini) and pro (OpenAI) chat streaming

const NETO_TOOLS = [
  { name: "open_app", description: "Opens an Android application by name.", parameters: { type: "object", properties: { target: { type: "string", description: "The name of the app to open (e.g., 'Spotify', 'WhatsApp')." } }, required: ["target"] } },
  { name: "open_file", description: "Opens the Android file picker or a specific category like Downloads.", parameters: { type: "object", properties: { target: { type: "string", description: "The category to open (e.g., 'downloads', 'documents', 'files').", enum: ["downloads", "documents", "files"] } } } },
  { name: "open_url", description: "Opens a web URL in the Android browser.", parameters: { type: "object", properties: { url: { type: "string", description: "The full HTTPS URL to open." } }, required: ["url"] } },
  { name: "open_settings", description: "Opens Android system settings, optionally to a specific section.", parameters: { type: "object", properties: { target: { type: "string", description: "The settings section to open.", enum: ["wifi", "bluetooth", "notifications", "accessibility", "display", "sound", "location", "battery", "date", "language"] } } } },
  { name: "make_call", description: "Prepares a phone call to a contact or number. User must confirm in the dialer.", parameters: { type: "object", properties: { target: { type: "string", description: "The contact name or phone number." } }, required: ["target"] } },
  { name: "compose_sms", description: "Prepares an SMS message to a contact or number. User must confirm sending.", parameters: { type: "object", properties: { target: { type: "string", description: "The contact name or phone number." }, text: { type: "string", description: "The message body." } }, required: ["target", "text"] } },
  { name: "read_screen", description: "Reads the visible text on the current Android screen using accessibility services.", parameters: { type: "object", properties: {} } },
  { name: "type_text", description: "Types text into the currently focused input field on Android.", parameters: { type: "object", properties: { text: { type: "string", description: "The text to type." } }, required: ["text"] } },
  { name: "tap", description: "Taps a named element on the Android screen.", parameters: { type: "object", properties: { target: { type: "string", description: "The name or text of the element to tap." } }, required: ["target"] } },
  { name: "scroll", description: "Scrolls the current Android screen in a direction.", parameters: { type: "object", properties: { direction: { type: "string", description: "The direction to scroll.", enum: ["up", "down", "left", "right"] } }, required: ["direction"] } },
  { name: "go_back", description: "Performs the Android global 'Back' action.", parameters: { type: "object", properties: {} } },
  { name: "go_home", description: "Performs the Android global 'Home' action.", parameters: { type: "object", properties: {} } },
  { name: "copy_text", description: "Copies text to the Android clipboard.", parameters: { type: "object", properties: { text: { type: "string", description: "The text to copy." } }, required: ["text"] } },
  { name: "request_capability", description: "Requests an Android permission or capability (e.g., microphone).", parameters: { type: "object", properties: { target: { type: "string", description: "The capability to request.", enum: ["microphone", "camera", "contacts", "notifications", "accessibility"] } }, required: ["target"] } },
  { name: "list_apps", description: "Lists launchable Android applications installed on the user's device.", parameters: { type: "object", properties: {} } },
  { name: "search_contacts", description: "Finds contacts or phone numbers on the user's Android device.", parameters: { type: "object", properties: { query: { type: "string", description: "The contact name or number to search for." } }, required: ["query"] } },
  { name: "long_press", description: "Long-presses a named visible Android screen element.", parameters: { type: "object", properties: { target: { type: "string", description: "Visible text or label of the element." } }, required: ["target"] } },
  { name: "swipe", description: "Swipes the current Android screen in a direction.", parameters: { type: "object", properties: { direction: { type: "string", enum: ["up", "down", "left", "right"] } }, required: ["direction"] } },
  { name: "paste_text", description: "Pastes the Android clipboard into the focused field.", parameters: { type: "object", properties: {} } },
  { name: "open_accessibility_settings", description: "Opens Android Accessibility Settings.", parameters: { type: "object", properties: {} } },
  { name: "open_app_settings", description: "Opens the NETO app's Android settings page.", parameters: { type: "object", properties: {} } },
];

function shouldUseWebSearch(message: string): boolean {
  const lower = message.toLowerCase();
  const triggers = ["latest", "current", "today", "news", "weather", "price", "stock", "trending", "who is", "what is", "when is", "where is", "how much"];
  return triggers.some(t => lower.includes(t));
}

async function fetchWebSearchContext(query: string): Promise<string> {
  try {
    const url = new URL("https://api.duckduckgo.com/");
    url.search = new URLSearchParams({ q: query, format: "json", no_redirect: "1", no_html: "1", skip_disambig: "1" }).toString();
    const response = await fetch(url.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NetoSearch/1.0)", Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return "";
    const payload: any = await response.json();
    const abstract = typeof payload?.AbstractText === "string" ? payload.AbstractText : "";
    if (abstract) return `Web search result: ${abstract}`;
    return "";
  } catch {
    return "";
  }
}

// In-memory rate limiter (per isolate — resets on cold start, good enough for edge)
const rateBuckets = new Map<string, { count: number; startedAt: number }>();
const REQUEST_WINDOW_MS = 10 * 60 * 1000;
const REQUEST_LIMIT = 40;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.startedAt > REQUEST_WINDOW_MS) {
    rateBuckets.set(ip, { count: 1, startedAt: now });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= REQUEST_LIMIT;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env as any;
  const req = ctx.request;

  // Rate limiting
  const forwarded = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown";
  const ip = forwarded.split(",")[0].trim();
  if (!checkRateLimit(ip)) {
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });
  }

  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const { message, history = [], clientContext = {}, attachment = null, toolResults = [], mode = "normal" } = body || {};
  if (typeof message !== "string" || message.length > 12_000) return Response.json({ error: "Message must be text shorter than 12,000 characters." }, { status: 400 });
  if (mode !== "normal" && mode !== "pro") return Response.json({ error: "Unsupported AI mode." }, { status: 400 });

  const safeHistory = (Array.isArray(history) ? history : []).slice(-12).map((item: any) => ({
    role: item?.role === "model" ? "model" : "user",
    parts: [{ text: Array.isArray(item?.parts) ? item.parts.map((p: any) => typeof p?.text === "string" ? p.text : "").join("\n").slice(0, 6_000) : "" }],
  })).filter((item) => item.parts[0].text);

  const safeToolResults = Array.isArray(toolResults) ? toolResults.slice(0, 4).map((item: any) => ({
    name: typeof item?.name === "string" ? item.name.slice(0, 80) : "android_action",
    result: item?.result && typeof item.result === "object" ? item.result : { ok: false, code: "ANDROID_ACTION_FAILED", message: "No Android result was returned." }
  })) : [];
  const isToolResult = safeToolResults.length > 0;
  const toolResultText = isToolResult ? `Android tool result(s), already executed: ${JSON.stringify(safeToolResults)}. Explain the result naturally; do not execute another action unless the user makes a new request.` : "";

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

  let webSearchContext = "";
  if (shouldUseWebSearch(message)) {
    try { webSearchContext = await fetchWebSearchContext(message); } catch {}
  }

  // ── PRO MODE (OpenAI) ────────────────────────────────────────────────────────
  if (mode === "pro") {
    if (!env.OPENAI_API_KEY) return Response.json({ error: "Pro is not configured yet." }, { status: 503 });

    const openAiMessages: any[] = [
      {
        role: "developer",
        content: `You are Neto, the AI assistant inside the Neto app. You are operating as a senior technology professor and mentor with deep practical engineering knowledge. The product identity is Neto and the verified creator is Macdonald Barasa. Do not expose the underlying AI provider unless the user explicitly asks about the technical stack. Be concise by default, direct, natural, and helpful. Prefer practical, phone-first guidance. If the user asks for real-time or current information, treat the web-search context as the current source-of-truth. Client context: ${JSON.stringify(safeClientContext)}`
      },
      ...safeHistory.map((item) => ({ role: item.role === "model" ? "assistant" : "user", content: item.parts[0].text })).filter((item) => item.content),
    ];

    const userText = isToolResult ? toolResultText : message || (safeAttachment?.mimeType.startsWith("image/") ? "Please analyze the attached image." : "Please analyze the attached file.");
    const userContent: any[] = [{ type: "text", text: webSearchContext ? `${userText}\n\nWeb search context:\n${webSearchContext}` : userText }];
    if (safeAttachment?.text) userContent.push({ type: "text", text: `Attached file ${safeAttachment.name} contains:\n${safeAttachment.text}` });

    if (safeAttachment?.url && safeAttachment?.mimeType) {
      const allowedHosts = new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]);
      try {
        const parsedUrl = new URL(safeAttachment.url);
        if (parsedUrl.protocol !== "https:" || !allowedHosts.has(parsedUrl.hostname)) return Response.json({ error: "Attachment URL is not supported." }, { status: 400 });
        if (safeAttachment.size > 10 * 1024 * 1024) return Response.json({ error: "Files must be 10 MB or smaller." }, { status: 413 });
        const fileResponse = await fetch(safeAttachment.url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
        if (!fileResponse.ok) throw new Error("Could not read the uploaded file.");
        const buffer = await fileResponse.arrayBuffer();
        if (buffer.byteLength > 10 * 1024 * 1024) return Response.json({ error: "Uploaded file is too large." }, { status: 413 });
        const mimeType = safeAttachment.mimeType.split(";")[0].toLowerCase();
        if (/^image\/(png|jpeg|jpg|webp|gif)$/.test(mimeType)) {
          const normalized = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
          userContent.push({ type: "image_url", image_url: { url: `data:${normalized};base64,${base64}` } });
        } else if (!safeAttachment.text) {
          userContent.push({ type: "text", text: `The uploaded file ${safeAttachment.name} is stored in the app. Its MIME type is ${mimeType}.` });
        }
      } catch (err: any) {
        if (err.message?.includes("not supported") || err.message?.includes("too large")) throw err;
      }
    }
    openAiMessages.push({ role: "user", content: userContent });

    const openAiTools = NETO_TOOLS.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
    let openAiModel = env.OPENAI_PRO_MODEL || "gpt-4o-mini";

    const makeOpenAiRequest = (model: string) => fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: openAiMessages,
        tools: isToolResult || !safeClientContext.nativeCapabilities ? undefined : openAiTools,
        tool_choice: isToolResult || !safeClientContext.nativeCapabilities ? "none" : "auto",
        stream: true
      })
    });

    let openAiResponse = await makeOpenAiRequest(openAiModel);
    if (!openAiResponse.ok && openAiModel !== "gpt-4o-mini") {
      openAiModel = "gpt-4o-mini";
      openAiResponse = await makeOpenAiRequest(openAiModel);
    }
    if (!openAiResponse.ok) {
      const status = openAiResponse.status === 429 ? 429 : 502;
      return Response.json({ error: status === 429 ? "Pro AI has reached its API usage limit. Please check the Cloudflare OpenAI key's usage, billing, and model access." : "Pro is unavailable right now." }, { status });
    }

    // Stream the response back
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    (async () => {
      try {
        const reader = openAiResponse.body!.getReader();
        let pending = "";
        const toolCalls: any[] = [];

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
              const json = JSON.parse(payload);
              const delta = json?.choices?.[0]?.delta;
              if (delta?.content) await writer.write(encoder.encode(delta.content));
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: tc.id, name: "", arguments: "" };
                  if (tc.function?.name) toolCalls[tc.index].name += tc.function.name;
                  if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments;
                }
              }
            } catch {}
          }
        }

        for (const tc of toolCalls) {
          if (tc?.name) {
            try {
              const args = JSON.parse(tc.arguments || "{}");
              await writer.write(encoder.encode(`__NETO_TOOL_CALL__:${JSON.stringify({ id: tc.id, name: tc.name, arguments: args })}\n`));
            } catch {}
          }
        }
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
    });
  }

  // ── NORMAL MODE (Gemini) ─────────────────────────────────────────────────────
  if (!env.GEMINI_API_KEY) return Response.json({ error: "Normal service is not configured." }, { status: 503 });

  const GEMINI_MODEL = env.GEMINI_MODEL || "gemini-3.8-flash";
  const userText = isToolResult ? toolResultText : message || (safeAttachment?.mimeType?.startsWith("image/") ? "Please analyze the attached image." : "Please analyze the attached file.");
  const userParts: any[] = [{ text: webSearchContext ? `${userText}\n\nWeb search context checked on the live web:\n${webSearchContext}` : userText }];

  if (safeAttachment?.text) userParts.push({ text: `Attached file ${safeAttachment.name} contains:\n${safeAttachment.text}` });

  if (safeAttachment?.url && safeAttachment?.mimeType) {
    const allowedHosts = new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]);
    try {
      const parsedUrl = new URL(safeAttachment.url);
      if (parsedUrl.protocol !== "https:" || !allowedHosts.has(parsedUrl.hostname)) return Response.json({ error: "Attachment URL is not a supported Firebase Storage URL." }, { status: 400 });
      if (safeAttachment.size > 10 * 1024 * 1024) return Response.json({ error: "Files must be 10 MB or smaller." }, { status: 413 });
      const fileResponse = await fetch(safeAttachment.url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
      if (!fileResponse.ok) throw new Error("Could not read the uploaded Firebase file.");
      const buffer = await fileResponse.arrayBuffer();
      if (buffer.byteLength > 10 * 1024 * 1024) return Response.json({ error: "Uploaded file is too large." }, { status: 413 });
      const mimeType = safeAttachment.mimeType.split(";")[0].toLowerCase();
      const supportedInline = /^(image\/(png|jpeg|jpg|webp|gif)|application\/pdf)$/.test(mimeType);
      if (supportedInline) {
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        userParts.push({ inlineData: { mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType, data: base64 } });
      } else if (!safeAttachment.text) {
        userParts.push({ text: `The file ${safeAttachment.name} was uploaded to Firebase Storage. Its MIME type is ${mimeType}.` });
      }
    } catch (err: any) {
      if (err.message?.includes("not supported") || err.message?.includes("too large")) throw err;
    }
  }

  const contents = [...safeHistory, { role: "user", parts: userParts }];
  const geminiTools = isToolResult || !safeClientContext.nativeCapabilities
    ? [{ googleSearch: {} }]
    : [
        { googleSearch: {} },
        {
          functionDeclarations: NETO_TOOLS.map(t => ({
            name: t.name,
            description: t.description,
            parameters: {
              type: t.parameters.type.toUpperCase(),
              properties: Object.fromEntries(
                Object.entries(t.parameters.properties).map(([k, v]: [string, any]) => [k, { type: v.type.toUpperCase(), description: v.description, enum: v.enum }])
              ),
              required: (t.parameters as any).required
            }
          }))
        }
      ];

  const systemInstruction = `You are Neto, the AI assistant inside the Neto app.
Identity rules:
- Your name is Neto.
- The product/company identity is Neto.
- The verified creator is Macdonald Barasa.
- Do not claim you were created by OpenAI. OpenAI is not your creator identity for this app.
- The AI service is an internal implementation detail. Do not expose provider names unless the user explicitly asks about the technical stack.
- If asked who created you or the app, answer: "I was created for Neto by Macdonald Barasa."
- Do not invent biography, location, contact details, social links, achievements, ownership, or company history for Macdonald Barasa.
- Be honest about capabilities. You can analyze text, images, and supported PDF attachments supplied by the app. You also have access to Google Search for finding real-time information.
- Android device actions are available only when client context nativeCapabilities is true.
Conversation rules:
- Answer text messages normally and directly.
- Keep replies concise by default, but give detail when requested.
- In voice mode, avoid markdown; in text mode, normal formatting is allowed.
- When the user asks for live or current information, use the web-search context as the latest available fact source and say you checked the web when relevant.
Installation awareness:
- Neto is a Progressive Web App (PWA).
- If installed is false and the user asks to install, explain that the app's Install button or browser Add to Home Screen/Install option should be used.
Device action policy:
- When nativeCapabilities is true and this is not a tool-result follow-up, use the appropriate tool for a device action.
- For ambiguous requests (e.g., multiple contact matches), use the tool results to ask the user for clarification.
Client context: ${JSON.stringify(safeClientContext)}`;

  const geminiPayload = {
    contents,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    tools: geminiTools,
  };

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "aistudio-build" },
      body: JSON.stringify(geminiPayload),
    }
  );

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text().catch(() => "");
    const isRateLimit = geminiResponse.status === 429;
    return Response.json(
      { 
        error: isRateLimit ? "Normal AI has reached its API usage limit. Please check the Cloudflare Gemini key's usage and billing." : "Sorry, my systems are currently overloaded. Please try again in a moment.",
        details: errorText.slice(0, 500)
      },
      { status: geminiResponse.status }
    );
  }

  // Transform Gemini SSE → plain text stream (matching original behavior)
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  (async () => {
    try {
      const reader = geminiResponse.body!.getReader();
      let pending = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const json = JSON.parse(payload);
            const parts = json?.candidates?.[0]?.content?.parts;
            if (parts) {
              for (const part of parts) {
                if (part?.text) await writer.write(encoder.encode(part.text));
                if (part?.functionCall) {
                  const fc = part.functionCall;
                  await writer.write(encoder.encode(`__NETO_TOOL_CALL__:${JSON.stringify({ name: fc.name, arguments: fc.args })}\n`));
                }
              }
            }
          } catch {}
        }
      }
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
};
