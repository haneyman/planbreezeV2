import {
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { IsString, MaxLength } from "class-validator";
import type { Request, Response } from "express";
import { SessionGuard, userId } from "../auth/session.js";
import { RangeDto } from "../plans/plans.dto.js";
import { CalendarService } from "./calendar.service.js";
export class CalendarRangeDto extends RangeDto {
  @IsString() @MaxLength(1000) calendarId!: string;
  @IsString() @MaxLength(100) timeZone!: string;
}
@Controller("calendar")
export class CalendarController {
  constructor(private calendar: CalendarService) {}
  @Post("connect") @UseGuards(SessionGuard) connect(@Req() r: Request) {
    return this.calendar.connect(userId(r), r.sessionID);
  }
  @Get("callback") async callback(@Req() r: Request, @Res() res: Response) {
    res.redirect(
      await this.calendar.callback(
        r.query.code,
        r.query.state,
        r.sessionID,
        r.session.userId,
      ),
    );
  }
  @Delete("connection") @UseGuards(SessionGuard) disconnect(@Req() r: Request) {
    return this.calendar.disconnect(userId(r));
  }
  @Post("refresh") @UseGuards(SessionGuard) refresh(@Req() r: Request) {
    return this.calendar.refresh(userId(r));
  }
  @Get("events") @UseGuards(SessionGuard) events(
    @Req() r: Request,
    @Query() q: CalendarRangeDto,
  ) {
    return this.calendar.events(userId(r), q);
  }
}
