# PlanBreeze

> Plan together. Keep the rest on your radar.

PlanBreeze is a web app for planning events with close family and friends. It keeps two kinds of plans side by side:

- **Committed:** things you are doing. They are written to your real calendar.
- **On the radar:** things you might do. They stay in PlanBreeze and add nothing to your calendar until you commit.

A timeline zooms from a single month out to more than a year. You can plan just for yourself or with **circles** (Family, Weekend crew, Wine club…), and each circle can link to its own calendar. You can add events from any web page, pasted text or forwarded email. **Breeze**, the built-in AI assistant, answers questions like "find a wine tasting event in October" and runs standing searches in the background.

**Stack:** TypeScript · [Nuxt 4](https://nuxt.com) + [Nuxt UI 4](https://ui.nuxt.com) (client-rendered) · [Convex](https://convex.dev) (database, functions, auth, crons) · Convex Auth with Google and Apple · Google Calendar API · Anthropic Claude API for Breeze.

Personal project by Mark · [planbreeze.com](https://planbreeze.com)

---

## What's in the repo

```
app/                 Nuxt front end
  pages/             index (Planner), ask, discover, capture, settings, login
  components/        PlanTimeline, PlanDetail, PlanFields, PlanFormModal, CircleCard, …
  composables/       convex.ts: Convex client, auth and useQuery (the only data layer)
  utils/             dates, timeline layout, draft helpers
convex/              Convex backend
  schema.ts          all tables
  auth.ts            Convex Auth (Google, Apple)
  circles.ts         circles and members (email + label + access)
  plans.ts           plans: list, create, edit, commit / uncommit
  google.ts          Google Calendar connect, event writes, sync cron
  breeze.ts          chat, standing searches, Discover suggestions
  capture.ts         paste-a-link extraction, email forwarding inbox
  claude.ts          Anthropic API client
  crons.ts           daily discovery, 30-minute calendar sync
  app.test.ts        backend tests (convex-test)
extension/           tiny Chrome extension: "open this page in PlanBreeze"
design/              clickable design mockups (open design/index.html)
docs/                product brief, feature spec, design system, architecture, plan
```

## Run it locally

Prerequisites: Node 22+, a free [Convex](https://convex.dev) account.

```bash
npm install
npx convex dev            # first run: log in, create the project; keeps running and pushes functions
npx @convex-dev/auth      # one time: sets JWT_PRIVATE_KEY, JWKS and SITE_URL on the dev deployment
cp .env.example .env      # then set NUXT_PUBLIC_CONVEX_URL to the URL `convex dev` printed
npm run dev               # http://localhost:3000
```

`npx convex dev` also regenerates `convex/_generated/`. The checked-in copy was written by hand before the first deployment, so let Convex overwrite it.

### Environment variables (set on the Convex deployment)

```bash
npx convex env set SITE_URL http://localhost:3000
npx convex env set TOKEN_ENCRYPTION_KEY "$(openssl rand -base64 32)"
npx convex env set AUTH_GOOGLE_ID ...        # Google OAuth client (web)
npx convex env set AUTH_GOOGLE_SECRET ...
npx convex env set AUTH_APPLE_ID ...         # Apple Services ID
npx convex env set AUTH_APPLE_SECRET ...     # Apple client-secret JWT (expires, regenerate every ≤6 months)
npx convex env set ANTHROPIC_API_KEY ...     # Breeze (chat, discovery, text extraction)
npx convex env set ANTHROPIC_MODEL claude-opus-5-5   # optional; any current Claude model with web search
# optional
npx convex env set GOOGLE_CALENDAR_CLIENT_ID ...     # defaults to AUTH_GOOGLE_*
npx convex env set GOOGLE_CALENDAR_CLIENT_SECRET ...
npx convex env set RESEND_API_KEY ...        # invite emails; without it they're only logged
npx convex env set EMAIL_FROM "PlanBreeze <hello@planbreeze.com>"
npx convex env set INBOUND_EMAIL_SECRET ...  # email forwarding webhook
npx convex env set INBOUND_EMAIL_DOMAIN in.planbreeze.com
```

### Google Cloud setup

One OAuth client (type **Web application**) can handle both sign-in and calendar access:

- **Authorized redirect URIs:**
  - `https://<deployment>.convex.site/api/auth/callback/google` (sign-in)
  - `https://<deployment>.convex.site/google/callback` (calendar connection)
- **Enable the Google Calendar API.**
- **Consent-screen scopes:** `openid`, `email`, `profile`, `calendar.calendarlist.readonly`, `calendar.events`, `calendar.freebusy`. The calendar scopes are "sensitive", so a public launch needs Google's app verification. Until then, add testers under *Test users*.

### Apple setup

This needs an Apple Developer Program membership:

- **Identifiers:** create an App ID with Sign in with Apple enabled, then a **Services ID**. The Services ID is `AUTH_APPLE_ID`.
- **Services ID configuration:** add the domain `<deployment>.convex.site` and the return URL `https://<deployment>.convex.site/api/auth/callback/apple`.
- **Client secret:** create a key for Sign in with Apple and generate the client-secret JWT from it. That JWT is `AUTH_APPLE_SECRET`.

### Email forwarding (optional)

Point an MX record for `in.planbreeze.com` at an inbound email provider (e.g. Postmark Inbound). Post the JSON webhook to `https://<deployment>.convex.site/inbound-email?secret=<INBOUND_EMAIL_SECRET>`.

Each user's forwarding address is shown on the *Add from anywhere* page. Only mail sent from the user's own sign-in address is accepted.

## Checks

```bash
npm run typecheck   # Nuxt + Convex
npm test            # vitest: backend (convex-test) + timeline layout
npm run build       # static build in .output/public
```

GitHub Actions runs all three on every push and PR (`.github/workflows/ci.yml`).

## Deploy

**Backend:**

```bash
npx convex deploy
```

Then set the production env vars with `npx convex env set --prod …`, including `SITE_URL=https://planbreeze.com`.

**Front end:** GitHub Actions builds the static Nuxt site against
`https://basic-peacock-14.convex.cloud`. Every push to `main`, including a merged
pull request, deploys after typecheck, tests, and build pass. Pull requests run
checks only. Deployment runs are serialized and do not cancel an active release.

The workflow uploads only `.output/public` to the existing droplet at
`147.182.196.221`. Each deployment creates
`/var/www/planbreeze/releases/<commit>-<run>-<attempt>` and atomically switches
`/var/www/planbreeze/current`. HTTPS checks verify both the exact deployed HTML
and SPA route fallback; a failed check restores the previous release. Earlier
releases remain available for manual rollback. No nginx restart is needed.

One-time GitHub Actions configuration (repository Settings → Secrets and
variables → Actions):

| Type | Name | Value |
| --- | --- | --- |
| Secret | `DEPLOY_SSH_KEY` | Private SSH key authorized for the deployment user on the droplet |
| Secret | `DEPLOY_KNOWN_HOSTS` | Verified SSH host-key entry for `147.182.196.221` |
| Variable | `DEPLOY_USER` | SSH username with write access to `/var/www/planbreeze` |

Use a dedicated deployment account/key with access to this site's directory.
The droplet needs `bash`, `rsync`, `curl`, and `cmp`, with nginx and the existing
HTTPS certificate configured for `planbreeze.com`. The `current` symlink must
already exist (the initial deployment created it). Verify the host key through
your trusted SSH connection before storing it; the workflow rejects unknown or
changed host keys. Do not upload application secrets or `.env` files as static
assets.

This workflow deploys the frontend only. Convex backend deployment and its
production environment variables remain managed separately as described above.

## Browser extension

Open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick the `extension/` folder. Clicking the toolbar button opens the current page on PlanBreeze's capture screen.

To use it with local development, change `APP_URL` in `extension/background.js` to `http://localhost:3000`.

## Docs

Start with `docs/01-product-brief.md` and `docs/02-feature-spec.md`. `docs/08-project-plan.md` shows what's built and what's next. `CLAUDE.md` has the rules for working on the code.
