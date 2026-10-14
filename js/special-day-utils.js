const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateKey(dateKey) {
  if (typeof dateKey !== "string") return null;

  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Use setUTCFullYear so years 0001–0099 are not silently shifted to 1901–1999.
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Returns a UTC-midnight Date for a valid YYYY-MM-DD date in the given year.
 * Returns null for invalid dates or years.
 */
export function specialDayDateForYear(date, year) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return null;

  const parsed = parseDateKey(date);
  if (!parsed) return null;

  const month = parsed.getUTCMonth();
  const day = parsed.getUTCDate();
  const result = new Date(0);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCFullYear(year, month, day);

  // Reject dates such as 29 February in a non-leap year.
  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month ||
    result.getUTCDate() !== day
  ) {
    return null;
  }

  return result;
}

/**
 * Calculates the countdown from todayKey (YYYY-MM-DD).
 * Recurring events return the next occurrence, including today.
 * One-time events retain their original year and can return negative days.
 */
export function specialDayCountdown(item, todayKey) {
  if (!item || typeof item !== "object" || typeof item.date !== "string") {
    return null;
  }

  const today = parseDateKey(todayKey);
  const originalDate = parseDateKey(item.date);
  if (!today || !originalDate) return null;

  const todayYear = today.getUTCFullYear();
  let eventDate;

  if (item.recurring === true) {
    // Search forward to handle recurring dates such as 29 February.
    for (let year = todayYear; year <= Math.min(todayYear + 8, 9999); year += 1) {
      const candidate = specialDayDateForYear(item.date, year);
      if (candidate && candidate.getTime() >= today.getTime()) {
        eventDate = candidate;
        break;
      }
    }
  } else {
    eventDate = originalDate;
  }

  if (!eventDate) return null;

  return {
    days: (eventDate.getTime() - today.getTime()) / DAY_IN_MS,
    date: eventDate
  };
}

/** Formats a valid Date using a stable UTC calendar date. */
export function formatSpecialDayDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

/** Converts a day difference into a short, human-readable label. */
export function formatSpecialDayCountdown(days) {
  if (!Number.isFinite(days)) return "";

  const wholeDays = Math.trunc(days);

  if (wholeDays === 0) return "Today";
  if (wholeDays === 1) return "Tomorrow";
  if (wholeDays > 1) return `${wholeDays} days left`;
  if (wholeDays === -1) return "Yesterday";
  return `${Math.abs(wholeDays)} days ago`;
}
