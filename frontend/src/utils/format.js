import { format, formatDistanceToNowStrict, parseISO } from './date';

const toDate = (value) => (value instanceof Date ? value : parseISO(value));

export const fmtDate = (value) => (value ? format(toDate(value), 'd MMMM yyyy') : '—');
export const fmtDateShort = (value) => (value ? format(toDate(value), 'd MMM') : '—');
export const fmtDateTime = (value) => (value ? format(toDate(value), 'd MMM yyyy, HH:mm') : '—');

export const fmtPeriod = (start, end) => {
  const s = toDate(start);
  const e = toDate(end);
  if (s.getFullYear() === e.getFullYear()) {
    return `${format(s, s.getMonth() === e.getMonth() ? 'd' : 'd MMM')} – ${format(e, 'd MMM yyyy')}`;
  }
  return `${format(s, 'd MMM yyyy')} – ${format(e, 'd MMM yyyy')}`;
};

export const fmtRelative = (value) =>
  value ? formatDistanceToNowStrict(toDate(value), { addSuffix: true }) : '';

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const daysBetween = (start, end) => {
  if (!start || !end) return 0;
  const diff = (Date.parse(end) - Date.parse(start)) / 86400000;
  return Number.isFinite(diff) ? Math.round(diff) + 1 : 0;
};

export const firstName = (profile) => profile?.first_name || profile?.full_name?.split(' ')[1] || '';
