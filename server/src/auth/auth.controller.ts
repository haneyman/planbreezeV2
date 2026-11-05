import {
  All,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService, safeReturn, siteUrl } from "./auth.service.js";
@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}
  @Get(":provider") start(
    @Param("provider") provider: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (provider !== "google" && provider !== "apple")
      return res.sendStatus(404);
    if (
      provider === "google"
        ? !process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET
        : !process.env.AUTH_APPLE_ID ||
          !process.env.AUTH_APPLE_PRIVATE_KEY ||
          !process.env.AUTH_APPLE_TEAM_ID ||
          !process.env.AUTH_APPLE_KEY_ID
    )
      throw new ServiceUnavailableException(
        "This sign-in provider is not configured.",
      );
    req.session.returnTo = safeReturn(req.query.next);
    this.auth.passport.authenticate(provider, {
      session: false,
      scope: ["email", "profile"],
    })(req, res);
  }
  @All(":provider/callback") callback(
    @Param("provider") provider: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (provider !== "google" && provider !== "apple")
      return res.sendStatus(404);
    this.auth.passport.authenticate(
      provider,
      { session: false },
      (err: unknown, result: { id: string } | false) => {
        if (err || !result)
          return res.redirect(`${siteUrl()}/login?error=signin`);
        const next = safeReturn(req.session.returnTo);
        req.session.regenerate((e) => {
          if (e) return res.sendStatus(500);
          req.session.userId = result.id;
          req.session.save((e) =>
            e
              ? res.sendStatus(500)
              : res.redirect(new URL(next, siteUrl()).href),
          );
        });
      },
    )(req, res);
  }
  @Post("logout") logout(@Req() req: Request, @Res() res: Response) {
    req.session.destroy((e) => {
      res.clearCookie("planbreeze.sid", { path: "/" });
      if (e) res.sendStatus(500);
      else res.sendStatus(204);
    });
  }
}
