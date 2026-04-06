/**
 * Server-side timezone utilities using date-fns-tz.
 * Do NOT import this in client components — use Intl API there instead.
 */
import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';
import { startOfWeek } from 'date-fns';

export const TZ = 'America/New_York';

/** Convert a UTC date/string to a "zoned" Date whose local properties reflect ET. */
export function toET(date: Date | string): Date {
  return toZonedTime(typeof date === 'string' ? new Date(date) : date, TZ);
}

/** Format a UTC date in Eastern Time. */
export function formatET(date: Date | string, fmt: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(toZonedTime(d, TZ), fmt, { timeZone: TZ });
}

/** Get start of current week (Monday midnight ET) as UTC ISO string for Firestore. */
export function getWeekStartUTC(): string {
  const nowET = toZonedTime(new Date(), TZ);
  const weekStartET = startOfWeek(nowET, { weekStartsOn: 1 });
  return fromZonedTime(weekStartET, TZ).toISOString();
}

/** Convert an ET "YYYY-MM-DDTHH:mm" string to UTC ISO. */
export function fromETLocal(etDatetime: string): string {
  return fromZonedTime(`${etDatetime}:00`, TZ).toISOString();
}

/** Convert a UTC ISO string to ET "datetime-local" value "YYYY-MM-DDTHH:mm". */
export function toETLocal(isoString: string): string {
  return format(toZonedTime(new Date(isoString), TZ), "yyyy-MM-dd'T'HH:mm", { timeZone: TZ });
}

/** ET date string "YYYY-MM-DD" for a UTC ISO string. */
export function etDateStr(isoString: string): string {
  return format(toZonedTime(new Date(isoString), TZ), 'yyyy-MM-dd', { timeZone: TZ });
}

/** Check if a UTC ISO string falls on "today" in ET. */
export function isTodayET(isoString: string): boolean {
  return etDateStr(isoString) === etDateStr(new Date().toISOString());
}

/** Check if a UTC ISO string falls on "yesterday" in ET. */
export function isYesterdayET(isoString: string): boolean {
  const todayET = etDateStr(new Date().toISOString());
  const [y, m, d] = todayET.split('-').map(Number);
  const prev = new Date(y, m - 1, d - 1);
  const yest = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
  return etDateStr(isoString) === yest;
}

/** Format time as "10:30 AM" in ET. */
export function formatTimeET(isoString: string): string {
  return format(toZonedTime(new Date(isoString), TZ), 'h:mm aa', { timeZone: TZ });
}

/** Relative day label in ET: "Today", "Yesterday", or "Mon Apr 7". */
export function relDayLabel(isoString: string): string {
  if (isTodayET(isoString)) return 'Today';
  if (isYesterdayET(isoString)) return 'Yesterday';
  return format(toZonedTime(new Date(isoString), TZ), 'EEE MMM d', { timeZone: TZ });
}

/**
 * Label for "forgot to clock out" messages.
 * Returns "yesterday" or "on Friday" etc.
 */
export function forgotCheckOutLabel(isoString: string): string {
  if (isYesterdayET(isoString)) return 'yesterday';
  const day = format(toZonedTime(new Date(isoString), TZ), 'EEEE', { timeZone: TZ });
  return `on ${day}`;
}
