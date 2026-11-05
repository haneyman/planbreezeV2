# Breeze

Breeze uses the OpenAI Responses API. Configure `OPENAI_API_KEY` and `OPENAI_MODEL`; the default is `gpt-4.1-mini`. Chat and discovery enable the `web_search` tool and request returned sources. Extraction uses plain Responses requests without search.

Prompts include the user's home area, interests, circle names, and visible upcoming plans. Never include credentials or refresh tokens. Web content is untrusted. Breeze suggests events; it cannot book, purchase, message, or commit plans. Events are parsed from the existing `<events>` format, validated, and shown only when their URL matches a source returned by search. Source URLs appear on event cards.

Chat responses and discovery run as persisted background jobs. The frontend polls while visible. Calendar fit distinguishes unavailable calendar checks from confirmed absence of conflicts.

Implementation: `server/src/breeze/openai.ts` and `breeze.service.ts`. Official API reference: https://developers.openai.com/api/docs/guides/tools-web-search
