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
import { BreezeService } from "./breeze.service.js";
import {
  ChatDto,
  RadarDto,
  SearchDto,
  SearchUpdateDto,
  SuggestionAddDto,
} from "./breeze.dto.js";
@Controller("breeze")
@UseGuards(SessionGuard)
export class BreezeController {
  constructor(private breeze: BreezeService) {}
  @Get("chats") chats(@Req() r: Request) {
    return this.breeze.listChats(userId(r));
  }
  @Get("chats/:id/messages") messages(
    @Req() r: Request,
    @Param("id") id: string,
  ) {
    return this.breeze.listMessages(userId(r), id);
  }
  @Post("messages") send(@Req() r: Request, @Body() dto: ChatDto) {
    return this.breeze.send(userId(r), dto);
  }
  @Get("searches") searches(@Req() r: Request) {
    return this.breeze.listSearches(userId(r));
  }
  @Post("searches") add(@Req() r: Request, @Body() dto: SearchDto) {
    return this.breeze.addSearch(userId(r), dto);
  }
  @Patch("searches/:id") change(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() dto: SearchUpdateDto,
  ) {
    return this.breeze.changeSearch(userId(r), id, dto.enabled);
  }
  @Delete("searches/:id") remove(@Req() r: Request, @Param("id") id: string) {
    return this.breeze.removeSearch(userId(r), id);
  }
  @Post("searches/:id/run") run(@Req() r: Request, @Param("id") id: string) {
    return this.breeze.searchNow(userId(r), id);
  }
  @Get("suggestions") suggestions(@Req() r: Request) {
    return this.breeze.listSuggestions(userId(r));
  }
  @Post("suggestions/:id/add") addSuggestion(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() dto: SuggestionAddDto,
  ) {
    return this.breeze.addSuggestion(userId(r), id, dto.circleId);
  }
  @Delete("suggestions/:id") dismiss(
    @Req() r: Request,
    @Param("id") id: string,
  ) {
    return this.breeze.dismissSuggestion(userId(r), id);
  }
  @Post("radar") radar(@Req() r: Request, @Body() dto: RadarDto) {
    return this.breeze.addEvent(userId(r), dto);
  }
}
