# Data model

The schema and indexes are defined in `server/src/common/models.ts`; record and HTTP response types live in `shared/types.ts`.

Collections: users, identities (provider + stable OAuth subject), circles, members, plans, calendarAccounts, oauthStates, chats, messages, standingSearches, suggestions, captures, jobs, and sessions.

String IDs preserve existing Convex IDs during import; new records use UUIDs. `_creationTime` remains a numeric timestamp. Relationships use string IDs. Date-only fields remain local `YYYY-MM-DD`, with optional `HH:MM` and an IANA time zone. Google all-day event end dates are exclusive; app end dates are inclusive.

A circle has an owner and membership rows. Roles are owner, coPlanner, contributor, and viewer. Private plans have no circle. Only co-planners/owners may commit shared plans; contributors may create radar plans and edit their own radar plans. Archived circles cannot grant access. These rules live in `common/permissions.ts` and are tested through HTTP endpoints.

Encrypted calendar tokens never appear in viewer responses. Sessions and OAuth states expire. Job state is pending, running, done, or failed; workers renew leases and retry failures up to five attempts.
