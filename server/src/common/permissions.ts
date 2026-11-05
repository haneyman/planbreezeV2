import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type {
  Access,
  CircleRecord,
  Member,
  PlanRecord,
} from "../../../shared/types.js";
const rank: Record<Access, number> = {
  viewer: 0,
  contributor: 1,
  coPlanner: 2,
  owner: 3,
};
@Injectable()
export class Permissions {
  constructor(
    @InjectModel("circles") private circles: Model<CircleRecord>,
    @InjectModel("members") private members: Model<Member>,
  ) {}
  async circle(circleId: string, userId: string, minimum: Access = "viewer") {
    const circle = await this.circles
      .findOne({ _id: circleId, archived: { $ne: true } })
      .lean();
    if (!circle) throw new NotFoundException("Circle not found.");
    const member = await this.members.findOne({ circleId, userId }).lean();
    if (!member || rank[member.access] < rank[minimum])
      throw new ForbiddenException(
        "You don't have access to do that in this circle.",
      );
    return { circle, member };
  }
  async mine(userId: string) {
    const memberships = await this.members.find({ userId }).limit(500).lean();
    return this.circles
      .find({
        _id: { $in: memberships.map((m) => m.circleId) },
        archived: { $ne: true },
      })
      .limit(500)
      .lean();
  }
  async plan(plan: PlanRecord, userId: string) {
    if (!plan.circleId) {
      const own = plan.ownerId === userId;
      return { view: own, edit: own, commit: own };
    }
    try {
      const { member } = await this.circle(plan.circleId, userId);
      return {
        view: true,
        edit:
          rank[member.access] >= 2 ||
          (rank[member.access] >= 1 &&
            plan.ownerId === userId &&
            plan.status === "radar"),
        commit: rank[member.access] >= 2,
      };
    } catch (e) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException)
        return { view: false, edit: false, commit: false };
      throw e;
    }
  }
}
