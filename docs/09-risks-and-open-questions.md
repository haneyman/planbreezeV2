# 09 — Risks & open questions

## Decisions made

| # | Decision | Date |
|---|---|---|
| DEC-01 | Language: **TypeScript** throughout | 2026-09-24 |
| DEC-02 | ~~Front end: **Vue 3 (Vite SPA), no Nuxt**~~ *(superseded by DEC-18)* | 2026-09-24 |
| DEC-03 | ~~Back end: **Fastify** REST API in TypeScript~~ *(superseded by DEC-18)* | 2026-09-24 |
| DEC-04 | ~~Database: **MongoDB**~~ *(superseded by DEC-18)* | 2026-09-24 |
| DEC-05 | Sign-in: **Google and Apple OAuth** | 2026-09-24 |
| DEC-06 | ~~Hosting: **DigitalOcean Droplet**~~ *(superseded by DEC-18)* | 2026-09-24 |
| DEC-07 | **Personal project** (not Rialtic). Continued on a personal Claude account. | 2026-09-24 |
| DEC-08 | Domain: **planbreeze.com** (owned) | 2026-09-24 |
| DEC-09 | ~~MongoDB: the **existing instance on the production Droplet**, with a new `planbreeze` database~~ *(superseded by DEC-18)* | 2026-09-24 |
| DEC-10 | ~~Background jobs: **Agenda** (MongoDB-backed)~~ *(superseded by DEC-18)* | 2026-09-24 |
| DEC-11 | ~~Environments: a **separate development Droplet** (dev.planbreeze.com) plus production~~ *(superseded by DEC-18)* | 2026-09-24 |
| DEC-12 | ~~Styling: **UnoCSS**~~ *(superseded by DEC-18)* | 2026-09-24 |
| DEC-13 | ~~MongoDB instances are **standalone** (not replica sets) and stay that way. Design uses single-document atomic updates, an outbox, and a capped collection for realtime. No transactions or change streams~~ *(superseded by DEC-18)* | 2026-09-24 |
| DEC-14 | ~~The dev Droplet has **its own MongoDB** (`planbreeze_dev`)~~ *(superseded by DEC-18)* | 2026-09-24 |
| DEC-15 | Web server: the **existing nginx** on each Droplet. Add PlanBreeze site configs and do not run Caddy | 2026-09-24 |
| DEC-16 | ~~**No Docker.** The API and worker run directly on each Droplet under **PM2**~~ *(superseded by DEC-18)* | 2026-09-24 |
| DEC-17 | **Multiple circles** per user. Members are added by email + label. Each circle has an optional linked calendar, and committed plans in the circle are added to it. The Planner filter shows Me + each circle | 2026-09-25 |
| DEC-18 | **Stack reset:** Nuxt 4 + Nuxt UI 4 front end (client-rendered), **Convex** backend (database, functions, auth, crons), repo on **GitHub**. Keep it simple, with few layers. Built as the MVP on 2026-09-25 | 2026-09-25 |
| DEC-19 | Auth: **Convex Auth** with Google and Apple. Its React client is ported to a small Vue composable (no extra auth vendor) | 2026-09-25 |
| DEC-20 | npm (single package, no monorepo), vitest + convex-test, GitHub Actions CI | 2026-09-25 |

DEC-15 (the existing nginx) still applies if the static front end is served from the Droplet.

## Open questions

