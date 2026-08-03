// utils/dateOnly.js
//
// Shared helpers for date-only (no time-of-day) fields, stored as a Date at
// midnight UTC — the same convention the current-affairs scrapers already
// use for CurrentAffairs.date (see scrapers/*/*.py).

export const toUtcMidnight = (input) => {
  const d = new Date(input);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

export const todayUtcMidnight = () => toUtcMidnight(new Date());

export const addUtcDays = (date, days) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

export const isSameUtcDay = (a, b) => {
  if (!a || !b) return false;
  return toUtcMidnight(a).getTime() === toUtcMidnight(b).getTime();
};
