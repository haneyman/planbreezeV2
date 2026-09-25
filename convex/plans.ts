import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { checkDates, myCircles, overlaps, planPermissions, requireCircleAccess, requireUserId } from "./lib";
import { planStatus } from "./schema";

const planFields = {
  title: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  startTime: v.optional(v.string()),
  endTime: v.optional(v.string()),
  timeZone: v.optional(v.string()),
  place: v.optional(v.string()),
  url: v.optional(v.string()),
  note: v.optional(v.string()),
  priceText: v.optional(v.string()),
  ticketOnSaleDate: v.optional(v.string()),
};

/** Every plan the viewer can see that overlaps [from, to]. */
export const list = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const userId = await requireUserId(ctx);
    const range = { startDate: from, endDate: to };
    const mine = await ctx.db.query("plans").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect();
    const circles = await myCircles(ctx, userId);
    const circlePlans = (
      await Promise.all(
        circles.map(({ circle }) =>
          ctx.db.query("plans").withIndex("by_circle", (q) => q.eq("circleId", circle._id)).collect(),
        ),
      )
    ).flat();
    const plans = [...mine.filter((p) => !p.circleId), ...circlePlans].filter((p) => overlaps(p, range));
    const byCircle = new Map(circles.map((c) => [c.circle._id, c]));
    return Promise.all(
      plans.map(async (p) => {
        const c = p.circleId ? byCircle.get(p.circleId) : undefined;
        const perms = await planPermissions(ctx, p, userId);
        return {
          ...p,
          circleName: c?.circle.name ?? null,
          circleColor: c?.circle.color ?? null,
          canEdit: perms.edit,
          canCommit: perms.commit,
          calendarLabel: await targetCalendarLabel(ctx, p, userId),
        };
      }),
    );
  },
});

export const create = mutation({
  args: { ...planFields, circleId: v.optional(v.id("circles")), status: planStatus, source: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    checkDates(args);
    if (!args.title.trim()) throw new ConvexError("Give the plan a title.");
    if (args.circleId)
      await requireCircleAccess(ctx, args.circleId, userId, args.status === "committed" ? "coPlanner" : "contributor");
    const user = await ctx.db.get(userId);
    const source = (["manual", "capture", "email", "breeze", "discover"] as const).find((s) => s === args.source) ?? "manual";
    const planId = await ctx.db.insert("plans", {
      ...args,
      title: args.title.trim(),
      source,
      ownerId: userId,
      timeZone: args.timeZone ?? user?.timeZone ?? "UTC",
    });
    if (args.status === "committed") await queueCalendarWrite(ctx, planId);
    return planId;
  },
});

export const update = mutation({
  args: {
    planId: v.id("plans"),
    title: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    startTime: v.optional(v.union(v.string(), v.null())),
    endTime: v.optional(v.union(v.string(), v.null())),
    place: v.optional(v.string()),
    url: v.optional(v.string()),
    note: v.optional(v.string()),
    priceText: v.optional(v.string()),
    ticketOnSaleDate: v.optional(v.string()),
    circleId: v.optional(v.union(v.id("circles"), v.null())),
  },
  handler: async (ctx, { planId, circleId, ...fields }) => {
    const userId = await requireUserId(ctx);
    const plan = await loadEditable(ctx, planId, userId);
    const { startTime, endTime, ...rest } = fields;
    const patch: Partial<Doc<"plans">> = Object.fromEntries(
      Object.entries(rest).filter(([, val]) => val !== undefined),
    );
    // null clears a time (the plan becomes all-day)
    if (startTime !== undefined) patch.startTime = startTime ?? undefined;
    if (endTime !== undefined) patch.endTime = endTime ?? undefined;
    if (patch.title !== undefined && !patch.title.trim()) throw new ConvexError("Give the plan a title.");
    if (circleId !== undefined) {
      if (circleId) await requireCircleAccess(ctx, circleId, userId, "contributor");
      patch.circleId = circleId ?? undefined;
    }
    checkDates({ ...plan, ...patch });
    await ctx.db.patch(planId, patch);
    if (plan.status === "committed") {
      // Moving circles can change the target calendar, so remove the old event and write a new one.
      if (circleId !== undefined && plan.googleEvent) {
        await ctx.scheduler.runAfter(0, internal.google.deleteEvent, { ...plan.googleEvent });
        await ctx.db.patch(planId, { googleEvent: undefined });
      }
      await queueCalendarWrite(ctx, planId);
    }
  },
});

