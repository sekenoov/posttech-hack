import { useState } from 'react';
import { Alert, Avatar, Box, Card, CardContent, Chip, Grid, Snackbar, Stack, Tab, Tabs, Typography } from '@mui/material';
import TaskAltIcon from '@mui/icons-material/TaskAltRounded';
import useApi from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { AsyncContent, EmptyState, PageHeader } from '../components/common/ui';
import RequestRow from '../components/requests/RequestRow';
import DecisionActions from '../components/requests/DecisionActions';
import { useT } from '../i18n';
import { tokens } from '../theme/tokens';
import { fmtDate } from '../utils/format';

function PendingTab({ onFlash }) {
  const t = useT();
  const result = useApi('/team/requests', { params: { status: 'pending' } });
  return (
    <AsyncContent result={result}>
      {(rows) => rows.length === 0 ? (
        <Card><EmptyState icon={TaskAltIcon} title={t('team.emptyPending')} text={t('team.emptyPendingText')} /></Card>
      ) : (
        <Stack spacing={1}>
          {rows.map((r) => (
            <Box key={r.id}>
              <RequestRow request={r} showEmployee />
              <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1.5, pl: { sm: 2 } }}>
                <DecisionActions size="small" request={r}
                  onDone={(_, d) => { onFlash(t(d === 'approve' ? 'requests.approved' : 'requests.rejected')); result.reload(); }} />
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </AsyncContent>
  );
}

function AllTab() {
  const t = useT();
  const result = useApi('/team/requests');
  return (
    <AsyncContent result={result}>
      {(rows) => rows.length === 0
        ? <Card><EmptyState title={t('requests.emptyFiltered')} /></Card>
        : <Stack spacing={1}>{rows.map((r) => <RequestRow key={r.id} request={r} showEmployee />)}</Stack>}
    </AsyncContent>
  );
}

function MembersTab() {
  const t = useT();
  const result = useApi('/team/members');
  return (
    <AsyncContent result={result}>
      {(members) => members.length === 0 ? <Card><EmptyState title={t('team.emptyMembers')} /></Card> : (
        <Grid container spacing={2}>
          {members.map((m) => (
            <Grid item xs={12} sm={6} lg={4} key={m.id}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar sx={{ bgcolor: tokens.primarySoft, color: tokens.primaryStrong, fontWeight: 600 }}>
                      {m.full_name.split(' ').slice(0, 2).map((p) => p[0]).join('')}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography fontWeight={600} noWrap>{m.full_name}</Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>{m.position}</Typography>
                    </Box>
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                    <Chip size="small" label={m.on_leave_today ? t('team.onLeave') : t('team.atWork')}
                      sx={m.on_leave_today ? { bgcolor: tokens.warningSoft, color: tokens.warning } : { bgcolor: tokens.primarySoft, color: tokens.primaryStrong }} />
                    <Chip size="small" variant="outlined" label={t('team.balance', { n: m.leave_balance.available_days })} />
                    {m.pending_requests > 0 && <Chip size="small" variant="outlined" color="warning" label={t('team.pendingCount', { n: m.pending_requests })} />}
                  </Stack>
                  <Typography variant="caption" component="p" sx={{ mt: 1.5 }}>
                    {m.department}. {t('team.hiredAt', { date: fmtDate(m.hire_date) })}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </AsyncContent>
  );
}

export default function TeamPage() {
  const t = useT();
  const { user } = useAuth();
  const [tab, setTab] = useState('pending');
  const [flash, setFlash] = useState('');
  const hr = user.role === 'hr';

  return (
    <>
      <PageHeader title={t(hr ? 'team.titleHr' : 'team.title')} subtitle={t(hr ? 'team.subtitleHr' : 'team.subtitle')} />
      <Card sx={{ mb: 2, px: 1 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile>
          <Tab value="pending" label={t('team.pending')} />
          <Tab value="all" label={t('team.allRequests')} />
          <Tab value="members" label={t('team.members')} />
        </Tabs>
      </Card>
      {tab === 'pending' && <PendingTab onFlash={setFlash} />}
      {tab === 'all' && <AllTab />}
      {tab === 'members' && <MembersTab />}
      <Snackbar open={Boolean(flash)} autoHideDuration={3000} onClose={() => setFlash('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled" onClose={() => setFlash('')}>{flash}</Alert>
      </Snackbar>
    </>
  );
}
