import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { addDays, decrypt, encrypt, randomToken, requireUserId } from "./lib";

// Google Calendar integration. Calendar consent is separate from sign-in:
// the user clicks "Connect Google Calendar", we store an encrypted refresh token,
// and committed plans are written to the right calendar.

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
].join(" ");

const redirectUri = () => `${process.env.CONVEX_SITE_URL}/google/callback`;
const siteUrl = () => process.env.SITE_URL ?? "http://localhost:3000";
const API = "https://www.googleapis.com/calendar/v3";

function clientCreds() {
  const id = process.env.GOOGLE_CALENDAR_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID;
  const secret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET;
  if (!id || !secret) throw new ConvexError("Google Calendar isn't configured (GOOGLE_CALENDAR_CLIENT_ID / _SECRET).");
  return { id, secret };
}

// Connect / disconnect -----------------------------------------------------------

/** Returns the Google consent URL; the browser navigates there. */
export const startConnect = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const state = randomToken();
    await ctx.db.insert("oauthStates", { userId, state });
    const params = new URLSearchParams({
      client_id: clientCreds().id,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },
});

export const googleCallback = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const back = (status: string) => Response.redirect(`${siteUrl()}/settings?google=${status}`, 302);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back("cancelled");
  const userId = await ctx.runMutation(internal.google.consumeState, { state });
  if (!userId) return back("expired");

  const { id, secret } = clientCreds();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const tokens = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; id_token?: string };
  if (!tokenRes.ok || !tokens.access_token || !tokens.refresh_token) return back("error");

  const email = tokens.id_token ? decodeJwtEmail(tokens.id_token) : undefined;
  const calendars = await listCalendars(tokens.access_token);
  await ctx.runMutation(internal.google.saveAccount, {
    userId,
    email,
    refreshToken: await encrypt(tokens.refresh_token),
    calendars,
  });
  return back("connected");
});

export const consumeState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const row = await ctx.db.query("oauthStates").withIndex("by_state", (q) => q.eq("state", state)).unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (Date.now() - row._creationTime > 15 * 60 * 1000) return null;
    return row.userId;
  },
});

const calendarValidator = v.array(
  v.object({ id: v.string(), name: v.string(), color: v.optional(v.string()), primary: v.optional(v.boolean()), writable: v.boolean() }),
);

export const saveAccount = internalMutation({
  args: { userId: v.id("users"), email: v.optional(v.string()), refreshToken: v.string(), calendars: calendarValidator },
  handler: async (ctx, { userId, email, refreshToken, calendars }) => {
    const existing = await ctx.db.query("calendarAccounts").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    const doc = { userId, provider: "google" as const, email, refreshToken, calendars, status: "ok" as const, lastSyncedAt: Date.now() };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("calendarAccounts", doc);
    const user = await ctx.db.get(userId);
    if (user && !user.defaultCalendarId) {
      const primary = calendars.find((c) => c.primary) ?? calendars.find((c) => c.writable);
      if (primary) await ctx.db.patch(userId, { defaultCalendarId: primary.id });
    }
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const acct = await ctx.db.query("calendarAccounts").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    if (acct) await ctx.db.delete(acct._id);
  },
});

export const refreshCalendars = action({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const token = await accessTokenFor(ctx, userId);
    if (!token) throw new ConvexError("Google Calendar isn't connected.");
    const calendars = await listCalendars(token);
    await ctx.runMutation(internal.google.updateCalendars, { userId, calendars });
  },
});

export const updateCalendars = internalMutation({
  args: { userId: v.id("users"), calendars: calendarValidator },
  handler: async (ctx, { userId, calendars }) => {
    const acct = await ctx.db.query("calendarAccounts").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    if (acct) await ctx.db.patch(acct._id, { calendars, lastSyncedAt: Date.now(), status: "ok" });
  },
});

// Writing events ------------------------------------------------------------------

/** Where a committed plan should go: the circle's linked calendar, else the committer's default. */
export const resolveTarget = internalQuery({
  args: { planId: v.id("plans"), committedBy: v.optional(v.id("users")) },
  handler: async (ctx, { planId, committedBy }) => {
    const plan = await ctx.db.get(planId);
    if (!plan) return null;
    let userId: Id<"users"> = committedBy ?? plan.ownerId;
    let calendarId: string | undefined;
    if (plan.circleId) {
      const circle = await ctx.db.get(plan.circleId);
      if (circle?.linkedCalendarId) {
        userId = circle.ownerId;
        calendarId = circle.linkedCalendarId;
      }
    }
    const user = await ctx.db.get(userId);
    const acct = await ctx.db.query("calendarAccounts").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    if (!acct) return { plan, target: null };
    calendarId ??= user?.defaultCalendarId ?? acct.calendars.find((c) => c.primary)?.id ?? "primary";
    return { plan, target: { userId, calendarId } };
  },
});

