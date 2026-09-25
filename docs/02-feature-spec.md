# 02 — Feature specification

Priorities: **MVP** = required for first release · **V1** = soon after launch · **Later** = backlog.
Screens referenced are in `design/screens/`.

---

## 1. Planner timeline (`Main.dc.html`)

### User stories
- As an organizer, I see committed plans and radar items for my circle on one timeline so I know what's coming and what's possible.
- As a user, I zoom from the next month out to next year without leaving the page.
- As a user, I filter the timeline to show my own plans and any of my circles (Family, Weekend crew, Wine club…).

### Requirements
| # | Requirement | Priority |
|---|---|---|
| 1.1 | Two lanes: **Committed** (solid blue bars) and **On the radar** (dashed coral bars). Each lane shows a count. | MVP |
| 1.2 | Zoom presets: Month (5 weeks), 2 months, Quarter, Year+ (12 months). Show the visible range as text ("Sep 21 – Nov 29, 2026"). | MVP |
| 1.3 | Continuous zoom by pinch / ctrl+scroll and horizontal pan by drag or shift+scroll. Presets snap. | V1 |
| 1.4 | Week ticks at Month and 2-month zoom; month ticks at Quarter and Year+. A "Today" marker is shown when today is in range. | MVP |
| 1.5 | Bars that overlap are packed into rows. Short plans whose label doesn't fit show the label beside the bar. | MVP |
| 1.6 | **Dense Year+ mode:** at Year+ zoom, single-day plans collapse into per-month clusters ("Oct · 6 plans") that expand on hover or click. This keeps both lanes visible without scrolling. See design issue D-2. | MVP |
| 1.7 | **"Showing plans for" chips: Me + one chip per circle** (with color and member count), plus a "New circle" shortcut. **Me** = plans that are just mine (no circle). Toggling a chip shows or hides that set. The chip state is remembered per user. | MVP |
| 1.8 | Selecting a plan opens a detail panel with its status, dates, place, people, note, source link and actions. | MVP |
| 1.9 | Radar actions: **Commit & add to calendar**, **Ask the circle** (poll), **Remind me later**, Remove. | MVP (poll = V1) |
| 1.10 | Committed actions: Open in Google Calendar, Invite others, Plan it with Breeze. | MVP |
| 1.11 | Fuzzy dates: a radar item can be "October", "Summer 2027" or "Sometime". It draws as a soft band across the period. | V1 |
| 1.12 | "Breeze noticed" card: up to 3 timely nudges (ticket sale dates, unbooked travel, conflicts). | MVP |
| 1.13 | Keyboard: arrow keys move between plans, Enter opens one, +/- zoom. | V1 |
| 1.14 | Mobile layout: vertical agenda grouped by week/month, with the same two states. | V1 |

### Acceptance criteria (examples)
- Given a radar item, when I click **Commit & add to calendar**, then it moves to the Committed lane within 1 s. An event is created on the target calendar set in my sync settings, and co-planners see the change within 5 s.
- Given zoom = 2 months, the Lisbon trip (June 2027) is not shown. Given zoom = Year+, it is shown.
- Given a plan in the Wine club circle, when I turn off the Wine club chip, the plan is hidden and the lane count drops by one. Turning off **Me** hides only plans that have no circle.
- Given a radar plan in a circle linked to Google · Family, the commit button reads "Commit & add to Family calendar", and committing creates the event on that calendar.

---

## 2. Ask Breeze: chat assistant (`Assistant.dc.html`)