export const remove = mutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const userId = await requireUserId(ctx);
    const plan = await loadEditable(ctx, planId, userId);
    if (plan.googleEvent) await ctx.scheduler.runAfter(0, internal.google.deleteEvent, { ...plan.googleEvent });
    await ctx.db.delete(planId);
  },
});

export const commit = mutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const userId = await requireUserId(ctx);
    const plan = await ctx.db.get(planId);
    if (!plan) throw new ConvexError("Plan not found.");
    const perms = await planPermissions(ctx, plan, userId);
    if (!perms.commit) throw new ConvexError("Only co-planners can commit plans in this circle.");
    await ctx.db.patch(planId, { status: "committed" });
    await queueCalendarWrite(ctx, planId, userId);
  },
});

export const uncommit = mutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const userId = await requireUserId(ctx);
    const plan = await ctx.db.get(planId);
    if (!plan) throw new ConvexError("Plan not found.");
    const perms = await planPermissions(ctx, plan, userId);
    if (!perms.commit) throw new ConvexError("Only co-planners can change this plan.");
    if (plan.googleEvent) await ctx.scheduler.runAfter(0, internal.google.deleteEvent, { ...plan.googleEvent });
    await ctx.db.patch(planId, { status: "radar", googleEvent: undefined, calendarStatus: undefined, calendarError: undefined });
  },
});

// Internal helpers used by google.ts --------------------------------------------

export const getInternal = internalQuery({
  args: { planId: v.id("plans") },
  handler: (ctx, { planId }) => ctx.db.get(planId),
});

export const setCalendarResult = internalMutation({
  args: {
    planId: v.id("plans"),
    calendarStatus: v.union(v.literal("synced"), v.literal("notConnected"), v.literal("error")),
    calendarError: v.optional(v.string()),
    googleEvent: v.optional(v.object({ userId: v.id("users"), calendarId: v.string(), eventId: v.string() })),
  },
  handler: async (ctx, { planId, ...result }) => {
    if (!(await ctx.db.get(planId))) return;
    await ctx.db.patch(planId, result);
  },
});

/** Called by the sync job when a PlanBreeze event was deleted in Google: back to the radar. */
export const markExternallyDeleted = internalMutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get(planId);
    if (!plan || plan.status !== "committed") return;
    await ctx.db.patch(planId, {
      status: "radar",
      googleEvent: undefined,
      calendarStatus: undefined,
      note: [plan.note, "Moved back to the radar because the calendar event was deleted."].filter(Boolean).join("\n"),
    });
  },
});

export const committedWithEvents = internalQuery({
  args: {},
  handler: async (ctx) => {
    const plans = await ctx.db.query("plans").withIndex("by_status", (q) => q.eq("status", "committed")).collect();
    return plans.filter((p) => p.googleEvent).map((p) => ({ _id: p._id, googleEvent: p.googleEvent! }));
  },
});

// ------------------------------------------------------------------------------

async function loadEditable(ctx: MutationCtx, planId: Id<"plans">, userId: Id<"users">) {
  const plan = await ctx.db.get(planId);
  if (!plan) throw new ConvexError("Plan not found.");
  const perms = await planPermissions(ctx, plan, userId);
  if (!perms.edit) throw new ConvexError("You can't edit this plan.");
  return plan;
}

async function queueCalendarWrite(ctx: MutationCtx, planId: Id<"plans">, committedBy?: Id<"users">) {
  await ctx.db.patch(planId, { calendarStatus: "pending", calendarError: undefined });
  await ctx.scheduler.runAfter(0, internal.google.writeEvent, { planId, committedBy });
}

/** Human label for where a commit will go, e.g. "Family calendar" or "your default calendar". */
async function targetCalendarLabel(ctx: QueryCtx, plan: Doc<"plans">, userId: Id<"users">) {
  let owner: Id<"users"> = userId;
  let calendarId: string | undefined;
  if (plan.circleId) {
    const circle = await ctx.db.get(plan.circleId);
    if (circle?.linkedCalendarId) {
      owner = circle.ownerId;
      calendarId = circle.linkedCalendarId;
    }
  }
  if (!calendarId) calendarId = (await ctx.db.get(userId))?.defaultCalendarId;
  const account = await ctx.db.query("calendarAccounts").withIndex("by_user", (q) => q.eq("userId", owner)).unique();
  if (!account) return owner === userId ? "your calendar (connect Google in Settings)" : "the circle's calendar";
  const cal = account.calendars.find((c) => c.id === calendarId) ?? account.calendars.find((c) => c.primary);
  return cal ? `${cal.name} calendar` : "your calendar";
}
