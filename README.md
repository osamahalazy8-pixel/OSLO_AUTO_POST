# OSLO_AUTO_POST

Personal social publishing dashboard built with React/Vite, Express, and Supabase.
It includes email/password sign-in, role-based access, and a single shared workspace.

## Local development

1. Create a Supabase project and run [`supabase/schema.sql`](./supabase/schema.sql) in its SQL Editor.
2. Run [`supabase/migration_20261014_auth_media.sql`](./supabase/migration_20261014_auth_media.sql) after the base schema. Copy `.env.example` to `backend/.env` and set the Supabase project URL, anon key, service-role key, a private `OWNER_SETUP_KEY`, and a new 32-byte `ENCRYPTION_KEY`.
3. Run `npm install`, then `npm run dev`.
4. Open the Vite URL printed in the terminal (normally `http://localhost:5173`).

Generate an encryption key with `openssl rand -hex 32`. A 64-character hexadecimal key is recommended; the backend also accepts a base64-encoded 32-byte key or a passphrase of at least 16 characters and derives a 32-byte key from it. Keep the exact value stable and backed up: changing it makes already stored platform tokens unreadable.
The Supabase service-role key and encryption key must only exist in the backend environment; never add them to frontend variables or source control. The anon key is used only by the backend authentication client and is not a secret. Set `OWNER_SETUP_KEY` to a random one-time bootstrap secret (for example, `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). The first registration must provide this secret to claim the owner role. Remove it from Render after the owner account is created; later public registrations do not use it and remain pending until approval.

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

The Express server serves the built Vite app and runs the UTC background scheduler. Use a single service instance: delivery rows are claimed atomically, but deployments or crashes during a remote publish request can still create an uncertain delivery outcome.

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
