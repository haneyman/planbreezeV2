import { describe, expect, test } from "vitest";
import { packBars, rangeFor, ticksFor } from "./timeline";

describe("timeline", () => {
  test("ranges start on Monday (weeks) or the 1st (months)", () => {
    expect(rangeFor("twoMonths", "2026-09-24")).toMatchObject({ from: "2026-09-21", to: "2026-11-30", tick: "week" });
    expect(rangeFor("month", "2026-09-24", 1)).toMatchObject({ from: "2026-10-26", to: "2026-11-30" });
    expect(rangeFor("year", "2026-09-24")).toMatchObject({ from: "2026-09-01", to: "2027-09-01", label: "Sep 2026 – Aug 2027" });
    expect(ticksFor(rangeFor("quarter", "2026-09-24")).map((t) => t.label)).toEqual(["Sep", "Oct", "Nov", "Dec"]);
  });

  test("overlapping plans go on separate rows; plans outside the range are dropped", () => {
    const r = rangeFor("twoMonths", "2026-09-24");
    const items = [
      { title: "Napa weekend with the Parks", startDate: "2026-10-23", endDate: "2026-10-25" },
      { title: "Mom's 70th birthday dinner", startDate: "2026-10-24", endDate: "2026-10-24" },
      { title: "Europe", startDate: "2027-06-12", endDate: "2027-06-26" },
    ];
    const { bars, rows } = packBars(items, r, 800);
    expect(bars).toHaveLength(2);
    expect(rows).toBe(2);
    expect(new Set(bars.map((b) => b.row)).size).toBe(2);
  });
});