export const writeEvent = internalAction({
  args: { planId: v.id("plans"), committedBy: v.optional(v.id("users")) },
  handler: async (ctx, { planId, committedBy }) => {
    const resolved = await ctx.runQuery(internal.google.resolveTarget, { planId, committedBy });
    if (!resolved || resolved.plan.status !== "committed") return;
    const { plan, target } = resolved;
    if (!target) {
      await ctx.runMutation(internal.plans.setCalendarResult, { planId, calendarStatus: "notConnected" });
      return;
    }
    try {
      const token = await accessTokenFor(ctx, target.userId);
      if (!token) throw new Error("Google Calendar needs to be reconnected.");
      const body = JSON.stringify(eventBody(plan));
      const same = plan.googleEvent && plan.googleEvent.calendarId === target.calendarId && plan.googleEvent.userId === target.userId;
      const cal = encodeURIComponent(target.calendarId);
      let res = same
        ? await gfetch(token, `${API}/calendars/${cal}/events/${encodeURIComponent(plan.googleEvent!.eventId)}`, "PATCH", body)
        : null;
      if (!res || res.status === 404 || res.status === 410) {
        if (plan.googleEvent && !same) await deleteGoogleEvent(ctx, plan.googleEvent);
        res = await gfetch(token, `${API}/calendars/${cal}/events`, "POST", body);
      }
      if (!res.ok) throw new Error(`Google Calendar error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const event = (await res.json()) as { id: string };
      await ctx.runMutation(internal.plans.setCalendarResult, {
        planId,
        calendarStatus: "synced",
        googleEvent: { userId: target.userId, calendarId: target.calendarId, eventId: event.id },
      });
    } catch (e) {
      await ctx.runMutation(internal.plans.setCalendarResult, {
        planId,
        calendarStatus: "error",
        calendarError: e instanceof Error ? e.message : String(e),
      });
    }
  },
});

export const deleteEvent = internalAction({
  args: { userId: v.id("users"), calendarId: v.string(), eventId: v.string() },
  handler: async (ctx, ev) => deleteGoogleEvent(ctx, ev),
});

/** Cron: notice PlanBreeze events that were deleted or moved in Google. */
export const syncCommitted = internalAction({
  args: {},
  handler: async (ctx) => {
    const plans = await ctx.runQuery(internal.plans.committedWithEvents, {});
    const tokens = new Map<Id<"users">, string | null>();
    for (const p of plans) {
      const { userId, calendarId, eventId } = p.googleEvent;
      if (!tokens.has(userId)) tokens.set(userId, await accessTokenFor(ctx, userId).catch(() => null));
      const token = tokens.get(userId);
      if (!token) continue;
      const res = await gfetch(token, `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, "GET");
      if (res.status === 404 || res.status === 410) {
        await ctx.runMutation(internal.plans.markExternallyDeleted, { planId: p._id });
        continue;
      }
      if (!res.ok) continue;
      const ev = (await res.json()) as GoogleEvent;
      if (ev.status === "cancelled") {
        await ctx.runMutation(internal.plans.markExternallyDeleted, { planId: p._id });
        continue;
      }
      const dates = fromGoogleTimes(ev);
      if (dates) await ctx.runMutation(internal.google.applyExternalChange, { planId: p._id, title: ev.summary, ...dates });
    }
  },
});

export const applyExternalChange = internalMutation({
  args: {
    planId: v.id("plans"),
    title: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.string(),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
  },
  handler: async (ctx, { planId, ...change }) => {
    const plan = await ctx.db.get(planId);
    if (!plan) return;
    const next = { ...change, title: change.title || plan.title };
    const same = (Object.keys(next) as (keyof typeof next)[]).every((k) => plan[k] === next[k]);
    if (!same) await ctx.db.patch(planId, next);
  },
});

