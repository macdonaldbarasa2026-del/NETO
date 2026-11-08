// Cloudflare Pages Function: /api/connectors/status
// Note: In a stateless Worker, oauthTokens live per-request. For persistent
// OAuth tokens across requests, use Cloudflare KV (NETO_KV binding).

const CONNECTOR_DEFINITIONS = [
  {
    id: "gmail",
    name: "Gmail",
    scopes: ["readonly:inbox", "drafts:write"],
    privacy: "Reads only the mail you explicitly ask to review. Drafts stay in your account until you approve sending.",
  },
  {
    id: "calendar",
    name: "Google Calendar",
    scopes: ["readonly:events", "events:write"],
    privacy: "Shows upcoming events and drafts new ones only after you confirm the action.",
  },
  {
    id: "drive",
    name: "Google Drive",
    scopes: ["readonly:files", "files:write"],
    privacy: "Accesses only files you explicitly select. No background sync is performed.",
  },
] as const;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env as any;
  // Check KV for connected tokens
  const connectors = await Promise.all(
    CONNECTOR_DEFINITIONS.map(async (connector) => {
      let connected = false;
      if (env.NETO_KV) {
        const token = await env.NETO_KV.get(`oauth:${connector.id}`);
        connected = !!token;
      }
      return {
        ...connector,
        connected,
        requiresConsent: true,
        status: env.GOOGLE_CLIENT_ID
          ? connected ? "Connected securely" : "Secure OAuth ready"
          : "Server configuration required",
      };
    })
  );

  return Response.json({
    connectors,
    note: "Connector access is consent-first and server-side only. Tokens are never stored in the browser.",
    supports: ["gmail", "calendar", "drive"],
    security: env.APP_ENCRYPTION_KEY
      ? "AES-256-GCM encryption enabled on server-side connector data"
      : "Server encryption key is not configured; connector data remains in-process only",
  });
};
