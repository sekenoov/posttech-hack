// date-fns wrapper: every formatter uses the active UI locale (ru by default).
import {
  format as dfFormat,
  formatDistanceToNowStrict as dfDistance,
} from 'date-fns';
import { kk, ru } from 'date-fns/locale';

export * from 'date-fns';

const LOCALES = { ru, kk };
let current = ru;

export const setDateLocale = (code) => { current = LOCALES[code] || ru; };

export const format = (date, fmt, options = {}) => dfFormat(date, fmt, { locale: current, ...options });
export const formatDistanceToNowStrict = (date, options = {}) => dfDistance(date, { locale: current, ...options });
