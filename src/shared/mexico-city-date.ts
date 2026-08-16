const MEXICO_CITY = "America/Mexico_City";

function dateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MEXICO_CITY,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

/**
 * Converts a Mexico City wall-clock date/time into its UTC instant without
 * inheriting the timezone of the Node process.
 */
function mexicoCityWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, ms: number) {
  const desired = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  let instant = desired;
  // The Intl-derived offset can change at DST boundaries; converge twice.
  for (let i = 0; i < 2; i += 1) {
    const actual = dateParts(new Date(instant));
    const actualWall = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second, ms);
    instant += desired - actualWall;
  }
  return new Date(instant);
}

export function mexicoCityDayBounds(value: string): { start: Date; end: Date } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const start = mexicoCityWallTimeToUtc(year, month, day, 0, 0, 0, 0);
  const end = mexicoCityWallTimeToUtc(year, month, day, 23, 59, 59, 999);
  return { start, end };
}

export function parseMexicoCityDateFilter(value: string, boundary: "start" | "end"): Date | null {
  const dayBounds = mexicoCityDayBounds(value);
  if (dayBounds) return dayBounds[boundary];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
