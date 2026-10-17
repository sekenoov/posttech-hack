import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import { StatusChip } from '../common/ui';
import { useT } from '../../i18n';
import { tokens } from '../../theme/tokens';

export default function AssignmentProgress({ assignment, compact = false }) {
  const t = useT();
  const a = assignment;
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
        <StatusChip status={a.status} />
        <Typography variant="body2" fontWeight={600} sx={{ color: tokens.primary }}>{a.progress_pct}%</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={a.progress_pct} aria-label={t('academy.progress')}
        sx={{ height: 6, borderRadius: 3, bgcolor: tokens.primaryTint, '& .MuiLinearProgress-bar': { bgcolor: tokens.primary } }} />
      {!compact && a.score != null && (
        <Typography variant="caption" component="div" sx={{ mt: 0.75 }}>{t('academy.score', { n: a.score })}</Typography>
      )}
    </Box>
  );
}
