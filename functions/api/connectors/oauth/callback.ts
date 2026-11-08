// Cloudflare Pages Function: /api/connectors/oauth/callback
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env as any;
  const url = new URL(ctx.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(`Authorization was denied: ${String(error)}`, { status: 400 });
  }

  if (!code || !state) {
    return new Response("Invalid connector callback.", { status: 400 });
  }

  // Look up session in KV
  let session: { provider: string; createdAt: number; redirectUri: string } | null = null;
  if (env.NETO_KV) {
    const raw = await env.NETO_KV.get(`oauth_session:${state}`);
    if (raw) {
      session = JSON.parse(raw);
      await env.NETO_KV.delete(`oauth_session:${state}`);
    }
  }

  if (!session) {
    return new Response("This OAuth request has expired or is invalid.", { status: 400 });
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return new Response("Google OAuth is not configured on this server.", { status: 501 });
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: session.redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    const tokenJson: any = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenJson.access_token) {
      console.error("Google OAuth exchange failed:", tokenJson);
      return new Response("Could not complete the secure Google sign-in.", { status: 502 });
    }

    const tokenRecord = {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiryDate: Date.now() + (Number(tokenJson.expires_in || 3600) * 1000),
      scope: tokenJson.scope,
      tokenType: tokenJson.token_type,
      provider: session.provider,
    };

    // Store token in KV (expires in 1 hour)
    if (env.NETO_KV) {
      await env.NETO_KV.put(
        `oauth:${session.provider}`,
        JSON.stringify(tokenRecord),
        { expirationTtl: Number(tokenJson.expires_in || 3600) }
      );
    }

    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>NETO Connector</title></head><body style="font-family:system-ui, sans-serif; display:grid; place-items:center; min-height:100vh; background:#0f172a; color:white;"> <div style="text-align:center; padding:24px; border-radius:16px; background:rgba(255,255,255,0.04); max-width:420px;"> <h2 style="margin-bottom:12px;">Connected securely</h2><p style="color:#cbd5e1; line-height:1.5; margin:0;">Google access was granted for NETO. You can close this window and continue using the app.</p></div><script>window.close();</script></body></html>`;
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("OAuth callback failed", err);
    return new Response("A secure connector error occurred.", { status: 500 });
  }
};
