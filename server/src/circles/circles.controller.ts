import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard, userId } from "../auth/session.js";
import { CirclesService } from "./circles.service.js";
import {
  CircleDto,
  CircleUpdateDto,
  MemberDto,
  MemberUpdateDto,
} from "./circles.dto.js";
@Controller("circles")
@UseGuards(SessionGuard)
export class CirclesController {
  constructor(private circles: CirclesService) {}
  @Get() list(@Req() r: Request) {
    return this.circles.list(userId(r));
  }
  @Post() create(@Req() r: Request, @Body() dto: CircleDto) {
    return this.circles.create(userId(r), dto);
  }
  @Patch(":id") update(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() dto: CircleUpdateDto,
  ) {
    return this.circles.update(userId(r), id, dto);
  }
  @Delete(":id") archive(@Req() r: Request, @Param("id") id: string) {
    return this.circles.archive(userId(r), id);
  }
  @Post(":id/members") add(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() dto: MemberDto,
  ) {
    return this.circles.add(userId(r), id, dto);
  }
  @Patch("members/:id") member(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() dto: MemberUpdateDto,
  ) {
    return this.circles.updateMember(userId(r), id, dto);
  }
  @Delete("members/:id") remove(@Req() r: Request, @Param("id") id: string) {
    return this.circles.removeMember(userId(r), id);
  }
}
