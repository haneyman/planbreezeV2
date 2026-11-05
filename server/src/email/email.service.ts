import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type {
  CircleRecord,
  Member,
  PlanRecord,
  User,
} from "../../../shared/types.js";
import { JobsService } from "../jobs/jobs.service.js";
import { normalizeEmail } from "../common/validation.js";
import { siteUrl } from "../auth/auth.service.js";
import { esc, sendEmail } from "./send.js";
@Injectable()
export class EmailService implements OnModuleInit {
  constructor(
    @InjectModel("members") private members: Model<Member>,
    @InjectModel("users") private users: Model<User>,
    @InjectModel("circles") private circles: Model<CircleRecord>,
    @InjectModel("plans") private plans: Model<PlanRecord>,
    private jobs: JobsService,
  ) {}
  onModuleInit() {
    this.jobs.register("email.invite", (p) =>
      this.invite(p.memberId!, p.invitedBy!),
    );
    this.jobs.register("email.plan", (p) =>
      this.plan(p.memberId!, p.planId!, p.addedBy!),
    );
  }
  private async context(memberId: string, actorId: string) {
    const member = await this.members.findById(memberId).lean();
    if (!member?.email || member.userId === actorId) return null;
    const circle = await this.circles
      .findOne({ _id: member.circleId, archived: { $ne: true } })
      .lean();
    if (!circle) return null;
    const actor = await this.users.findById(actorId).lean();
    if (normalizeEmail(actor?.email ?? "") === normalizeEmail(member.email))
      return null;
    const registered = !!(await this.users.exists({
      email: normalizeEmail(member.email),
    }));
    return { member, circle, actor: actor?.name ?? "Someone", registered };
  }
  async invite(memberId: string, actorId: string) {
    const c = await this.context(memberId, actorId);
    if (!c || c.registered) return;
    const message = `${c.actor} added you to ${c.circle.name} on PlanBreeze. Register with ${c.member.email} using Google or Apple to see its plans.`;
    const url = new URL("/login", siteUrl()).href;
    await sendEmail(
      c.member.email!,
      `You're invited to ${c.circle.name} on PlanBreeze`,
      `<p>Hi ${esc(c.member.label)},</p><p>${esc(message)}</p><p><a href="${esc(url)}">Register for PlanBreeze</a></p>`,
      `${message}\n${url}`,
    );
  }
  async plan(memberId: string, planId: string, actorId: string) {
    const c = await this.context(memberId, actorId);
    const p = await this.plans.findById(planId).lean();
    if (!c || !p || p.circleId !== c.circle._id) return;
    const message = `${c.actor} added ${p.title} to ${c.circle.name}. ${p.startDate}${p.startTime ? " " + p.startTime : ""} – ${p.endDate}${p.endTime ? " " + p.endTime : ""}. ${p.startTime ? p.timeZone : "All day"}. ${p.place ?? ""}. ${p.status === "radar" ? "On the radar" : "Committed"}.`;
    const invitation = c.registered
      ? "Sign in to view the plan."
      : `Register with ${c.member.email} using Google or Apple to view this circle's plans.`;
    const url = new URL("/login", siteUrl()).href;
    await sendEmail(
      c.member.email!,
      `New plan in ${c.circle.name}: ${p.title}`,
      `<p>Hi ${esc(c.member.label)},</p><p>${esc(message)}</p><p>${esc(invitation)}</p><p><a href="${esc(url)}">Open PlanBreeze</a></p>`,
      `${message}\n${invitation}\n${url}`,
    );
  }
}
