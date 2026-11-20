# PlanBreeze

Plan together. Keep the rest on your radar.

A shared planner for family and friends. Committed plans go to Google Calendar; radar plans stay in PlanBreeze until someone commits them.

**Stack:** Nuxt 4 + Nuxt UI, TypeScript, NestJS REST API, MongoDB/Mongoose, Passport Google/Apple OAuth, MongoDB cookie sessions, and OpenAI Responses API with web search. Mailgun sends opt-in notification emails.

## Development

Use Node 24 LTS, npm, and Docker (or an existing standalone MongoDB instance).

```bash
npm ci
cp .env.example .env
# Set SESSION_SECRET (at least 32 characters) and TOKEN_ENCRYPTION_KEY (base64 32 bytes).
docker compose up -d --wait
npm run dev:api
```

In another terminal, run `npm run dev`. The frontend runs on port 3000 (explicitly set by the dev script) and the API on 3001. Local requests to `127.0.0.1` redirect to `localhost` so OAuth, cookies, and CORS use a consistent hostname. The shared `.env` contains `PORT=3001` for the API; the frontend must override that value. `dev:api` builds first and watches compiled JavaScript; rerun `npm run build:api` after editing TypeScript, or run `npx tsc -p server --watch` in another terminal.

MongoDB runs in Docker locally and on the droplet’s existing MongoDB instance in production. Both run in standalone mode; the API does not use transactions. The local Compose service is bound to localhost without authentication. In production, keep MongoDB bound to loopback, enable authentication, use an app-specific database user, and maintain off-droplet backups. See the deployment guide for the production connection string.

## Configuration

All settings are in [.env.example](.env.example). Only `NUXT_PUBLIC_API_URL` is exposed to browsers. Keep credentials, private keys, session secrets, and token encryption keys server-side. Use the existing `TOKEN_ENCRYPTION_KEY` when importing encrypted Google Calendar tokens.

Google sign-in requires `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. Register these redirect URLs:

- Local sign-in: `http://localhost:3001/api/auth/google/callback`
- Local Calendar consent: `http://localhost:3001/api/calendar/callback`
- Production sign-in: `https://planbreeze.com/api/auth/google/callback`
- Production Calendar consent: `https://planbreeze.com/api/calendar/callback`

Calendar consent is separate from login. The calendar client defaults to the sign-in client. Enable Google Calendar API and configure OAuth test users or publish the consent screen as appropriate.

Apple requires `AUTH_APPLE_ID` (Services ID), `AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`, and `AUTH_APPLE_PRIVATE_KEY` (PEM). Register the production domain and `https://planbreeze.com/api/auth/apple/callback` with Apple. Apple uses a cross-site form POST; production uses secure cookies with SameSite=None and requires HTTPS. Use an HTTPS development domain for Apple testing. Google works over local HTTP.

Breeze uses `OPENAI_API_KEY` and `OPENAI_MODEL` (default `gpt-4.1-mini`). The key needs access to Responses and web search. Search results ground event cards; raw source content cannot authorize application actions. AI calls never receive calendar refresh tokens. Live API usage incurs provider charges.

Email remains disabled unless `EMAIL_ENABLED=true`; then configure the Mailgun variables. Inbound Postmark-compatible JSON goes to `POST /api/capture/inbound-email?secret=<INBOUND_EMAIL_SECRET>`. Only the user's own email may forward to their assigned address on `INBOUND_EMAIL_DOMAIN`.

## Structure

```text
app/                 Nuxt pages and components
  composables/api.ts Cookie auth, polling, refresh after writes, error toasts
  utils/api.ts       Typed REST calls
shared/types.ts      HTTP response and stored-record types
server/src/
  auth/              Passport OAuth and session guard
  users/ circles/ plans/ calendar/ breeze/ capture/ email/
  jobs/              Durable MongoDB jobs, retries, leases, schedule deduplication
  common/            Schemas, permissions, date validation, token encryption
server/test/         API integration tests using temporary MongoDB
server/scripts/      Convex snapshot importer
```

Controllers validate requests, services enforce permissions and use Mongoose models directly. There is no repository layer. The API runs as one process with its worker and scheduled tasks. The browser refreshes after writes and polls every five seconds while visible; updates from other users can take up to five seconds.

Discovery runs daily at 13:05 UTC. Calendar synchronization runs every 30 minutes. Jobs survive restarts, renew leases, retry up to five attempts, and retain failed status for inspection in MongoDB's `jobs` collection. Calendar writes use deterministic Google event IDs to make retries repeatable. Mailgun does not provide an exactly-once guarantee: a crash after delivery but before recording success can duplicate an email. Do not scale the API into multiple processes without adding per-plan serialization for concurrent calendar writes.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

Tests start a disposable standalone MongoDB 8 instance (first run downloads the binary). Google, Apple, OpenAI, and Mailgun live flows require configured credentials; provider calls in automated integration tests are mocked. No real emails or paid AI calls run in the test suite.

See [migration and deployment](docs/10-migration-and-deployment.md) for importing existing data and deploying the API. The Chrome extension still opens `/capture?url=...` and needs no protocol change.

Standalone MongoDB uses atomic single-document updates. Multi-document operations and job enqueueing are sequential: a database failure or process crash can leave partial work. Request validation runs before writes where practical, but there is no cross-document rollback. A failed snapshot import must be retried into a fresh database.

For the HTTPS development server at `dev.planbreeze.com` (PM2 + Caddy), see [Ubuntu development deployment](docs/11-ubuntu-lan-deployment.md). It includes first-time setup and `./scripts/deploy-ubuntu.sh` for deploying both web and API.
