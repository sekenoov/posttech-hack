import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Grid, Stack, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import useApi from '../hooks/useApi';
import api, { errorMessage } from '../services/api';
import { useNotifications } from '../context/NotificationsContext';
import { AsyncContent, PageHeader, SectionCard } from '../components/common/ui';
import { useT } from '../i18n';
import { tokens } from '../theme/tokens';
import { daysBetween, fmtPeriod, todayISO } from '../utils/format';

export default function RequestNewPage() {
  const t = useT();
  const navigate = useNavigate();
  const { refresh } = useNotifications();
  const me = useApi('/me');
  const [form, setForm] = useState({ start_date: '', end_date: '', comment: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const today = todayISO();

  const set = (key) => (e) => setForm((f) => {
    const next = { ...f, [key]: e.target.value };
    if (key === 'start_date' && (!f.end_date || f.end_date < next.start_date)) next.end_date = next.start_date;
    return next;
  });

  const days = daysBetween(form.start_date, form.end_date);
  const dateError = form.start_date && form.start_date < today ? t('requests.datesPast')
    : form.start_date && form.end_date && form.end_date < form.start_date ? t('requests.datesInvalid') : '';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/requests', {
        type: 'vacation', start_date: form.start_date, end_date: form.end_date, comment: form.comment || null,
      });
      refresh();
      navigate(`/requests/${data.id}`, { replace: true, state: { flash: t('requests.createdFlash') } });
    } catch (err) {
      setError(errorMessage(err, t('states.errorTitle')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t('requests.newTitle')} subtitle={t('requests.newSubtitle')}
        back={<Button size="small" startIcon={<ArrowBackIcon />} component={RouterLink} to="/requests" sx={{ mb: 1, ml: -1 }}>{t('nav.requests')}</Button>} />
      <AsyncContent result={me}>
        {(profile) => {
          const available = profile.leave_balance.available_days;
          const notEnough = days > available;
          const canSubmit = form.start_date && form.end_date && !dateError && !notEnough && days > 0 && !busy;
          return (
            <Grid container spacing={2}>
              <Grid item xs={12} md={7}>
                <Card>
                  <CardContent component="form" onSubmit={submit} sx={{ p: 3 }}>
                    {error && <Alert severity="error" sx={{ mb: 2 }} role="alert">{error}</Alert>}
                    <Stack spacing={2.5}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField type="date" label={t('requests.startDate')} value={form.start_date} onChange={set('start_date')}
                          InputLabelProps={{ shrink: true }} inputProps={{ min: today }} required fullWidth size="medium" />
                        <TextField type="date" label={t('requests.endDate')} value={form.end_date} onChange={set('end_date')}
                          InputLabelProps={{ shrink: true }} inputProps={{ min: form.start_date || today }} required fullWidth size="medium" />
                      </Stack>
                      {dateError && <Alert severity="warning">{dateError}</Alert>}
                      <TextField label={t('requests.comment')} helperText={`${t('requests.commentHint')} (${form.comment.length}/500)`}
                        value={form.comment} onChange={set('comment')} multiline minRows={3} inputProps={{ maxLength: 500 }} />
                      <Box>
                        <Button type="submit" variant="contained" size="large" disabled={!canSubmit}>
                          {busy ? t('requests.submitting') : t('requests.submit')}
                        </Button>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={5}>
                <SectionCard>
                  <Typography variant="body2" color="text.secondary">{t('dashboard.available')}</Typography>
                  <Typography sx={{ fontSize: '2rem', fontWeight: 700, color: tokens.primary }}>{available}</Typography>
                  {days > 0 && !dateError && (
                    <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: notEnough ? tokens.dangerSoft : tokens.primarySoft }}>
                      <Typography fontWeight={600}>{t('requests.summary', { days: t('common.days', { n: days }) })}</Typography>
                      <Typography variant="body2" color="text.secondary">{fmtPeriod(form.start_date, form.end_date)}</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5, color: notEnough ? tokens.danger : tokens.text }}>
                        {notEnough ? t('requests.notEnough', { n: available }) : t('requests.availableAfter', { n: available - days })}
                      </Typography>
                    </Box>
                  )}
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{t('requests.approver')}</Typography>
                  <Typography fontWeight={500}>{profile.manager?.full_name || t('requests.approverHr')}</Typography>
                </SectionCard>
              </Grid>
            </Grid>
          );
        }}
      </AsyncContent>
    </>
  );
}
