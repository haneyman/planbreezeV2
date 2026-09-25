// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
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
