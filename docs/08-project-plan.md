# Project status

The repository has migrated from Convex to the approved NestJS REST API with MongoDB/Mongoose, cookie sessions, visible-tab polling, durable jobs, and OpenAI in place of Anthropic.

Implemented areas: profiles, circles and members, private/shared plans, Google/Apple OAuth, Calendar connection/read/write/sync, AI chat, standing searches/discovery, link/text capture, inbound email capture, and Mailgun notifications.

Release work requires production MongoDB and provider credentials, a verified snapshot import, OAuth/webhook callback changes, API provisioning, and a coordinated frontend cutover. See `10-migration-and-deployment.md`. Existing live Convex data and deployment are not modified by repository changes.
