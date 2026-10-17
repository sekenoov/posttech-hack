import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { LOCALES, READY_LOCALES, useI18n } from '../../i18n';

// Rendered only when more than one locale is complete.
export default function LanguageSwitch() {
  const { locale, setLocale } = useI18n();
  const { setUser } = useAuth();
  if (READY_LOCALES.length < 2) return null;

  const change = (_, code) => {
    if (!code) return;
    setLocale(code);
    // remembered server-side (best effort) so the choice follows the user across devices
    api.patch('/me', { locale: code }).then(({ data }) => setUser(data)).catch(() => {});
  };

  return (
    <ToggleButtonGroup size="small" exclusive value={locale} onChange={change} aria-label="Язык / Тіл"
      sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.25, fontWeight: 600, textTransform: 'none' } }}>
      {READY_LOCALES.map((code) => (
        <ToggleButton key={code} value={code} lang={code}>{LOCALES[code].label}</ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
