import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;
export type Access = Doc<"members">["access"];

export async function requireUserId(ctx: { auth: QueryCtx["auth"] }): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx as QueryCtx);
  if (!userId) throw new ConvexError("Please sign in.");
  return userId;
}

/** The viewer's membership row in a circle, or null. */
export async function membershipOf(ctx: Ctx, circleId: Id<"circles">, userId: Id<"users">) {
  const rows = await ctx.db
    .query("members")
    .withIndex("by_circle", (q) => q.eq("circleId", circleId))
    .collect();
  return rows.find((m) => m.userId === userId) ?? null;
}

const rank: Record<Access, number> = { viewer: 0, contributor: 1, coPlanner: 2, owner: 3 };

export async function requireCircleAccess(
  ctx: Ctx,
  circleId: Id<"circles">,
  userId: Id<"users">,
  atLeast: Access,
) {
  const circle = await ctx.db.get(circleId);
  if (!circle || circle.archived) throw new ConvexError("Circle not found.");
  const m = await membershipOf(ctx, circleId, userId);
  if (!m || rank[m.access] < rank[atLeast]) throw new ConvexError("You don't have access to do that in this circle.");
  return { circle, member: m };
}

/** Circles the user belongs to (any access level). */
export async function myCircles(ctx: Ctx, userId: Id<"users">) {
  const rows = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const circles = await Promise.all(rows.map((m) => ctx.db.get(m.circleId)));
  return rows
    .map((m, i) => ({ member: m, circle: circles[i] }))
    .filter((x): x is { member: Doc<"members">; circle: Doc<"circles"> } => !!x.circle && !x.circle.archived);
}

/** Can the user see / edit / commit this plan? */
export async function planPermissions(ctx: Ctx, plan: Doc<"plans">, userId: Id<"users">) {
  if (!plan.circleId) {
    const mine = plan.ownerId === userId;
    return { view: mine, edit: mine, commit: mine, access: mine ? ("owner" as Access) : null };
  }
  const m = await membershipOf(ctx, plan.circleId, userId);
  if (!m) return { view: false, edit: false, commit: false, access: null };
  const r = rank[m.access];
  const ownRadar = plan.ownerId === userId && plan.status === "radar";
  return {
    view: true,
    edit: r >= rank.coPlanner || (r >= rank.contributor && ownRadar),
    commit: r >= rank.coPlanner,
    access: m.access,
  };
}

// Dates ---------------------------------------------------------------------

export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
export const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function checkDates(p: { startDate: string; endDate: string; startTime?: string; endTime?: string }) {
  if (!isDate(p.startDate) || !isDate(p.endDate)) throw new ConvexError("Dates must be YYYY-MM-DD.");
  if (p.endDate < p.startDate) throw new ConvexError("The end date is before the start date.");
  if (p.startTime && !isTime(p.startTime)) throw new ConvexError("Start time must be HH:MM.");
  if (p.endTime && !isTime(p.endTime)) throw new ConvexError("End time must be HH:MM.");
}

export function addDays(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const overlaps = (a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) =>
  a.startDate <= b.endDate && b.startDate <= a.endDate;

export function dedupeKey(e: { title: string; startDate: string }) {
  return e.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + "|" + e.startDate;
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

// Token encryption (AES-256-GCM, key from TOKEN_ENCRYPTION_KEY, base64 32 bytes) --

async function key() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encrypt(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(plain));
  return b64(iv) + "." + b64(ct);
}

export async function decrypt(stored: string) {
  const [iv = "", ct = ""] = stored.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ct));
  return new TextDecoder().decode(pt);
}

export function randomToken(bytes = 16) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}
