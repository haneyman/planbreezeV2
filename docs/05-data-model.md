# 05 — Data model (Convex)

The source of truth is **`convex/schema.ts`**. This page summarizes it.

```
users ──< members >── circles (ownerId, linkedCalendarId?)
  │                      │
  │                      └──< plans (circleId)        plans with no circleId = "just me"
  ├──< plans (ownerId)
  ├── calendarAccounts (Google, encrypted refresh token, calendars[])
  ├──< chats ──< messages (events[] with fit)
  ├──< standingSearches ──< suggestions
  └──< captures (forwarded email / paste drafts)
```

| Table | Key fields | Notes |
|---|---|---|
| `users` | name, email, image, **timeZone, homeArea, interests[], defaultCalendarId, radarSyncMode, inboundAlias** | Convex Auth's users table plus PlanBreeze fields. Convex Auth also adds `authAccounts`, `authSessions` and other tables. |
| `circles` | ownerId, name, color, **linkedCalendarId?**, archived? | A user can own and belong to any number of circles. |
| `members` | circleId, **label, email?**, access (`owner` \| `coPlanner` \| `contributor` \| `viewer`), userId?, invitedAt? | One row per person per circle, including the owner. `userId` is filled in when someone signs in with that email. |
| `plans` | ownerId, circleId?, title, status (`radar` \| `committed`), startDate, endDate (inclusive `YYYY-MM-DD`), startTime?, endTime?, timeZone, place, url, note, priceText, ticketOnSaleDate, source, **googleEvent {userId, calendarId, eventId}**, calendarStatus, calendarError | Indexed by owner, circle and status. |
| `calendarAccounts` | userId, provider `google`, email, **refreshToken (encrypted)**, calendars[] {id, name, color, primary, writable}, status | One per user. Apple, Yahoo and Outlook come later. |
| `oauthStates` | userId, state | Short-lived CSRF state for the calendar consent redirect. |
| `chats`, `messages` | messages: role, text, events[] (event + fit), pending | Answers are written by a scheduled action. |
| `standingSearches` | userId, query, circleId?, enabled, lastRunAt | Run daily by cron. |
| `suggestions` | userId, searchId?, event, fit, dedupeKey, state (`new` \| `added` \| `dismissed`) | Unique per user and dedupeKey. |
| `captures` | userId, source (`email` \| `paste`), subject, draft, status | The forwarded-email inbox. |

## Rules (tested in `convex/app.test.ts`)

1. **Visibility:** a user sees their own "just me" plans plus every plan in circles they belong to.
2. **Contributors** can create radar plans in a circle but can't commit them. Co-planners and owners can.
3. **Target calendar:** a commit uses `circle.linkedCalendarId` (with the owner's account) if set, otherwise the committer's `defaultCalendarId`.
4. **Invites** link to an account only when the sign-in email matches the member's email.
5. **Dates** are validated: `YYYY-MM-DD`, the end date can't be before the start, and times are `HH:MM`.
