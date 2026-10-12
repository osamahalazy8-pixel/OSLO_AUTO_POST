# OSLO_AUTO_POST

Personal social publishing dashboard built with React/Vite, Express, and Supabase.
It intentionally has no login or signup UI.

## Local development

1. Create a Supabase project and run [`supabase/schema.sql`](./supabase/schema.sql) in its SQL Editor.
2. Copy `.env.example` to `backend/.env` and set the Supabase project URL, service-role key, and a new 32-byte `ENCRYPTION_KEY`.
3. Run `npm install`, then `npm run dev`.
4. Open the Vite URL printed in the terminal (normally `http://localhost:5173`).

Generate an encryption key with `openssl rand -hex 32`. Keep it stable and backed up: changing it makes already stored platform tokens unreadable.
The Supabase service-role key and encryption key must only exist in the backend environment; never add them to frontend variables or source control.

## Render

Deploy the repository as one Node Web Service using `npm install && npm run build` as the build command and `npm start` as the start command. Set the following variables in Render's Environment page:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | Leave unset; Render supplies this automatically. Use `3001` only for local development. |
| `SUPABASE_URL` | Project URL from Supabase → Project Settings → API, e.g. `https://<project-ref>.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role/secret key from Project Settings → API. Keep server-side only. |
| `ENCRYPTION_KEY` | A newly generated 32-byte key encoded as 64 hexadecimal characters. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and keep a secure backup. |
| `SUPABASE_STORAGE_BUCKET` | `post-media` (created by the SQL script). |
| `SCHEDULER_ENABLED` | `true` to enable scheduled publishing. Run only one Render instance with this enabled. |
| `META_GRAPH_API_VERSION` | `v22.0` (change when upgrading to a supported Meta Graph API version). |
| `X_API_BASE_URL` | `https://api.x.com/2` (the standard X API v2 endpoint). |

The Express server serves the built Vite app and runs the UTC background scheduler. Use a single service instance: delivery rows are claimed atomically, but deployments or crashes during a remote publish request can still create an uncertain delivery outcome.

The scheduler polls once per minute, so publication is not guaranteed at an exact second. Platform review, scopes, account type, media processing, rate limits, and API availability affect delivery.

## Platform coverage

- Facebook: Page feed, photo, and video posts via the Meta Graph API.
- Instagram: professional-account image and Reel publishing via the Instagram Graph API.
- X: text-only publishing using an OAuth 2.0 user-context access token. Media publishing is intentionally rejected.
- TikTok: video publishing using the Content Posting API and a media URL pulled by TikTok. The scheduler polls TikTok for the final status; review can take hours. App review and creator permissions are required.

Platform API access is not interchangeable with an API key. Configure the required developer application, scopes, Page/professional-account IDs, review approvals, and token lifecycle for each platform. Failed deliveries remain visible in the dashboard; they are not retried automatically to avoid accidentally duplicating a post.

Uploads are limited to 100 MiB by the app and stored in a private Supabase Storage bucket. The server creates a one-hour signed URL only when a delivery is due.

## Security warning

There are no application login pages or API authentication routes by design. Anyone who can reach the deployed site can manage its connections, content, and schedule. Do not deploy it to an unrestricted public URL. Put the service behind an access-control proxy such as Cloudflare Access or another trusted private access layer. The Supabase tables have RLS enabled and do not grant direct access to anonymous/authenticated clients; the backend uses the service-role key.

## Keep alive

`GET /api/ping` returns `200` JSON and may be called by an external monitoring service. It does not guarantee that a free Render instance will remain continuously awake or that scheduled tasks will run without interruption.
