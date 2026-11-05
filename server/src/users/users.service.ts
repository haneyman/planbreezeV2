import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type { CalendarAccount, User, Viewer } from "../../../shared/types.js";
import { checkZone } from "../common/validation.js";
import { ProfileDto } from "./users.dto.js";
@Injectable()
export class UsersService {
  constructor(
    @InjectModel("users") private users: Model<User>,
    @InjectModel("calendarAccounts") private accounts: Model<CalendarAccount>,
  ) {}
  async viewer(userId?: string): Promise<Viewer | null> {
    if (!userId) return null;
    const u = await this.users.findById(userId).lean();
    if (!u) return null;
    const a = await this.accounts.findOne({ userId }).lean();
    return {
      _id: u._id,
      name: u.name ?? u.email ?? "You",
      email: u.email,
      image: u.image,
      timeZone: u.timeZone,
      homeArea: u.homeArea,
      interests: u.interests ?? [],
      defaultCalendarId: u.defaultCalendarId,
      radarSyncMode: u.radarSyncMode ?? "appOnly",
      inboundAddress: u.inboundAlias
        ? `${u.inboundAlias}@${process.env.INBOUND_EMAIL_DOMAIN ?? "in.planbreeze.com"}`
        : null,
      google: a
        ? {
            email: a.email,
            status: a.status,
            lastSyncedAt: a.lastSyncedAt,
            calendars: a.calendars,
          }
        : null,
    };
  }
  async update(userId: string, dto: ProfileDto) {
    if (dto.timeZone) checkZone(dto.timeZone);
    if (dto.defaultCalendarId) {
      const account = await this.accounts.findOne({ userId }).lean();
      if (
        !account?.calendars.some(
          (c) => c.id === dto.defaultCalendarId && c.writable,
        )
      )
        throw new BadRequestException("Choose a writable calendar.");
    }
    await this.users.updateOne({ _id: userId }, { $set: dto });
  }
}
