import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";

/**
 * Email via Resend (https://resend.com). If RESEND_API_KEY isn't set, emails are
 * logged instead of sent, so local development works without an email provider.
 */
export async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email not sent: RESEND_API_KEY missing] to=${to} subject=${subject}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "PlanBreeze <hello@planbreeze.com>",
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

export const inviteInfo = internalQuery({
  args: { memberId: v.id("members"), invitedBy: v.id("users") },
  handler: async (ctx, { memberId, invitedBy }) => {
    const member = await ctx.db.get(memberId);
    if (!member?.email) return null;
    const circle = await ctx.db.get(member.circleId);
    const inviter = await ctx.db.get(invitedBy);
    return { email: member.email, label: member.label, circle: circle?.name ?? "a circle", inviter: inviter?.name ?? "Someone" };
  },
});

export const sendInvite = internalAction({
  args: { memberId: v.id("members"), invitedBy: v.id("users") },
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(internal.email.inviteInfo, args);
    if (!info) return;
    const site = process.env.SITE_URL ?? "https://planbreeze.com";
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    await sendEmail(
      info.email,
      `${info.inviter} invited you to ${info.circle} on PlanBreeze`,
      `<p>Hi ${esc(info.label)},</p>
       <p>${esc(info.inviter)} added you to the <strong>${esc(info.circle)}</strong> circle on PlanBreeze, a shared planner for family and friends.</p>
       <p><a href="${site}/login">Sign in with this email address</a> to see the circle's plans.</p>`,
    );
  },
});
