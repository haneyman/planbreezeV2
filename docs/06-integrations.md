# 06 — Integrations

> Provider details below reflect general knowledge as of mid-2026. Confirm every item marked **(verify)** against current provider docs and terms during Phase 0.

## Sign-in providers (MVP)

| Provider | Protocol | Notes |
|---|---|---|
| Google | OpenID Connect (`openid email profile` only) | Calendar scopes are requested later in a separate "Connect Google Calendar" step |
| Apple | Sign in with Apple (OIDC-style, `name email`) | Needs an Apple Developer Program membership, a Services ID, and return URLs verified on planbreeze.com. The client secret is a JWT signed with an Apple private key, and it expires. The name is only sent on first sign-in. Users may choose a private-relay email; to email relay addresses, register the outbound sending domain with Apple's private email relay. **(verify)** |

Signing in with Apple does **not** give calendar access. iCloud Calendar still needs CalDAV with an app-specific password (below).

## Calendars

### Google Calendar (MVP)
- **API:** Google Calendar API v3.
- **Auth:** OAuth 2.0 with offline access (refresh token). Calendar consent is requested separately from sign-in, so users can sign in first and connect later.
- **Scopes (minimal set, verify):** list calendars (read-only), read/write events on calendars the user picks, and free/busy. Prefer the narrowest event scopes Google offers for events the app creates.
- **App verification:** Calendar scopes are classed as *sensitive*. A public launch needs Google OAuth app verification (privacy policy, homepage, scope justification, demo video). Budget **2–6 weeks** and start in Phase 1. Until then, testing is limited to ≤100 test users. **(verify)**
- **Sync:** `events.list` with `syncToken` for incremental sync. `events.watch` push channels, renewed before expiry. Full resync when a token is invalidated (HTTP 410).
- **Writes:** created events carry `extendedProperties.private.planbreezePlanId` so they can be matched back reliably.
- **Quotas:** per-user and per-project limits. Batch where possible and back off exponentially. **(verify)**

### Apple iCloud Calendar (V1)
- **Protocol:** CalDAV (`caldav.icloud.com`). Apple offers no OAuth for third-party calendar access.
- **Auth:** the user creates an **app-specific password** at account.apple.com and pastes it in with their Apple ID. The UI must walk them through this step by step.
- **Sync:** poll with `getctag` / WebDAV sync-collection (RFC 6578) every 5–15 min. No push.
- **Library:** `tsdav` (TypeScript CalDAV client) **(verify maintenance status)**.

### Yahoo Calendar (V1)
- **Protocol:** CalDAV (`caldav.calendar.yahoo.com`) **(verify endpoint)**.
- **Auth:** a Yahoo **app password** generated in Account Security.
- **Sync:** same polling approach as iCloud.

### Outlook / Microsoft 365 (V1)
- **API:** Microsoft Graph `/me/calendars`, `/me/events`, `calendarView`, delta queries, change-notification subscriptions.
- **Auth:** Microsoft identity platform OAuth with delegated `Calendars.ReadWrite` + `offline_access`.

### ICS subscriptions (V1)
- Read-only URL feeds (school, sports leagues). Poll every 6–24 h and parse with `ical.js`.

### Sync design principles
1. Only PlanBreeze-created events are ever edited or deleted by PlanBreeze.
2. Other events are read as **busy blocks**. Titles are not stored unless the user opts in to "show my event titles to me".
3. Conflict resolution: the provider's last write wins for time and title. PlanBreeze keeps its own fields (people, radar notes).
4. Every sync run is idempotent and resumable. Provider cursors are stored per calendar.
5. There is a sync health page per account with the last error and a reconnect button.

## Capture channels

| Channel | MVP? | Implementation |
|---|---|---|
| Paste box (URL / text) | MVP | Server fetches the URL (with SSRF protection), extracts, returns a draft |
| Email forward | MVP | Unique inbound address per user on `in.planbreeze.com` (MX record points at the inbound provider). The provider webhook posts parsed MIME. Only mail from verified sender addresses is accepted, to block spam. |
| Chrome extension | MVP | MV3. Reads the active tab's DOM (JSON-LD + visible text) in a content script and posts to the API. Auth via a short-lived token from the web app. |
| Mobile share | V1 | PWA Web Share Target API first (Android and desktop Chrome). iOS needs a native share extension later. **(verify iOS PWA share-target support)** |
| Photo / flyer | V1 | Upload the image; a vision-capable LLM extracts the fields |
| Gmail add-on / inbox scanning | Later | Gmail read scopes are *restricted* and need a yearly third-party security assessment. Avoid until there is clear demand; email forwarding covers the need. **(verify)** |

### Extraction pipeline
1. **Structured first:** schema.org `Event` JSON-LD / microdata / `ics` attachments / calendar invites (`text/calendar`).
2. **LLM fallback:** cleaned text goes to a strict JSON schema with fields `title, start, end, all_day, time_zone, place, price_text, ticket_on_sale_at, url, confidence{}`.
3. **Normalize:** resolve relative dates against the email's sent date, geocode the place, pick a time zone from the place.
4. **Check:** duplicates, calendar fit, circle members' busy time.
5. Low-confidence fields are highlighted in the confirmation card.

## Event sources for discovery

Discovery combines several sources. Treat each as a pluggable `EventSource` adapter returning normalized candidates.

| Source | Notes |
|---|---|
| LLM web search (Claude server-side web search tool) | Broadest coverage (venue sites, local news, tourism boards). Must cite a URL for every result. |
| Ticketmaster Discovery API | Concerts, sports, theater; free API key with rate limits **(verify terms)** |
| SeatGeek API | Similar coverage **(verify availability and terms)** |
| Eventbrite | Its public event-search API was retired years ago, so it is not usable for search. Pages found via web search are still readable through structured data. **(verify)** |
| PredictHQ | Paid, aggregated event data; consider if coverage gaps appear |
| Venue / tourism sites | Many publish schema.org `Event` data that the capture extractor already reads |
| Newsletters the user forwards | Treat as a first-party source for that user |

Rules: respect robots.txt and each API's terms, cache results, and never scrape behind logins.

## Other services
- **Geocoding / travel time:** Google Maps Platform or Mapbox for "50 min drive" estimates **(decide, cost)**.
- **Flight price watching:** a later feature. Needs a flight-data API (e.g. Amadeus Self-Service or Duffel) **(verify availability and cost)**.
- **Email out:** Postmark or SES.
- **Push:** Web Push (VAPID) for the PWA. APNs/FCM once there are native apps.
