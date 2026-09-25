# 08 — Project plan

## Status — 2026-09-25

The stack changed to **Nuxt + Nuxt UI + Convex** (DEC-18), and the MVP code is written. The Droplet, MongoDB, Fastify, Agenda and PM2 work items below are **no longer needed**, because Convex covers the database, functions, jobs, cron and auth.

**Built**

| Area | What works |
|---|---|
| Sign-in | Google + Apple via Convex Auth; invites link automatically by email |
| Planner | Zoomable timeline (Month / 2 months / Quarter / Year+ with month clusters), prev/next/today, Me + circle filter chips, detail panel, create/edit/delete, commit/uncommit, "Breeze noticed" nudges |
| Circles | Create (name, color, linked calendar, email + label people), add/remove people, access levels, archive, invite emails (Resend) |
| Google Calendar | Separate consent, encrypted refresh token, calendar list, default calendar, commit writes to the circle's linked calendar or the default, edits and deletes follow, 30-min sync (deleted → back to radar), free/busy for fit checks |
| Ask Breeze | Chat with web search, grounded event cards with fit lines, add to radar (me or a circle), "keep watching" → standing search |
| Discover | Daily standing searches, suggestions with fit, add / not for us, filters |
| Capture | Paste a link (JSON-LD, then Claude) or text, confirm and save; email forwarding webhook + inbox; `?url=` for the extension and share links; minimal Chrome extension |
| Quality | Strict TypeScript (Nuxt + Convex), 10 vitest tests (permissions, commit routing, extraction, timeline), GitHub Actions CI |

**Next** (in rough order)

1. **First deploy.** Run `npx convex dev`, set the env vars and do a Google OAuth test-user setup. Then click through all screens with real data and fix what shows up.
2. **Google app verification** for the calendar scopes. This is needed before more than 100 users.
3. **Push sync** (`events.watch`) instead of 30-minute polling.
4. **Reminders.** Ticket on-sale reminder and "before the event" email via a scheduled function.
5. **Apple / Yahoo** (CalDAV + app-specific password) and **Outlook** (Microsoft Graph).
6. **Mobile agenda view and PWA share target.**
7. **Polls and comments** on radar plans; kid profiles.
8. **Fuzzy dates** ("Summer 2027") and continuous pinch zoom.

The original phased plan is kept below for reference. Its estimates assumed the old stack.

---

## Assumptions
- **Project type:** personal project, owned by Mark, built with a personal Claude account as the AI coding assistant.
- **Effort:** the MVP (Phases 0–4) is about **37 engineer-weeks**, including tests. The week numbers below assume **2 full-time engineers**. For a solo build with AI assistance, expect the calendar time to stretch, roughly 5–8 months depending on hours per week. Re-baseline at the end of Phase 0 once actual pace is known.
- **Start:** after this plan is approved (Week 1 = first week after approval).
- **MVP goal:** a private beta with ~20 families on Google Calendar, in about **16 weeks** at a 2-engineer pace.
- Estimates are ±30%. Re-plan at the end of each phase.

## Timeline at a glance

| Phase | Weeks | Outcome |
|---|---|---|
| 0 — Foundations & decisions | 1–2 | Repo, stack, CI, environments, open questions settled |
| 1 — Planner + Google Calendar | 3–6 | Timeline, committed/radar, Google two-way sync |
| 2 — Capture | 7–9 | Paste, email forward, Chrome extension |
| 3 — Breeze & Discover | 10–13 | Chat, standing searches, suggestion feed |
| 4 — Circle, notifications, beta hardening | 14–16 | Invites, access levels, reminders, private beta |
| 5 — V1 expansion | 17–22 | Apple, Yahoo, Outlook, mobile share, photo capture, polls |
| *Parallel* — Google OAuth verification | from week 4 | Needed before opening past 100 test users |

```
Week:        1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22
Phase 0     ██ ██
Phase 1           ██ ██ ██ ██
Phase 2                       ██ ██ ██
Phase 3                                ██ ██ ██ ██
Phase 4                                            ██ ██ ██
Beta                                                        ▲
Phase 5                                                        ██ ██ ██ ██ ██ ██
Google verif.        ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
```

---

## Phase 0 — Foundations & decisions (weeks 1–2)

