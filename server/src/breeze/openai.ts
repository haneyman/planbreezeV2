import OpenAI from "openai";
import { ServiceUnavailableException } from "@nestjs/common";
import type { EventCandidate } from "../../../shared/types.js";
import { checkEventExtras, isDate, isTime } from "../common/validation.js";
export type { EventCandidate } from "../../../shared/types.js";
export async function callOpenAI(opts: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  webSearch?: { maxUses?: number; location?: string; timeZone?: string };
  maxTokens?: number;
}): Promise<{ text: string; sourceUrls: Set<string> }> {
  if (!process.env.OPENAI_API_KEY)
    throw new ServiceUnavailableException(
      "Breeze is not configured. Add OPENAI_API_KEY on the server.",
    );
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 90000,
    maxRetries: 1,
  });
  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    store: false,
    instructions: opts.system,
    input: opts.messages,
    max_output_tokens: opts.maxTokens ?? 4096,
    ...(opts.webSearch
      ? {
          tools: [{ type: "web_search" as const }],
          tool_choice: "required" as const,
          include: ["web_search_call.action.sources" as const],
          max_tool_calls: opts.webSearch.maxUses ?? 5,
        }
      : {}),
  });
  if (response.status !== "completed")
    throw new Error("AI response was incomplete. Please try again.");
  const sourceUrls = new Set<string>();
  for (const item of response.output) {
    if (item.type === "web_search_call" && item.action.type === "search") {
      for (const source of item.action.sources ?? [])
        if (source.type === "url") sourceUrls.add(source.url);
    }
    if (item.type === "message")
      for (const content of item.content)
        if (content.type === "output_text") {
          for (const annotation of content.annotations)
            if (annotation.type === "url_citation")
              sourceUrls.add(annotation.url);
        }
  }
  return { text: response.output_text, sourceUrls };
}
export function grounded(events: EventCandidate[], sourceUrls: Set<string>) {
  const normalize = (value: string) => {
    try {
      const u = new URL(value);
      if (!["http:", "https:"].includes(u.protocol)) return null;
      u.hash = "";
      u.search = "";
      return u.href.replace(/\/$/, "");
    } catch {
      return null;
    }
  };
  const allowed = new Set([...sourceUrls].map(normalize).filter(Boolean));
  return events.filter(
    (event) => event.url && allowed.has(normalize(event.url)),
  );
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
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const s = (k: string) =>
      typeof r[k] === "string" && (r[k] as string).trim()
        ? (r[k] as string).trim()
        : undefined;
    const title = s("title");
    const startDate = s("startDate");
    const endDate = s("endDate") ?? startDate;
    if (
      !title ||
      !startDate ||
      !endDate ||
      !isDate(startDate) ||
      !isDate(endDate) ||
      endDate < startDate
    )
      continue;
    const startTime = s("startTime");
    const endTime = s("endTime");
    const onSale = s("ticketOnSaleDate");
    const candidate: EventCandidate = {
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
    };
    try {
      checkEventExtras(candidate);
      out.push(candidate);
    } catch {
      continue;
    }
  }
  return out;
}

/** Text after removing the <events> block. */
export const withoutEvents = (text: string) =>
  text.replace(/<events>[\s\S]*?<\/events>/g, "").trim();

export const EVENTS_FORMAT = `When you mention specific events, end your reply with a machine-readable block:
<events>[{"title": "...", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "startTime": "HH:MM or omit", "endTime": "HH:MM or omit", "place": "venue, city", "priceText": "as listed or omit", "url": "the source page URL", "reason": "one short line on why it fits", "ticketOnSaleDate": "YYYY-MM-DD or omit"}]</events>
Only include events you found in search results, each with the URL of the page you found it on. Never invent events, dates or prices. If you found nothing, say so and use <events>[]</events>.`;
