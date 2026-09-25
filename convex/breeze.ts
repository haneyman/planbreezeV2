import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { callClaude, EVENTS_FORMAT, parseEvents, withoutEvents, type EventCandidate } from "./claude";
import { addDays, dedupeKey, myCircles, overlaps, requireCircleAccess, requireUserId } from "./lib";
import { eventCandidate } from "./schema";

// Breeze: the chat assistant, standing searches and the Discover feed.

// Chat ---------------------------------------------------------------------------------

export const chats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return (await ctx.db.query("chats").withIndex("by_user", (q) => q.eq("userId", userId)).order("desc").take(20));
  },
});

export const messages = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    const userId = await requireUserId(ctx);
    const chat = await ctx.db.get(chatId);
    if (!chat || chat.userId !== userId) return [];
    return ctx.db.query("messages").withIndex("by_chat", (q) => q.eq("chatId", chatId)).collect();
  },
});

/** Post a question; the answer arrives reactively when the background action finishes. */
export const send = mutation({
  args: { chatId: v.optional(v.id("chats")), text: v.string() },
  handler: async (ctx, { chatId, text }) => {
    const userId = await requireUserId(ctx);
    const q = text.trim();
    if (!q) throw new ConvexError("Ask Breeze something.");
    if (chatId) {
      const chat = await ctx.db.get(chatId);
      if (!chat || chat.userId !== userId) throw new ConvexError("Chat not found.");
    } else {
      chatId = await ctx.db.insert("chats", { userId, title: q.slice(0, 60) });
    }
    await ctx.db.insert("messages", { chatId, role: "user", text: q });
    const replyId = await ctx.db.insert("messages", { chatId, role: "assistant", text: "", pending: true });
    await ctx.scheduler.runAfter(0, internal.breeze.respond, { userId, chatId, replyId });
    return chatId;
  },
});

export const respond = internalAction({
  args: { userId: v.id("users"), chatId: v.id("chats"), replyId: v.id("messages") },
  handler: async (ctx, { userId, chatId, replyId }) => {
    try {
      const c = await ctx.runQuery(internal.breeze.context, { userId, chatId });
      const history = c.history.filter((m) => !m.pending && m.text);
      const { text, sourceUrls } = await callClaude({
        system: `You are Breeze, the planning assistant inside PlanBreeze, a shared planner for families and friends.
Today is ${c.today}. The user is ${c.name}${c.homeArea ? `, based near ${c.homeArea}` : ""}. Time zone: ${c.timeZone}.
Their circles: ${c.circles || "none yet"}.
Their interests: ${c.interests || "not set"}.
Their plans for the next 90 days (status, dates, title, circle):
${c.plans || "(none)"}
Be brief, warm and concrete. Use web search to find real, current events. Check fit against the plans above.
You can't book, buy or message anyone; the user adds things with buttons in the app.
${EVENTS_FORMAT}`,
        messages: history.map((m) => ({ role: m.role, content: m.text })),
        webSearch: { maxUses: 5, location: c.homeArea, timeZone: c.timeZone },
      });
      const events = grounded(parseEvents(text), sourceUrls);
      const fits = await fitFor(ctx, userId, events);
      await ctx.runMutation(internal.breeze.saveReply, {
        replyId,
        text: withoutEvents(text) || (events.length ? "Here's what I found." : "I couldn't find anything that fits."),
        events: events.map((e, i) => ({ ...e, fit: fits[i] })),
      });
    } catch (e) {
      await ctx.runMutation(internal.breeze.saveReply, {
        replyId,
        text: e instanceof ConvexError ? String(e.data) : "Sorry, something went wrong. Please try again.",
        events: [],
      });
    }
  },
});

