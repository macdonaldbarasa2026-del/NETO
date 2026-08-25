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

## Firebase + Render setup

Neto now uses Firebase Storage for user attachments and Firebase Authentication with anonymous sign-in for upload ownership. The browser uploads files directly to Firebase, which keeps large files away from the Render request path.

### Firebase Console

1. Open the Firebase project `project-bcceb490-51e7-4695-b98`.
2. Enable Authentication > Sign-in method > Anonymous.
3. Create or enable Storage.
4. Deploy the included `storage.rules`.
5. Enable Firestore if you want conversation history saved by the Render backend.

### Render

Set these environment variables in the Render service:

- `GEMINI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_KEY`, as a JSON service-account string if Firestore persistence is required.

The Firebase web configuration is safe to ship in the frontend. Security comes from Firebase Authentication and Storage Rules. Never put a Firebase Admin service-account private key in frontend code or Git.

### Upload limits

- Maximum file size: 10 MB.
- Images, PDF, text, JSON, CSV, XML, and HTML are accepted.
- Files upload directly to Firebase Storage.
- Supported images and PDFs are fetched by the Render backend only when the user asks Neto to analyze them.
- Chat history sent to the AI is capped to the latest 20 messages.
