// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { eventsFromJsonLd } from "./capture";
import { parseEvents } from "./claude";

async function setup() {
  const t = convexTest(schema, modules);
  const mark = await t.run((ctx) => ctx.db.insert("users", { name: "Mark", email: "mark@example.com", timeZone: "America/Los_Angeles" }));
  const dana = await t.run((ctx) => ctx.db.insert("users", { name: "Dana", email: "dana@example.com" }));
  const as = (id: string) => t.withIdentity({ subject: `${id}|session` });
  return { t, mark, dana, asMark: as(mark), asDana: as(dana) };
}

const plan = { title: "Harvest wine tasting", startDate: "2026-10-10", endDate: "2026-10-10" };

describe("circles", () => {
  test("create a circle with members; existing users are linked by email", async () => {
    const { asMark, asDana } = await setup();
    await asMark.mutation(api.circles.create, {
      name: "Family",
      color: "#3F7A5A",
      members: [
        { email: "Dana@Example.com", label: "Dana", access: "coPlanner" },
        { email: "lisa@example.com", label: "Aunt Lisa" },
      ],
    });
    const [family] = await asMark.query(api.circles.list, {});
    expect(family!.name).toBe("Family");
    expect(family!.members.map((m) => [m.label, m.access, m.joined])).toEqual([
      ["Mark", "owner", true],
      ["Dana", "coPlanner", true],
      ["Aunt Lisa", "contributor", false],
    ]);
    // Dana sees the circle too
    expect((await asDana.query(api.circles.list, {})).map((c) => c.name)).toEqual(["Family"]);
  });

  test("rejects duplicate emails and bad addresses", async () => {
    const { asMark } = await setup();
    const id = await asMark.mutation(api.circles.create, { name: "Crew", color: "#46698F", members: [{ email: "jen@example.com", label: "Jen" }] });
    await expect(asMark.mutation(api.circles.addMember, { circleId: id, member: { email: "jen@example.com", label: "Jen" } })).rejects.toThrow(/already/);
    await expect(asMark.mutation(api.circles.addMember, { circleId: id, member: { email: "nope", label: "X" } })).rejects.toThrow(/email/);
  });
});

describe("plans", () => {
  test("just-me plans are private; circle plans are shared with members", async () => {
    const { asMark, asDana } = await setup();
    const family = await asMark.mutation(api.circles.create, { name: "Family", color: "#3F7A5A", members: [{ email: "dana@example.com", label: "Dana" }] });
    await asMark.mutation(api.plans.create, { ...plan, status: "radar" });
    await asMark.mutation(api.plans.create, { ...plan, title: "Pumpkin patch", circleId: family, status: "radar" });
    const range = { from: "2026-10-01", to: "2026-10-31" };
    expect((await asMark.query(api.plans.list, range)).map((p) => p.title).sort()).toEqual(["Harvest wine tasting", "Pumpkin patch"]);
    expect((await asDana.query(api.plans.list, range)).map((p) => p.title)).toEqual(["Pumpkin patch"]);
    // outside the range
    expect(await asMark.query(api.plans.list, { from: "2026-11-01", to: "2026-11-30" })).toEqual([]);
  });

  test("contributors can add radar plans but not commit", async () => {
    const { asMark, asDana } = await setup();
    const family = await asMark.mutation(api.circles.create, { name: "Family", color: "#3F7A5A", members: [{ email: "dana@example.com", label: "Dana" }] });
    const id = await asDana.mutation(api.plans.create, { ...plan, circleId: family, status: "radar" });
    await expect(asDana.mutation(api.plans.commit, { planId: id })).rejects.toThrow(/co-planners/);
    await asMark.mutation(api.plans.commit, { planId: id });
    const [p] = await asMark.query(api.plans.list, { from: "2026-10-01", to: "2026-10-31" });
    expect(p!.status).toBe("committed");
    expect(p!.calendarStatus).toBe("pending");
  });

  test("commit goes to the circle's linked calendar, else the default calendar", async () => {
    const { t, mark, asMark } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("calendarAccounts", {
        userId: mark as any,
        provider: "google",
        refreshToken: "x",
        status: "ok",
        calendars: [
          { id: "personal@group", name: "Personal", primary: true, writable: true },
          { id: "family@group", name: "Family", writable: true },
        ],
      });
      await ctx.db.patch(mark as any, { defaultCalendarId: "personal@group" });
    });
    const family = await asMark.mutation(api.circles.create, { name: "Family", color: "#3F7A5A", linkedCalendarId: "family@group", members: [] });
    const crew = await asMark.mutation(api.circles.create, { name: "Crew", color: "#46698F", members: [] });
    const a = await asMark.mutation(api.plans.create, { ...plan, circleId: family, status: "radar" });
    const b = await asMark.mutation(api.plans.create, { ...plan, circleId: crew, status: "radar" });
    const c = await asMark.mutation(api.plans.create, { ...plan, status: "radar" });
    const target = async (planId: any) => (await t.query(internal.google.resolveTarget, { planId }))!.target!.calendarId;
    expect(await target(a)).toBe("family@group");
    expect(await target(b)).toBe("personal@group");
    expect(await target(c)).toBe("personal@group");
    const labels = Object.fromEntries((await asMark.query(api.plans.list, { from: "2026-10-01", to: "2026-10-31" })).map((p) => [p._id, p.calendarLabel]));
    expect(labels[a]).toBe("Family calendar");
    expect(labels[c]).toBe("Personal calendar");
  });

  test("rejects bad dates", async () => {
    const { asMark } = await setup();
    await expect(asMark.mutation(api.plans.create, { ...plan, endDate: "2026-10-01", status: "radar" })).rejects.toThrow(/before/);
    await expect(asMark.mutation(api.plans.create, { ...plan, startDate: "10/10/2026", status: "radar" })).rejects.toThrow(/YYYY/);
  });
});