export const context = internalQuery({
  args: { userId: v.id("users"), chatId: v.optional(v.id("chats")) },
  handler: async (ctx, { userId, chatId }) => {
    const user = await ctx.db.get(userId);
    const timeZone = user?.timeZone ?? "UTC";
    const today = localToday(timeZone);
    const circles = await myCircles(ctx, userId);
    const plans = await visiblePlans(ctx, userId, today, addDays(today, 90));
    const names = new Map(circles.map((c) => [c.circle._id, c.circle.name]));
    const history = chatId
      ? await ctx.db.query("messages").withIndex("by_chat", (q) => q.eq("chatId", chatId)).collect()
      : [];
    return {
      today,
      timeZone,
      name: user?.name ?? "the user",
      homeArea: user?.homeArea,
      interests: (user?.interests ?? []).join(", "),
      circles: circles.map((c) => c.circle.name).join(", "),
      plans: plans
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map((p) => `- ${p.status}, ${p.startDate}${p.endDate !== p.startDate ? ` to ${p.endDate}` : ""}: ${p.title} (${p.circleId ? names.get(p.circleId) : "just me"})`)
        .join("\n"),
      history: history.slice(-12).map((m) => ({ role: m.role, text: m.text, pending: m.pending })),
    };
  },
});

export const saveReply = internalMutation({
  args: {
    replyId: v.id("messages"),
    text: v.string(),
    events: v.array(v.object({ ...eventCandidate.fields, fit: v.optional(v.string()) })),
  },
  handler: async (ctx, { replyId, text, events }) => {
    await ctx.db.patch(replyId, { text, events, pending: false });
  },
});

// Standing searches -------------------------------------------------------------------

export const searches = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return ctx.db.query("standingSearches").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
  },
});

export const addSearch = mutation({
  args: { query: v.string(), circleId: v.optional(v.id("circles")) },
  handler: async (ctx, { query: q, circleId }) => {
    const userId = await requireUserId(ctx);
    if (!q.trim()) throw new ConvexError("Describe what Breeze should look for.");
    if (circleId) await requireCircleAccess(ctx, circleId, userId, "viewer");
    const id = await ctx.db.insert("standingSearches", { userId, query: q.trim().slice(0, 200), circleId, enabled: true });
    await ctx.scheduler.runAfter(0, internal.breeze.runSearch, { searchId: id });
    return id;
  },
});

export const setSearchEnabled = mutation({
  args: { searchId: v.id("standingSearches"), enabled: v.boolean() },
  handler: async (ctx, { searchId, enabled }) => {
    const userId = await requireUserId(ctx);
    const s = await ctx.db.get(searchId);
    if (!s || s.userId !== userId) throw new ConvexError("Search not found.");
    await ctx.db.patch(searchId, { enabled });
  },
});

export const removeSearch = mutation({
  args: { searchId: v.id("standingSearches") },
  handler: async (ctx, { searchId }) => {
    const userId = await requireUserId(ctx);
    const s = await ctx.db.get(searchId);
    if (s?.userId === userId) await ctx.db.delete(searchId);
  },
});

export const runSearchNow = action({
  args: { searchId: v.id("standingSearches") },
  handler: async (ctx, { searchId }) => {
    const userId = await requireUserId(ctx);
    const s = await ctx.runQuery(internal.breeze.searchInternal, { searchId });
    if (!s || s.userId !== userId) throw new ConvexError("Search not found.");
    await ctx.runAction(internal.breeze.runSearch, { searchId });
  },
});

export const searchInternal = internalQuery({
  args: { searchId: v.id("standingSearches") },
  handler: (ctx, { searchId }) => ctx.db.get(searchId),
});

export const enabledSearches = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("standingSearches").collect()).filter((s) => s.enabled),
});

