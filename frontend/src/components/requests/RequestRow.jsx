import { Link as RouterLink } from 'react-router-dom';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import { StatusChip } from '../common/ui';
import { useT } from '../../i18n';
import { tokens } from '../../theme/tokens';
import { fmtDateShort, fmtPeriod } from '../../utils/format';

/** One request as a responsive row/card; used in lists and on the dashboard. */
export default function RequestRow({ request, showEmployee = false, actions }) {
  const t = useT();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, border: `1px solid ${tokens.border}`, borderRadius: 3,
      bgcolor: 'background.paper', '&:hover': { borderColor: tokens.primary } }}>
      <ButtonBase component={RouterLink} to={`/requests/${request.id}`}
        sx={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left', borderRadius: 3, p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.75, sm: 2 }} alignItems={{ sm: 'center' }} sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={600} noWrap>
              {showEmployee ? request.employee.full_name : t(`requestType.${request.type}`)}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {showEmployee ? `${t(`requestType.${request.type}`)} · ` : ''}
              {fmtPeriod(request.start_date, request.end_date)} · {t('common.days', { n: request.days })}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="caption" sx={{ display: { xs: 'none', md: 'block' }, whiteSpace: 'nowrap' }}>
              {t('requests.created')} {fmtDateShort(request.created_at)}
            </Typography>
            <StatusChip status={request.status} />
          </Stack>
        </Stack>
        {!actions && <ChevronRightIcon sx={{ color: tokens.textMuted, ml: 1 }} />}
      </ButtonBase>
      {actions && <Stack direction="row" spacing={1} sx={{ pr: 2 }}>{actions}</Stack>}
    </Box>
  );
}
