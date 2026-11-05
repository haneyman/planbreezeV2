import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
declare module "express-session" {
  interface SessionData {
    userId?: string;
    returnTo?: string;
    calendarState?: string;
  }
}
@Injectable()
export class SessionGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.session.userId) throw new UnauthorizedException("Please sign in.");
    return true;
  }
}
export function userId(req: Request) {
  if (!req.session.userId) throw new UnauthorizedException("Please sign in.");
  return req.session.userId;
}
