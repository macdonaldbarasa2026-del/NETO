// Cloudflare Pages Functions global middleware: adds security headers
export const onRequest: PagesFunction = async (ctx) => {
  const response = await ctx.next();
  const newResponse = new Response(response.body, response);
  newResponse.headers.set("X-Content-Type-Options", "nosniff");
  newResponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  newResponse.headers.set("X-Frame-Options", "SAMEORIGIN");
  newResponse.headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
  return newResponse;
};
