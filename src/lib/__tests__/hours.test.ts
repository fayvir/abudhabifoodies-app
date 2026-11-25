import { formatTime, openStatus, weekHours } from '../hours';

// Abu Dhabi is UTC+4: 2026-11-23 is a Monday.
const at = (hhmm: string, date = '2026-11-23') => new Date(`${date}T${hhmm}:00+04:00`);
const NNBSP = ' ';
const THIN = ' ';
const week = (text: string) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((i) => [`day_${i}`, `Day: ${text}`]));

describe('formatTime', () => {
  it('drops :00, keeps minutes, names midnight', () => {
    expect(formatTime(23 * 60)).toBe('11 PM');
    expect(formatTime(23 * 60 + 30)).toBe('11:30 PM');
    expect(formatTime(12 * 60)).toBe('12 PM');
    expect(formatTime(0)).toBe('midnight');
    expect(formatTime(24 * 60)).toBe('midnight');
    expect(formatTime(26 * 60)).toBe('2 AM');
  });
});

describe('openStatus', () => {
  const google = { day_0: `Monday: 12:00${NNBSP}PM${THIN}–${THIN}11:00${NNBSP}PM` };

  it('reads Google strings with narrow and thin spaces', () => {
    expect(openStatus(google, at('13:00'))).toEqual({ open: true, label: 'Open · closes 11 PM' });
    expect(openStatus(google, at('10:00'))).toEqual({ open: false, label: 'Closed · opens 12 PM' });
    expect(openStatus(google, at('23:30'))).toEqual({ open: false, label: 'Closed now' });
    const twoDays = { ...google, day_1: 'Tuesday: 9:30 AM – 11:00 PM' };
    expect(openStatus(twoDays, at('23:30'))).toEqual({ open: false, label: 'Closed · opens 9:30 AM tomorrow' });
  });

  it('uses Abu Dhabi time, not UTC', () => {
    // 09:30 UTC is 13:30 in Abu Dhabi.
    expect(openStatus(google, new Date('2026-11-23T09:30:00Z'))?.open).toBe(true);
  });

  it('gives a start with no AM/PM the end\'s period, and 11 – 3 PM is 11 AM', () => {
    expect(openStatus({ day_0: 'Monday: 12:00 – 11:00 PM' }, at('12:30'))?.open).toBe(true);
    expect(openStatus({ day_0: 'Monday: 11:00 – 3:00 PM' }, at('11:30'))).toEqual({ open: true, label: 'Open · closes 3 PM' });
  });

  it('handles several windows and the gap between them', () => {
    const h = { day_0: 'Monday: 12:30 – 4:00 PM, 6:00 – 11:30 PM' };
    expect(openStatus(h, at('17:00'))).toEqual({ open: false, label: 'Closed · opens 6 PM' });
    expect(openStatus(h, at('19:00'))).toEqual({ open: true, label: 'Open · closes 11:30 PM' });
  });

  it('a window past midnight is open late tonight and early tomorrow', () => {
    const h = { day_0: 'Monday: 6:00 PM – 2:00 AM', day_1: 'Tuesday: Closed' };
    expect(openStatus(h, at('23:00'))).toEqual({ open: true, label: 'Open · closes 2 AM' });
    expect(openStatus(h, at('01:00', '2026-11-24'))).toEqual({ open: true, label: 'Open · closes 2 AM' });
    expect(openStatus(h, at('03:00', '2026-11-24'))).toEqual({ open: false, label: 'Closed today' });
  });

  it('closes at midnight when the window ends 12:00 AM', () => {
    expect(openStatus({ day_0: 'Monday: 10:00 AM – 12:00 AM' }, at('22:00'))).toEqual({ open: true, label: 'Open · closes midnight' });
  });

  it('open 24 hours and closed days', () => {
    expect(openStatus(week('Open 24 hours'), at('03:00'))).toEqual({ open: true, label: 'Open 24 hours' });
    expect(openStatus({ day_0: 'Monday: Closed' }, at('12:00'))).toEqual({ open: false, label: 'Closed today' });
  });

  it('is null without hours, without today, or for text it cannot read', () => {
    expect(openStatus(null)).toBeNull();
    expect(openStatus({ day_3: 'Thursday: 9:00 AM – 5:00 PM' }, at('12:00'))).toBeNull();
    expect(openStatus({ day_0: 'Monday: by appointment' }, at('12:00'))).toBeNull();
  });
});

describe('weekHours', () => {
  it('lists Monday first in a short, readable form', () => {
    const rows = weekHours({ day_1: 'Tuesday: Closed', day_0: `Monday: 12:00${NNBSP}PM${THIN}–${THIN}12:00${NNBSP}AM` });
    expect(rows).toEqual([
      { day: 'Monday', text: '12 PM – midnight' },
      { day: 'Tuesday', text: 'Closed' },
    ]);
  });

  it('shows unreadable text as Google wrote it, and nothing without data', () => {
    expect(weekHours({ day_0: 'Monday: by appointment' })).toEqual([{ day: 'Monday', text: 'by appointment' }]);
    expect(weekHours(null)).toEqual([]);
  });
});
