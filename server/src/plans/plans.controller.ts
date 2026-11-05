import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard, userId } from "../auth/session.js";
import { PlansService } from "./plans.service.js";
import { PlanDto, PlanUpdateDto, RangeDto } from "./plans.dto.js";
@Controller("plans")
@UseGuards(SessionGuard)
export class PlansController {
  constructor(private plans: PlansService) {}
  @Get() list(@Req() r: Request, @Query() q: RangeDto) {
    return this.plans.list(userId(r), q);
  }
  @Post() create(@Req() r: Request, @Body() dto: PlanDto) {
    return this.plans.create(userId(r), dto);
  }
  @Patch(":id") update(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() dto: PlanUpdateDto,
  ) {
    return this.plans.update(userId(r), id, dto);
  }
  @Delete(":id") remove(@Req() r: Request, @Param("id") id: string) {
    return this.plans.remove(userId(r), id);
  }
  @Post(":id/commit") commit(@Req() r: Request, @Param("id") id: string) {
    return this.plans.status(userId(r), id, true);
  }
  @Post(":id/uncommit") uncommit(@Req() r: Request, @Param("id") id: string) {
    return this.plans.status(userId(r), id, false);
  }
}
