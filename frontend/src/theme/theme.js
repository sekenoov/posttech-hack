import { createTheme } from '@mui/material/styles';
import { ruRU } from '@mui/material/locale';
import { tokens as t, cssVariables } from './tokens';

const theme = createTheme(
  {
    palette: {
      primary: { main: t.primaryStrong, dark: t.primaryHover, light: t.primary, contrastText: '#FFFFFF' },
      secondary: { main: t.text, contrastText: '#FFFFFF' },
      success: { main: t.primary, contrastText: '#FFFFFF' },
      warning: { main: t.warning, contrastText: '#FFFFFF' },
      error: { main: t.danger, contrastText: '#FFFFFF' },
      info: { main: t.info, contrastText: '#FFFFFF' },
      background: { default: t.bg, paper: t.surface },
      text: { primary: t.text, secondary: t.textMuted },
      divider: t.border,
      brand: { main: t.primary, soft: t.primarySoft, tint: t.primaryTint },
    },
    shape: { borderRadius: t.radius },
    typography: {
      fontFamily: t.font,
      h1: { fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' },
      h2: { fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-0.01em' },
      h3: { fontSize: '1.125rem', fontWeight: 600 },
      h4: { fontSize: '1rem', fontWeight: 600 },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600, fontSize: '0.8125rem' },
      body2: { fontSize: '0.875rem' },
      caption: { color: t.textMuted },
      button: { textTransform: 'none', fontWeight: 600 },
      overline: { fontWeight: 600, letterSpacing: '0.06em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': cssVariables,
          body: { backgroundColor: t.bg },
          '*:focus-visible': { outline: `2px solid ${t.primary}`, outlineOffset: 2 },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: t.radius, paddingInline: 16, minHeight: 40 },
          sizeSmall: { minHeight: 32, paddingInline: 12 },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: 'none' },
          outlined: { borderColor: t.border },
        },
      },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: { root: { borderRadius: t.radiusCard, borderColor: t.border } },
      },
      MuiChip: { styleOverrides: { root: { fontWeight: 600, borderRadius: 8 } } },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } } },
      MuiTabs: { styleOverrides: { root: { minHeight: 44 } } },
      MuiTooltip: { defaultProps: { arrow: true } },
      MuiAlert: { styleOverrides: { root: { borderRadius: t.radius } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: t.radiusCard } } },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: t.radius,
            '&.Mui-selected': { backgroundColor: t.primarySoft, color: t.primaryStrong },
            '&.Mui-selected:hover': { backgroundColor: t.primaryTint },
          },
        },
      },
    },
  },
  ruRU,
);

export default theme;
