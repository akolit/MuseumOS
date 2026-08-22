# Meta OAuth setup (Facebook Pages + Instagram Business)

The marketing module ships with an OAuth flow that lets a curator
connect the museum's Facebook Page and the Instagram Business account
linked to it without copy-pasting tokens by hand. The code lives next
to this README in `meta.service.ts` + `oauth.controller.ts`.

The flow works the moment three env vars are set in the API container.
Until then, the **Connect via Facebook** button throws a clear 400 and
the operator can still use the manual token modal as a fallback.

## What you need from Meta Developers

You're going to spin up a Meta app in https://developers.facebook.com
and bind the museum's Facebook Page to it.

1. **Create the app**
   - Apps → Create app → "Business" → name it e.g. `MuseumOS` (you can
     rename later).
   - Once created, note the **App ID** and **App Secret** (Settings →
     Basic).

2. **Add products**
   - Add "Facebook Login for Business".
   - Add "Instagram" (or "Instagram Graph API" — same product).

3. **Configure Facebook Login**
   - Settings → Valid OAuth Redirect URIs:
     - Dev:   `http://localhost:3000/api/marketing/oauth/meta/callback`
     - Prod:  `https://<your-prod-host>/api/marketing/oauth/meta/callback`
   - Leave the rest at defaults.

4. **Permissions and Features**
   You need these permissions for the museum's use case:
   - `public_profile` (default)
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `pages_read_user_content`
   - `read_insights`
   - `instagram_basic`
   - `instagram_content_publish`
   - `instagram_manage_insights`

   For development you only need to have these listed in the app — they
   work immediately for the app's owner / testers without app review.
   **For production** Meta requires going through App Review for the
   page/instagram permissions. Expect 1–2 weeks of back-and-forth.

5. **Link the museum's Page + Instagram**
   - The Facebook Page is linked to the app under
     **Roles → Page Roles** (during dev) or once approved (in prod).
   - The Instagram Business account must already be linked to the
     Facebook Page (Page Settings → Instagram → "Connect Account").

## Env vars

Add to your `.env` (the one the API container reads):

```
META_APP_ID=1234567890123456
META_APP_SECRET=abc...xyz
META_OAUTH_REDIRECT_URI=http://localhost:3000/api/marketing/oauth/meta/callback
WEB_BASE_URL=http://localhost:5173
```

In production:

```
META_OAUTH_REDIRECT_URI=https://museumos.example.org/api/marketing/oauth/meta/callback
WEB_BASE_URL=https://museumos.example.org
```

The values must EXACTLY match what's registered in the Meta app's
Valid OAuth Redirect URIs (including the protocol, the trailing slash,
and the path).

## What happens at runtime

1. Operator clicks **Connect via Facebook** on the Channels tab.
2. Frontend hits `GET /api/marketing/oauth/meta/start` which mints a
   one-shot CSRF state token (in-memory, 10-minute TTL — swap for
   Redis once we run more than one API instance) and 302s to
   `https://www.facebook.com/v21.0/dialog/oauth?…`.
3. Operator accepts the requested scopes on Facebook.
4. Facebook 302s to `/api/marketing/oauth/meta/callback?code=…&state=…`.
5. The callback:
   - Verifies `state` against the in-memory store, then deletes it.
   - Exchanges `code` for a short-lived user token.
   - Exchanges that for a long-lived (≈60-day) user token.
   - Calls `/me/accounts` to list the user's Pages.
   - For each Page, upserts a row into `social_accounts` keyed by
     `(platform, external_id)` with the Page's **never-expiring**
     access token. Reconnecting refreshes the row in place.
   - If a Page is linked to an Instagram Business account, also
     upserts an Instagram row using the same Page token (IG Graph API
     accepts the linked Page token).
6. Audit log entries are written, then the operator is 302'd back to
   `/marketing?oauth_connected=<n>`.

## Production hardening checklist

Before pointing real users at this:

- [ ] Move `stateStore` from in-memory to Redis (`META_OAUTH_STATE_REDIS_URL`).
- [ ] Encrypt `social_accounts.access_token` at rest (pgcrypto or
      app-level AES-GCM with `MARKETING_TOKEN_KEY` from env).
- [ ] Add background webhook for `accounts/refresh` so the museum is
      notified when a token revokes server-side.
- [ ] Submit the app for Meta App Review with the museum's privacy
      policy + a demo screencast.
