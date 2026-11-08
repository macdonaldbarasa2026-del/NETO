// Cloudflare Pages Function: /api/health
export const onRequestGet: PagesFunction = async (ctx) => {
  return Response.json({ status: "ok", timestamp: new Date().toISOString() });
};
