import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import supertest from "supertest";
import { getConnectionToken, getModelToken } from "@nestjs/mongoose";
import signature from "cookie-signature";
import type { Connection, Model } from "mongoose";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { User } from "../../shared/types";
// Import tsc output: Nest relies on emitted decorator metadata (esbuild does not emit it).
import { createApp } from "../dist/server/src/bootstrap.js";
import { AuthService } from "../dist/server/src/auth/auth.service.js";
import { JobsService } from "../dist/server/src/jobs/jobs.service.js";
import { CalendarService } from "../dist/server/src/calendar/calendar.service.js";
import { BreezeService } from "../dist/server/src/breeze/breeze.service.js";
import { CaptureService } from "../dist/server/src/capture/capture.service.js";
import {
  eventBody,
  readonlyCalendarEvent,
} from "../dist/server/src/calendar/calendar.helpers.js";
import {
  callOpenAI,
  grounded,
  parseEvents,
} from "../dist/server/src/breeze/openai.js";
import { eventsFromJsonLd } from "../dist/server/src/capture/extraction.js";
import { encrypt, decrypt } from "../dist/server/src/common/crypto.js";
let mongo: MongoMemoryServer;
let app: Awaited<ReturnType<typeof createApp>>;
let connection: Connection;
let owner: string;
let guest: string;
let outsider: string;
const origin = "http://localhost:3000";
const secret = "test-session-secret-with-at-least-32-characters";
const plan = {
  title: "Harvest wine tasting",
  startDate: "2026-11-10",
  endDate: "2026-11-10",
  status: "radar",
};
const range = { from: "2026-11-01", to: "2026-11-30" };
const model = <T = any>(name: string) => app.get<Model<T>>(getModelToken(name));
async function cookie(userId: string) {
  const sid = randomBytes(24).toString("hex");
  await connection.db!.collection("sessions").insertOne({
    _id: sid as any,
    expires: new Date(Date.now() + 3600000),
    session: JSON.stringify({
      cookie: {
        originalMaxAge: 3600000,
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: false,
      },
      userId,
    }),
  });
  return `planbreeze.sid=${encodeURIComponent("s:" + signature.sign(sid, secret))}`;
}
async function api(
  user: string | undefined,
  method: "get" | "post" | "patch" | "delete",
  path: string,
  body?: object,
) {
  const request = supertest(app.getHttpServer())
    [method]("/api" + path)
    .set("Origin", origin);
  if (user) request.set("Cookie", await cookie(user));
  if (body) request.send(body);
  return request;
}
beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JOBS_ENABLED = "false";
  process.env.EMAIL_ENABLED = "false";
  process.env.SESSION_SECRET = secret;
  process.env.SITE_URL = origin;
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.INBOUND_EMAIL_SECRET = "inbound-test";
  mongo = await MongoMemoryServer.create({
    binary: { version: "8.0.16" },
  });
  process.env.MONGODB_URI = mongo.getUri("planbreeze-test");
  app = await createApp();
  await app.init();
  connection = app.get(getConnectionToken());
  for (const name of [
    "users",
    "members",
    "suggestions",
    "identities",
    "plans",
    "circles",
    "calendarAccounts",
    "chats",
    "messages",
    "standingSearches",
    "captures",
  ])
    await model(name).init();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  for (const collection of Object.values(connection.collections))
    await collection.deleteMany({});
  owner = (
    await model<User>("users").create({
      name: "Mark",
      email: "mark@example.com",
      timeZone: "America/Los_Angeles",
      inboundAlias: "mark-test",
    })
  )._id;
  guest = (
    await model<User>("users").create({
      name: "Dana",
      email: "dana@example.com",
    })
  )._id;
  outsider = (
    await model<User>("users").create({
      name: "Other",
      email: "other@example.com",
    })
  )._id;
});
afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});
async function circle(access = "contributor") {
  const res = await api(owner, "post", "/circles", {
    name: "Family",
    color: "#3F7A5A",
    members: [{ email: "Dana@Example.com", label: "Dana", access }],
  });
  expect(res.status).toBe(201);
  return res.text;
}
async function create(user = owner, circleId?: string, fields = {}) {
  const res = await api(user, "post", "/plans", {
    ...plan,
    ...(circleId ? { circleId } : {}),
    ...fields,
  });
  expect(res.status).toBe(201);
  return res.text;
}
describe("REST authentication, validation, and permissions", () => {
  test("requires a session and protects cookie-authenticated writes against other origins", async () => {
    expect((await api(undefined, "get", "/plans")).status).toBe(401);
    const res = await supertest(app.getHttpServer())
      .post("/api/plans")
      .set("Cookie", await cookie(owner))
      .set("Origin", "https://attacker.example")
      .send(plan);
    expect(res.status).toBe(403);
    expect((await api(owner, "get", "/users/me")).body.email).toBe(
      "mark@example.com",
    );
  });
  test("rejects invalid dates, nulls, privilege fields, and missing nested events", async () => {
    for (const body of [
      { ...plan, startDate: "2026-02-30" },
      { ...plan, ownerId: outsider },
      { ...plan, title: null },
      { ...plan, circleId: null },
      { ...plan, timeZone: "invalid" },
    ])
      expect((await api(owner, "post", "/plans", body)).status).toBe(400);
    expect(
      (await api(owner, "post", "/capture/save", { status: "radar" })).status,
    ).toBe(400);
    expect(
      (await api(owner, "post", "/breeze/radar", { event: null })).status,
    ).toBe(400);
  });
  test("private plans stay private; circles are shared only with members", async () => {
    const family = await circle();
    const privateId = await create();
    await create(owner, family);
    expect(
      (await api(owner, "get", "/plans?" + new URLSearchParams(range))).body,
    ).toHaveLength(2);
    expect(
      (await api(guest, "get", "/plans?" + new URLSearchParams(range))).body,
    ).toHaveLength(1);
    expect(
      (await api(outsider, "get", "/plans?" + new URLSearchParams(range))).body,
    ).toEqual([]);
    expect(
      (await api(guest, "patch", "/plans/" + privateId, { title: "stolen" }))
        .status,
    ).toBe(403);
    expect((await api(outsider, "delete", "/plans/" + privateId)).status).toBe(
      403,
    );
  });
  test("contributors can edit own radar plans but only co-planners can commit", async () => {
    const family = await circle();
    const own = await create(guest, family);
    const other = await create(owner, family);
    expect(
      (await api(guest, "patch", "/plans/" + own, { title: "Updated" })).status,
    ).toBe(200);
    expect(
      (await api(guest, "patch", "/plans/" + other, { title: "No" })).status,
    ).toBe(403);
    expect((await api(guest, "post", `/plans/${own}/commit`, {})).status).toBe(
      403,
    );
    expect((await api(owner, "post", `/plans/${own}/commit`, {})).status).toBe(
      201,
    );
    expect((await model("plans").findById(own).lean()).calendarStatus).toBe(
      "pending",
    );
    expect(await model("jobs").countDocuments({ kind: "calendar.write" })).toBe(
      1,
    );
    expect(
      (await api(guest, "patch", "/plans/" + own, { title: "No" })).status,
    ).toBe(403);
  });
  test("viewers cannot create; archived membership does not permit plan access", async () => {
    const family = await circle("viewer");
    expect(
      (await api(guest, "post", "/plans", { ...plan, circleId: family }))
        .status,
    ).toBe(403);
    const id = await create(owner, family);
    await api(owner, "delete", "/circles/" + family);
    expect(
      (await api(guest, "patch", "/plans/" + id, { title: "No" })).status,
    ).toBe(403);
  });
  test("circle creation rejects duplicate members before writing any records", async () => {
    const body = {
      name: "Crew",
      color: "#46698F",
      members: [
        { email: "dana@example.com", label: "Dana" },
        { email: "dana@example.com", label: "Again" },
      ],
    };
    expect((await api(owner, "post", "/circles", body)).status).toBe(400);
    expect(await model("circles").countDocuments()).toBe(0);
    expect(await model("members").countDocuments()).toBe(0);
    expect(await model("jobs").countDocuments()).toBe(0);
  });
  test("cannot move a committed plan into a circle where actor is only contributor", async () => {
    const family = await circle();
    const id = await create(guest, undefined, { status: "committed" });
    expect(
      (await api(guest, "patch", "/plans/" + id, { circleId: family })).status,
    ).toBe(403);
  });
  test("allows clearing times and uncommitting without sending radar events", async () => {
    const id = await create(owner, undefined, {
      startTime: "14:00",
      endTime: "15:00",
    });
    expect(
      (
        await api(owner, "patch", "/plans/" + id, {
          startTime: null,
          endTime: null,
        })
      ).status,
    ).toBe(200);
    expect(
      (await model("plans").findById(id).lean()).startTime,
    ).toBeUndefined();
    expect(await model("jobs").countDocuments({ kind: "calendar.write" })).toBe(
      0,
    );
  });
  test("logout invalidates the MongoDB session", async () => {
    const c = await cookie(owner);
    await supertest(app.getHttpServer())
      .post("/api/auth/logout")
      .set("Origin", origin)
      .set("Cookie", c)
      .send({})
      .expect(204);
    await supertest(app.getHttpServer())
      .get("/api/circles")
      .set("Cookie", c)
      .expect(401);
  });
});
describe("OAuth identities, capture, and discovery ownership", () => {
  test("creates a new Google account on standalone MongoDB", async () => {
    const hello = await connection.db!.admin().command({ hello: 1 });
    expect(hello.setName).toBeUndefined();
    const auth = app.get(AuthService);
    const id = await auth.resolve({
      provider: "google",
      subject: "new-google-subject",
      email: "new@example.com",
      name: "New user",
    });
    expect((await api(id, "get", "/users/me")).body.email).toBe(
      "new@example.com",
    );
    expect(
      await auth.resolve({
        provider: "google",
        subject: "new-google-subject",
        email: "new@example.com",
      }),
    ).toBe(id);
    expect(
      await model("users").countDocuments({ email: "new@example.com" }),
    ).toBe(1);
  });
  test("links verified provider identity to imported user and invitations", async () => {
    await model("members").create({
      circleId: "circle",
      label: "Future user",
      email: "mark@example.com",
      access: "viewer",
    });
    const auth = app.get(AuthService);
    expect(
      await auth.resolve({
        provider: "google",
        subject: "google-sub",
        email: "MARK@example.com",
      }),
    ).toBe(owner);
    expect(
      await auth.resolve({
        provider: "google",
        subject: "google-sub",
        email: "changed@example.com",
      }),
    ).toBe(owner);
    expect(await model("users").countDocuments()).toBe(3);
    expect((await model("members").findOne().lean()).userId).toBe(owner);
  });
  test("does not expose another user chat, searches, captures, or suggestions", async () => {
    const chat = await model("chats").create({
      userId: owner,
      title: "Private",
    });
    expect(
      (await api(guest, "get", `/breeze/chats/${chat._id}/messages`)).status,
    ).toBe(404);
    const search = await model("standingSearches").create({
      userId: owner,
      query: "Jazz",
      enabled: true,
    });
    expect(
      (await api(guest, "post", `/breeze/searches/${search._id}/run`, {}))
        .status,
    ).toBe(404);
    const cap = await model("captures").create({
      userId: owner,
      source: "email",
      status: "draft",
    });
    expect(
      (
        await api(guest, "post", "/capture/save", {
          event: {
            title: plan.title,
            startDate: plan.startDate,
            endDate: plan.endDate,
          },
          captureId: cap._id,
          status: "radar",
        })
      ).status,
    ).toBe(404);
    expect(await model("plans").countDocuments()).toBe(0);
  });
  test("inbound email requires secret, matching sender, and correct domain", async () => {
    const capture = app.get(CaptureService);
    await expect(capture.inbound("wrong", {})).rejects.toThrow();
    await capture.inbound("inbound-test", {
      From: "other@example.com",
      To: "mark-test@in.planbreeze.com",
      TextBody: "hello",
    });
    await capture.inbound("inbound-test", {
      From: "mark@example.com",
      To: "mark-test@wrong.example",
      TextBody: "hello",
    });
    expect(await model("captures").countDocuments()).toBe(0);
    await capture.inbound("inbound-test", {
      From: "mark@example.com",
      To: "mark-test@in.planbreeze.com",
      TextBody: "hello",
    });
    expect(await model("captures").countDocuments()).toBe(1);
    expect(await model("jobs").countDocuments({ kind: "capture.email" })).toBe(
      1,
    );
  });
});
describe("Calendar behavior and durable jobs", () => {
  test("routes linked circle calendar through owner, otherwise through committer default", async () => {
    await model("calendarAccounts").create({
      userId: owner,
      provider: "google",
      refreshToken: "x",
      calendars: [{ id: "family", name: "Family", writable: true }],
      status: "ok",
    });
    await model("calendarAccounts").create({
      userId: guest,
      provider: "google",
      refreshToken: "x",
      calendars: [
        { id: "personal", name: "Personal", writable: true, primary: true },
      ],
      status: "ok",
    });
    const c = await model("circles").create({
      ownerId: owner,
      name: "Family",
      color: "green",
      linkedCalendarId: "family",
    });
    const p = await model("plans").create({
      ...plan,
      ownerId: guest,
      circleId: c._id,
      timeZone: "UTC",
    });
    const cal = app.get(CalendarService);
    expect(await cal.resolveTarget(p.toObject(), guest)).toEqual({
      userId: owner,
      calendarId: "family",
    });
    expect(
      await cal.resolveTarget({ ...p.toObject(), circleId: undefined }, guest),
    ).toEqual({ userId: guest, calendarId: "personal" });
  });
  test("retries do not duplicate calendar events and check ownership before updates/deletes", async () => {
    const p = await model("plans").create({
      ...plan,
      status: "committed",
      ownerId: owner,
      timeZone: "UTC",
    });
    const cal = app.get(CalendarService);
    vi.spyOn(cal, "token").mockResolvedValue("access");
    vi.spyOn(cal, "resolveTarget").mockResolvedValue({
      userId: owner,
      calendarId: "family",
    });
    let event: any = null;
    let creates = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        const method = options?.method ?? "GET";
        if (method === "GET")
          return event
            ? Response.json(event)
            : new Response("", { status: 404 });
        if (method === "POST") {
          creates++;
          event = JSON.parse(options.body);
          return Response.json(event);
        }
        if (method === "PATCH") {
          event = { ...event, ...JSON.parse(options.body) };
          return Response.json(event);
        }
        return new Response(null, { status: 204 });
      }),
    );
    try {
      await cal.write(p._id);
      await cal.write(p._id);
      expect(creates).toBe(1);
      const firstId = event.id;
      await api(owner, "post", `/plans/${p._id}/uncommit`, {});
      await api(owner, "post", `/plans/${p._id}/commit`, {});
      event = null;
      await cal.write(p._id);
      expect(event.id).not.toBe(firstId);
      expect(creates).toBe(2);
      event.extendedProperties.private.planbreezePlanId = "someone-else";
      await expect(
        cal.deleteEvent(
          { userId: owner, calendarId: "family", eventId: event.id },
          p._id,
        ),
      ).rejects.toThrow(/ownership/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  test("worker retries failures, resumes expired leases, and deduplicates scheduled work", async () => {
    const jobs = app.get(JobsService);
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue(undefined);
    jobs.register("test", handler);
    await jobs.enqueue("test", {}, "daily-test");
    await jobs.enqueue("test", {}, "daily-test");
    expect(await model("jobs").countDocuments()).toBe(1);
    process.env.JOBS_ENABLED = "true";
    try {
      await jobs.tick();
      expect(handler).toHaveBeenCalledTimes(1);
      expect((await model("jobs").findOne().lean()).state).toBe("pending");
      await model("jobs").updateOne(
        {},
        { $set: { state: "running", leaseUntil: new Date(0) } },
      );
      await jobs.tick();
      expect((await model("jobs").findOne().lean()).state).toBe("done");
      expect(handler).toHaveBeenCalledTimes(2);
    } finally {
      process.env.JOBS_ENABLED = "false";
    }
  });
  test("all-day dates stay local and Google exclusive ends convert back correctly", () => {
    expect(
      eventBody({
        ...plan,
        _id: "plan",
        ownerId: owner,
        _creationTime: 0,
        status: "radar",
        timeZone: "America/Los_Angeles",
      }).end,
    ).toEqual({ date: "2026-11-11" });
    expect(
      readonlyCalendarEvent(
        { id: "g", start: { date: "2026-11-10" }, end: { date: "2026-11-12" } },
        { id: "cal", name: "Personal" },
        range.from,
        range.to,
      )?.endDate,
    ).toBe("2026-11-11");
  });
});
describe("OpenAI and extraction", () => {
  test("uses Responses web search and accepts only exact returned source URLs", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    let request: any;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        request = JSON.parse(options.body);
        return Response.json({
          id: "resp",
          object: "response",
          status: "completed",
          output: [
            {
              type: "web_search_call",
              id: "search",
              status: "completed",
              action: {
                type: "search",
                sources: [
                  { type: "url", url: "https://venue.example/events/1" },
                ],
              },
            },
            {
              type: "message",
              id: "msg",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: "Found it",
                  annotations: [
                    {
                      type: "url_citation",
                      url: "https://venue.example/events/1",
                      title: "Venue",
                      start_index: 0,
                      end_index: 8,
                    },
                  ],
                },
              ],
            },
          ],
        });
      }),
    );
    try {
      const result = await callOpenAI({
        system: "Find events",
        messages: [{ role: "user", content: "Jazz" }],
        webSearch: {},
      });
      expect(request.tools).toEqual([{ type: "web_search" }]);
      expect(request.store).toBe(false);
      expect(result.text).toBe("Found it");
      const e = {
        title: "Jazz",
        startDate: "2026-11-10",
        endDate: "2026-11-10",
      };
      expect(
        grounded(
          [
            { ...e, url: "https://venue.example/events/1" },
            { ...e, url: "https://venue.example/events/1-invented" },
          ],
          result.sourceUrls,
        ),
      ).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
      delete process.env.OPENAI_API_KEY;
    }
  });
  test("validates AI events and reads structured event pages", () => {
    expect(
      parseEvents(
        '<events>[null,42,{"title":"Bad","startDate":"2026-02-30"}]</events>',
      ),
    ).toEqual([]);
    expect(
      eventsFromJsonLd(
        '<script type="application/ld+json">{"@type":"Event","name":"Jazz","startDate":"2026-11-10T19:00:00-08:00"}</script>',
      )[0],
    ).toMatchObject({
      title: "Jazz",
      startDate: "2026-11-10",
      startTime: "19:00",
    });
  });
  test("calendar refresh token encryption round-trips without plaintext storage", async () => {
    const encrypted = await encrypt("refresh-secret");
    expect(encrypted).not.toContain("refresh-secret");
    expect(await decrypt(encrypted)).toBe("refresh-secret");
  });
});

