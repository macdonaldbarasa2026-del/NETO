// Cloudflare Pages Function: /api/connectors/oauth/start
const CONNECTOR_DEFINITIONS = [
  { id: "gmail", name: "Gmail", scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"], privacy: "Reads only the mail you explicitly ask to review." },
  { id: "calendar", name: "Google Calendar", scopes: ["https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"], privacy: "Shows upcoming events and drafts new ones only after you confirm the action." },
  { id: "drive", name: "Google Drive", scopes: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"], privacy: "Accesses only files you explicitly select." },
] as const;

function generateState(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env as any;
  const body = await ctx.request.json() as any;
  const provider = typeof body?.provider === "string" ? body.provider : "";
  const connector = CONNECTOR_DEFINITIONS.find((item) => item.id === provider);

  if (!connector) {
    return Response.json({ error: "Unsupported connector." }, { status: 400 });
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return Response.json({
      provider: connector.id,
      status: "not_configured",
      message: "Secure Google OAuth is not configured on this server yet.",
    }, { status: 501 });
  }

  const state = generateState();
  const appUrl = env.APP_URL || new URL(ctx.request.url).origin;
  const redirectUri = `${appUrl}/api/connectors/oauth/callback`;

  // Store session in KV with 10 min TTL
  if (env.NETO_KV) {
    await env.NETO_KV.put(
      `oauth_session:${state}`,
      JSON.stringify({ provider: connector.id, createdAt: Date.now(), redirectUri }),
      { expirationTtl: 600 }
    );
  }

  const scopeString = connector.scopes.join(" ");
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopeString);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  return Response.json({
    provider: connector.id,
    status: "oauth_ready",
    authUrl: authUrl.toString(),
    message: `Secure OAuth for ${connector.name} is ready. The user must approve the requested scopes before any action is executed.`,
    scopes: connector.scopes,
    privacy: connector.privacy,
  });
};
