import { ConvexError } from "convex/values";
import { isDate, isTime } from "./lib";

// Minimal Anthropic Messages API client used by Breeze (chat, discovery) and capture.

export type EventCandidate = {
  title: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  place?: string;
  priceText?: string;
  url?: string;
  reason?: string;
  ticketOnSaleDate?: string;
};

type Block =
  | { type: "text"; text: string }
  | { type: "server_tool_use"; name: string; input: unknown }
  | { type: "web_search_tool_result"; content: { type: string; url?: string; title?: string }[] | { type: string } }
  | { type: string; [k: string]: unknown };

export async function callClaude(opts: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  webSearch?: { maxUses?: number; location?: string; timeZone?: string };
  maxTokens?: number;
}): Promise<{ text: string; sourceUrls: Set<string> }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ConvexError("Breeze isn't set up yet: add ANTHROPIC_API_KEY to the Convex environment.");
  const tools = opts.webSearch
    ? [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: opts.webSearch.maxUses ?? 5,
          ...(opts.webSearch.location
            ? { user_location: { type: "approximate", city: opts.webSearch.location, timezone: opts.webSearch.timeZone } }
            : {}),
        },
      ]
    : undefined;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages: opts.messages,
      ...(tools ? { tools } : {}),
    }),
  });
  if (!res.ok) throw new ConvexError(`Breeze couldn't reach the AI service (${res.status}).`);
  const data = (await res.json()) as { content: Block[] };
  const sourceUrls = new Set<string>();
  let text = "";
  for (const b of data.content) {
    if (b.type === "text") text += (b as { text: string }).text;
    if (b.type === "web_search_tool_result" && Array.isArray(b.content))
      for (const r of b.content as { url?: string }[]) if (r.url) sourceUrls.add(r.url);
    // citations on text blocks also carry URLs
    const cites = (b as { citations?: { url?: string }[] }).citations;
    if (cites) for (const c of cites) if (c.url) sourceUrls.add(c.url);
  }
  return { text, sourceUrls };
}

/** Pull the JSON array inside <events>…</events> and keep only well-formed candidates. */
export function parseEvents(text: string): EventCandidate[] {
  const m = text.match(/<events>([\s\S]*?)<\/events>/);
  if (!m) return [];
  let raw: unknown;
  try {
    raw = JSON.parse((m[1] ?? "").trim());
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: EventCandidate[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const s = (k: string) => (typeof r[k] === "string" && (r[k] as string).trim() ? (r[k] as string).trim() : undefined);
    const title = s("title");
    const startDate = s("startDate");
    const endDate = s("endDate") ?? startDate;
    if (!title || !startDate || !endDate || !isDate(startDate) || !isDate(endDate) || endDate < startDate) continue;
    const startTime = s("startTime");
    const endTime = s("endTime");
    const onSale = s("ticketOnSaleDate");
    out.push({
      title: title.slice(0, 200),
      startDate,
      endDate,
      startTime: startTime && isTime(startTime) ? startTime : undefined,
      endTime: endTime && isTime(endTime) ? endTime : undefined,
      place: s("place")?.slice(0, 200),
      priceText: s("priceText")?.slice(0, 100),
      url: s("url"),
      reason: s("reason")?.slice(0, 200),
      ticketOnSaleDate: onSale && isDate(onSale) ? onSale : undefined,
    });
  }
  return out;
}

/** Text after removing the <events> block. */
export const withoutEvents = (text: string) => text.replace(/<events>[\s\S]*?<\/events>/g, "").trim();

export const EVENTS_FORMAT = `When you mention specific events, end your reply with a machine-readable block:
<events>[{"title": "...", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "startTime": "HH:MM or omit", "endTime": "HH:MM or omit", "place": "venue, city", "priceText": "as listed or omit", "url": "the source page URL", "reason": "one short line on why it fits", "ticketOnSaleDate": "YYYY-MM-DD or omit"}]</events>
Only include events you found in search results, each with the URL of the page you found it on. Never invent events, dates or prices. If you found nothing, say so and use <events>[]</events>.`;