| # | Requirement | Priority |
|---|---|---|
| 2.1 | Chat available as a side panel on the Planner and as a full page. | MVP |
| 2.2 | Answers event-finding questions ("find a wine tasting event in October") with result cards: date block, title, venue/time/price, distance, and a **calendar fit** line (free / conflict with X / suggestion). | MVP |
| 2.3 | Each result card has Add to radar, Commit & add to calendar, and Ask [person]. | MVP |
| 2.4 | Answers availability questions across the circle ("which Saturdays in November is everyone free?") using free/busy only. | MVP |
| 2.5 | Offers to turn a one-off search into a standing search ("Yes, keep watching"). | MVP |
| 2.6 | Keeps recent chats in a list. Chats are private to the user unless shared. | MVP |
| 2.7 | Accepts a pasted link or screenshot in the composer and captures it. | V1 |
| 2.8 | Trip helper: itinerary ideas for a committed trip (e.g. Porto, 3 days) drawn from the trip's dates. | V1 |
| 2.9 | Shows a sources/"why" line for each suggestion. | MVP |
| 2.10 | Never invents events: every result must come from a retrieved source with a URL. | MVP |

See `07-ai-assistant.md` for tools, prompts and guardrails.

---

## 3. Discover: background suggestions (`Discover.dc.html`)

| # | Requirement | Priority |
|---|---|---|
| 3.1 | A feed of suggestions grouped by reason: "This weekend", "For your [trip]", "Because you like [interest]". | MVP |
| 3.2 | Filters: Everything, Next 2 months, a specific trip, With [person]. | MVP |
| 3.3 | Each card: date, title, place/time/price, a reason line (green = fits, amber = conflict, blue = interest match), and **Add to radar** / **Not for us**. | MVP |
| 3.4 | "Not for us" feeds back into ranking ("Got it — fewer like this"). | MVP |
| 3.5 | Standing searches are listed with on/off switches. Interests can be edited ("What Breeze has learned"). | MVP |
| 3.6 | A "6 new" badge in the nav. Optional weekly digest email. | MVP / V1 |
| 3.7 | Push notification when a high-fit suggestion appears or a watched price drops. | Later |

---

## 4. Add from anywhere: capture (`Capture.dc.html`, `Mobile.dc.html`)

| # | Requirement | Priority |
|---|---|---|
| 4.1 | **Paste box:** accepts a URL, pasted email text or free text ("dinner at the Parks' on the 14th"). | MVP |
| 4.2 | **Email forwarding:** a unique address per user (e.g. `mark@in.planbreeze.com`). Forwarded emails become draft plans in an "Inbox" tray. | MVP |
| 4.3 | **Browser extension** (Chrome first): on click, reads the current page and shows an editable card (title, when, where, tickets, calendar check), a lane toggle (Radar / Committed), a **Circle** picker (Just me or one of my circles, with a hint about which calendar a commit will use), a reminder, and Save. | MVP |
| 4.4 | **Mobile share sheet** (PWA share target first, native later): same card as a bottom sheet. | V1 |
| 4.5 | **Photo of a flyer:** upload an image; extraction by a vision model. | V1 |
| 4.6 | **Gmail side panel** add-on. | Later (depends on Google restricted-scope review; see 06) |
| 4.7 | Extraction reads schema.org `Event` JSON-LD / microdata first, then an LLM over the page text. Every extracted field can be edited before saving. | MVP |
| 4.8 | Duplicate detection: if a matching plan exists (same title ±, same date), offer to merge. | MVP |
| 4.9 | Ticket-sale reminders: if a page shows an on-sale date, offer "Remind me when tickets go on sale". | MVP |
| 4.10 | Captured plans keep a link to their source. | MVP |

Acceptance: from a typical event page, the extension card fills in title, date and place correctly for ≥ 90% of a test set of 100 real event pages. Saving takes one click.

---

## 5. Circles & sharing (`Settings.dc.html`)

A user can create **multiple circles**, such as Family, Weekend crew or Wine club. Each circle has a name, a color, members (email + label + access level) and an optional **linked calendar**.

