// Cloudflare Pages Functions Environment bindings type
interface Env {
  // Secrets (set via dashboard or wrangler secret put)
  GEMINI_API_KEY: string;
  OPENAI_API_KEY: string;
  FIREBASE_SERVICE_ACCOUNT_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APP_ENCRYPTION_KEY: string;
  APP_URL: string;

  // Vars (set in wrangler.toml)
  NODE_ENV: string;
  GEMINI_MODEL: string;
  GEMINI_LIVE_MODEL: string;
  OPENAI_PRO_MODEL: string;
  OPENAI_PRO_REALTIME_MODEL: string;
  OPENAI_PRO_VOICE: string;

  // KV namespace
  NETO_KV: KVNamespace;

  // Durable Objects
  NETO_LIVE: DurableObjectNamespace;
}