| ID | Work item | Est. |
|---|---|---|
| P0-01 | Resolve the remaining Phase 0 open questions in `09` (ODM, monorepo tooling, CI). Confirm both Droplets have spare capacity and note their MongoDB and nginx versions | 0.5 |
| P0-02 | pnpm monorepo scaffold: `apps/web` (Vue 3 + Vite), `apps/api` (Fastify), `apps/worker`, `apps/extension`, `packages/*`; ESLint, Prettier, strict TS | 1 |
| P0-03 | GitHub Actions CI: typecheck, unit tests, API tests on `mongodb-memory-server`, Playwright smoke test, production build of api/worker/SPA | 1 |
| P0-04 | Infrastructure: DigitalOcean Droplet hardening (UFW, SSH keys, unattended upgrades), **PM2 ecosystem** for `planbreeze-api` and `planbreeze-worker` (startup on boot, log rotation, graceful reload), a release-directory deploy script with rollback, a dedicated `planbreeze` user. **nginx site config** added to the existing nginx on each Droplet (SPA + API + SSE settings) with Let's Encrypt certs for planbreeze.com / www / api and dev / api.dev. No Docker. Deploy scripts (main → dev, tag → prod), local Compose, app-level encryption keys per environment | 1.5 |
| P0-05 | MongoDB v1: create `planbreeze` on the prod instance and `planbreeze_dev` on the dev Droplet's own instance, with least-privilege users (both are standalone). Build the outbox + `version` helpers, the relay job, and the capped `realtimeEvents` collection. Then collections + `$jsonSchema` validators + indexes (users, sessions, circles, people, memberships, plans, calendarAccounts), migrate-mongo. Add a `mongodump --db planbreeze` nightly backup to DO Spaces | 1 |
| P0-06 | UnoCSS config with PlanBreeze theme tokens and shortcuts (`btn`, `chip`, `card`), plus base components (Button, Chip, Avatar, Segmented, Switch, Card) in `packages/ui` | 1 |
| P0-07 | Sign in with Google: Google Cloud project, OAuth consent screen (testing mode), Fastify auth routes, sessions | 0.5 |
| P0-08 | Sign in with Apple: Apple Developer membership, App ID + Services ID, domain verification on planbreeze.com, client-secret JWT signing + rotation, account linking by email | 1 |
| P0-09 | planbreeze.com DNS (apex, www, api, dev, api.dev), SPF/DKIM/DMARC placeholders; privacy policy + terms drafts | 0.5 |

**Exit criteria:** a merge to `main` deploys the SPA and API to the development Droplet. A user can sign in with Google or Apple at dev.planbreeze.com. Nightly backups run and one restore has been tested. The tokens render correctly in a component gallery.

## Phase 1 — Planner + Google Calendar (weeks 3–6)

| ID | Work item | Est. |
|---|---|---|
| P1-01 | Plan CRUD API + policy module (`can()`) with tests per access level; plans owned by a user and optionally in a circle | 1 |
| P1-01b | **Circles:** create/list/edit/archive, members as email + label + access, optional linked calendar, owner membership; Calendars & circles page UI; Planner "Me + circles" filter chips | 1.5 |
| P1-02 | Timeline engine in `packages/core`: range math, tick generation, lane packing, label placement, Year+ month clustering | 1.5 |
| P1-03 | Planner UI: zoom presets, lanes, Today marker, person filter chips, detail panel | 2 |
| P1-04 | Commit / un-commit flow with optimistic UI | 0.5 |
| P1-05 | Google connect flow (separate consent), calendar picker, write-target choice | 1 |
| P1-06 | Google sync worker: initial import of busy blocks, incremental `syncToken`, push channels + renewal | 2 |
| P1-07 | Write committed plans to Google, **routing to the circle's linked calendar or the default calendar**; handle external edits/deletes (→ back to radar) | 1 |
| P1-08 | Radar sync modes (app-only / tentative hold / warn only) | 0.5 |
| P1-09 | Sync health UI + reconnect | 0.5 |
| P1-10 | Start Google OAuth verification submission | 0.25 |

**Exit criteria:** Mark and Dana can use the Planner daily against real Google calendars for one week with no duplicate or lost events. The timeline renders 200 plans at 60 fps.

## Phase 2 — Capture (weeks 7–9)

