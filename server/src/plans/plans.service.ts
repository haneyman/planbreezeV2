import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { randomUUID } from "node:crypto";
import type {
  CalendarAccount,
  CircleRecord,
  Member,
  Plan,
  PlanRecord,
  User,
} from "../../../shared/types.js";
import { Permissions } from "../common/permissions.js";
import {
  checkDates,
  checkEventExtras,
  checkZone,
  isDate,
} from "../common/validation.js";
import { JobsService } from "../jobs/jobs.service.js";
import { PlanDto, PlanUpdateDto, RangeDto } from "./plans.dto.js";
@Injectable()
export class PlansService {
  constructor(
    @InjectModel("plans") private plans: Model<PlanRecord>,
    @InjectModel("users") private users: Model<User>,
    @InjectModel("calendarAccounts") private accounts: Model<CalendarAccount>,
    @InjectModel("members") private members: Model<Member>,
    private permissions: Permissions,
    private jobs: JobsService,
  ) {}
  async visible(userId: string, from: string, to: string) {
    const circles = await this.permissions.mine(userId);
    return this.plans
      .find({
        $or: [
          { ownerId: userId, circleId: { $exists: false } },
          { circleId: { $in: circles.map((c) => c._id) } },
        ],
        startDate: { $lte: to },
        endDate: { $gte: from },
      })
      .sort({ startDate: 1, _id: 1 })
      .limit(2000)
      .lean();
  }
  async list(userId: string, { from, to }: RangeDto): Promise<Plan[]> {
    if (
      !isDate(from) ||
      !isDate(to) ||
      from > to ||
      Date.parse(to) - Date.parse(from) > 3 * 366 * 86400000
    )
      throw new BadRequestException(
        "Choose a valid range of up to three years.",
      );
    const circles = await this.permissions.mine(userId);
    const byId = new Map(circles.map((c) => [c._id, c]));
    const plans = await this.visible(userId, from, to);
    return Promise.all(
      plans.map(async (p) => {
        const c = p.circleId ? byId.get(p.circleId) : undefined;
        const perms = await this.permissions.plan(p, userId);
        return {
          ...p,
          circleName: c?.name ?? null,
          circleColor: c?.color ?? null,
          canEdit: perms.edit,
          canCommit: perms.commit,
          calendarLabel: await this.label(c, userId),
        };
      }),
    );
  }
  private async label(circle: CircleRecord | undefined, userId: string) {
    const owner = circle?.linkedCalendarId ? circle.ownerId : userId;
    const user = await this.users.findById(userId).lean();
    const a = await this.accounts.findOne({ userId: owner }).lean();
    if (!a)
      return owner === userId
        ? "your calendar (connect Google in Settings)"
        : "the circle's calendar";
    const cal =
      a.calendars.find(
        (c) => c.id === (circle?.linkedCalendarId ?? user?.defaultCalendarId),
      ) ?? a.calendars.find((c) => c.primary);
    return cal ? `${cal.name} calendar` : "your calendar";
  }
  async create(userId: string, dto: PlanDto) {
    checkDates(dto);
    checkEventExtras(dto);
    if (!dto.title.trim())
      throw new BadRequestException("Give the plan a title.");
    if (dto.circleId)
      await this.permissions.circle(
        dto.circleId,
        userId,
        dto.status === "committed" ? "coPlanner" : "contributor",
      );
    const u = await this.users.findById(userId).lean();
    const timeZone = dto.timeZone ?? u?.timeZone ?? "UTC";
    checkZone(timeZone);
    const { reason, ...fields } = dto;
    const p = await this.plans.create({
      ...fields,
      title: dto.title.trim(),
      ownerId: userId,
      timeZone,
      note: dto.note ?? reason,
      source: dto.source ?? "manual",
      ...(dto.status === "committed"
        ? { calendarGeneration: randomUUID() }
        : {}),
    });
    if (p.status === "committed") await this.queueWrite(p._id, userId);
    await this.queueEmails(p._id, dto.circleId, userId);
    return p._id;
  }
  private async editable(planId: string, userId: string, commit = false) {
    const p = await this.plans.findById(planId).lean();
    if (!p) throw new NotFoundException("Plan not found.");
    const perms = await this.permissions.plan(p, userId);
    if (!(commit ? perms.commit : perms.edit))
      throw new ForbiddenException(
        commit
          ? "Only co-planners can commit plans in this circle."
          : "You can't edit this plan.",
      );
    return p;
  }
  async update(userId: string, planId: string, dto: PlanUpdateDto) {
    const p = await this.editable(planId, userId);
    if (dto.title !== undefined && !dto.title.trim())
      throw new BadRequestException("Give the plan a title.");
    if (dto.circleId && dto.circleId !== p.circleId)
      await this.permissions.circle(
        dto.circleId,
        userId,
        p.status === "committed" ? "coPlanner" : "contributor",
      );
    checkDates({ ...p, ...dto });
    checkEventExtras(dto);
    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    for (const [key, value] of Object.entries(dto))
      if (value === null) unset[key] = 1;
      else if (value !== undefined) set[key] = value;
    if (
      dto.circleId !== undefined &&
      dto.circleId !== p.circleId &&
      p.googleEvent
    ) {
      await this.jobs.enqueue("calendar.delete", {
        ...p.googleEvent,
        planId,
      });
      unset.googleEvent = 1;
      set.calendarGeneration = randomUUID();
    }
    await this.plans.updateOne({ _id: planId }, { $set: set, $unset: unset });
    if (dto.circleId && dto.circleId !== p.circleId)
      await this.queueEmails(planId, dto.circleId, userId);
    if (p.status === "committed") await this.queueWrite(planId, userId);
  }
  async remove(userId: string, planId: string) {
    const p = await this.editable(planId, userId);
    if (p.googleEvent)
      await this.jobs.enqueue("calendar.delete", {
        ...p.googleEvent,
        planId,
      });
    await this.plans.deleteOne({ _id: planId });
  }
  async status(userId: string, planId: string, committed: boolean) {
    const p = await this.editable(planId, userId, true);
    if (committed) {
      await this.plans.updateOne(
        { _id: planId },
        {
          $set: {
            status: "committed",
            ...(p.status !== "committed"
              ? { calendarGeneration: randomUUID() }
              : {}),
          },
        },
      );
      await this.queueWrite(planId, userId);
    } else {
      if (p.googleEvent)
        await this.jobs.enqueue("calendar.delete", {
          ...p.googleEvent,
          planId,
        });
      await this.plans.updateOne(
        { _id: planId },
        {
          $set: { status: "radar" },
          $unset: { googleEvent: 1, calendarStatus: 1, calendarError: 1 },
        },
      );
    }
  }
  private async queueWrite(planId: string, committedBy: string) {
    await this.plans.updateOne(
      { _id: planId },
      {
        $set: { calendarStatus: "pending", committedBy },
        $unset: { calendarError: 1 },
      },
    );
    await this.jobs.enqueue("calendar.write", { planId, committedBy });
  }
  private async queueEmails(
    planId: string,
    circleId: string | undefined,
    addedBy: string,
  ) {
    if (!circleId) return;
    const members = await this.members
      .find({ circleId, userId: { $ne: addedBy }, email: { $exists: true } })
      .limit(500)
      .lean();
    for (const m of members)
      await this.jobs.enqueue("email.plan", {
        memberId: m._id,
        planId,
        addedBy,
      });
  }
}
