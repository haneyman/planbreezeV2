import { BadRequestException } from "@nestjs/common";
export const isDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export function checkDates(p: {
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
}) {
  if (!isDate(p.startDate) || !isDate(p.endDate))
    throw new BadRequestException("Dates must be YYYY-MM-DD.");
  if (p.endDate < p.startDate)
    throw new BadRequestException("The end date is before the start date.");
  if (
    (p.startTime && !isTime(p.startTime)) ||
    (p.endTime && !isTime(p.endTime))
  )
    throw new BadRequestException("Times must be HH:MM.");
  if (p.endTime && !p.startTime)
    throw new BadRequestException("An end time requires a start time.");
  if (
    p.startTime &&
    p.endTime &&
    p.startDate === p.endDate &&
    p.endTime <= p.startTime
  )
    throw new BadRequestException("The end time must follow the start time.");
}
export function addDays(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const overlaps = (
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
) => a.startDate <= b.endDate && b.startDate <= a.endDate;
export const dedupeKey = (e: { title: string; startDate: string }) =>
  e.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim() +
  "|" +
  e.startDate;
export const normalizeEmail = (s: string) => s.trim().toLowerCase();
export function localToday(timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function checkZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
  } catch {
    throw new BadRequestException("Invalid time zone.");
  }
}

export function checkEventExtras(event: {
  ticketOnSaleDate?: string;
  url?: string;
}) {
  if (event.ticketOnSaleDate && !isDate(event.ticketOnSaleDate))
    throw new BadRequestException("Ticket sale date must be YYYY-MM-DD.");
  if (event.url) {
    try {
      const url = new URL(event.url);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      throw new BadRequestException("Use an HTTP or HTTPS link.");
    }
  }
}