describe("Breeze workflows", () => {
  test("chat background processing returns sourced events; search results deduplicate and save once", async () => {
    const user = await model("users").findById(owner).lean();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: user.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const event = {
      title: "Sourced jazz",
      startDate: today,
      endDate: today,
      url: "https://venue.example/jazz",
    };
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: "resp",
          object: "response",
          status: "completed",
          output: [
            {
              type: "web_search_call",
              id: "search",
              status: "completed",
              action: {
                type: "search",
                sources: [{ type: "url", url: event.url }],
              },
            },
            {
              type: "message",
              id: "msg",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: `Found jazz.<events>${JSON.stringify([event])}</events>`,
                  annotations: [],
                },
              ],
            },
          ],
        }),
      ),
    );
    try {
      const sent = await api(owner, "post", "/breeze/messages", {
        text: "Find jazz",
      });
      expect(sent.status).toBe(201);
      const reply = await model("messages")
        .findOne({ chatId: sent.text, pending: true })
        .lean();
      const breeze = app.get(BreezeService);
      await breeze.respond(owner, sent.text, reply._id);
      const messages = (
        await api(owner, "get", `/breeze/chats/${sent.text}/messages`)
      ).body;
      expect(messages.find((m: any) => m.role === "assistant")).toMatchObject({
        pending: false,
        text: "Found jazz.",
        events: [{ title: event.title, url: event.url }],
      });
      const search = await api(owner, "post", "/breeze/searches", {
        query: "Jazz nearby",
      });
      expect(search.status).toBe(201);
      await breeze.runSearch(search.text);
      await breeze.runSearch(search.text);
      const suggestions = await breeze.listSuggestions(owner);
      expect(suggestions).toHaveLength(1);
      const id = suggestions[0]!._id;
      const added = await api(
        owner,
        "post",
        `/breeze/suggestions/${id}/add`,
        {},
      );
      expect(added.status).toBe(201);
      expect((await model("plans").findById(added.text).lean()).status).toBe(
        "radar",
      );
      expect(
        (await api(owner, "post", `/breeze/suggestions/${id}/add`, {})).status,
      ).toBe(404);
      expect(
        await model("jobs").countDocuments({ kind: "calendar.write" }),
      ).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      delete process.env.OPENAI_API_KEY;
    }
  });
  test("capture draft saves once and updates its status on standalone MongoDB", async () => {
    const event = {
      title: "Captured event",
      startDate: plan.startDate,
      endDate: plan.endDate,
    };
    const cap = await model("captures").create({
      userId: owner,
      source: "email",
      status: "draft",
      draft: event,
    });
    expect(
      (
        await api(owner, "post", "/capture/save", {
          event,
          status: "radar",
          captureId: cap._id,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await api(owner, "post", "/capture/save", {
          event,
          status: "radar",
          captureId: cap._id,
        })
      ).status,
    ).toBe(404);
    expect(await model("plans").countDocuments()).toBe(1);
    expect((await model("captures").findById(cap._id).lean()).status).toBe(
      "saved",
    );
  });
});
describe("snapshot migration", () => {
  test("dry-run writes nothing; apply preserves IDs, identities, encrypted tokens, and queues pending commits", async () => {
    const root = await mkdtemp(join(tmpdir(), "planbreeze-import-"));
    const snapshot = {
      users: [
        {
          _id: "legacy-user",
          _creationTime: 1,
          email: "Legacy@Example.com",
          name: "Legacy",
          emailVerificationTime: 1,
        },
      ],
      plans: [
        {
          ...plan,
          _id: "legacy-plan",
          _creationTime: 2,
          ownerId: "legacy-user",
          status: "committed",
          timeZone: "America/Los_Angeles",
          calendarStatus: "pending",
        },
      ],
      calendarAccounts: [
        {
          _id: "legacy-calendar",
          _creationTime: 3,
          userId: "legacy-user",
          provider: "google",
          refreshToken: await encrypt("old-token"),
          calendars: [],
          status: "ok",
        },
      ],
      authAccounts: [
        {
          _id: "legacy-account",
          provider: "google",
          providerAccountId: "google-legacy-sub",
          userId: "legacy-user",
        },
      ],
      messages: [],
    };
    for (const [name, rows] of Object.entries(snapshot)) {
      await mkdir(join(root, name));
      await writeFile(
        join(root, name, "documents.jsonl"),
        rows.map((r) => JSON.stringify(r)).join("\n"),
      );
    }
    const run = promisify(execFile);
    const uri = mongo.getUri("import-test");
    const options = {
      cwd: process.cwd(),
      env: { ...process.env, MONGODB_URI: uri },
      timeout: 30000,
    };
    const dry = await run(
      process.execPath,
      ["server/scripts/import-convex.mjs", root],
      options,
    );
    expect(dry.stdout).toContain("Dry run complete");
    expect(
      await connection
        .getClient()
        .db("import-test")
        .collection("users")
        .countDocuments(),
    ).toBe(0);
    await run(
      process.execPath,
      ["server/scripts/import-convex.mjs", root, "--apply"],
      options,
    );
    const imported = connection.getClient().db("import-test");
    expect((await imported.collection("users").findOne())?.email).toBe(
      "legacy@example.com",
    );
    expect((await imported.collection("users").findOne())?._id).toBe(
      "legacy-user",
    );
    expect((await imported.collection("identities").findOne())?.subject).toBe(
      "google-legacy-sub",
    );
    expect(
      await decrypt(
        (await imported.collection("calendarAccounts").findOne())!.refreshToken,
      ),
    ).toBe("old-token");
    expect(
      await imported
        .collection("jobs")
        .countDocuments({ kind: "calendar.write" }),
    ).toBe(1);
    await expect(
      run(
        process.execPath,
        ["server/scripts/import-convex.mjs", root, "--apply"],
        options,
      ),
    ).rejects.toThrow(/not empty/);
  });
});
