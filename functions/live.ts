// Cloudflare Pages Function: /live
// Routes WebSocket connections to the NetoLiveSession Durable Object

interface Env {
  NETO_LIVE: DurableObjectNamespace;
  GEMINI_API_KEY: string;
  OPENAI_API_KEY: string;
  GEMINI_LIVE_MODEL: string;
  OPENAI_PRO_REALTIME_MODEL: string;
  OPENAI_PRO_VOICE: string;
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const upgradeHeader = ctx.request.headers.get("Upgrade");
  if (!upgradeHeader || upgradeHeader !== "websocket") {
    return new Response("Expected websocket", { status: 426 });
  }

  const url = new URL(ctx.request.url);
  // Use a fixed DO id so all connections share session management
  // For production, you may want per-user DO IDs
  const id = ctx.env.NETO_LIVE.idFromName("neto-live-session");
  const stub = ctx.env.NETO_LIVE.get(id);

  return stub.fetch(ctx.request);
};