describe("extraction", () => {
  test("reads schema.org events from JSON-LD", () => {
    const html = `<html><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"MusicEvent","name":"Harvest Night","startDate":"2026-10-10T13:00:00-07:00","endDate":"2026-10-10T17:00:00-07:00","location":{"@type":"Place","name":"Ridgeline Cellars","address":{"addressLocality":"Sonoma"}},"offers":{"price":"45","priceCurrency":"USD","validFrom":"2026-10-01T09:00"}}]}</script></html>`;
    expect(eventsFromJsonLd(html)).toEqual([
      {
        title: "Harvest Night",
        startDate: "2026-10-10",
        endDate: "2026-10-10",
        startTime: "13:00",
        endTime: "17:00",
        place: "Ridgeline Cellars, Sonoma",
        priceText: "$45",
        url: undefined,
        ticketOnSaleDate: "2026-10-01",
      },
    ]);
  });

  test("parses and validates Breeze's <events> block", () => {
    const text = `Here you go. <events>[{"title":"Jazz","startDate":"2026-10-18","url":"https://a.example/jazz"},{"title":"Bad","startDate":"soon"}]</events>`;
    expect(parseEvents(text)).toEqual([
      expect.objectContaining({ title: "Jazz", startDate: "2026-10-18", endDate: "2026-10-18", url: "https://a.example/jazz" }),
    ]);
  });
});


describe("read-only Google planner events", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const range = { calendarId: "personal@group", from: "2026-10-01", to: "2026-11-01", timeZone: "America/Los_Angeles" };
  const event = (id: string) => ({ id, summary: id, start: { date: "2026-10-10" }, end: { date: "2026-10-11" } });
  async function connected() {
    const users = await setup();
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", btoa("k".repeat(32)));
    vi.stubEnv("AUTH_GOOGLE_ID", "test-client");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "test-secret");
    const { encrypt } = await import("./lib");
    const refreshToken = await encrypt("test-refresh-token");
    await users.t.run((ctx) => ctx.db.insert("calendarAccounts", {
      userId: users.mark, provider: "google", refreshToken, status: "ok",
      calendars: [{ id: range.calendarId, name: "Personal", writable: true }],
    }));
    return users;
  }
  test("rejects unauthenticated callers, other users' calendars, and invalid ranges before Google access", async () => {
    const { t, asMark, asDana } = await connected();
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(t.action(api.google.calendarEvents, range)).rejects.toThrow(/sign in/);
    await expect(asDana.action(api.google.calendarEvents, range)).rejects.toThrow(/not connected/);
    await expect(asMark.action(api.google.calendarEvents, { ...range, calendarId: "someone-else" })).rejects.toThrow(/not connected/);
    await expect(asMark.action(api.google.calendarEvents, { ...range, from: "2026-02-30" })).rejects.toThrow(/range/);
    await expect(asMark.action(api.google.calendarEvents, { ...range, to: "2028-01-01" })).rejects.toThrow(/range/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test("loads recurring instances across pages, removes duplicates and cancelled events, preserves date boundaries", async () => {
    const { t, asMark } = await connected();
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "test-access" }))
      .mockResolvedValueOnce(Response.json({ items: [
        event("all-day"), { ...event("cancelled"), status: "cancelled" },
        { ...event("owned"), extendedProperties: { private: { planbreezePlanId: "plan" } } },
        { ...event("outside"), start: { date: "2026-11-01" }, end: { date: "2026-11-02" } },
      ], nextPageToken: "page-two" }))
      .mockResolvedValueOnce(Response.json({ items: [{
        id: "recurring_20261011", summary: "Weekly dinner",
        start: { dateTime: "2026-10-10T23:00:00-07:00" }, end: { dateTime: "2026-10-11T00:00:00-07:00" },
        htmlLink: "https://calendar.google.com/calendar/event?eid=test",
      }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await asMark.action(api.google.calendarEvents, range);
    expect(result.truncated).toBe(false);
    expect(result.events.map((e) => e.eventId)).toEqual(["all-day", "recurring_20261011"]);
    expect(result.events[0]).toMatchObject({ startDate: "2026-10-10", endDate: "2026-10-10", status: "google" });
    expect(result.events[1]).toMatchObject({ startTime: "23:00", endTime: "00:00", endDate: "2026-10-10" });
    const request = new URL(fetchMock.mock.calls[1]![0]);
    expect(request.searchParams.get("singleEvents")).toBe("true");
    expect(request.searchParams.get("timeZone")).toBe(range.timeZone);
    expect(new URL(fetchMock.mock.calls[2]![0]).searchParams.get("pageToken")).toBe("page-two");
    expect(await t.run((ctx) => ctx.db.query("plans").collect())).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("test-access");
    expect(JSON.stringify(result)).not.toContain("test-refresh-token");
  });
  test("reports truncated results instead of silently dropping later pages", async () => {
    const { asMark } = await connected();
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "test-access" }))
      .mockImplementation(() => Promise.resolve(Response.json({ items: [], nextPageToken: "more" })));
    vi.stubGlobal("fetch", fetchMock);
    expect((await asMark.action(api.google.calendarEvents, range)).truncated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
  test("reports Google failures without leaking the response or credentials", async () => {
    const { asMark } = await connected();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ access_token: "test-access" }))
      .mockResolvedValueOnce(new Response("private response", { status: 403 })));
    await expect(asMark.action(api.google.calendarEvents, range)).rejects.toThrow(/Could not load Google events/);
  });
});
