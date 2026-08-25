<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/bfd77777-aadb-4e1a-bbe0-6133213c747a

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## PWA / standalone behavior

Neto is configured as an installable standalone PWA for PWABuilder-style packaging. The service worker precaches the Vite production app shell and static assets, then serves the cached shell immediately on navigation. This prevents a sleeping Render instance from blocking the installed app's startup UI.

The app also performs a silent `/api/health` warm-up shortly after launch when an internet connection is available. This can wake a sleeping Render backend without exposing a Render loading/wake page to the user. AI/API operations still require connectivity and the backend; the user-facing app shell remains available offline.
