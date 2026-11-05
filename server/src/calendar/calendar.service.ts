import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Cron } from "@nestjs/schedule";
import type { Model } from "mongoose";
import { createHash, randomBytes } from "node:crypto";
import type {
  Calendar,
  CalendarAccount,
  CircleRecord,
  GoogleEventRef,
  PlanRecord,
  User,
} from "../../../shared/types.js";
import type { OAuthState } from "../common/models.js";
import { encrypt, decrypt } from "../common/crypto.js";
import { addDays, checkZone, isDate } from "../common/validation.js";
import { JobsService } from "../jobs/jobs.service.js";
import { apiUrl, siteUrl } from "../auth/auth.service.js";
import {
  eventBody,
  fromGoogleTimes,
  readonlyCalendarEvent,
  type ReadonlyCalendarEvent,
} from "./calendar.helpers.js";
const API = "https://www.googleapis.com/calendar/v3";
const redirectUri = () => `${apiUrl()}/calendar/callback`;
function credentials() {
  const id =
    process.env.GOOGLE_CALENDAR_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID;
  const secret =
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET;
  if (!id || !secret)
    throw new BadRequestException("Google Calendar is not configured.");
  return { id, secret };
}
async function gfetch(
  token: string,
  url: string,
  method = "GET",
  body?: unknown,
) {
  return fetch(url, {
    method,
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
@Injectable()
export class CalendarService implements OnModuleInit {
  constructor(
    @InjectModel("calendarAccounts") private accounts: Model<CalendarAccount>,
    @InjectModel("users") private users: Model<User>,
    @InjectModel("plans") private plans: Model<PlanRecord>,
    @InjectModel("circles") private circles: Model<CircleRecord>,
    @InjectModel("oauthStates") private states: Model<OAuthState>,
    private jobs: JobsService,
  ) {}
  onModuleInit() {
    this.jobs.register("calendar.write", (p) =>
      this.write(p.planId!, p.committedBy),
    );
    this.jobs.register("calendar.delete", (p) =>
      this.deleteEvent(
        { userId: p.userId!, calendarId: p.calendarId!, eventId: p.eventId! },
        p.planId!,
      ),
    );
    this.jobs.register("calendar.sync", () => this.sync());
  }
  async connect(userId: string, sessionId: string) {
    const state = randomBytes(32).toString("hex");
    await this.states.create({
      userId,
      sessionId,
      state,
      expiresAt: new Date(Date.now() + 15 * 60000),
    });
    return (
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id: credentials().id,
        redirect_uri: redirectUri(),
        response_type: "code",
        scope:
          "openid email https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy",
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
      })
    );
  }
  async callback(
    code: unknown,
    state: unknown,
    sessionId: string,
    userId?: string,
  ) {
    const back = (status: string) => `${siteUrl()}/settings?google=${status}`;
    if (typeof code !== "string" || typeof state !== "string" || !userId)
      return back("cancelled");
    const row = await this.states
      .findOneAndDelete({
        state,
        userId,
        sessionId,
        expiresAt: { $gt: new Date() },
      })
      .lean();
    if (!row) return back("expired");
    const { id, secret } = credentials();
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      body: new URLSearchParams({
        code,
        client_id: id,
        client_secret: secret,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    const tokens = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!res.ok || !tokens.access_token || !tokens.refresh_token)
      return back("error");
    const info = await gfetch(
      tokens.access_token,
      "https://www.googleapis.com/oauth2/v3/userinfo",
    );
    const profile = info.ok ? ((await info.json()) as { email?: string }) : {};
    const calendars = await this.listCalendars(tokens.access_token);
    await this.accounts.updateOne(
      { userId },
      {
        $set: {
          provider: "google",
          refreshToken: await encrypt(tokens.refresh_token),
          email: profile.email,
          calendars,
          status: "ok",
          lastSyncedAt: Date.now(),
        },
      },
      { upsert: true },
    );
    return back("connected");
  }
  async disconnect(userId: string) {
    await this.accounts.deleteOne({ userId });
  }
  async token(userId: string) {
    const a = await this.accounts.findOne({ userId }).lean();
    if (!a || a.status !== "ok") return null;
    const { id, secret } = credentials();
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        refresh_token: await decrypt(a.refreshToken),
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      if ([400, 401].includes(res.status)) {
        await this.accounts.updateOne(
          { userId },
          { $set: { status: "needsReauth" } },
        );
        return null;
      }
      throw new Error("Google token service unavailable.");
    }
    return ((await res.json()) as { access_token: string }).access_token;
  }
  private async listCalendars(token: string): Promise<Calendar[]> {
    const calendars: Calendar[] = [];
    let pageToken = "";
    do {
      const res = await gfetch(
        token,
        `${API}/users/me/calendarList?minAccessRole=reader&maxResults=250&pageToken=${encodeURIComponent(pageToken)}`,
      );
      if (!res.ok) throw new Error("Could not list Google calendars.");
      const data = (await res.json()) as {
        items?: {
          id: string;
          summary: string;
          summaryOverride?: string;
          backgroundColor?: string;
          primary?: boolean;
          accessRole: string;
        }[];
        nextPageToken?: string;
      };
      calendars.push(
        ...(data.items ?? []).map((c) => ({
          id: c.id,
          name: c.summaryOverride ?? c.summary,
          color: c.backgroundColor,
          primary: c.primary ?? false,
          writable: ["owner", "writer"].includes(c.accessRole),
        })),
      );
      pageToken = data.nextPageToken ?? "";
    } while (pageToken && calendars.length < 1000);
    return calendars;
  }
  async refresh(userId: string) {
    const token = await this.token(userId);
    if (!token)
      throw new BadRequestException("Reconnect Google Calendar in Settings.");
    await this.accounts.updateOne(
      { userId },
      {
        $set: {
          calendars: await this.listCalendars(token),
          lastSyncedAt: Date.now(),
          status: "ok",
        },
      },
    );
  }
  async events(
    userId: string,
    {
      calendarId,
      from,
      to,
      timeZone,
    }: { calendarId: string; from: string; to: string; timeZone: string },
  ) {
    if (
      !isDate(from) ||
      !isDate(to) ||
      to <= from ||
      Date.parse(to) - Date.parse(from) > 370 * 86400000
    )
      throw new BadRequestException(
        "Choose a calendar range of up to one year.",
      );
    checkZone(timeZone);
    const account = await this.accounts.findOne({ userId }).lean();
    const calendar = account?.calendars.find((c) => c.id === calendarId);
    if (!calendar)
      throw new BadRequestException(
        "This calendar is not connected to your account.",
      );
    const token = await this.token(userId);
    if (!token)
      throw new UnauthorizedException("Reconnect Google Calendar in Settings.");
    const events: ReadonlyCalendarEvent[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 4; page++) {
      const params = new URLSearchParams({
        timeMin: `${addDays(from, -1)}T00:00:00Z`,
        timeMax: `${addDays(to, 1)}T00:00:00Z`,
        timeZone,
        singleEvents: "true",
        showDeleted: "false",
        orderBy: "startTime",
        maxResults: "250",
        fields:
          "nextPageToken,items(id,status,summary,location,htmlLink,start,end,extendedProperties)",
        ...(pageToken ? { pageToken } : {}),
      });
      const res = await gfetch(
        token,
        `${API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      );
      if (!res.ok)
        throw new BadRequestException("Could not load Google events.");
      const data = (await res.json()) as {
        items?: Parameters<typeof readonlyCalendarEvent>[0][];
        nextPageToken?: string;
      };
      for (const event of data.items ?? []) {
        const item = readonlyCalendarEvent(event, calendar, from, to);
        if (item) events.push(item);
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return { events, truncated: !!pageToken };
  }
  async resolveTarget(plan: PlanRecord, committedBy?: string) {
    let userId =
      plan.committedBy ??
      committedBy ??
      plan.googleEvent?.userId ??
      plan.ownerId;
    let calendarId: string | undefined;
    if (plan.circleId) {
      const c = await this.circles
        .findOne({ _id: plan.circleId, archived: { $ne: true } })
        .lean();
      if (!c) return null;
      if (c.linkedCalendarId) {
        userId = c.ownerId;
        calendarId = c.linkedCalendarId;
      }
    }
    const a = await this.accounts.findOne({ userId }).lean();
    if (!a) return null;
    const u = await this.users.findById(userId).lean();
    calendarId ??=
      u?.defaultCalendarId ?? a.calendars.find((c) => c.primary)?.id;
    if (
      !calendarId ||
      !a.calendars.some((c) => c.id === calendarId && c.writable)
    )
      return null;
    return { userId, calendarId };
  }
  async write(planId: string, committedBy?: string) {
    const p = await this.plans.findById(planId).lean();
    if (!p || p.status !== "committed") return;
    const target = await this.resolveTarget(p, committedBy);
    if (!target) {
      await this.plans.updateOne(
        { _id: planId },
        { $set: { calendarStatus: "notConnected" } },
      );
      return;
    }
    try {
      const token = await this.token(target.userId);
      if (!token) throw new Error("Reconnect Google Calendar in Settings.");
      const same =
        p.googleEvent?.userId === target.userId &&
        p.googleEvent.calendarId === target.calendarId;
      const eventId = same
        ? p.googleEvent!.eventId
        : createHash("sha256")
            .update(
              `${planId}:${p.calendarGeneration ?? "imported"}:${target.userId}:${target.calendarId}`,
            )
            .digest("hex");
      if (p.googleEvent && !same) await this.deleteEvent(p.googleEvent, planId);
      const url = `${API}/calendars/${encodeURIComponent(target.calendarId)}/events/${encodeURIComponent(eventId)}`;
      const existing = await gfetch(token, url);
      let res: Response;
      if (existing.ok) {
        const e = (await existing.json()) as {
          extendedProperties?: { private?: { planbreezePlanId?: string } };
        };
        if (e.extendedProperties?.private?.planbreezePlanId !== planId)
          throw new Error("Calendar event ownership check failed.");
        res = await gfetch(token, url, "PATCH", eventBody(p));
      } else if ([404, 410].includes(existing.status)) {
        res = await gfetch(
          token,
          `${API}/calendars/${encodeURIComponent(target.calendarId)}/events`,
          "POST",
          { ...eventBody(p), id: eventId },
        );
        // A timed-out prior attempt may already have created the deterministic event.
        if (res.status === 409) res = await gfetch(token, url);
      } else throw new Error("Could not read calendar event.");
      if (!res.ok)
        throw new Error(`Google Calendar request failed (${res.status}).`);
      const latest = await this.plans.findById(planId).lean();
      if (
        !latest ||
        latest.status !== "committed" ||
        latest.calendarGeneration !== p.calendarGeneration
      ) {
        await this.deleteEvent({ ...target, eventId }, planId);
        return;
      }
      await this.plans.updateOne(
        {
          _id: planId,
          status: "committed",
          calendarGeneration: p.calendarGeneration,
        },
        {
          $set: {
            calendarStatus: "synced",
            googleEvent: { ...target, eventId },
          },
          $unset: { calendarError: 1 },
        },
      );
    } catch (e) {
      await this.plans.updateOne(
        { _id: planId, status: "committed" },
        {
          $set: {
            calendarStatus: "error",
            calendarError:
              "Calendar sync failed. Reconnect Google or try again shortly.",
          },
        },
      );
      throw e;
    }
  }
  async deleteEvent(ref: GoogleEventRef, planId: string) {
    const token = await this.token(ref.userId);
    if (!token)
      throw new Error("Reconnect Google Calendar to remove the event.");
    const url = `${API}/calendars/${encodeURIComponent(ref.calendarId)}/events/${encodeURIComponent(ref.eventId)}`;
    const res = await gfetch(token, url);
    if ([404, 410].includes(res.status)) return;
    if (!res.ok) throw new Error("Could not read calendar event.");
    const e = (await res.json()) as {
      extendedProperties?: { private?: { planbreezePlanId?: string } };
    };
    if (e.extendedProperties?.private?.planbreezePlanId !== planId)
      throw new Error("Calendar event ownership check failed.");
    const removed = await gfetch(token, url, "DELETE");
    if (!removed.ok && ![404, 410].includes(removed.status))
      throw new Error("Could not delete calendar event.");
  }
  @Cron("0 */30 * * * *", { timeZone: "UTC" })
  async scheduleSync() {
    if (process.env.JOBS_ENABLED !== "false")
      await this.jobs.enqueue(
        "calendar.sync",
        {},
        `calendar-sync:${Math.floor(Date.now() / 1800000)}`,
      );
  }
  async sync() {
    for await (const p of this.plans
      .find({ status: "committed", googleEvent: { $exists: true } })
      .lean()
      .cursor()) {
      const ref = p.googleEvent!;
      const token = await this.token(ref.userId);
      if (!token) continue;
      const res = await gfetch(
        token,
        `${API}/calendars/${encodeURIComponent(ref.calendarId)}/events/${encodeURIComponent(ref.eventId)}`,
      );
      const ev = res.ok
        ? ((await res.json()) as Parameters<typeof fromGoogleTimes>[0])
        : null;
      if ([404, 410].includes(res.status) || ev?.status === "cancelled") {
        await this.plans.updateOne(
          { _id: p._id, "googleEvent.eventId": ref.eventId },
          {
            $set: {
              status: "radar",
              note: [
                p.note,
                "Moved back to the radar because the calendar event was deleted.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            $unset: { googleEvent: 1, calendarStatus: 1, calendarError: 1 },
          },
        );
      } else if (ev) {
        const dates = fromGoogleTimes(ev);
        if (dates)
          await this.plans.updateOne(
            {
              _id: p._id,
              status: "committed",
              "googleEvent.eventId": ref.eventId,
              calendarStatus: "synced",
            },
            {
              $set: { ...dates, title: ev.summary || p.title },
              ...(!dates.startTime
                ? { $unset: { startTime: 1, endTime: 1 } }
                : {}),
            },
          );
      }
    }
  }
  async busy(
    userId: string,
    timeMin: string,
    timeMax: string,
  ): Promise<{ start: string; end: string }[] | null> {
    const token = await this.token(userId);
    if (!token) return null;
    const a = await this.accounts.findOne({ userId }).lean();
    const res = await gfetch(token, `${API}/freeBusy`, "POST", {
      timeMin,
      timeMax,
      items: (a?.calendars ?? []).slice(0, 50).map((c) => ({ id: c.id })),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      calendars: Record<
        string,
        { busy?: { start: string; end: string }[]; errors?: unknown[] }
      >;
    };
    if (Object.values(data.calendars).some((c) => c.errors?.length))
      return null;
    return Object.values(data.calendars).flatMap((c) => c.busy ?? []);
  }
}
