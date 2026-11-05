# Working on PlanBreeze

The user approved NestJS + MongoDB/Mongoose on 2026-11-03, with OpenAI replacing Anthropic. Keep the Nuxt frontend and one API process. Use Node 24 LTS and npm.

Controllers validate DTOs; services enforce authorization and access Mongoose models directly. No repository layer, CQRS, Redis, or microservices. Shared record/response types are in `shared/types.ts`. Frontend REST calls are in `app/utils/api.ts`; auth, polling, and toasts are in `app/composables/api.ts`.

Permissions live in `server/src/common/permissions.ts`: owner > coPlanner > contributor > viewer. Private plans are visible only to their owner. Contributors may edit their own radar plans; co-planners can commit. Check the destination circle when moving a plan.

Committed plans target the circle owner's linked Google Calendar, otherwise the committer's default. Radar plans never create external events. Edit/delete only Google events carrying the matching `planbreezePlanId`. Keep refresh tokens AES-GCM encrypted using `TOKEN_ENCRYPTION_KEY`; never log them or send them to AI.

MongoDB is standalone locally and in production. Do not use transactions, sessions for database operations, or change streams. Write directly through Mongoose; validate before writing and use conditional single-document updates for state changes. Multi-document writes and job enqueueing are sequential and can partially complete. MongoDB runs in Docker locally and on the existing droplet instance in production, not Atlas. Jobs retry, so provider operations must be repeatable where possible. Mailgun delivery can duplicate across a crash boundary; do not claim exactly-once delivery.

Breeze suggests, never acts. Suggested events require returned search source URLs. Dates stay local `YYYY-MM-DD`, end inclusive, with optional `HH:MM` and IANA zones.

Keep sentence-case UI, existing accessible components, theme colors, solid committed bars, and dashed radar bars. Backend tests are in `server/test`; run `npm run typecheck`, `npm test`, and `npm run build` before pushing. Tests import compiled API output so Nest receives decorator metadata.

See README for setup and docs/10-migration-and-deployment.md for production migration. Do not run the data import or deploy without a configured target and reviewed cutover.
