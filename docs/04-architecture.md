# 04 — Architecture

> **Decided (2026-09-25):** Nuxt 4 + Nuxt UI 4 front end, Convex backend, GitHub repo. This replaces the earlier Vue-SPA / Fastify / MongoDB / Droplet / PM2 design. The guiding rule is to keep it simple, with few layers.

## Shape

```
 Browser (Nuxt 4 SPA, Nuxt UI)            Chrome extension        Inbound email provider
   │  app/composables/convex.ts             │ opens /capture?url=     │ POST /inbound-email
   │  (ConvexClient over WebSocket:         │                         │
   │   live queries, mutations, actions,    ▼                         ▼
   │   Convex Auth tokens)            ┌──────────────────────────────────────────────┐
   └─────────────────────────────────►│ Convex deployment                            │
                                      │  queries / mutations (transactional)         │
                                      │  actions (fetch: Google, Anthropic, pages)   │
                                      │  HTTP routes: /api/auth/*, /google/callback, │
                                      │               /inbound-email                 │
                                      │  scheduler + crons (discovery, sync)         │
                                      │  database (convex/schema.ts)                 │
                                      └──────────────┬───────────────────────────────┘
                                                     │
                    Google OAuth + Calendar API · Sign in with Apple · Anthropic API · Resend
```

There are only two moving parts: a static Nuxt build and a Convex deployment. Convex supplies the database, realtime updates, background jobs, cron, HTTP endpoints and auth, so there is no separate API server, queue or cache.

## Front end

- Nuxt 4 with `ssr: false`, built with `nuxt generate` into static files. Serve them from nginx on the existing Droplet or any static host.
- Nuxt UI 4 components throughout. The theme is in `app/assets/css/main.css` (tokens) and `app/app.config.ts` (color roles).
- **Data layer:** `app/composables/convex.ts`, about 200 lines.
  - `useQuery(fn, args)` subscribes with `ConvexClient.onUpdate`, and every screen updates live.
  - `mutate` and `runAction` are thin wrappers, and `useRun` adds error and success toasts.
  - It also includes a Vue port of Convex Auth's React client: OAuth redirect, code exchange, token storage and refresh.
- **Pages:**
  - `index` (Planner)
  - `ask` (Breeze chat)
  - `discover` (suggestions + standing searches)
  - `capture` (paste / inbox)
  - `settings` (calendars, profile, circles)
  - `login`
- **Route guard:** `middleware/auth.global.ts`.

## Backend (Convex)

| File | Responsibility |
|---|---|
| `schema.ts` | All tables and shared validators |
| `lib.ts` | Auth helper, **permissions** (`requireCircleAccess`, `planPermissions`), date checks, AES-GCM token encryption |
| `auth.ts` | Convex Auth with Google + Apple. After sign-in it links pending circle invites by email and assigns an inbound email alias |
| `users.ts` | Viewer profile, settings |
| `circles.ts` | Circles and members (email + label + access), linked calendar |
| `plans.ts` | List by date range (Me + my circles), create/edit/delete, commit/uncommit |
| `google.ts` | Calendar OAuth (separate consent), calendar list, event create/update/delete, free/busy, 30-min sync cron |
| `breeze.ts` | Chat (answers arrive via the scheduler), standing searches, suggestions, daily discovery cron, fit checks |
| `capture.ts` | Link/text extraction (schema.org JSON-LD first, Claude fallback), inbound email webhook and inbox |
| `claude.ts` | Anthropic Messages API client, `<events>` parsing and validation |
| `email.ts` | Invite emails via Resend (logged if not configured) |
| `crons.ts` | `discovery` daily, `google calendar sync` every 30 min |

### Key flows

**Commit a plan**
1. `plans.commit` checks the user's access in the circle (co-planner or owner). In one transaction it sets `status: committed` and `calendarStatus: pending`, and schedules `google.writeEvent`.
2. `writeEvent` picks the target calendar:
   - If the plan's circle has a `linkedCalendarId`, it writes there with the circle owner's Google account.
   - Otherwise it writes to the committer's `defaultCalendarId`.
   - It then creates or patches the Google event and stores `googleEvent`. If no calendar is connected, it sets `calendarStatus: notConnected`.
3. Every client sees the change instantly through its live query.

**Google → PlanBreeze.** Every 30 minutes, `syncCommitted` looks up each PlanBreeze event:
- A deleted or cancelled event sends its plan back to the radar, with a note.
- A changed date or title is copied onto the plan.

Push channels (`events.watch`) can replace polling later.

**Ask Breeze**
1. `breeze.send` stores the question and a pending reply, then schedules `respond`.
2. `respond` builds context: today, home area, circles, interests and the next 90 days of plans.
3. It calls Claude with web search, parses the `<events>` block, and keeps only events whose URL appeared in the search results.
4. It adds fit lines from overlapping committed plans and Google free/busy, then saves the reply. The page updates live.

**Discovery.** Standing searches run daily, or immediately when added or on "Search now". New events are de-duplicated against existing plans and past suggestions, then saved as `suggestions`.

**Capture**
- **Pasted URL:** fetched and parsed for schema.org `Event` JSON-LD. If there is none, Claude extracts the event from the page text, which it treats as untrusted content.
- **Forwarded email:** the webhook accepts mail only from the account's own address, then stores a draft in the inbox.

## Security & privacy

- **Permissions:** every public function calls `requireUserId`, then checks circle access through `lib.ts`.
- **Google refresh tokens:** encrypted with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`), never returned to clients and never sent to the LLM.
- **What the LLM sees:** plan titles and dates, and busy intervals only. It never sees other calendar events' titles.
- **Page and email text** is fenced as untrusted content in prompts. Breeze's tools are read-only, and adding anything needs a user click.
- **Outbound fetch:** pasted URLs are restricted to http(s), and localhost and private-range hostnames are rejected.
- **Invites** only link to accounts whose sign-in email matches.

## Environments

| Environment | Backend | Front end |
|---|---|---|
| Local | `npx convex dev` (a personal dev deployment) | `npm run dev` |
| Production | `npx convex deploy` | `NUXT_PUBLIC_CONVEX_URL=… npm run build`, then serve `.output/public` |

A preview or staging deployment can be added with a second Convex project, or with Convex preview deployments per branch.
