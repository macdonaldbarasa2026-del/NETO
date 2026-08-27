# Neto PWA

## AI modes

Neto has two user-facing AI modes:

- Normal: Gemini handles text, images/files, and live voice.
- Pro: OpenAI handles text, images/files, and live voice when `OPENAI_API_KEY` is configured on Render.

The provider names are intentionally hidden from the Neto UI. Users only see Normal and Pro.

## Render environment variables

Set these in Render:

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_KEY`

Optional defaults already declared in `render.yaml`:

- `OPENAI_PRO_MODEL=gpt-5.6`
- `OPENAI_PRO_REALTIME_MODEL=gpt-realtime-2.1`
- `OPENAI_PRO_VOICE=marin`

Never put a real API key in the frontend, ZIP, or Git repository.

## Voice

Normal voice uses the Gemini Live API.
Pro voice uses the OpenAI Realtime API through the server websocket proxy. The browser sends microphone PCM to `/live?mode=pro`; the server resamples 16 kHz browser audio to the 24 kHz format required by the OpenAI realtime session and forwards returned audio to the browser.

## Navigation

Settings, History, About, and Install panels include Back navigation and browser back handling.
