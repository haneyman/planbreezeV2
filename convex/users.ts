import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib";

/** The signed-in user, their Google Calendar connection (without tokens) and inbound address. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const account = await ctx.db
      .query("calendarAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const domain = process.env.INBOUND_EMAIL_DOMAIN ?? "in.planbreeze.com";
    return {
      _id: user._id,
      name: user.name ?? user.email ?? "You",
      email: user.email,
      image: user.image,
      timeZone: user.timeZone,
      homeArea: user.homeArea,
      interests: user.interests ?? [],
      defaultCalendarId: user.defaultCalendarId,
      radarSyncMode: user.radarSyncMode ?? "appOnly",
      inboundAddress: user.inboundAlias ? `${user.inboundAlias}@${domain}` : null,
      google: account
        ? {
            email: account.email,
            status: account.status,
            lastSyncedAt: account.lastSyncedAt,
            calendars: account.calendars,
          }
        : null,
    };
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    timeZone: v.optional(v.string()),
    homeArea: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    defaultCalendarId: v.optional(v.string()),
    radarSyncMode: v.optional(v.union(v.literal("appOnly"), v.literal("warnOnly"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const patch = Object.fromEntries(Object.entries(args).filter(([, val]) => val !== undefined));
    await ctx.db.patch(userId, patch);
  },
});
