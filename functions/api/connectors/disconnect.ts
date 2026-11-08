// Cloudflare Pages Function: /api/connectors/disconnect
const CONNECTOR_DEFINITIONS = [
  { id: "gmail", name: "Gmail" },
  { id: "calendar", name: "Google Calendar" },
  { id: "drive", name: "Google Drive" },
] as const;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env as any;
  const body = await ctx.request.json() as any;
  const provider = typeof body?.provider === "string" ? body.provider : "";
  const connector = CONNECTOR_DEFINITIONS.find((item) => item.id === provider);

  if (!connector) {
    return Response.json({ error: "Unsupported connector." }, { status: 400 });
  }

  if (env.NETO_KV) {
    await env.NETO_KV.delete(`oauth:${connector.id}`);
  }

  return Response.json({
    provider: connector.id,
    status: "disconnected",
    message: `${connector.name} was disconnected. No credentials are stored in the browser.`,
  });
};
