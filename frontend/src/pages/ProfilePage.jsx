import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Grid, LinearProgress, Snackbar, Stack, TextField, Typography } from '@mui/material';
import AssignmentProgress from '../components/academy/AssignmentProgress';
import LockIcon from '@mui/icons-material/LockOutlined';
import useApi from '../hooks/useApi';
import api, { errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AsyncContent, InfoAlert, PageHeader, SectionCard } from '../components/common/ui';
import { useDeptName, useT } from '../i18n';
import { tokens } from '../theme/tokens';
import { fmtDate, fmtDateTime } from '../utils/format';

const PHONE_RE = /^[0-9+()\-\s]*$/;

function Field({ label, value }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography fontWeight={500} sx={{ mt: 0.25, wordBreak: 'break-word' }}>{value || '—'}</Typography>
    </Box>
  );
}

function LeaveCard({ balance }) {
  const t = useT();
  const usedPct = balance.total_days ? Math.min(100, (balance.used_days / balance.total_days) * 100) : 0;
  const pendingPct = balance.total_days ? Math.min(100 - usedPct, (balance.pending_days / balance.total_days) * 100) : 0;
  return (
    <SectionCard title={t('profile.leave')}>
      <Typography sx={{ fontSize: '2.25rem', fontWeight: 700, color: tokens.primary, lineHeight: 1.1 }}>
        {balance.available_days}
      </Typography>
      <Typography variant="body2" color="text.secondary">{t('profile.leaveAvailable')}</Typography>
      <Box sx={{ position: 'relative', mt: 2, mb: 2 }}>
        <LinearProgress variant="buffer" value={usedPct} valueBuffer={usedPct + pendingPct}
          sx={{ height: 8, borderRadius: 4, '& .MuiLinearProgress-dashed': { display: 'none' },
            '& .MuiLinearProgress-bar1Buffer': { bgcolor: tokens.primary },
            '& .MuiLinearProgress-bar2Buffer': { bgcolor: '#F5C77E' }, bgcolor: tokens.primaryTint }}
          aria-label={t('profile.leaveUsed')} />
      </Box>
      <Grid container spacing={1}>
        {[['leaveTotal', balance.total_days], ['leaveUsed', balance.used_days], ['leavePending', balance.pending_days]].map(([k, v]) => (
          <Grid item xs={4} key={k}><Field label={t(`profile.${k}`)} value={t('common.daysShort', { n: v })} /></Grid>
        ))}
      </Grid>
    </SectionCard>
  );
}

function PersonalCard({ profile, onSaved }) {
  const t = useT();
  const [phone, setPhone] = useState(profile.personal_phone || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setPhone(profile.personal_phone || ''), [profile.personal_phone]);
  const invalid = !PHONE_RE.test(phone);
  const dirty = phone !== (profile.personal_phone || '');

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.patch('/me', { personal_phone: phone });
      onSaved(data);
    } catch (err) {
      setError(errorMessage(err, t('states.errorTitle')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title={t('profile.personal')}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('profile.personalHint')}</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack component="form" direction={{ xs: 'column', sm: 'row' }} spacing={1.5} onSubmit={save}>
        <TextField label={t('profile.phone')} value={phone} onChange={(e) => setPhone(e.target.value)}
          error={invalid} helperText={invalid ? t('profile.phoneInvalid') : ' '} inputProps={{ maxLength: 32, inputMode: 'tel' }}
          sx={{ flex: 1 }} />
        <Button type="submit" variant="contained" disabled={!dirty || invalid || busy} sx={{ alignSelf: { sm: 'flex-start' } }}>
          {t('common.save')}
        </Button>
      </Stack>
    </SectionCard>
  );
}

function LearningSection() {
  const t = useT();
  const result = useApi('/academy/my');
  return (
    <SectionCard title={t('profile.learning')} action={<Button size="small" component={RouterLink} to="/academy">{t('dashboard.toAcademy')}</Button>}>
      <AsyncContent result={result} rows={1}>
        {(rows) => rows.length === 0 ? <Typography color="text.secondary">{t('dashboard.noLearning')}</Typography> : (
          <Grid container spacing={2}>
            {rows.map((a) => (
              <Grid item xs={12} sm={6} key={a.id}>
                <Typography fontWeight={600} sx={{ mb: 0.75 }}>{a.course_title}</Typography>
                <AssignmentProgress assignment={a} />
              </Grid>
            ))}
          </Grid>
        )}
      </AsyncContent>
    </SectionCard>
  );
}

export default function ProfilePage() {
  const t = useT();
  const deptName = useDeptName();
  const result = useApi('/me');
  const { setUser } = useAuth();
  const [saved, setSaved] = useState(false);

  return (
    <>
      <PageHeader title={t('profile.title')} />
      <AsyncContent result={result}>
        {(p) => (
          <Grid container spacing={2}>
            <Grid item xs={12} lg={8}>
              <SectionCard title={t('profile.official')}
                action={<LockIcon fontSize="small" sx={{ color: tokens.textMuted }} titleAccess={t('profile.officialHint')} />}>
                <InfoAlert sx={{ mb: 2.5 }}>{t('profile.officialHint')}</InfoAlert>
                <Grid container spacing={2.5}>
                  <Grid item xs={12} sm={6}><Field label={t('profile.fullName')} value={p.full_name} /></Grid>
                  <Grid item xs={12} sm={6}><Field label={t('profile.employeeCode')} value={p.employee_code} /></Grid>
                  <Grid item xs={12} sm={6}><Field label={t('profile.company')} value={p.company} /></Grid>
                  <Grid item xs={12} sm={6}><Field label={t('profile.position')} value={p.position} /></Grid>
                  <Grid item xs={12} sm={6}><Field label={t('profile.department')} value={deptName(p.department)} /></Grid>
                  <Grid item xs={12} sm={6}><Field label={t('profile.manager')} value={p.manager ? `${p.manager.full_name}${p.manager.position ? ` — ${p.manager.position}` : ''}` : t('profile.noManager')} /></Grid>
                  <Grid item xs={12} sm={6}><Field label={t('profile.hireDate')} value={fmtDate(p.hire_date)} /></Grid>
                  <Grid item xs={12} sm={6}><Field label={t('profile.location')} value={p.work_location} /></Grid>
                  <Grid item xs={12} sm={6}><Field label={t('profile.email')} value={p.email} /></Grid>
                  <Grid item xs={12} sm={6}><Field label={t('profile.role')} value={t(`roles.${p.role}`)} /></Grid>
                </Grid>
                <Typography variant="caption" component="p" sx={{ mt: 2 }}>
                  {t('profile.syncedAt', { date: fmtDateTime(p.synced_at) })}
                </Typography>
              </SectionCard>
              <Box sx={{ mt: 2 }}><LearningSection /></Box>
            </Grid>
            <Grid item xs={12} lg={4}>
              <Stack spacing={2}>
                <LeaveCard balance={p.leave_balance} />
                <PersonalCard profile={p} onSaved={(data) => { setUser(data); result.reload(); setSaved(true); }} />
              </Stack>
            </Grid>
          </Grid>
        )}
      </AsyncContent>
      <Snackbar open={saved} autoHideDuration={3000} onClose={() => setSaved(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled" onClose={() => setSaved(false)}>{t('profile.saved')}</Alert>
      </Snackbar>
    </>
  );
}
