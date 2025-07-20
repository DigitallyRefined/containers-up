import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Temporal } from '@js-temporal/polyfill';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getRelativeTime = (
  isoString: string | number,
  largestUnit: Temporal.DateTimeUnit = 'year',
  timeZone: Temporal.TimeZoneLike = 'UTC'
) => {
  const now = Temporal.Now.zonedDateTimeISO(timeZone);
  const past = Temporal.ZonedDateTime.from(`${new Date(isoString).toISOString()}[${timeZone}]`);
  const diff = now.since(past, { largestUnit });

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  const units: Array<[keyof typeof diff, Intl.RelativeTimeFormatUnit]> = [
    ['years', 'year'],
    ['months', 'month'],
    ['weeks', 'week'],
    ['days', 'day'],
    ['hours', 'hour'],
    ['minutes', 'minute'],
    ['seconds', 'second'],
  ];

  for (const [diffKey, rtfUnit] of units) {
    const value = diff[diffKey];
    if (Math.abs(Number(value)) >= 1) {
      return rtf.format(-Math.floor(Number(value)), rtfUnit);
    }
  }

  return 'just now';
};