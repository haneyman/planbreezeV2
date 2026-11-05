# Architecture

The browser runs a client-rendered Nuxt app. Typed REST calls in `app/utils/api.ts` use credentials-included fetch against NestJS under `/api`. `app/composables/api.ts` handles authentication status, refresh after writes, and visible-tab polling. Shared response types live in `shared/types.ts`.

Nest controllers validate input DTOs. Feature services enforce ownership and circle access, then read or write Mongoose models directly. Schemas and indexes live in `server/src/common/models.ts`. There is no repository layer, generic CRUD framework, Redis, or separate worker service.

Services write documents and enqueue their side-effect jobs sequentially using standalone MongoDB. Individual document updates are atomic; operations across multiple documents can partially complete after a failure. The API processes persisted jobs with expiring leases and bounded retries. Discovery and Calendar sync use Nest scheduling and deduplicated job keys. Production uses the MongoDB instance on the same droplet as the API; local development uses standalone MongoDB in Docker Compose. No transactions, database sessions, or change streams are used.

Google and Apple OAuth resolve provider subjects to users. MongoDB stores sessions; browsers hold only an HTTP-only session cookie. OAuth validates state; application writes verify the frontend Origin. Google Calendar refresh tokens remain AES-GCM encrypted. Calendar consent is separate from sign-in.

OpenAI Responses provides chat, event discovery with web search, and text extraction. Event cards require a matching source URL from web search. AI cannot commit plans, buy tickets, or send messages. No credentials enter model context.

See `README.md` for configuration and `docs/10-migration-and-deployment.md` for release operations.
