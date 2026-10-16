# OSLO_AUTO_POST

Personal social publishing dashboard built with React/Vite, Express, and Supabase.
It includes email/password sign-in, role-based access, and a single shared workspace.

## Local development

1. Create a Supabase project and run [`supabase/schema.sql`](./supabase/schema.sql) in its SQL Editor.
2. Run [`supabase/migration_20261014_auth_media.sql`](./supabase/migration_20261014_auth_media.sql) after the base schema. Copy `.env.example` to `backend/.env` and set the Supabase project URL, anon key, service-role key, a private `OWNER_SETUP_KEY`, and a new 32-byte `ENCRYPTION_KEY`.
3. Run `npm install`, then `npm run dev`.
4. Open the Vite URL printed in the terminal (normally `http://localhost:5173`).

Generate an encryption key with `openssl rand -hex 32`. A 64-character hexadecimal key is recommended; the backend also accepts a base64-encoded 32-byte key or a passphrase of at least 16 characters and derives a 32-byte key from it. Keep the exact value stable and backed up: changing it makes already stored platform tokens unreadable.
The Supabase service-role key, encryption key, and social-provider client secrets must only exist in the backend environment; never add them to frontend variables or source control. The anon key is used only by the backend authentication client and is not a secret. Set `OWNER_SETUP_KEY` to a random one-time bootstrap secret (for example, `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). The first registration must provide this secret to claim the owner role. Remove it from Render after the owner account is created; later public registrations do not use it and remain pending until approval.

## Accounts and roles

The database migration adds email/password sign-in, secure HTTP-only session cookies, and a single-workspace membership table. The first account registered after the migration with the setup secret becomes the active owner. Every later public registration is pending until an owner or administrator activates it. Roles are owner, admin, editor, and viewer; only the owner can appoint another administrator. Configure Supabase Auth email confirmation and SMTP before inviting staff so users can verify their email addresses. Back up the database before applying the migration.

## Render

Deploy the repository as one Node Web Service using `npm install && npm run build` as the build command and `npm start` as the start command. Set the following variables in Render's Environment page:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | Leave unset; Render supplies this automatically. Use `3001` only for local development. |
| `SUPABASE_URL` | Project URL from Supabase → Project Settings → API, e.g. `https://<project-ref>.supabase.co`. |
| `SUPABASE_ANON_KEY` | Public anon key from Project Settings → API. Used server-side for user sign-in; never use it in place of the service-role key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role/secret key from Project Settings → API. Keep server-side only. |
| `OWNER_SETUP_KEY` | Random one-time secret used only to create the first owner account. Remove it after owner setup. |
| `ENCRYPTION_KEY` | Recommended: a newly generated 32-byte key encoded as 64 hexadecimal characters. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. The backend also accepts base64-encoded 32-byte keys or passphrases of at least 16 characters. Keep the exact value stable and backed up. |
| `SUPABASE_STORAGE_BUCKET` | `post-media` (created by the SQL script). |
| `SCHEDULER_ENABLED` | `true` to enable scheduled publishing. Run only one Render instance with this enabled. |
| `META_GRAPH_API_VERSION` | `v22.0` (change when upgrading to a supported Meta Graph API version). |
| `X_API_BASE_URL` | `https://api.x.com/2` (the standard X API v2 endpoint). |
| `META_APP_ID` / `META_APP_SECRET` | Meta developer app credentials. Optional; enable official Facebook and Instagram OAuth. |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | X OAuth 2.0 confidential web-app credentials with Authorization Code + PKCE enabled. |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | TikTok Login Kit app credentials with the required user-info and video-publishing products/scopes approved. |
| `PUBLIC_BASE_URL` | Optional canonical public server URL. Render's `RENDER_EXTERNAL_URL` is used when this is unset. |
| `FRONTEND_URL` | Optional frontend return URL; defaults to the Render service URL in production and `http://localhost:5173` locally. |

The Express server serves the built Vite app and runs the UTC background scheduler. Use a single service instance: delivery rows are claimed atomically, but deployments or crashes during a remote publish request can still create an uncertain delivery outcome.

### Official account authorization (OAuth)

The Connections page offers both the existing manual token entry and an official provider sign-in option. OAuth never asks for or receives the user's platform password. Set the provider credentials above in Render, then copy the callback URLs shown by `GET /api/oauth/providers` into each developer application's allow-listed redirect/callback URLs:

- Meta (shared by Facebook and Instagram): `https://<your-service>/api/oauth/facebook/callback`
- X: `https://<your-service>/api/oauth/x/callback`
- TikTok: `https://<your-service>/api/oauth/tiktok/callback`

Use the exact HTTPS service URL shown by Render. Meta OAuth presents the pages available to the consenting Facebook user, then lets the workspace owner select a Page and its linked professional Instagram account. X requests `users.read`, `tweet.write`, and `offline.access`; TikTok requests `user.info.basic` and `video.publish`. The provider app must enable these products/scopes and pass any required review. The selected X and TikTok refresh tokens are encrypted, rotated automatically before access-token expiry, and stored server-side. Meta Page tokens are stored encrypted; revoking app access or removing Page permissions requires reconnecting the account. OAuth state/PKCE sessions are short-lived and kept in server memory, so keep one Render instance and complete the authorization without restarting/redeploying the service. OAuth connections are shared by this single workspace, not private per staff member.

The scheduler polls once per minute, so publication is not guaranteed at an exact second. Platform review, scopes, account type, media processing, rate limits, and API availability affect delivery.

## Platform coverage

- Facebook: Page feed, photo, and video posts via the Meta Graph API.
- Instagram: professional-account image and Reel publishing via the Instagram Graph API.
- X: text-only publishing using an OAuth 2.0 user-context access token. Media publishing is intentionally rejected.
- TikTok: video publishing using the Content Posting API and a media URL pulled by TikTok. The scheduler polls TikTok for the final status; review can take hours. App review and creator permissions are required.

Platform API access is not interchangeable with an API key. Configure the required developer application, scopes, Page/professional-account IDs, review approvals, and token lifecycle for each platform. Failed deliveries remain visible in the dashboard; they are not retried automatically to avoid accidentally duplicating a post.

Uploads accept up to 10 images/videos per post, with a 100 MiB per-file and 250 MiB total upload limit, and are stored in a private Supabase Storage bucket. The server converts common image formats to JPEG and supported videos to MP4, creating a platform-specific copy for each destination. Choose a center crop or a blurred background to fit images/videos into platform frames; animated GIF input is reduced to its first frame. Instagram supports carousels of up to 10 items, Facebook supports a single video or an album of up to 10 images, TikTok currently supports one video, and X remains text-only. The server creates one-hour signed URLs only when a delivery is due.

## Security warning

The API requires a verified Supabase session and checks active status and role on every workspace request. Public registrations after the first owner remain pending until approved. Protect the first owner setup key and configure Supabase Auth email confirmation/SMTP. The Supabase tables have RLS enabled and do not grant direct access to anonymous/authenticated clients; the backend uses the service-role key. Consider putting the site behind an access-control proxy such as Cloudflare Access as an additional protection.

## Keep alive

`GET /api/ping` returns `200` JSON and may be called by an external monitoring service. It does not guarantee that a free Render instance will remain continuously awake or that scheduled tasks will run without interruption.
