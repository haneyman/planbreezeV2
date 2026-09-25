# 01 — Product brief

## The problem

Families and close friends plan across scattered places. Commitments live in Google or Apple calendars. Ideas like "we should do that wine thing in the fall" or "maybe add Paris to the Europe trip" live in texts, screenshots, email newsletters and people's heads. Calendars are good at the first kind and useless for the second. Nobody sees both kinds together, across both near and far timeframes, and across the people involved.

## The product

PlanBreeze is a shared planning space for a small circle of people. It combines:

1. **A zoomable timeline** of committed plans and radar items. It covers anything from the next few weeks to next summer's trip.
2. **Two states for every plan.** *Committed* plans sync to real calendars. *Radar* items are kept in view without adding anything to a calendar. Committing is one click.
3. **Capture from anywhere.** A browser extension, email forwarding, the phone share sheet, a pasted link or text, or a photo of a flyer. PlanBreeze pulls out the date, place and ticket details automatically.
4. **Breeze, an AI assistant.** Breeze answers questions against the user's calendar and circle ("find a wine tasting in October", "which Saturdays in November is everyone free?"). It also runs standing searches in the background and suggests things to do.
5. **Real calendar integration.** Google Calendar first, then Apple iCloud, Yahoo and Outlook.

## Who it's for

| Persona | Description | Main needs |
|---|---|---|
| **The organizer** (primary, e.g. Mark) | Keeps the family's plans together; connects calendars; invites people | See everything at once, capture fast, not miss things, avoid conflicts |
| **Co-planner** (e.g. partner Dana) | Plans equally; commits and edits | Same as the organizer; sees changes others make |
| **Contributor** (e.g. adult kids, parents, friends) | Adds ideas and votes; lighter touch | Quick add, see what's planned with them, low effort |
| **Viewer** (e.g. a 9-year-old, extended family) | Sees shared plans only | Simple, read-only, age-appropriate |

Each circle is small, typically 3–15 people, and a user typically has 1–5 circles. This is not an event-ticketing or social network product.

## Core concepts (glossary)

- **Plan:** any item on the timeline. It has a title, a time (a single day, a range or a fuzzy period such as "June 2027"), a place, people and a source.
- **Committed:** the user has decided to do it. It gets written to the chosen external calendar.
- **On the radar:** a plan the user is interested in but hasn't committed to. By default nothing is written to any external calendar.
- **Circle:** a named group a user plans with ("Family", "Weekend crew", "Wine club"). A user can have **many circles**, and a person can be in several. Each member is added by email with a label (their display name in that circle) and has an access level: Co-planner, Contributor or Viewer. A circle can have an optional **linked calendar**, and committed plans in that circle are added to it.
- **Me / just me:** plans that belong to no circle and are private to the user. They are written to the user's default calendar.
- **Timeframe / zoom:** the visible window: Month, 2 months, Quarter or Year+. It can also be pinched or scrolled.
- **Suggestion:** something Breeze found that isn't on the timeline yet. The user can add it to the radar or dismiss it with "Not for us".
- **Standing search:** a saved background search Breeze keeps running, such as "wine tastings within an hour" or "festivals in Lisbon, June 12–26, 2027".
- **Capture:** turning an outside source (web page, email, photo, text) into a plan.

## Product principles

1. **Radar is first-class.** "Maybe" plans get the same care as committed ones, with their own look (dashed coral) that is easy to tell apart.
2. **Zoom, don't paginate.** One continuous timeline. Near-term detail and long-range trips live in the same place.
3. **Capture in under 10 seconds.** From an email or web page to a saved radar item.
4. **Breeze suggests, you decide.** The AI never commits, books, buys or messages anyone on its own.
5. **Calendars stay the source of truth for time.** PlanBreeze reads busy time from every connected calendar and writes only committed plans, to the calendar the user chooses.
6. **Private by default.** Circle members see only plans shared with them and plain busy/free time, never the details of other calendar events.
7. **Calm, warm, unhurried.** No urgency framing, no streaks, no engagement bait.

## Success measures (first 6 months after launch)

| Metric | Target (initial guess, to be refined) |
|---|---|
| Activated users (connected ≥1 calendar and saved ≥3 plans in week 1) | 40% of sign-ups |
| Median capture time (source → saved) | < 10 s |
| Radar → committed conversion | 15–25% of radar items |
| Suggestions acted on (added to radar) | ≥ 10% |
| Weekly active circles (≥2 members active) | 30% of accounts |
| Sync correctness (conflicting or duplicate events reported) | < 0.5% of synced events |

## Out of scope (for now)

- Selling tickets or taking payments
- Public or social event discovery feeds beyond the user's circle
- Full calendar replacement (day/week grids for editing arbitrary meetings)
- Corporate/work scheduling features (room booking, meeting polls for large groups)
