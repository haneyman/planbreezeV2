import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { timingSafeEqual } from "node:crypto";
import type { Capture, User } from "../../../shared/types.js";
import { localToday, normalizeEmail } from "../common/validation.js";
import { JobsService } from "../jobs/jobs.service.js";
import { PlansService } from "../plans/plans.service.js";
import { fetchPage } from "./fetch-page.js";
import {
  eventsFromJsonLd,
  extractWithOpenAI,
  stripHtml,
} from "./extraction.js";
import { SaveCaptureDto } from "./capture.dto.js";
@Injectable()
export class CaptureService implements OnModuleInit {
  constructor(
    @InjectModel("captures") private captures: Model<Capture>,
    @InjectModel("users") private users: Model<User>,
    private jobs: JobsService,
    private plans: PlansService,
  ) {}
  onModuleInit() {
    this.jobs.register("capture.email", (p) =>
      this.process(p.captureId!, p.text!, p.html!, p.subject),
    );
  }
  inbox(userId: string) {
    return this.captures
      .find({ userId, status: { $in: ["processing", "draft", "failed"] } })
      .sort({ _creationTime: -1 })
      .limit(200)
      .lean();
  }
  async extract(userId: string, input: string) {
    const u = await this.users.findById(userId).lean();
    const today = localToday(u?.timeZone);
    const text = input.trim();
    if (/^https?:\/\/\S+$/i.test(text)) {
      const html = await fetchPage(text);
      const draft =
        eventsFromJsonLd(html)[0] ??
        (await extractWithOpenAI(stripHtml(html).slice(0, 15000), today, text));
      return {
        draft: draft ? { ...draft, url: draft.url ?? text } : null,
        ...(!draft
          ? { message: "No event found. You can fill it in below." }
          : {}),
      };
    }
    const draft = await extractWithOpenAI(text, today);
    return {
      draft,
      ...(!draft
        ? { message: "No event found. You can fill it in below." }
        : {}),
    };
  }
  async save(userId: string, dto: SaveCaptureDto) {
    if (
      dto.captureId &&
      !(await this.captures.exists({
        _id: dto.captureId,
        userId,
        status: "draft",
      }))
    )
      throw new NotFoundException("Capture not found.");
    const id = await this.plans.create(userId, {
      ...dto.event,
      circleId: dto.circleId,
      status: dto.status,
      source: dto.captureId ? "email" : "capture",
    });
    if (dto.captureId)
      await this.captures.updateOne(
        { _id: dto.captureId, userId, status: "draft" },
        { $set: { status: "saved" } },
      );
    return id;
  }
  async dismiss(userId: string, captureId: string) {
    await this.captures.updateOne(
      { _id: captureId, userId },
      { $set: { status: "dismissed" } },
    );
  }
  async inbound(secret: unknown, body: unknown) {
    const expected = process.env.INBOUND_EMAIL_SECRET;
    if (
      !expected ||
      typeof secret !== "string" ||
      Buffer.byteLength(secret) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
    )
      throw new ForbiddenException();
    if (!body || typeof body !== "object" || Array.isArray(body)) return;
    const b = body as Record<string, unknown>;
    const string = (v: unknown) => (typeof v === "string" ? v : "");
    const fromFull =
      b.FromFull && typeof b.FromFull === "object"
        ? (b.FromFull as Record<string, unknown>).Email
        : undefined;
    const from = normalizeEmail(
      string(fromFull) || string(b.From).replace(/.*<|>.*/g, ""),
    );
    const recipients = [
      string(b.To),
      ...(Array.isArray(b.ToFull)
        ? b.ToFull.flatMap((v) =>
            v && typeof v === "object"
              ? [string((v as Record<string, unknown>).Email)]
              : [],
          )
        : []),
    ];
    const domain = process.env.INBOUND_EMAIL_DOMAIN ?? "in.planbreeze.com";
    for (const recipient of recipients) {
      const address = recipient.toLowerCase().match(/([a-z0-9-]+)@([^\s>,]+)/);
      if (!address || address[2] !== domain) continue;
      const user = await this.users
        .findOne({ inboundAlias: address[1], email: from })
        .lean();
      if (!user) continue;
      {
        const c = await this.captures.create({
          userId: user._id,
          source: "email",
          subject: string(b.Subject).slice(0, 200),
          status: "processing",
        });
        await this.jobs.enqueue("capture.email", {
          captureId: c._id,
          subject: string(b.Subject).slice(0, 200),
          text: (string(b.TextBody) || stripHtml(string(b.HtmlBody))).slice(
            0,
            20000,
          ),
          html: string(b.HtmlBody).slice(0, 200000),
        });
      }
      break;
    }
  }
  private async process(
    captureId: string,
    text: string,
    html: string,
    subject?: string,
  ) {
    const c = await this.captures.findById(captureId).lean();
    if (!c || c.status !== "processing") return;
    const u = await this.users.findById(c.userId).lean();
    try {
      const draft =
        eventsFromJsonLd(html)[0] ??
        (await extractWithOpenAI(
          `Subject: ${subject ?? ""}\n\n${text}`,
          localToday(u?.timeZone),
        ));
      await this.captures.updateOne(
        { _id: captureId },
        {
          $set: draft
            ? { draft, status: "draft" }
            : { status: "failed", error: "No event found in this email." },
        },
      );
    } catch {
      await this.captures.updateOne(
        { _id: captureId },
        {
          $set: {
            status: "failed",
            error:
              "Could not process this email. Please paste its contents to try again.",
          },
        },
      );
    }
  }
}
