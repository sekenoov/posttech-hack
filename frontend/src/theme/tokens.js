// JanaМен design tokens. Values confirmed from the public Jana Post site CSS
// (see docs/JANA_BRAND_RESEARCH.md). Components use these via the MUI theme
// or the matching CSS variables (--jm-*), never raw hex values.
export const tokens = {
  primary: '#008C00',        // brand surfaces: icons, progress, big numbers
  primaryStrong: '#007A00',  // interactive: button fill, links, active nav text (AA)
  primaryHover: '#006600',
  primarySoft: '#F0FDF4',
  primaryTint: '#E3F6E3',
  logo: '#1B8918',

  text: '#12151A',
  textMuted: '#5E5E60',
  bg: '#F6F6F6',
  surface: '#FFFFFF',
  border: '#E8E6E0',

  warning: '#B54708',
  warningSoft: '#FFF6E5',
  danger: '#D92D20',
  dangerSoft: '#FEF0EF',
  info: '#175CD3',
  infoSoft: '#EEF4FF',
  neutralSoft: '#F1F1F1',

  radius: 10,
  radiusCard: 14,
  font: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  sidebarWidth: 256,
};

export const cssVariables = Object.fromEntries(
  Object.entries(tokens)
    .filter(([, v]) => typeof v === 'string' && v.startsWith('#'))
    .map(([k, v]) => [`--jm-${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, v]),
);
