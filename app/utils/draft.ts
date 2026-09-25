import type { EventCandidate, Plan, PlanDraft } from "./types";

export function emptyDraft(date: string, circleId = "me"): PlanDraft {
  return {
    title: "",
    startDate: date,
    endDate: date,
    startTime: "",
    endTime: "",
    place: "",
    url: "",
    note: "",
    priceText: "",
    ticketOnSaleDate: "",
    circleId,
    status: "radar",
  };
}

export function draftFromEvent(e: EventCandidate, circleId = "me"): PlanDraft {
  return {
    ...emptyDraft(e.startDate, circleId),
    title: e.title,
    endDate: e.endDate,
    startTime: e.startTime ?? "",
    endTime: e.endTime ?? "",
    place: e.place ?? "",
    url: e.url ?? "",
    note: e.reason ?? "",
    priceText: e.priceText ?? "",
    ticketOnSaleDate: e.ticketOnSaleDate ?? "",
  };
}

export function draftFromPlan(p: Plan): PlanDraft {
  return {
    title: p.title,
    startDate: p.startDate,
    endDate: p.endDate,
    startTime: p.startTime ?? "",
    endTime: p.endTime ?? "",
    place: p.place ?? "",
    url: p.url ?? "",
    note: p.note ?? "",
    priceText: p.priceText ?? "",
    ticketOnSaleDate: p.ticketOnSaleDate ?? "",
    circleId: p.circleId ?? "me",
    status: p.status,
  };
}

/** Optional fields: empty string → undefined, for Convex args. */
export function draftToArgs(d: PlanDraft) {
  const opt = (s: string) => (s.trim() ? s.trim() : undefined);
  return {
    title: d.title.trim(),
    startDate: d.startDate,
    endDate: d.endDate || d.startDate,
    startTime: opt(d.startTime),
    endTime: opt(d.endTime),
    place: opt(d.place),
    url: opt(d.url),
    note: opt(d.note),
    priceText: opt(d.priceText),
    ticketOnSaleDate: opt(d.ticketOnSaleDate),
  };
}
