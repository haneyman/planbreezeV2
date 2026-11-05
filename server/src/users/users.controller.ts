import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard, userId } from "../auth/session.js";
import { ProfileDto } from "./users.dto.js";
import { UsersService } from "./users.service.js";
@Controller("users")
export class UsersController {
  constructor(private users: UsersService) {}
  @Get("me") viewer(@Req() req: Request) {
    return this.users.viewer(req.session.userId);
  }
  @Patch("me") @UseGuards(SessionGuard) update(
    @Req() req: Request,
    @Body() dto: ProfileDto,
  ) {
    return this.users.update(userId(req), dto);
  }
}