| # | Question | Options / recommendation | Needed by |
|---|---|---|---|
| Q-23 | Where to host the static front end | The existing nginx on the Droplet (config in README) vs. a static host (Netlify, Cloudflare Pages, Vercel) | Before launch |
| Q-24 | Which Claude model for Breeze (cost vs. quality) | Configurable with `ANTHROPIC_MODEL`. Measure the cost of the daily discovery cron | Before beta |
| Q-18 | Can a plan belong to more than one circle? | Assumed **one circle or just me** (simpler sync and permissions). Sharing across circles later if needed | Phase 1 |
| Q-19 | The linked calendar belongs to the circle owner. Should members also see it in their own Google Calendar? | MVP: members see plans in PlanBreeze only. Later: auto-share the Google calendar with members' emails (needs broader calendar scope) | V1 |
| Q-20 | "Create a new Google calendar for this circle" needs the broader `calendar` scope (create calendars) | Ship MVP with "pick an existing calendar". Add "create new" once scopes and verification allow it | Phase 1 |
| Q-21 | When a circle's linked calendar changes, move existing committed events? | Default: future commits only, and offer "Move existing events" | Phase 1 |
| Q-22 | Can a co-planner (not the owner) commit to the owner's linked calendar? | Assumed yes: PlanBreeze writes with the owner's connection. Otherwise it falls back to the co-planner's own default calendar | Phase 1 |
| Q-7 | Email providers (outbound + inbound on `in.planbreeze.com`) | Postmark (both) vs. SES vs. Cloudflare Email Routing for inbound | Phase 2 |
| Q-9 | Monthly budget for LLM + event APIs during beta | Sets the per-user discovery cap | Phase 3 |
| Q-10 | Which second calendar first: Apple or Outlook? | Apple fits families more; Outlook is easier (OAuth) | Week 16 |
| Q-11 | Native mobile apps? | PWA first (recommended); native iOS later for the share extension | Week 16 |
| Q-12 | Dark mode in MVP? | Recommend after MVP | Phase 1 |
| Q-13 | Kid profiles: minimum age and parental controls | Needed before inviting under-13s; affects COPPA obligations | Phase 4 |
| Q-14 | Circle members see each other's busy time by default? | Recommend off; opt in per member | Phase 4 |
| Q-15 | Home area precision for "near me" | City/ZIP level (recommended) | Phase 3 |
| Q-16 | Business model (if any) | Personal/free for now; revisit after beta | Later |
| Q-17 | Trademark check on "PlanBreeze" | Quick search before a public launch | Before public launch |

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Google OAuth verification delays public launch | Med | High | Submit early (week 4). Beta stays under 100 test users until approved. Keep scopes minimal. |
| R-2 | Sign in with Apple setup (Developer membership, Services ID, key rotation, relay emails) takes longer than expected | Med | Low | Do it in Phase 0. Store the name on first sign-in. Handle relay addresses when matching by email. |
| R-3 | Apple/Yahoo calendar app-password setup confuses users | High | Med | Guided flow with screenshots. ICS read-only fallback. |
| R-15 | (If the front end is served from the Droplet) changing nginx on shared Droplets could break the other sites there | Low | High | Separate PlanBreeze site file, `nginx -t` before every reload, config in git, rollback by removing the symlink. |
| R-6 | Event discovery coverage is patchy by city | Med | High | Blend sources plus web search, measure relevance, allow forwarded newsletters. |
| R-7 | The LLM hallucinates events or dates | Med | High | URL required for every event, cards rendered from tool output, schema validation, CI evals. |
| R-8 | Prompt injection from captured pages or emails | Med | Med | Untrusted-data delimiting, draft-only tools, red-team evals. |
| R-9 | Sync bugs duplicate or delete calendar events | Med | High | Only touch PlanBreeze-created events, idempotent jobs, extended properties, test calendars. |
| R-10 | LLM costs grow with background discovery | Med | Med | Per-user caps, caching, cheaper models for bulk work, adaptive cadence. |
| R-11 | Privacy concerns about AI reading calendars | Med | Med | Busy intervals only, clear data-use copy, export/delete. |
| R-12 | Event-source API terms change | Med | Med | Adapter pattern; no single-source dependency. |
| R-13 | Year+ timeline clutter | High | Med | Month clustering (design issue D-2). |
| R-14 | Solo/personal-project bandwidth stretches the timeline | High | Med | Phase gates; cut Phase 5 scope first; keep MVP focused. |
| R-17 | Convex Auth is pre-1.0 and its client is ported by hand to Vue | Med | Med | The port is small (`app/composables/convex.ts`); pin versions; re-check on each `@convex-dev/auth` upgrade. Fallback: Clerk or Better Auth. |

## Design issues found while reviewing the mockups
See `design/README.md` → "Known design issues" (D-1 … D-8).