/** Run one standing search and store new suggestions. */
export const runSearch = internalAction({
  args: { searchId: v.id("standingSearches") },
  handler: async (ctx, { searchId }) => {
    const s = await ctx.runQuery(internal.breeze.searchInternal, { searchId });
    if (!s || !s.enabled) return;
    const c = await ctx.runQuery(internal.breeze.context, { userId: s.userId });
    const { text, sourceUrls } = await callClaude({
      system: `You find real upcoming events for PlanBreeze users. Today is ${c.today}. The user is based near ${c.homeArea ?? "an unknown area"}.
Their interests: ${c.interests || "not set"}. Their existing plans (skip anything already listed, and prefer dates that are free):
${c.plans || "(none)"}
Return 3 to 6 events. ${EVENTS_FORMAT}`,
      messages: [{ role: "user", content: `Standing search: ${s.query}` }],
      webSearch: { maxUses: 4, location: c.homeArea, timeZone: c.timeZone },
    });
    const events = grounded(parseEvents(text), sourceUrls).filter((e) => e.endDate >= c.today);
    const fits = await fitFor(ctx, s.userId, events);
    await ctx.runMutation(internal.breeze.saveSuggestions, {
      userId: s.userId,
      searchId,
      items: events.map((event, i) => ({ event, fit: fits[i] })),
    });
  },
});

export const saveSuggestions = internalMutation({
  args: {
    userId: v.id("users"),
    searchId: v.optional(v.id("standingSearches")),
    items: v.array(v.object({ event: eventCandidate, fit: v.optional(v.string()) })),
  },
  handler: async (ctx, { userId, searchId, items }) => {
    const plans = await visiblePlans(ctx, userId, "0000-01-01", "9999-12-31");
    const planKeys = new Set(plans.map((p) => dedupeKey(p)));
    for (const { event, fit } of items) {
      const key = dedupeKey(event);
      if (planKeys.has(key)) continue;
      const existing = await ctx.db
        .query("suggestions")
        .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("dedupeKey", key))
        .first();
      if (existing) continue;
      await ctx.db.insert("suggestions", { userId, searchId, event, fit, dedupeKey: key, state: "new" });
    }
    if (searchId) await ctx.db.patch(searchId, { lastRunAt: Date.now() });
  },
});

/** Cron: run every enabled standing search. */
export const runDiscovery = internalAction({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.runQuery(internal.breeze.enabledSearches, {});
    const dayAgo = Date.now() - 20 * 60 * 60 * 1000;
    for (const s of all.filter((x) => !x.lastRunAt || x.lastRunAt < dayAgo).slice(0, 25)) {
      try {
        await ctx.runAction(internal.breeze.runSearch, { searchId: s._id });
      } catch (e) {
        console.error("standing search failed", s._id, e);
      }
    }
  },
});

// Suggestions (Discover) ---------------------------------------------------------------

export const suggestions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const today = localToday((await ctx.db.get(userId))?.timeZone ?? "UTC");
    const rows = await ctx.db
      .query("suggestions")
      .withIndex("by_user_state", (q) => q.eq("userId", userId).eq("state", "new"))
      .collect();
    const searches = await ctx.db.query("standingSearches").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const byId = new Map(searches.map((s) => [s._id, s]));
    return rows
      .filter((r) => r.event.endDate >= today)
      .sort((a, b) => a.event.startDate.localeCompare(b.event.startDate))
      .map((r) => ({
        _id: r._id,
        event: r.event,
        fit: r.fit,
        searchQuery: r.searchId ? byId.get(r.searchId)?.query ?? null : null,
        circleId: r.searchId ? byId.get(r.searchId)?.circleId ?? null : null,
      }));
  },
});

export const addSuggestionToRadar = mutation({
  args: { suggestionId: v.id("suggestions"), circleId: v.optional(v.id("circles")) },
  handler: async (ctx, { suggestionId, circleId }) => {
    const userId = await requireUserId(ctx);
    const s = await ctx.db.get(suggestionId);
    if (!s || s.userId !== userId) throw new ConvexError("Suggestion not found.");
    const planId = await insertRadarPlan(ctx, userId, s.event, circleId, "discover");
    await ctx.db.patch(suggestionId, { state: "added" });
    return planId;
  },
});

export const dismissSuggestion = mutation({
  args: { suggestionId: v.id("suggestions") },
  handler: async (ctx, { suggestionId }) => {
    const userId = await requireUserId(ctx);
    const s = await ctx.db.get(suggestionId);
    if (s?.userId === userId) await ctx.db.patch(suggestionId, { state: "dismissed" });
  },
});

