import { Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { Passport } from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy } from "passport-strategy";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { User, Member } from "../../../shared/types.js";
import type { Identity } from "../common/models.js";
import { normalizeEmail } from "../common/validation.js";
import { JobsService } from "../jobs/jobs.service.js";

declare module "express-session" {
  interface SessionData {
    appleState?: string;
    appleNonce?: string;
  }
}
const appleKeys = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);
export const siteUrl = () => process.env.SITE_URL ?? "http://localhost:3000";
export const apiUrl = () => process.env.API_URL ?? "http://localhost:3001/api";
export function safeReturn(value: unknown) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\r\n]/.test(value)
    ? value
    : "/";
}
interface LoginIdentity {
  provider: string;
  subject: string;
  email?: string;
  name?: string;
  image?: string;
}
class AppleStrategy extends Strategy {
  name = "apple";
  constructor(private resolve: (identity: LoginIdentity) => Promise<string>) {
    super();
  }
  authenticate(req: Request) {
    void this.run(req).catch(() =>
      this.fail({ message: "Apple sign-in failed." }, 401),
    );
  }
  private async run(req: Request) {
    if (req.method !== "POST") {
      req.session.appleState = randomBytes(32).toString("hex");
      req.session.appleNonce = randomBytes(32).toString("hex");
      await new Promise<void>((resolve, reject) =>
        req.session.save((e) => (e ? reject(e) : resolve())),
      );
      this.redirect(
        "https://appleid.apple.com/auth/authorize?" +
          new URLSearchParams({
            client_id: process.env.AUTH_APPLE_ID!,
            redirect_uri: `${apiUrl()}/auth/apple/callback`,
            response_type: "code",
            response_mode: "form_post",
            scope: "name email",
            state: req.session.appleState!,
            nonce: req.session.appleNonce!,
          }),
      );
      return;
    }
    const { code, state } = req.body as Record<string, unknown>;
    const expected = req.session.appleState;
    const nonce = req.session.appleNonce;
    delete req.session.appleState;
    delete req.session.appleNonce;
    if (
      typeof code !== "string" ||
      typeof state !== "string" ||
      !expected ||
      state.length !== expected.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(expected))
    )
      throw new UnauthorizedException();
    const key = await importPKCS8(
      process.env.AUTH_APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      "ES256",
    );
    const secret = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: process.env.AUTH_APPLE_KEY_ID })
      .setIssuer(process.env.AUTH_APPLE_TEAM_ID!)
      .setSubject(process.env.AUTH_APPLE_ID!)
      .setAudience("https://appleid.apple.com")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(key);
    const response = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.AUTH_APPLE_ID!,
        client_secret: secret,
        redirect_uri: `${apiUrl()}/auth/apple/callback`,
      }),
    });
    if (!response.ok) throw new UnauthorizedException();
    const tokens = (await response.json()) as { id_token: string };
    const { payload } = await jwtVerify(tokens.id_token, appleKeys, {
      issuer: "https://appleid.apple.com",
      audience: process.env.AUTH_APPLE_ID,
    });
    if (!payload.sub || payload.nonce !== nonce)
      throw new UnauthorizedException();
    const email =
      (payload.email_verified === true || payload.email_verified === "true") &&
      typeof payload.email === "string"
        ? payload.email
        : undefined;
    this.success({
      id: await this.resolve({
        provider: "apple",
        subject: payload.sub,
        email,
      }),
    });
  }
}
@Injectable()
export class AuthService {
  readonly passport = new Passport();
  constructor(
    @InjectModel("users") private users: Model<User>,
    @InjectModel("identities") private identities: Model<Identity>,
    @InjectModel("members") private members: Model<Member>,
    private jobs: JobsService,
  ) {
    if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)
      this.passport.use(
        new GoogleStrategy(
          {
            clientID: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            callbackURL: `${apiUrl()}/auth/google/callback`,
            state: true,
            pkce: true,
          },
          (_access, _refresh, profile, done) => {
            const email = profile.emails?.find((e) => e.verified)?.value;
            void this.resolve({
              provider: "google",
              subject: profile.id,
              email,
              name: profile.displayName,
              image: profile.photos?.[0]?.value,
            }).then((id) => done(null, { id }), done);
          },
        ),
      );
    if (
      process.env.AUTH_APPLE_ID &&
      process.env.AUTH_APPLE_PRIVATE_KEY &&
      process.env.AUTH_APPLE_TEAM_ID &&
      process.env.AUTH_APPLE_KEY_ID
    )
      this.passport.use(
        new AppleStrategy((identity) => this.resolve(identity)),
      );
  }
  async resolve(identity: LoginIdentity) {
    const linked = await this.identities
      .findOne({ provider: identity.provider, subject: identity.subject })
      .lean();
    if (linked) return linked.userId;
    if (!identity.email)
      throw new UnauthorizedException("A verified email address is required.");
    const email = normalizeEmail(identity.email);
    let u = await this.users.findOne({ email }).lean();
    if (!u)
      u = (
        await this.users.create({
          email,
          name: identity.name,
          image: identity.image,
          inboundAlias: `${
            email
              .split("@")[0]!
              .replace(/[^a-z0-9]/g, "")
              .slice(0, 12) || "me"
          }-${randomBytes(6).toString("hex")}`,
        })
      ).toObject();
    await this.members.updateMany(
      { email, userId: { $exists: false } },
      { $set: { userId: u._id } },
    );
    await this.identities.create({
      userId: u._id,
      provider: identity.provider,
      subject: identity.subject,
    });
    return u._id;
  }
}
