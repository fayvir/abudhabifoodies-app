/**
 * Opening hours from Google Places, as the site stores them:
 * { day_0: "Monday: 9:00 AM – 11:00 PM", … day_6: "Sunday: …" } (day_0 = Monday).
 * Always evaluated in Abu Dhabi time (UTC+4, no DST), whatever the phone's zone.
 *
 * Google's real strings, all handled: "Open 24 hours", "Closed", several windows
 * ("12:30 – 4:00 PM, 6:00 – 11:30 PM"), a start with no AM/PM (it takes the end's),
 * windows past midnight ("6:00 PM – 2:00 AM"), and narrow/thin no-break spaces.
 */

export type Hours = Record<string, string> | null | undefined;

const OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY = 24 * 60;
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** [start, end) in minutes from that day's midnight; end may pass 1440 (closes after midnight). */
type Window = [number, number];
type DayHours = { kind: 'closed' } | { kind: 'allDay' } | { kind: 'windows'; windows: Window[] };

function clean(s: string): string {
  return s.replace(/[    ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** "9:30 PM" -> minutes; "9:30" -> minutes in `fallback` period. */
function toMinutes(t: string, fallback?: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})(?: ?(AM|PM))?$/i);
  if (!m) return null;
  const period = (m[3] ?? fallback)?.toUpperCase();
  if (!period) return null;
  let h = parseInt(m[1], 10) % 12;
  if (period === 'PM') h += 12;
  return h * 60 + parseInt(m[2], 10);
}

function parseDay(desc: string | undefined): DayHours | null {
  if (!desc) return null;
  const i = desc.indexOf(':');
  const body = clean(i >= 0 && /^[A-Za-z]+$/.test(desc.slice(0, i).trim()) ? desc.slice(i + 1) : desc);
  if (/^open 24 hours$/i.test(body)) return { kind: 'allDay' };
  if (/^closed$/i.test(body)) return { kind: 'closed' };
  const windows: Window[] = [];
  for (const part of body.split(',')) {
    const [a, b] = part.split(/ ?[–-] ?/);
    if (!a || !b) return null;
    const endPeriod = b.trim().match(/(AM|PM)$/i)?.[1];
    const end = toMinutes(b);
    let start = toMinutes(a, endPeriod);
    if (start === null || end === null) return null;
    // "11:00 – 3:00 PM" means 11 AM, not 11 PM.
    if (!/(AM|PM)$/i.test(a.trim()) && endPeriod?.toUpperCase() === 'PM' && start > end) start -= 12 * 60;
    windows.push([start, end <= start ? end + DAY : end]);
  }
  return windows.length > 0 ? { kind: 'windows', windows } : null;
}

/** 0 = Monday … 6 = Sunday, and minutes since midnight, in Abu Dhabi. */
function abuDhabiNow(now: Date): { day: number; minutes: number } {
  const t = new Date(now.getTime() + OFFSET_MS);
  return { day: (t.getUTCDay() + 6) % 7, minutes: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

/** 1380 -> "11 PM", 1410 -> "11:30 PM", 0 -> "midnight". */
export function formatTime(minutes: number): string {
  const m = ((minutes % DAY) + DAY) % DAY;
  if (m === 0) return 'midnight';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

export interface OpenStatus {
  open: boolean;
  /** "Open · closes 11 PM", "Open 24 hours", "Closed · opens 6 PM", "Closed today", "Closed now" */
  label: string;
}

/** Open/closed right now with the next change, or null when the hours are missing or unreadable. */
export function openStatus(hours: Hours, now: Date = new Date()): OpenStatus | null {
  if (!hours || typeof hours !== 'object') return null;
  const { day, minutes } = abuDhabiNow(now);
  const today = parseDay(hours[`day_${day}`]);
  const yesterday = parseDay(hours[`day_${(day + 6) % 7}`]);

  // Still inside last night's window that runs past midnight.
  if (yesterday?.kind === 'windows') {
    for (const [s, e] of yesterday.windows) {
      if (e > DAY && minutes + DAY >= s && minutes + DAY < e) return { open: true, label: `Open · closes ${formatTime(e)}` };
    }
  }
  if (!today) return null;
  if (today.kind === 'allDay') return { open: true, label: 'Open 24 hours' };
  if (today.kind === 'closed') return { open: false, label: 'Closed today' };
  for (const [s, e] of today.windows) {
    if (minutes >= s && minutes < e) {
      return { open: true, label: e - s >= DAY ? 'Open 24 hours' : `Open · closes ${formatTime(e)}` };
    }
  }
  const next = today.windows.map(([s]) => s).filter((s) => s > minutes).sort((a, b) => a - b)[0];
  return { open: false, label: next !== undefined ? `Closed · opens ${formatTime(next)}` : 'Closed now' };
}

/** Monday-first rows for a full week, e.g. { day: 'Monday', text: '12 PM – midnight' }; [] without data. */
export function weekHours(hours: Hours): { day: string; text: string }[] {
  if (!hours || typeof hours !== 'object') return [];
  const rows = DAY_NAMES.map((day, i) => {
    const raw = hours[`day_${i}`];
    if (!raw) return null;
    const parsed = parseDay(raw);
    let text: string;
    if (!parsed) text = clean(raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw);
    else if (parsed.kind === 'allDay') text = 'Open 24 hours';
    else if (parsed.kind === 'closed') text = 'Closed';
    else text = parsed.windows.map(([s, e]) => `${formatTime(s)} – ${formatTime(e)}`).join(', ');
    return { day, text };
  });
  return rows.filter((r): r is { day: string; text: string } => r !== null);
}
