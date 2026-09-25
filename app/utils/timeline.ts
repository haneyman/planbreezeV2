import { addDays, addMonths, MONTHS, shortDate, startOfMonth, startOfWeek, toMs } from "./dates";

export type Zoom = "month" | "twoMonths" | "quarter" | "year";

export const ZOOMS: { id: Zoom; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "twoMonths", label: "2 months" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year+" },
];

export type Range = { from: string; to: string; tick: "week" | "month"; label: string };

/** Visible range for a zoom level, shifted `offset` steps from today. `to` is exclusive. */
export function rangeFor(zoom: Zoom, today: string, offset = 0): Range {
  let from: string;
  let to: string;
  let tick: Range["tick"];
  if (zoom === "month" || zoom === "twoMonths") {
    const weeks = zoom === "month" ? 5 : 10;
    from = addDays(startOfWeek(today), offset * weeks * 7);
    to = addDays(from, weeks * 7);
    tick = "week";
  } else {
    const months = zoom === "quarter" ? 4 : 12;
    from = addMonths(startOfMonth(today), offset * months);
    to = addMonths(from, months);
    tick = "month";
  }
  const last = addDays(to, -1);
  const y1 = from.slice(0, 4);
  const y2 = last.slice(0, 4);
  const label =
    tick === "week"
      ? `${shortDate(from)}${y1 !== y2 ? `, ${y1}` : ""} – ${shortDate(last)}, ${y2}`
      : `${MONTHS[+from.slice(5, 7) - 1]} ${y1 !== y2 ? y1 + " " : ""}– ${MONTHS[+last.slice(5, 7) - 1]} ${y2}`;
  return { from, to, tick, label };
}

export type Tick = { left: number; width: number; label: string; sub: string };

export function ticksFor(r: Range): Tick[] {
  const pct = pctFn(r);
  const starts: string[] = [];
  for (let d = r.from; d < r.to; d = r.tick === "week" ? addDays(d, 7) : addMonths(d, 1)) starts.push(d);
  return starts.map((d, i) => {
    const next = starts[i + 1] ?? r.to;
    const month = +d.slice(5, 7) - 1;
    return {
      left: pct(d),
      width: pct(next) - pct(d),
      label: r.tick === "week" ? shortDate(d) : MONTHS[month]!,
      sub: r.tick === "month" && (i === 0 || month === 0) ? d.slice(0, 4) : "",
    };
  });
}

export const pctFn = (r: Range) => {
  const a = toMs(r.from);
  const span = toMs(r.to) - a;
  return (d: string) => ((toMs(d) - a) / span) * 100;
};

export type Bar<T> = {
  item: T;
  left: number; // %
  width: number; // %
  row: number;
  labelInside: boolean;
  labelSide: "right" | "left";
};

/**
 * Lay out plans in rows so bars and their labels don't collide.
 * trackPx is the rendered width of the track, used to estimate label widths.
 */
export function packBars<T extends { startDate: string; endDate: string; title: string }>(
  items: T[],
  r: Range,
  trackPx: number,
): { bars: Bar<T>[]; rows: number } {
  const pct = pctFn(r);
  const rowEnds: number[] = [];
  const bars: Bar<T>[] = [];
  const sorted = [...items].sort((a, b) => a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate));
  for (const item of sorted) {
    const s = item.startDate < r.from ? r.from : item.startDate;
    const e = addDays(item.endDate, 1) > r.to ? r.to : addDays(item.endDate, 1);
    if (e <= r.from || s >= r.to) continue;
    const left = pct(s);
    const width = Math.max(pct(e) - left, 0);
    const barPx = Math.max((width / 100) * trackPx, 14);
    const labelPx = item.title.length * 7 + 24;
    const labelInside = barPx >= labelPx;
    let a = left;
    let b = left + (barPx / trackPx) * 100;
    let labelSide: "right" | "left" = "right";
    if (!labelInside) {
      const rightEnd = left + ((barPx + 6 + labelPx) / trackPx) * 100;
      if (rightEnd <= 100) b = rightEnd;
      else {
        labelSide = "left";
        a = left - ((labelPx + 6) / trackPx) * 100;
      }
    }
    let row = rowEnds.findIndex((end) => end < a - 0.4);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(0);
    }
    rowEnds[row] = b;
    bars.push({ item, left, width, row, labelInside, labelSide });
  }
  return { bars, rows: Math.max(rowEnds.length, 1) };
}
