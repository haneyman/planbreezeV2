// Plans use local calendar dates ("YYYY-MM-DD"); all math here is on UTC midnights of those dates.

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY = 86_400_000;

export const toMs = (d: string) => Date.parse(d + "T00:00:00Z");
export const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fromMs(toMs(d) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY);

export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addMonths(d: string, n: number) {
  const t = new Date(toMs(d));
  return fromMs(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + n, 1));
}

export const startOfMonth = (d: string) => d.slice(0, 8) + "01";

export function startOfWeek(d: string) {
  const dow = new Date(toMs(d)).getUTCDay(); // 0 = Sunday
  return addDays(d, -((dow + 6) % 7)); // Monday
}

export function shortDate(d: string) {
  const t = new Date(toMs(d));
  return `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}`;
}

export function formatTime(t?: string) {
  if (!t) return "";
  const [h = 0, m = 0] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, "0")} ${suffix}` : `${hr} ${suffix}`;
}

/** "Sat, Oct 10, 2026 · 1 pm" / "Oct 23 – 25, 2026" / "Dec 22, 2026 – Jan 2, 2027" */
export function formatWhen(p: { startDate: string; endDate: string; startTime?: string; endTime?: string }) {
  const a = new Date(toMs(p.startDate));
  const b = new Date(toMs(p.endDate));
  const time = p.startTime ? ` · ${formatTime(p.startTime)}${p.endTime ? ` – ${formatTime(p.endTime)}` : ""}` : "";
  if (p.startDate === p.endDate)
    return `${WEEKDAYS[a.getUTCDay()]}, ${shortDate(p.startDate)}, ${a.getUTCFullYear()}${time}`;
  if (a.getUTCFullYear() !== b.getUTCFullYear())
    return `${shortDate(p.startDate)}, ${a.getUTCFullYear()} – ${shortDate(p.endDate)}, ${b.getUTCFullYear()}`;
  if (a.getUTCMonth() === b.getUTCMonth())
    return `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()} – ${b.getUTCDate()}, ${a.getUTCFullYear()}${time}`;
  return `${shortDate(p.startDate)} – ${shortDate(p.endDate)}, ${b.getUTCFullYear()}${time}`;
}

export function relativeDays(from: string, to: string) {
  const n = daysBetween(from, to);
  if (n < 0) return n === -1 ? "Yesterday" : `${-n} days ago`;
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n > 60) return `In about ${Math.round(n / 30.4)} months`;
  return `In ${n} days`;
}
