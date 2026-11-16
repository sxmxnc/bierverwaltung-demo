/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

// Zeiträume für Rangliste und Verbrauchsübersicht – in deutscher Ortszeit, auch wenn der
// Server (z. B. Heroku) in UTC läuft. Woche = ab Montag 0:00, Monat = ab dem 1. um 0:00.
export type Period = 'week' | 'month' | 'lastMonth' | 'all';
export const PERIODS: Period[] = ['week', 'month', 'lastMonth', 'all'];

const TIME_ZONE = 'Europe/Berlin';

function berlinParts(ms: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short'
    })
      .formatToParts(ms)
      .map(part => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: String(parts.weekday)
  };
}

// 0:00 Uhr deutscher Zeit am angegebenen Kalendertag als Zeitstempel (ms)
export function berlinMidnight(year: number, month: number, day: number): number {
  const guess = Date.UTC(year, month - 1, day);
  const local = berlinParts(guess);
  const offset = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - guess;
  return guess - offset;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function periodRange(period: Period, now = Date.now()): { from: number; to: number } {
  const today = berlinParts(now);
  switch (period) {
    case 'week': {
      const sinceMonday = WEEKDAYS.indexOf(today.weekday);
      const monday = new Date(Date.UTC(today.year, today.month - 1, today.day - sinceMonday));
      return {
        from: berlinMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()),
        to: Infinity
      };
    }
    case 'month':
      return { from: berlinMidnight(today.year, today.month, 1), to: Infinity };
    case 'lastMonth': {
      const prev =
        today.month === 1 ? { year: today.year - 1, month: 12 } : { year: today.year, month: today.month - 1 };
      return { from: berlinMidnight(prev.year, prev.month, 1), to: berlinMidnight(today.year, today.month, 1) };
    }
    default:
      return { from: -Infinity, to: Infinity };
  }
}

export function parsePeriod(value: unknown, fallback: Period = 'month'): Period {
  return PERIODS.includes(value as Period) ? (value as Period) : fallback;
}
