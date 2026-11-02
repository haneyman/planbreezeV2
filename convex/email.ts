import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { normalizeEmail } from "./lib";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Disabled until explicitly enabled, so local review cannot accidentally send mail. */
export async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (process.env.EMAIL_ENABLED !== "true") {
    console.info("Email skipped: EMAIL_ENABLED is not true.");
    return;
  }
  const key = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const from = process.env.EMAIL_FROM;
  const region = process.env.MAILGUN_REGION ?? "US";
  if (!key || !domain || !from) throw new Error("Mailgun requires MAILGUN_API_KEY, MAILGUN_DOMAIN and EMAIL_FROM.");
  if (region !== "US" && region !== "EU") throw new Error("MAILGUN_REGION must be US or EU.");
  const body = new FormData();
  for (const [name, value] of Object.entries({ from, to, subject: subject.replace(/[\r\n]/g, " "), html, text })) body.set(name, value);
  if (process.env.EMAIL_REPLY_TO) body.set("h:Reply-To", process.env.EMAIL_REPLY_TO);
  const host = region === "EU" ? "api.eu.mailgun.net" : "api.mailgun.net";
  const response = await fetch(`https://${host}/v3/${encodeURIComponent(domain)}/messages`, {
    method: "POST", headers: { Authorization: `Basic ${btoa(`api:${key}`)}` }, body,
  });
  // Provider responses can contain message contents or addresses; do not log them.
  if (!response.ok) throw new Error(`Mailgun rejected email (HTTP ${response.status}).`);
}

function deliveryEnabled() {
  if (process.env.EMAIL_ENABLED === "true") return true;
  console.info("Email skipped: EMAIL_ENABLED is not true.");
  return false;
}

function loginUrl() {
  const site = process.env.SITE_URL;
  if (!site) throw new Error("SITE_URL is required for email links.");
  const url = new URL("/login", site);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid SITE_URL.");
  return url.href;
}

async function registered(ctx: QueryCtx, email: string, userId?: Id<"users">) {
  return !!(userId && await ctx.db.get(userId)) || !!await ctx.db.query("users").withIndex("email", (q) => q.eq("email", normalizeEmail(email))).first();
}

export const inviteInfo = internalQuery({
  args: { memberId: v.id("members"), invitedBy: v.id("users") },
  handler: async (ctx, { memberId, invitedBy }) => {
    const member = await ctx.db.get(memberId);
    if (!member?.email || await registered(ctx, member.email, member.userId)) return null;
    const circle = await ctx.db.get(member.circleId);
    if (!circle || circle.archived) return null;
    const inviter = await ctx.db.get(invitedBy);
    return { email: member.email, label: member.label, circle: circle.name, inviter: inviter?.name ?? "Someone" };
  },
});

export const sendInvite = internalAction({
  args: { memberId: v.id("members"), invitedBy: v.id("users") },
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(internal.email.inviteInfo, args);
    if (!info || !deliveryEnabled()) return;
    const url = loginUrl();
    const message = `${info.inviter} added you to the ${info.circle} circle on PlanBreeze, a shared planner for family and friends.`;
    const invitation = `Register with ${info.email} using Google or Apple to see the circle's plans. Use the same email address so your membership is linked automatically.`;
    await sendEmail(info.email, `You're invited to ${info.circle} on PlanBreeze`,
      `<p>Hi ${esc(info.label)},</p><p>${esc(message)}</p><p>${esc(invitation)}</p><p><a href="${esc(url)}">Register for PlanBreeze</a></p>`,
      `Hi ${info.label},\n\n${message}\n\n${invitation}\n${url}`);
  },
});

/** Snapshot recipients at the time the plan is added; recheck membership before delivery. */
export async function queueCirclePlanEmails(ctx: MutationCtx, planId: Id<"plans">, circleId: Id<"circles"> | undefined, addedBy: Id<"users">) {
  if (!circleId) return;
  const actor = await ctx.db.get(addedBy);
  const seen = new Set<string>();
  for await (const member of ctx.db.query("members").withIndex("by_circle", (q) => q.eq("circleId", circleId))) {
    if (!member.email || member.userId === addedBy) continue;
    const email = normalizeEmail(member.email);
    if (email === normalizeEmail(actor?.email ?? "") || seen.has(email)) continue;
    seen.add(email);
    await ctx.scheduler.runAfter(0, internal.email.sendPlanAdded, { memberId: member._id, planId, addedBy });
  }
}

export const planEmailInfo = internalQuery({
  args: { memberId: v.id("members"), planId: v.id("plans"), addedBy: v.id("users") },
  handler: async (ctx, { memberId, planId, addedBy }) => {
    const member = await ctx.db.get(memberId);
    const plan = await ctx.db.get(planId);
    if (!member?.email || !plan?.circleId || plan.circleId !== member.circleId || member.userId === addedBy) return null;
    const circle = await ctx.db.get(plan.circleId);
    if (!circle || circle.archived) return null;
    const actor = await ctx.db.get(addedBy);
    if (normalizeEmail(member.email) === normalizeEmail(actor?.email ?? "")) return null;
    return { email: member.email, label: member.label, circle: circle.name, actor: actor?.name ?? "Someone", plan,
      registered: await registered(ctx, member.email, member.userId) };
  },
});

export const sendPlanAdded = internalAction({
  args: { memberId: v.id("members"), planId: v.id("plans"), addedBy: v.id("users") },
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(internal.email.planEmailInfo, args);
    if (!info || !deliveryEnabled()) return;
    const p = info.plan;
    const url = loginUrl();
    const message = `${info.actor} added ${p.title} to ${info.circle} on PlanBreeze.`;
    const details = [
      `${p.startDate}${p.startTime ? ` ${p.startTime}` : ""} – ${p.endDate}${p.endTime ? ` ${p.endTime}` : ""}${p.startTime ? ` (${p.timeZone ?? "UTC"})` : " (all day)"}`,
      p.place, p.status === "radar" ? "On the radar — not yet committed." : "Committed plan.",
    ].filter(Boolean).join("\n");
    const invitation = info.registered ? "Sign in to view the plan." : `You've been added to this circle. Register with ${info.email} using Google or Apple to view its plans. Use the same email address so your membership is linked automatically.`;
    await sendEmail(info.email, `New plan in ${info.circle}: ${p.title}`,
      `<p>Hi ${esc(info.label)},</p><p>${esc(message)}</p><p>${esc(details).replace(/\n/g, "<br>")}</p><p>${esc(invitation)}</p><p><a href="${esc(url)}">${info.registered ? "Open PlanBreeze" : "Register for PlanBreeze"}</a></p>`,
      `Hi ${info.label},\n\n${message}\n\n${details}\n\n${invitation}\n${url}`);
  },
});
