// Cloudflare Pages Function: /api/connectors/health
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env as any;
  const hasEncKey = !!env.APP_ENCRYPTION_KEY;
  return Response.json({
    status: hasEncKey ? "secure" : "pending_config",
    encryption: hasEncKey ? "enabled" : "disabled",
    note: "Sensitive connector data is encrypted before storage when APP_ENCRYPTION_KEY is configured.",
  });
};
