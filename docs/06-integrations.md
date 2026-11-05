# Integrations

Google/Apple OAuth, Google Calendar, OpenAI Responses/web search, Mailgun, and Postmark-compatible inbound email are configured through `.env.example`. Exact callback URLs and environment names are documented in `README.md`.

Calendar consent is separate from sign-in. A committed circle plan targets the circle owner's linked calendar; otherwise it targets the committer's default calendar. Radar plans never create calendar events. Writes/deletes check the private `planbreezePlanId` event marker. Tokens are encrypted at rest.

Breeze uses OpenAI for chat, searches, and extraction. Event candidates require valid local dates and matching returned web-search source URLs. The assistant suggests; only user clicks create/commit plans. Mailgun is disabled unless explicitly enabled. Inbound capture checks a shared secret, forwarding domain, and sender ownership.
