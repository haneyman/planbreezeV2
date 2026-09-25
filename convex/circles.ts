import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { myCircles, normalizeEmail, requireCircleAccess, requireUserId } from "./lib";
import { access } from "./schema";

const memberInput = v.object({ email: v.optional(v.string()), label: v.string(), access: v.optional(access) });

/** Circles the viewer belongs to, with members. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const mine = await myCircles(ctx, userId);
    return Promise.all(
      mine.map(async ({ circle, member }) => {
        const members = await ctx.db
          .query("members")
          .withIndex("by_circle", (q) => q.eq("circleId", circle._id))
          .collect();
        return {
          _id: circle._id,
          name: circle.name,
          color: circle.color,
          linkedCalendarId: circle.linkedCalendarId ?? null,
          isOwner: circle.ownerId === userId,
          myAccess: member.access,
          members: members.map((m) => ({
            _id: m._id,
            label: m.label,
            email: m.email ?? null,
            access: m.access,
            joined: !!m.userId,
            isMe: m.userId === userId,
          })),
        };
      }),
    );
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    color: v.string(),
    linkedCalendarId: v.optional(v.string()),
    members: v.array(memberInput),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Give the circle a name.");
    const user = await ctx.db.get(userId);
    const circleId = await ctx.db.insert("circles", {
      ownerId: userId,
      name,
      color: args.color,
      linkedCalendarId: args.linkedCalendarId || undefined,
    });
    await ctx.db.insert("members", {
      circleId,
      label: user?.name ?? "Me",
      email: user?.email ? normalizeEmail(user.email) : undefined,
      access: "owner",
      userId,
    });
    for (const m of args.members) await addMemberRow(ctx, circleId, m, userId);
    return circleId;
  },
});

export const update = mutation({
  args: {
    circleId: v.id("circles"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    linkedCalendarId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { circleId, name, color, linkedCalendarId }) => {
    const userId = await requireUserId(ctx);
    const { circle } = await requireCircleAccess(ctx, circleId, userId, "coPlanner");
    if (linkedCalendarId !== undefined && circle.ownerId !== userId)
      throw new ConvexError("Only the circle's owner can change its linked calendar.");
    await ctx.db.patch(circleId, {
      ...(name !== undefined && name.trim() ? { name: name.trim() } : {}),
      ...(color !== undefined ? { color } : {}),
      ...(linkedCalendarId !== undefined ? { linkedCalendarId: linkedCalendarId ?? undefined } : {}),
    });
  },
});

export const archive = mutation({
  args: { circleId: v.id("circles") },
  handler: async (ctx, { circleId }) => {
    const userId = await requireUserId(ctx);
    await requireCircleAccess(ctx, circleId, userId, "owner");
    await ctx.db.patch(circleId, { archived: true });
  },
});

export const addMember = mutation({
  args: { circleId: v.id("circles"), member: memberInput },
  handler: async (ctx, { circleId, member }) => {
    const userId = await requireUserId(ctx);
    await requireCircleAccess(ctx, circleId, userId, "coPlanner");
    return addMemberRow(ctx, circleId, member, userId);
  },
});

export const updateMember = mutation({
  args: { memberId: v.id("members"), label: v.optional(v.string()), access: v.optional(access) },
  handler: async (ctx, { memberId, label, access: newAccess }) => {
    const userId = await requireUserId(ctx);
    const m = await ctx.db.get(memberId);
    if (!m) throw new ConvexError("Member not found.");
    await requireCircleAccess(ctx, m.circleId, userId, "coPlanner");
    if (newAccess === "owner" || (m.access === "owner" && newAccess)) throw new ConvexError("The owner can't be changed here.");
    await ctx.db.patch(memberId, {
      ...(label?.trim() ? { label: label.trim() } : {}),
      ...(newAccess ? { access: newAccess } : {}),
    });
  },
});

export const removeMember = mutation({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const userId = await requireUserId(ctx);
    const m = await ctx.db.get(memberId);
    if (!m) return;
    if (m.access === "owner") throw new ConvexError("The owner can't be removed. Archive the circle instead.");
    if (m.userId !== userId) await requireCircleAccess(ctx, m.circleId, userId, "coPlanner");
    await ctx.db.delete(memberId);
  },
});

async function addMemberRow(
  ctx: MutationCtx,
  circleId: Id<"circles">,
  m: { email?: string; label: string; access?: "owner" | "coPlanner" | "contributor" | "viewer" },
  invitedBy: Id<"users">,
) {
  const email = m.email?.trim() ? normalizeEmail(m.email) : undefined;
  const label = m.label.trim() || email?.split("@")[0] || "";
  if (!label) throw new ConvexError("Each person needs an email or a label.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError(`"${email}" doesn't look like an email address.`);
  const existing = await ctx.db
    .query("members")
    .withIndex("by_circle", (q) => q.eq("circleId", circleId))
    .collect();
  if (email && existing.some((x) => x.email === email)) throw new ConvexError(`${email} is already in this circle.`);
  const user = email
    ? await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).first()
    : null;
  const memberId = await ctx.db.insert("members", {
    circleId,
    label,
    email,
    access: m.access && m.access !== "owner" ? m.access : "contributor",
    userId: user?._id,
    invitedAt: email ? Date.now() : undefined,
  });
  if (email) await ctx.scheduler.runAfter(0, internal.email.sendInvite, { memberId, invitedBy });
  return memberId;
}
