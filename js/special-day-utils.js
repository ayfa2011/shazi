export function specialDayDateForYear(date, year) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [, monthText, dayText] = date.split("-");
  const month = Number(monthText);
  const day = Number(dayText);
  const result = new Date(Date.UTC(year, month - 1, day));
  if (result.getUTCFullYear() !== year || result.getUTCMonth() !== month - 1 || result.getUTCDate() !== day) return null;
  return result;
}

export function specialDayCountdown(item, todayKey) {
  if (typeof item?.date !== "string" || typeof todayKey !== "string") return null;
  const [year, month, day] = todayKey.split("-").map(Number);
  const today = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(today.getTime()) || today.getUTCFullYear() !== year || today.getUTCMonth() !== month - 1 || today.getUTCDate() !== day) return null;

  const eventYear = item.recurring ? year : Number(item.date.slice(0, 4));
  let nextDate = specialDayDateForYear(item.date, eventYear);
  if (item.recurring) {
    let nextYear = year;
    while (!nextDate && nextYear <= year + 8) nextDate = specialDayDateForYear(item.date, ++nextYear);
    while (nextDate && nextDate < today && nextYear < year + 8) {
      nextDate = specialDayDateForYear(item.date, ++nextYear);
      while (!nextDate && nextYear <= year + 8) nextDate = specialDayDateForYear(item.date, ++nextYear);
    }
  }
  if (!nextDate) return null;

  return {
    days: Math.round((nextDate.getTime() - today.getTime()) / 86400000),
    date: nextDate
  };
}

export function formatSpecialDayDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

export function formatSpecialDayCountdown(days) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `${days} days left`;
  if (days === -1) return "Yesterday";
  return `${Math.abs(days)} days ago`;
}
