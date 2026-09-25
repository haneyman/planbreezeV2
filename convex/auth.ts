import Apple from "@auth/core/providers/apple";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { normalizeEmail, randomToken } from "./lib";

// Sign in with Google or Apple. Calendar access is a separate consent step (see google.ts).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, Apple],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId }) {
      await setUpUser(ctx as unknown as MutationCtx, userId as Id<"users">);
    },
  },
});

/** Give new users an inbound email alias and link any circle invites sent to their email. */
async function setUpUser(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) return;
  if (!user.inboundAlias) {
    const base = (user.email ?? "me").split("@")[0]!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "me";
    await ctx.db.patch(userId, { inboundAlias: `${base}-${randomToken(3)}` });
  }
  if (!user.email) return;
  const invites = await ctx.db
    .query("members")
    .withIndex("by_email", (q) => q.eq("email", normalizeEmail(user.email!)))
    .collect();
  for (const m of invites) if (!m.userId) await ctx.db.patch(m._id, { userId });
}