/** Add an event from a chat answer to the radar. */
export const addEventToRadar = mutation({
  args: { event: eventCandidate, circleId: v.optional(v.id("circles")) },
  handler: async (ctx, { event, circleId }) => {
    const userId = await requireUserId(ctx);
    return insertRadarPlan(ctx, userId, event, circleId, "breeze");
  },
});

// Helpers ------------------------------------------------------------------------------

async function insertRadarPlan(
  ctx: MutationCtx,
  userId: Id<"users">,
  e: EventCandidate,
  circleId: Id<"circles"> | undefined,
  source: "breeze" | "discover",
) {
  if (circleId) await requireCircleAccess(ctx, circleId, userId, "contributor");
  const user = await ctx.db.get(userId);
  return ctx.db.insert("plans", {
    ownerId: userId,
    circleId,
    title: e.title,
    status: "radar",
    startDate: e.startDate,
    endDate: e.endDate,
    startTime: e.startTime,
    endTime: e.endTime,
    timeZone: user?.timeZone ?? "UTC",
    place: e.place,
    url: e.url,
    priceText: e.priceText,
    ticketOnSaleDate: e.ticketOnSaleDate,
    note: e.reason,
    source,
  });
}

/** Keep only events whose URL came back from web search (no invented events). */
function grounded(events: EventCandidate[], sourceUrls: Set<string>) {
  const norm = (u: string) => u.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
  const allowed = new Set([...sourceUrls].map(norm));
  return events.filter((e) => e.url && (allowed.has(norm(e.url)) || [...allowed].some((a) => norm(e.url!).startsWith(a))));
}

async function fitFor(ctx: { runQuery: any; runAction: any }, userId: Id<"users">, events: EventCandidate[]) {
  if (!events.length) return [];
  const min = events.reduce((m, e) => (e.startDate < m ? e.startDate : m), events[0]!.startDate);
  const max = events.reduce((m, e) => (e.endDate > m ? e.endDate : m), events[0]!.endDate);
  const overlapsByEvent: string[][] = await ctx.runQuery(internal.breeze.planOverlaps, { userId, events: events.map(({ startDate, endDate }) => ({ startDate, endDate })) });
  const busy: { start: string; end: string }[] = await ctx.runAction(internal.google.busyFor, {
    userId,
    timeMin: `${min}T00:00:00Z`,
    timeMax: `${addDays(max, 1)}T00:00:00Z`,
  });
  return events.map((e, i) => {
    const hits = overlapsByEvent[i] ?? [];
    if (hits.length) return `Overlaps ${hits.slice(0, 2).join(" and ")}`;
    const busyThatDay = busy.some((b) => b.start.slice(0, 10) <= e.endDate && b.end.slice(0, 10) >= e.startDate);
    return busyThatDay ? "Something's on your calendar that day" : "Nothing planned that day";
  });
}

export const planOverlaps = internalQuery({
  args: { userId: v.id("users"), events: v.array(v.object({ startDate: v.string(), endDate: v.string() })) },
  handler: async (ctx, { userId, events }) => {
    const plans = await visiblePlans(ctx, userId, "0000-01-01", "9999-12-31");
    return events.map((e) => plans.filter((p) => p.status === "committed" && overlaps(p, e)).map((p) => p.title));
  },
});

async function visiblePlans(ctx: QueryCtx, userId: Id<"users">, from: string, to: string) {
  const mine = await ctx.db.query("plans").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect();
  const circles = await myCircles(ctx, userId);
  const circlePlans = (
    await Promise.all(circles.map(({ circle }) => ctx.db.query("plans").withIndex("by_circle", (q) => q.eq("circleId", circle._id)).collect()))
  ).flat();
  return [...mine.filter((p) => !p.circleId), ...circlePlans].filter((p) => overlaps(p, { startDate: from, endDate: to }));
}

export function localToday(timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