/** Busy intervals across the user's readable Google calendars (for "is everyone free?"). */
export const busyFor = internalAction({
  args: { userId: v.id("users"), timeMin: v.string(), timeMax: v.string() },
  handler: async (ctx, { userId, timeMin, timeMax }): Promise<{ start: string; end: string }[]> => {
    const token = await accessTokenFor(ctx, userId).catch(() => null);
    if (!token) return [];
    const acct = await ctx.runQuery(internal.google.accountFor, { userId });
    const items = (acct?.calendars ?? []).map((c) => ({ id: c.id }));
    const res = await gfetch(token, `${API}/freeBusy`, "POST", JSON.stringify({ timeMin, timeMax, items }));
    if (!res.ok) return [];
    const data = (await res.json()) as { calendars: Record<string, { busy: { start: string; end: string }[] }> };
    return Object.values(data.calendars).flatMap((c) => c.busy ?? []);
  },
});

export const accountFor = internalQuery({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) =>
    ctx.db.query("calendarAccounts").withIndex("by_user", (q) => q.eq("userId", userId)).unique(),
});

export const markNeedsReauth = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const acct = await ctx.db.query("calendarAccounts").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    if (acct) await ctx.db.patch(acct._id, { status: "needsReauth" });
  },
});

// Helpers -----------------------------------------------------------------------------

type ActionCtxLike = { runQuery: any; runMutation: any };

async function accessTokenFor(ctx: ActionCtxLike, userId: Id<"users">): Promise<string | null> {
  const acct: Doc<"calendarAccounts"> | null = await ctx.runQuery(internal.google.accountFor, { userId });
  if (!acct) return null;
  const { id, secret } = clientCreds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: await decrypt(acct.refreshToken),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) await ctx.runMutation(internal.google.markNeedsReauth, { userId });
    return null;
  }
  return ((await res.json()) as { access_token: string }).access_token;
}

async function deleteGoogleEvent(ctx: ActionCtxLike, ev: { userId: Id<"users">; calendarId: string; eventId: string }) {
  const token = await accessTokenFor(ctx, ev.userId);
  if (!token) return;
  await gfetch(token, `${API}/calendars/${encodeURIComponent(ev.calendarId)}/events/${encodeURIComponent(ev.eventId)}`, "DELETE");
}

function gfetch(token: string, url: string, method: string, body?: string) {
  return fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body,
  });
}

async function listCalendars(token: string) {
  const res = await gfetch(token, `${API}/users/me/calendarList?minAccessRole=reader`, "GET");
  if (!res.ok) throw new Error(`Couldn't list calendars (${res.status})`);
  const data = (await res.json()) as {
    items: { id: string; summary: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean; accessRole: string }[];
  };
  return data.items.map((c) => ({
    id: c.id,
    name: c.summaryOverride ?? c.summary,
    color: c.backgroundColor,
    primary: c.primary ?? false,
    writable: c.accessRole === "owner" || c.accessRole === "writer",
  }));
}

function decodeJwtEmail(jwt: string): string | undefined {
  try {
    const payload = JSON.parse(atob((jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
    return payload.email;
  } catch {
    return undefined;
  }
}

function plusHour(t: string) {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h >= 23 ? "23:59" : `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function eventBody(plan: Doc<"plans">) {
  const description = [plan.note, plan.url, "Added from PlanBreeze"].filter(Boolean).join("\n\n");
  const common = {
    summary: plan.title,
    location: plan.place,
    description,
    extendedProperties: { private: { planbreezePlanId: plan._id } },
  };
  if (!plan.startTime) {
    return { ...common, start: { date: plan.startDate }, end: { date: addDays(plan.endDate, 1) } };
  }
  const endTime = plan.endTime ?? plusHour(plan.startTime);
  return {
    ...common,
    start: { dateTime: `${plan.startDate}T${plan.startTime}:00`, timeZone: plan.timeZone },
    end: { dateTime: `${plan.endDate}T${endTime}:00`, timeZone: plan.timeZone },
  };
}

type GoogleEvent = {
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

export function fromGoogleTimes(ev: GoogleEvent) {
  if (ev.start?.date && ev.end?.date) return { startDate: ev.start.date, endDate: addDays(ev.end.date, -1) };
  if (ev.start?.dateTime && ev.end?.dateTime) {
    // dateTime includes the offset of the event's zone, e.g. 2026-10-10T13:00:00-07:00
    return {
      startDate: ev.start.dateTime.slice(0, 10),
      endDate: ev.end.dateTime.slice(0, 10),
      startTime: ev.start.dateTime.slice(11, 16),
      endTime: ev.end.dateTime.slice(11, 16),
    };
  }
  return null;
}
