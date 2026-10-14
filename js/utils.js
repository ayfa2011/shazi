export const $ = (s, root = document) => root.querySelector(s); export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = (v = "") => String(v).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));

export function toast(msg) {
  const el = $("#toast");
  if (el) {
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2400);
  }
}

export function todayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return `${parts.find(x => x.type === "year").value}-${parts.find(x => x.type === "month").value}-${parts.find(x => x.type === "day").value}`;
}

export function scheduleDubaiDayRollover(callback) {
  const [year, month, day] = todayKey().split("-").map(Number);
  const nextMidnight = Date.UTC(year, month - 1, day + 1) - 4 * 60 * 60 * 1000;
  return setTimeout(callback, Math.max(0, nextMidnight - Date.now() + 50));
}

export function dailyIndex(length, date = new Date()) {
  if (!length) return 0;
  const day = Date.parse(`${todayKey(date)}T00:00:00Z`) / 86400000;
  return Math.floor(day) % length;
}