import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import ru from './ru';
import kk from './kk';
import { setDateLocale } from '../utils/date';

// Only locales whose dictionaries are complete are offered in the switcher.
export const LOCALES = { ru: { label: 'Рус', dict: ru }, kk: { label: 'Қаз', dict: kk } };
export const READY_LOCALES = Object.keys(LOCALES).filter((code) => LOCALES[code].dict.__complete);

const I18nContext = createContext(null);

const lookup = (dict, key) => key.split('.').reduce((node, part) => (node == null ? node : node[part]), dict);

const readStoredLocale = () => {
  try {
    const stored = localStorage.getItem('locale');
    const code = READY_LOCALES.includes(stored) ? stored : 'ru';
    setDateLocale(code);
    return code;
  } catch {
    return 'ru';
  }
};

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(readStoredLocale);

  const setLocale = useCallback((code) => {
    if (!READY_LOCALES.includes(code)) return;
    setDateLocale(code);
    setLocaleState(code);
    try { localStorage.setItem('locale', code); } catch { /* storage unavailable */ }
    document.documentElement.lang = code;
  }, []);

  const t = useCallback((key, vars) => {
    let value = lookup(LOCALES[locale].dict, key);
    if (value == null) value = lookup(ru, key); // fallback to Russian
    if (value == null) return key;
    if (typeof value === 'function') return value(vars || {});
    if (vars) return String(value).replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? `{${name}}`));
    return value;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useT = () => useContext(I18nContext).t;

/** Department name in the active locale (falls back to Russian). */
export const useDeptName = () => {
  const { locale } = useContext(I18nContext);
  return (dept) => (dept ? (locale === 'kk' && dept.name_kk) || dept.name : '');
};