| # | Requirement | Priority |
|---|---|---|
| 5.1 | **Circle list** on the Calendars & circles page: each circle shows name, color, member count and linked calendar, and expands to show members. | MVP |
| 5.2 | **Create a circle:** name, optional linked calendar, and one or more people entered as **email + label** ("dana.h@example.com" / "Dana"). "Add another person" adds rows. Creating the circle sends email invites. | MVP |
| 5.3 | **Edit a circle:** rename, change color, add a person (email + label), change a person's label or access, remove a person, archive the circle. | MVP |
| 5.4 | **Linked calendar (optional):** choose one of the owner's writable calendars (e.g. Google · Family) or "Create a new Google calendar for this circle". **Committed plans in the circle are added to that calendar.** Circles without one use the owner's default calendar. | MVP ("create new" = V1) |
| 5.5 | Access levels per membership: **Co-planner** (add/commit/edit the circle's plans), **Contributor** (add to radar, vote, comment), **Viewer** (see the circle's plans). | MVP |
| 5.6 | Invitees can join without connecting a calendar. Memberships are linked when someone signs in with a matching verified email. The same person can be in several circles, with a different label in each. | MVP |
| 5.7 | Every plan belongs to **one circle or to "just me"**. Its visibility defaults to all members of that circle, with the option to restrict it to the people on the plan. | MVP |
| 5.8 | Members see each other's busy/free time only if they have connected calendars and turned sharing on (per circle). | MVP |
| 5.9 | Kid profiles (managed, no email) for young children. | V1 |
| 5.10 | "Ask the circle" poll on a radar item: In / Not for me / Suggest dates. | V1 |
| 5.11 | Comments on plans. | V1 |
| 5.12 | Move a plan to another circle. If it is committed, its calendar event moves to the new circle's calendar. | V1 |
| 5.13 | Share a circle's linked Google calendar with its members' Google accounts automatically (calendar ACL). | Later |

Acceptance:
- Creating "Book club" with two people shows it in the circle list and as a new chip on the Planner, and sends two invites.
- With Family linked to Google · Family, committing any Family plan creates the event on Google · Family. With Weekend crew unlinked, committing one of its plans creates the event on the default calendar (Google · Personal).

---

## 6. Calendars & sync (`Settings.dc.html`)

| # | Requirement | Priority |
|---|---|---|
| 6.1 | Connect **Google Calendar** via OAuth. Choose which sub-calendars to read, and a **default calendar** for committed plans that are just mine (and for circles with no linked calendar). Circle calendars are set per circle (§5.4). | MVP |
| 6.2 | Two-way sync for PlanBreeze-created events: changes in Google update PlanBreeze, and deleting in Google moves the plan back to Radar (with a notice). | MVP |
| 6.3 | Read busy time from all selected calendars for conflict checks and free/busy answers. | MVP |
| 6.4 | Radar sync setting: Keep in PlanBreeze only (default) / Add as tentative holds / Show nothing but warn about conflicts. | MVP |
| 6.5 | Connect **Apple iCloud Calendar** (CalDAV + app-specific password). | V1 |
| 6.6 | Connect **Yahoo Calendar** (CalDAV + app password). | V1 |
| 6.7 | Connect **Outlook / Microsoft 365** (Microsoft Graph). | V1 |
| 6.8 | Subscribe to ICS feeds (school calendars, sports schedules) as read-only. | V1 |
| 6.9 | Sync health indicator ("Synced 2m ago") and a reconnect flow when tokens expire. | MVP |

---

## 7. Accounts, notifications, settings

| # | Requirement | Priority |
|---|---|---|
| 7.1 | Sign in with Google and Sign in with Apple (MVP). Accounts linked by verified email; Apple private-relay addresses supported. Email magic link (Later). | MVP |
| 7.2 | Onboarding: connect calendar → pick interests → invite 1 person → try a capture. | MVP |
| 7.3 | Reminders by email (MVP) and web/mobile push (V1). | MVP / V1 |
| 7.4 | Data export (JSON + ICS) and account deletion. | MVP |
| 7.5 | Time zone per user and per plan (travel plans show local time). | MVP |

---

## MVP summary

The MVP covers: Google + Apple sign-in, the Planner timeline (with dense Year+ mode), the committed/radar model, multiple circles (email + label members, 3 access levels, optional linked calendar per circle), the Me + circles filter, Google Calendar two-way sync, paste box and email-forward capture, the Chrome extension, Ask Breeze chat with event search and free/busy, the Discover feed with standing searches, email reminders, and export/delete.