| ID | Work item | Est. |
|---|---|---|
| P2-01 | Extraction service: JSON-LD/microdata/ICS parsers, LLM structured fallback, normalization, geocoding | 1.5 |
| P2-02 | Build an extraction test set (100 event pages, 50 emails) + eval script | 0.5 |
| P2-03 | Paste box (URL/text) with SSRF-safe fetcher and confirmation card | 0.5 |
| P2-04 | Inbound email: per-user address, provider webhook, sender verification, Inbox tray | 1 |
| P2-05 | Chrome MV3 extension: auth handoff, content script, popover card, save | 1.5 |
| P2-06 | Duplicate detection + merge; on-sale reminders | 0.5 |

**Exit criteria:** extraction eval ≥ 90% on title/date/place. From a real event page, capturing with the extension takes under 10 s.

## Phase 3 — Breeze & Discover (weeks 10–13)

| ID | Work item | Est. |
|---|---|---|
| P3-01 | LLM adapter, prompt library, tool framework, tracing, cost metering | 1 |
| P3-02 | Tools: `list_plans`, `get_free_busy`, `check_fit`, `draft_plan` | 1 |
| P3-03 | Event-source adapters: web search + one ticketing API; normalization + dedupe | 1.5 |
| P3-04 | Chat UI (side panel + full page), result cards, recent chats | 1.5 |
| P3-05 | Standing searches: model, scheduler, UI with switches, "keep watching" from chat, auto-searches for trips | 1 |
| P3-06 | Ranking + learning from add/dismiss; interest editor | 1 |
| P3-07 | Discover feed + filters + nav badge; "Breeze noticed" rules | 1 |
| P3-08 | AI eval suite (relevance, grounding, injection red-team) in CI | 1 |

**Exit criteria:** the evals in `07` pass. The median chat answer arrives in under 8 s. The daily LLM cost per active user is under the budget set in P0-01.

## Phase 4 — Circle, notifications, beta hardening (weeks 14–16)

| ID | Work item | Est. |
|---|---|---|
| P4-01 | Invite emails for circle members, join flow (link memberships by verified email), per-plan visibility, member in multiple circles | 1.5 |
| P4-02 | Realtime updates per circle | 0.5 |
| P4-03 | Reminders + weekly digest email | 1 |
| P4-04 | Onboarding flow (connect → interests → invite → first capture) | 1 |
| P4-05 | Export (JSON/ICS), account deletion, privacy policy + terms final | 0.5 |
| P4-06 | Accessibility audit (WCAG 2.2 AA), performance pass, error monitoring, load test | 1 |
| P4-07 | Beta ops: feedback widget, analytics for the success metrics, support inbox | 0.5 |

**Exit criteria:** 20 beta families onboarded. No P0/P1 bugs open. Metrics dashboard live.

## Phase 5 — V1 expansion (weeks 17–22, re-planned after beta)
Apple iCloud + Yahoo via CalDAV (2), Outlook via Graph (1), ICS subscriptions (0.5), PWA share target + mobile agenda layout (2), photo/flyer capture (1), polls and comments (1.5), continuous pinch zoom (1), fuzzy dates (1), push notifications (1).

---

## Milestones & review gates

| Gate | When | Who reviews | Decision |
|---|---|---|---|
| G0 — Plan approved | now | Mark | Start Phase 0 |
| G1 — Dogfood | end of week 6 | Mark + Dana | Continue / adjust timeline design |
| G2 — Capture quality | end of week 9 | Mark | Extraction good enough? |
| G3 — AI quality & cost | end of week 13 | Mark | Launch Breeze in beta or hold |
| G4 — Beta launch | end of week 16 | Mark | Invite beta families |
| G5 — V1 scope | week 18 | Mark | Prioritize Phase 5 from beta feedback |

## Rough running costs (to validate in P0-01)
Hosting for the beta: the existing production Droplet (MongoDB already running there) plus a separate development Droplet and DO Spaces for backups. Check current DO pricing for the dev Droplet and Spaces. Apple Developer Program membership is a yearly fee. LLM costs depend on discovery cadence, so set a per-user daily cap and measure it in Phase 3. There will be one-time costs for the Chrome Web Store developer account and any paid event-data APIs. The domain (planbreeze.com) is already owned.
