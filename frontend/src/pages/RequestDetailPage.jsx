import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Grid, Snackbar, Stack, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import DescriptionIcon from '@mui/icons-material/DescriptionOutlined';
import useApi from '../hooks/useApi';
import api, { errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { AsyncContent, PageHeader, SectionCard, StatusChip } from '../components/common/ui';
import DecisionActions from '../components/requests/DecisionActions';
import RevokeApproval from '../components/requests/RevokeApproval';
import { useT } from '../i18n';
import { tokens } from '../theme/tokens';
import { fmtDateTime, fmtPeriod } from '../utils/format';

const DOT = { pending: tokens.warning, approved: tokens.primary, rejected: tokens.danger, cancelled: tokens.textMuted };
const HISTORY_LABEL = { pending: 'historyCreated', approved: 'historyApproved', rejected: 'historyRejected', cancelled: 'historyCancelled' };
const historyLabel = (h) => (h.from_status === 'approved' && h.to_status === 'pending' ? 'historyRevoked' : HISTORY_LABEL[h.to_status]);

function History({ items }) {
  const t = useT();
  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {items.map((h, i) => (
        <Box component="li" key={h.id} sx={{ display: 'flex', gap: 1.5, pb: i === items.length - 1 ? 0 : 2.5, position: 'relative' }}>
          {i < items.length - 1 && (
            <Box sx={{ position: 'absolute', left: 5, top: 14, bottom: 0, width: 2, bgcolor: tokens.border }} />
          )}
          <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: DOT[h.to_status], mt: 0.5, flexShrink: 0, zIndex: 1 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight={600}>{t(`requests.${historyLabel(h)}`)}</Typography>
            <Typography variant="body2" color="text.secondary">
              {h.actor.full_name}{h.actor.position ? `, ${h.actor.position}` : ''}
            </Typography>
            <Typography variant="caption">{fmtDateTime(h.created_at)}</Typography>
            {h.comment && (
              <Typography variant="body2" sx={{ mt: 0.75, p: 1.25, bgcolor: tokens.bg, borderRadius: 2 }}>«{h.comment}»</Typography>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export default function RequestDetailPage() {
  const t = useT();
  const { id } = useParams();
  const { user } = useAuth();
  const { refresh } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const result = useApi(`/requests/${id}`);
  const [flash, setFlash] = useState(location.state?.flash || '');
  const [error, setError] = useState('');

  const cancel = async () => {
    if (!window.confirm(t('requests.cancelConfirm'))) return;
    try {
      await api.post(`/requests/${id}/cancel`);
      refresh();
      setFlash(t('requests.cancelled'));
      result.reload();
    } catch (err) {
      setError(errorMessage(err, t('states.errorTitle')));
    }
  };

  const backTo = location.state?.from || (result.data && result.data.employee.id !== user.id ? '/team' : '/requests');

  return (
    <>
      <AsyncContent result={result}>
        {(r) => (
          <>
            <PageHeader
              back={<Button size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate(backTo)} sx={{ mb: 1, ml: -1 }}>{t('common.back')}</Button>}
              title={<Stack direction="row" spacing={1.5} alignItems="center" component="span">
                <span>{t('requests.detailTitle', { id: r.id })}</span><StatusChip status={r.status} size="medium" />
              </Stack>}
              subtitle={`${t(`requestType.${r.type}`)}, ${r.employee.full_name}`}
            />
            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
            <Grid container spacing={2}>
              <Grid item xs={12} md={7}>
                <Card>
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant="body2" color="text.secondary">{t('requests.period')}</Typography>
                    <Typography variant="h2" component="p" sx={{ mt: 0.5 }}>{fmtPeriod(r.start_date, r.end_date)}</Typography>
                    <Typography color="text.secondary">{t('common.days', { n: r.days })}. {t('requests.created')} {fmtDateTime(r.created_at)}</Typography>

                    {r.comment && (
                      <Box sx={{ mt: 2.5 }}>
                        <Typography variant="body2" color="text.secondary">{t('requests.employeeComment')}</Typography>
                        <Typography sx={{ mt: 0.5 }}>{r.comment}</Typography>
                      </Box>
                    )}
                    {r.decided_by && (
                      <Box sx={{ mt: 2.5, p: 2, borderRadius: 2, bgcolor: r.status === 'approved' ? tokens.primarySoft : tokens.dangerSoft }}>
                        <Typography variant="body2" color="text.secondary">{t('requests.decidedBy')}</Typography>
                        <Typography fontWeight={600}>{r.decided_by.full_name}, {fmtDateTime(r.decided_at)}</Typography>
                        {r.decision_comment && <Typography sx={{ mt: 1 }}>«{r.decision_comment}»</Typography>}
                      </Box>
                    )}
                    {r.docflow_ref && (
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
                        <DescriptionIcon fontSize="small" sx={{ color: tokens.textMuted }} />
                        <Typography variant="body2" color="text.secondary">{t('requests.docflow')}: <b>{r.docflow_ref}</b></Typography>
                      </Stack>
                    )}

                    {(r.can_decide || r.can_cancel || r.can_revoke) && (
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 3 }}>
                        {r.can_decide && (
                          <DecisionActions request={r} onDone={(_, d) => { setFlash(t(d === 'approve' ? 'requests.approved' : 'requests.rejected')); result.reload(); }} />
                        )}
                        {r.can_revoke && (
                          <RevokeApproval request={r} onDone={() => { setFlash(t('requests.revoked')); result.reload(); }} />
                        )}
                        {r.can_cancel && <Button variant="outlined" color="inherit" onClick={cancel}>{t('requests.cancelRequest')}</Button>}
                      </Stack>
                    )}
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={5}>
                <SectionCard title={t('requests.history')}><History items={r.history} /></SectionCard>
              </Grid>
            </Grid>
          </>
        )}
      </AsyncContent>
      <Snackbar open={Boolean(flash)} autoHideDuration={3500} onClose={() => setFlash('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled" onClose={() => setFlash('')}>{flash}</Alert>
      </Snackbar>
    </>
  );
}
