# 07 — Breeze: the AI assistant

Breeze does four jobs:

1. **Answer:** a chat that finds events and answers availability questions.
2. **Extract:** turns captured pages, emails and photos into structured plans (see 06).
3. **Discover:** runs standing searches in the background and ranks suggestions.
4. **Notice:** writes short, timely nudges ("Tickets open Oct 1").

## Principles
- **Suggest, never act.** Breeze can read calendars and create *drafts*. Any change to plans, calendars or other people needs a user click. It never buys, books, RSVPs or sends messages.
- **No invented events.** Every event shown must come from a tool result with a source URL. If nothing is found, Breeze says so.
- **Grounded in the user's own data.** Fit lines ("You and Dana are free") come from a deterministic free/busy tool. The model does not guess availability.
- **Short and warm.** Plain, first-person, brief answers with no hype.

## Chat architecture

An agent loop on the server with tool use. The model gets a system prompt, a compact user context and tools.

**User context (per turn, minimal):** user's name, home area (city level), time zone, today's date, circle members (names, relationships, kid ages if given), interests, the next ~60 days of plans (title/date/status), and active trips.

**Tools**
| Tool | Purpose | Side effects |
|---|---|---|
| `search_events(query, date_range, area, radius, audience)` | Queries event-source adapters + web search, returns normalized candidates with URLs | none |
| `web_search(query)` / `web_fetch(url)` | General lookup (server-side tool) | none |
| `get_free_busy(people[], range)` | Deterministic free/busy from `busy_block` and plans | none |
| `list_plans(range, status?, people?)` | Reads the timeline | none |
| `check_fit(candidate)` | Conflicts, overlaps and travel time vs. existing plans | none |
| `draft_plan(candidate, status)` | Creates a draft card the UI shows with Add/Commit buttons | draft only |
| `create_standing_search(spec)` | Proposes a standing search; the user confirms in the UI | draft only |
| `get_trip(plan_id)` | Details of a committed trip for itinerary help | none |

Result cards in the chat are rendered from structured tool output, not from the model's prose, so dates, prices and links match the sources exactly.

## Background discovery

```
scheduler ─► for each enabled standing_search (by cadence)
             ├─ build queries from query_spec + interests + circle (kid ages, radius)
             ├─ run event-source adapters + LLM web search
             ├─ normalize → dedupe (vs plans, past suggestions, dismissals)
             ├─ score  = relevance(interest embeddings, text)
             │          × fit(free/busy, travel time)
             │          × freshness × novelty − penalty(similar to dismissed)
             ├─ LLM writes one-line reason ("Falls on your first night in Lisbon")
             └─ store top N as `suggestion` (state=new) → badge / digest
```

- **Standing searches** come from onboarding interests, from "Yes, keep watching" in chat, and automatically from committed trips (a destination plus date range spawns "things to do in Lisbon, Jun 12–26").
- **Learning:** Add to radar raises the weights of similar interests, and "Not for us" lowers them. Commit is the strongest positive signal.
- **Cost control:** cap LLM calls per user per day. Cache source results per area/date. Run cheap adapters first and use web search only to fill gaps. Use a smaller model for extraction and reason lines, and a larger one for chat.
- **Noticer:** rules first (on-sale dates, unbooked travel before a trip, a new conflict), with the LLM used only to word the message.

## Safety & prompt-injection defense
- Captured page/email text and web results are **untrusted data**. They go into the model inside clear delimiters, with an instruction to treat them as content only.
- Tools with side effects are draft-only. Nothing a web page says can trigger a write.
- Output validation: event candidates must pass schema validation, and dates must parse and fall in range. URLs must come from tool results.
- PII minimization: no calendar event titles from non-PlanBreeze events are sent to the model, only busy intervals.
- Kids: suggestions for kid profiles pass an audience filter (all-ages / family).

## Evaluation (set up in Phase 2, before launch)
| Eval | Measure | Target |
|---|---|---|
| Extraction | Field accuracy on 100 real event pages + 50 emails | title/date/place ≥ 90% |
| Search relevance | Human-rated top-3 for 50 scripted queries ("wine tasting in October") | ≥ 80% relevant |
| Grounding | Share of shown events with a valid source URL | 100% |
| Fit correctness | Free/busy statements vs. ground truth | 100% |
| Injection | Red-team pages that try to trigger actions | 0 successful |

## Model choice
Use an adapter so models can be swapped. Start with a current Claude model for chat (tool use + web search) and a smaller, cheaper model for extraction and reason lines. Model IDs and prices change, so pin them in config, not code.
