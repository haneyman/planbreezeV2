import type { PlanRecord } from "../../../shared/types.js";
import { addDays } from "../common/validation.js";
type GoogleApiEvent = GoogleEvent & {
  id?: string;
  location?: string;
  htmlLink?: string;
  extendedProperties?: {
    private?: { planbreezePlanId?: string };
    shared?: { planbreezePlanId?: string };
  };
};

export type ReadonlyCalendarEvent = {
  _id: string;
  eventId: string;
  calendarId: string;
  calendarName: string;
  title: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  place?: string;
  url?: string;
  status: "google";
};

export function readonlyCalendarEvent(
  event: GoogleApiEvent,
  calendar: { id: string; name: string },
  from: string,
  to: string,
): ReadonlyCalendarEvent | null {
  if (
    !event.id ||
    event.status === "cancelled" ||
    event.extendedProperties?.private?.planbreezePlanId ||
    event.extendedProperties?.shared?.planbreezePlanId
  )
    return null;
  // Google returns timed events in the timeZone requested by calendarEvents.
  const dates = fromGoogleTimes(event);
  if (!dates) return null;
  // Google end dates/times are exclusive; a midnight ending occupies the previous day.
  if (
    event.end?.dateTime &&
    dates.endTime === "00:00" &&
    dates.endDate > dates.startDate
  )
    dates.endDate = addDays(dates.endDate, -1);
  if (dates.endDate < from || dates.startDate >= to) return null;
  const url =
    event.htmlLink?.startsWith("https://www.google.com/calendar/") ||
    event.htmlLink?.startsWith("https://calendar.google.com/")
      ? event.htmlLink
      : undefined;
  return {
    _id: `google:${encodeURIComponent(calendar.id)}:${event.id}`,
    eventId: event.id,
    calendarId: calendar.id,
    calendarName: calendar.name,
    title: (event.summary || "Busy").slice(0, 500),
    ...dates,
    ...(event.location ? { place: event.location.slice(0, 1000) } : {}),
    ...(url ? { url } : {}),
    status: "google",
  };
}

function plusHour(t: string) {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h >= 23
    ? "23:59"
    : `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function eventBody(plan: PlanRecord) {
  const description = [plan.note, plan.url, "Added from PlanBreeze"]
    .filter(Boolean)
    .join("\n\n");
  const common = {
    summary: plan.title,
    location: plan.place,
    description,
    extendedProperties: { private: { planbreezePlanId: plan._id } },
  };
  if (!plan.startTime) {
    return {
      ...common,
      start: { date: plan.startDate },
      end: { date: addDays(plan.endDate, 1) },
    };
  }
  const endTime = plan.endTime ?? plusHour(plan.startTime);
  return {
    ...common,
    start: {
      dateTime: `${plan.startDate}T${plan.startTime}:00`,
      timeZone: plan.timeZone,
    },
    end: { dateTime: `${plan.endDate}T${endTime}:00`, timeZone: plan.timeZone },
  };
}

type GoogleEvent = {
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

export function fromGoogleTimes(ev: GoogleEvent) {
  if (ev.start?.date && ev.end?.date)
    return { startDate: ev.start.date, endDate: addDays(ev.end.date, -1) };
  if (ev.start?.dateTime && ev.end?.dateTime) {
    // dateTime includes the offset of the event's zone, e.g. 2026-10-10T13:00:00-07:00
    return {
      startDate: ev.start.dateTime.slice(0, 10),
      endDate: ev.end.dateTime.slice(0, 10),
      startTime: ev.start.dateTime.slice(11, 16),
      endTime: ev.end.dateTime.slice(11, 16),
    };
  }
  return null;
}
