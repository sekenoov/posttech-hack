// Small shared building blocks used across all JanaМен pages.
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Skeleton, Stack, Typography,
} from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineRounded';
import InboxIcon from '@mui/icons-material/InboxRounded';
import LockIcon from '@mui/icons-material/LockOutlined';
import SearchOffIcon from '@mui/icons-material/SearchOffRounded';
import { Link as RouterLink } from 'react-router-dom';
import { useT } from '../../i18n';
import { tokens } from '../../theme/tokens';
import { errorMessage } from '../../services/api';

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between"
      alignItems={{ xs: 'stretch', sm: 'flex-end' }} sx={{ mb: 3 }}>
      <Box sx={{ minWidth: 0 }}>
        {back}
        <Typography variant="h1" component="h1">{title}</Typography>
        {subtitle && <Typography color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>}
      </Box>
      {actions && <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>{actions}</Stack>}
    </Stack>
  );
}

const STATUS_STYLE = {
  pending: { color: tokens.warning, bg: tokens.warningSoft },
  approved: { color: tokens.primaryStrong, bg: tokens.primarySoft },
  completed: { color: tokens.primaryStrong, bg: tokens.primarySoft },
  rejected: { color: tokens.danger, bg: tokens.dangerSoft },
  cancelled: { color: tokens.textMuted, bg: tokens.neutralSoft },
  assigned: { color: tokens.info, bg: tokens.infoSoft },
  in_progress: { color: tokens.warning, bg: tokens.warningSoft },
};

export function StatusChip({ status, size = 'small' }) {
  const t = useT();
  const style = STATUS_STYLE[status] || STATUS_STYLE.cancelled;
  return (
    <Chip size={size} label={t(`status.${status}`)}
      sx={{ color: style.color, bgcolor: style.bg, border: 'none' }} />
  );
}

export function SectionCard({ title, action, children, sx, contentSx }) {
  return (
    <Card sx={{ height: '100%', ...sx }}>
      {(title || action) && (
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ px: 2.5, pt: 2, pb: 1 }}>
          <Typography variant="h3" component="h2" sx={{ minWidth: 0 }}>{title}</Typography>
          {action && <Box sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{action}</Box>}
        </Stack>
      )}
      <CardContent sx={{ pt: title ? 0.5 : 2.5, px: 2.5, '&:last-child': { pb: 2.5 }, ...contentSx }}>
        {children}
      </CardContent>
    </Card>
  );
}

export function LoadingState({ rows = 3, inline = false }) {
  if (inline) return <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>;
  return (
    <Stack spacing={1.5} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={64} />
      ))}
    </Stack>
  );
}

export function EmptyState({ title, text, action, icon: Icon = InboxIcon }) {
  return (
    <Box sx={{ textAlign: 'center', py: 5, px: 2 }}>
      <Box sx={{ width: 56, height: 56, borderRadius: '50%', bgcolor: tokens.primarySoft, color: tokens.primary,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 1.5 }}>
        <Icon />
      </Box>
      <Typography variant="h3">{title}</Typography>
      {text && <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 420, mx: 'auto' }}>{text}</Typography>}
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Box>
  );
}

export function ErrorState({ error, onRetry }) {
  const t = useT();
  return (
    <Box sx={{ textAlign: 'center', py: 5 }}>
      <ErrorOutlineIcon sx={{ fontSize: 40, color: tokens.danger }} />
      <Typography variant="h3" sx={{ mt: 1 }}>{t('states.errorTitle')}</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5 }}>{errorMessage(error, t('states.errorText'))}</Typography>
      {onRetry && <Button sx={{ mt: 2 }} variant="outlined" onClick={onRetry}>{t('common.retry')}</Button>}
    </Box>
  );
}

function FullPageMessage({ icon: Icon, title, text }) {
  const t = useT();
  return (
    <Box sx={{ textAlign: 'center', py: { xs: 6, md: 10 } }}>
      <Icon sx={{ fontSize: 48, color: tokens.textMuted }} />
      <Typography variant="h2" sx={{ mt: 1.5 }}>{title}</Typography>
      <Typography color="text.secondary" sx={{ mt: 1 }}>{text}</Typography>
      <Button component={RouterLink} to="/" variant="contained" sx={{ mt: 3 }}>{t('states.toHome')}</Button>
    </Box>
  );
}

export function ForbiddenState() {
  const t = useT();
  return <FullPageMessage icon={LockIcon} title={t('states.forbiddenTitle')} text={t('states.forbiddenText')} />;
}

export function NotFoundState() {
  const t = useT();
  return <FullPageMessage icon={SearchOffIcon} title={t('states.notFoundTitle')} text={t('states.notFoundText')} />;
}

/** Renders loading / 403 / 404 / error for a useApi() result, otherwise children(data). */
export function AsyncContent({ result, children, rows }) {
  if (result.loading && !result.data) return <LoadingState rows={rows} />;
  if (result.status === 403) return <ForbiddenState />;
  if (result.status === 404) return <NotFoundState />;
  if (result.error) return <ErrorState error={result.error} onRetry={result.reload} />;
  if (!result.data) return null;
  return children(result.data);
}

export function InfoAlert({ children, ...props }) {
  return <Alert severity="info" variant="outlined" sx={{ bgcolor: tokens.infoSoft, borderColor: 'transparent' }} {...props}>{children}</Alert>;
}

export function KpiCard({ label, value, hint, icon: Icon, to, accent = tokens.primary }) {
  const content = (
    <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
          <Typography sx={{ fontSize: '2rem', fontWeight: 700, color: accent, lineHeight: 1.2, mt: 0.5 }}>{value}</Typography>
          {hint && <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>{hint}</Typography>}
        </Box>
        {Icon && (
          <Box sx={{ p: 1, borderRadius: 2, bgcolor: tokens.primarySoft, color: tokens.primary, display: 'flex' }}>
            <Icon fontSize="small" />
          </Box>
        )}
      </Stack>
    </CardContent>
  );
  return (
    <Card sx={{ height: '100%', ...(to && { transition: 'border-color .15s', '&:hover': { borderColor: tokens.primary } }) }}>
      {to ? <Box component={RouterLink} to={to} sx={{ color: 'inherit', textDecoration: 'none', display: 'block' }}>{content}</Box> : content}
    </Card>
  );
}
