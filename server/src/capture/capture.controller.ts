import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard, userId } from "../auth/session.js";
import { CaptureService } from "./capture.service.js";
import { ExtractDto, SaveCaptureDto } from "./capture.dto.js";
@Controller("capture")
export class CaptureController {
  constructor(private capture: CaptureService) {}
  @Get() @UseGuards(SessionGuard) inbox(@Req() r: Request) {
    return this.capture.inbox(userId(r));
  }
  @Post("extract") @UseGuards(SessionGuard) extract(
    @Req() r: Request,
    @Body() dto: ExtractDto,
  ) {
    return this.capture.extract(userId(r), dto.input);
  }
  @Post("save") @UseGuards(SessionGuard) save(
    @Req() r: Request,
    @Body() dto: SaveCaptureDto,
  ) {
    return this.capture.save(userId(r), dto);
  }
  @Delete(":id") @UseGuards(SessionGuard) dismiss(
    @Req() r: Request,
    @Param("id") id: string,
  ) {
    return this.capture.dismiss(userId(r), id);
  }
  @Post("inbound-email") async inbound(
    @Query("secret") secret: string,
    @Body() body: unknown,
  ) {
    await this.capture.inbound(secret, body);
    return { ok: true };
  }
}
