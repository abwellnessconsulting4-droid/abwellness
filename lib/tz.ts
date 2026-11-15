/**
 * Wall-clock times in a clinic time zone (e.g. "Wednesdays 10:00–18:00 in
 * America/New_York") converted to exact instants, DST-aware.
 */

function offsetMinutes(timeZone: string, at: Date) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

/** The instant when the wall clock in `timeZone` reads `date` (YYYY-MM-DD) at `time` (HH:MM). */
export function zonedTime(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes handle the hour around DST changes.
  let instant = guess - offsetMinutes(timeZone, new Date(guess)) * 60_000;
  instant = guess - offsetMinutes(timeZone, new Date(instant)) * 60_000;
  return new Date(instant);
}

/** YYYY-MM-DD of an instant in a time zone. */
export function dateKey(at: Date, timeZone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Day of week (0 = Sunday) of a calendar date. */
export function weekdayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function formatTime(at: Date, timeZone = "America/New_York") {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(at);
}

export function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
