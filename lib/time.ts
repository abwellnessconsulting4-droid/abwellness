/** Start and end of "today" in a clinic time zone, as UTC Dates. */
export function dayRange(timeZone = "America/New_York", now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const offsetFor = (date: Date) => {
    const tz = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const match = tz.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0;
  };
  const midnightUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const start = new Date(midnightUtc - offsetFor(new Date(midnightUtc)) * 60_000);
  const end = new Date(start.getTime() + 24 * 3_600_000);
  return { start, end };
}

export function formatDateTime(date: Date, timeZone = "America/New_York") {
  return new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
