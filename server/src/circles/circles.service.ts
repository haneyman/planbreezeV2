import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type {
  CalendarAccount,
  Circle,
  CircleRecord,
  Member,
  User,
} from "../../../shared/types.js";
import { Permissions } from "../common/permissions.js";
import { normalizeEmail } from "../common/validation.js";
import { JobsService } from "../jobs/jobs.service.js";
import {
  CircleDto,
  CircleUpdateDto,
  MemberDto,
  MemberUpdateDto,
} from "./circles.dto.js";
@Injectable()
export class CirclesService {
  constructor(
    @InjectModel("circles") private circles: Model<CircleRecord>,
    @InjectModel("members") private members: Model<Member>,
    @InjectModel("users") private users: Model<User>,
    @InjectModel("calendarAccounts") private accounts: Model<CalendarAccount>,
    private permissions: Permissions,
    private jobs: JobsService,
  ) {}
  async list(userId: string): Promise<Circle[]> {
    const circles = await this.permissions.mine(userId);
    return Promise.all(
      circles.map(async (c) => {
        const members = await this.members
          .find({ circleId: c._id })
          .limit(500)
          .lean();
        return {
          _id: c._id,
          name: c.name,
          color: c.color,
          linkedCalendarId: c.linkedCalendarId ?? null,
          isOwner: c.ownerId === userId,
          myAccess: members.find((m) => m.userId === userId)!.access,
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
  }
  private async calendar(userId: string, id?: string | null) {
    if (!id) return;
    const a = await this.accounts.findOne({ userId }).lean();
    if (!a?.calendars.some((c) => c.id === id && c.writable))
      throw new BadRequestException("Choose a writable calendar.");
  }
  async create(userId: string, dto: CircleDto) {
    if (!dto.name.trim())
      throw new BadRequestException("Give the circle a name.");
    await this.calendar(userId, dto.linkedCalendarId);
    const u = await this.users.findById(userId).lean();
    const emails = new Set<string>(u?.email ? [normalizeEmail(u.email)] : []);
    for (const member of dto.members) {
      const email = member.email ? normalizeEmail(member.email) : undefined;
      if (!member.label.trim() && !email)
        throw new BadRequestException("Each person needs an email or a label.");
      if (email && emails.has(email))
        throw new BadRequestException("This email is already in this circle.");
      if (email) emails.add(email);
    }

    const c = await this.circles.create({
      ownerId: userId,
      name: dto.name.trim(),
      color: dto.color,
      linkedCalendarId: dto.linkedCalendarId || undefined,
    });
    await this.members.create({
      circleId: c._id,
      label: u?.name ?? "Me",
      email: u?.email,
      userId,
      access: "owner",
    });
    for (const m of dto.members) await this.addRow(c._id, m, userId);
    return c._id;
  }
  async update(userId: string, circleId: string, dto: CircleUpdateDto) {
    const { circle } = await this.permissions.circle(
      circleId,
      userId,
      "coPlanner",
    );
    if (dto.linkedCalendarId !== undefined) {
      if (circle.ownerId !== userId)
        throw new ForbiddenException(
          "Only the owner can change its linked calendar.",
        );
      await this.calendar(userId, dto.linkedCalendarId);
    }
    if (dto.name !== undefined && !dto.name.trim())
      throw new BadRequestException("Give the circle a name.");
    const { linkedCalendarId, ...rest } = dto;
    await this.circles.updateOne(
      { _id: circleId },
      {
        $set: {
          ...rest,
          ...(rest.name ? { name: rest.name.trim() } : {}),
          ...(linkedCalendarId ? { linkedCalendarId } : {}),
        },
        ...(linkedCalendarId === null || linkedCalendarId === ""
          ? { $unset: { linkedCalendarId: 1 } }
          : {}),
      },
    );
  }
  async archive(userId: string, circleId: string) {
    await this.permissions.circle(circleId, userId, "owner");
    await this.circles.updateOne(
      { _id: circleId },
      { $set: { archived: true } },
    );
  }
  async add(userId: string, circleId: string, member: MemberDto) {
    await this.permissions.circle(circleId, userId, "coPlanner");
    return this.addRow(circleId, member, userId);
  }
  private async addRow(circleId: string, dto: MemberDto, invitedBy: string) {
    const email = dto.email ? normalizeEmail(dto.email) : undefined;
    const label = dto.label.trim() || email?.split("@")[0];
    if (!label)
      throw new BadRequestException("Each person needs an email or a label.");
    if (email && (await this.members.exists({ circleId, email })))
      throw new BadRequestException("This email is already in this circle.");
    const user = email ? await this.users.findOne({ email }).lean() : null;
    const m = await this.members.create({
      circleId,
      label,
      email,
      access: dto.access ?? "contributor",
      userId: user?._id,
      invitedAt: email ? Date.now() : undefined,
    });
    if (email && !user)
      await this.jobs.enqueue("email.invite", { memberId: m._id, invitedBy });
    return m._id;
  }
  async updateMember(userId: string, memberId: string, dto: MemberUpdateDto) {
    const m = await this.members.findById(memberId).lean();
    if (!m) throw new NotFoundException("Member not found.");
    await this.permissions.circle(m.circleId, userId, "coPlanner");
    if (m.access === "owner" && dto.access)
      throw new BadRequestException("The owner can't be changed here.");
    await this.members.updateOne({ _id: memberId }, { $set: dto });
  }
  async removeMember(userId: string, memberId: string) {
    const m = await this.members.findById(memberId).lean();
    if (!m) return;
    if (m.access === "owner")
      throw new BadRequestException(
        "The owner can't be removed. Archive the circle instead.",
      );
    if (m.userId !== userId)
      await this.permissions.circle(m.circleId, userId, "coPlanner");
    await this.members.deleteOne({ _id: memberId });
  }
}
