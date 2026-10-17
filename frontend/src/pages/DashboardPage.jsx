import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Grid, Stack, Typography } from '@mui/material';
import BeachIcon from '@mui/icons-material/BeachAccessOutlined';
import HourglassIcon from '@mui/icons-material/HourglassEmptyRounded';
import NotificationsIcon from '@mui/icons-material/NotificationsNoneRounded';
import GroupsIcon from '@mui/icons-material/GroupsOutlined';
import BadgeIcon from '@mui/icons-material/BadgeOutlined';
import AddIcon from '@mui/icons-material/AddRounded';
import EventNoteIcon from '@mui/icons-material/EventNoteOutlined';
import SchoolIcon from '@mui/icons-material/SchoolOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeOutlined';
import AssignmentProgress from '../components/academy/AssignmentProgress';
import useApi from '../hooks/useApi';
import { AsyncContent, EmptyState, KpiCard, PageHeader, SectionCard } from '../components/common/ui';
import RequestRow from '../components/requests/RequestRow';
import RecentNotificationsCard from '../components/notifications/RecentNotificationsCard';
import { useNotifications } from '../context/NotificationsContext';
import { useDeptName, useT } from '../i18n';
import { tokens } from '../theme/tokens';
import { fmtDate } from '../utils/format';

/** The employee's main HR services, one tap each (demo scenario 1: "быстрые сервисы"). */
function QuickServices({ available, teamPending }) {
  const t = useT();
  const services = [
    { to: '/requests/new', label: t('dashboard.newVacation'), hint: t('dashboard.qsVacationHint', { n: available }), icon: AddIcon, primary: true },
    { to: '/requests', label: t('dashboard.qsRequests'), hint: t('dashboard.qsRequestsHint'), icon: EventNoteIcon },
    { to: '/academy', label: t('dashboard.qsLearning'), hint: t('dashboard.qsLearningHint'), icon: SchoolIcon },
    { to: '/assistant', label: t('dashboard.askAi'), hint: t('dashboard.qsAiHint'), icon: AutoAwesomeIcon },
  ];
  if (teamPending != null) {
    services.push({ to: '/team', label: t('dashboard.reviewTeam'), hint: t('dashboard.qsTeamHint', { n: teamPending }), icon: GroupsIcon });
  }
  return (
    <Box component="section" aria-labelledby="quick-services" sx={{ mb: 3 }}>
      <Typography id="quick-services" variant="h3" component="h2" sx={{ mb: 1.5 }}>{t('dashboard.quickActions')}</Typography>
      <Box sx={{ display: 'grid', gap: 1.5,
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${services.length}, minmax(0, 1fr))` } }}>
        {services.map(({ to, label, hint, icon: Icon, primary }) => (
          <Box key={to} component={RouterLink} to={to}
            sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 2, borderRadius: `${tokens.radiusCard}px`,
              textDecoration: 'none', border: `1px solid ${primary ? tokens.primaryStrong : tokens.border}`,
              bgcolor: primary ? tokens.primaryStrong : 'background.paper', color: primary ? '#fff' : tokens.text,
              transition: 'border-color .15s, background-color .15s',
              '&:hover': primary ? { bgcolor: tokens.primaryHover } : { borderColor: tokens.primary } }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: primary ? 'rgba(255,255,255,0.18)' : tokens.primarySoft, color: primary ? '#fff' : tokens.primary }}>
              <Icon fontSize="small" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography fontWeight={600} sx={{ lineHeight: 1.3 }}>{label}</Typography>
              <Typography variant="caption" component="div" sx={{ mt: 0.25, color: primary ? 'rgba(255,255,255,0.85)' : tokens.textMuted }}>
                {hint}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function ProfileSummary({ profile }) {
  const t = useT();
  const deptName = useDeptName();
  const rows = [
    [t('profile.position'), profile.position],
    [t('profile.department'), deptName(profile.department)],
    [t('profile.manager'), profile.manager?.full_name || t('profile.noManager')],
    [t('profile.hireDate'), fmtDate(profile.hire_date)],
    [t('profile.company'), profile.company],
  ];
  return (
    <SectionCard title={t('profile.official')}
      action={<Button size="small" component={RouterLink} to="/profile">{t('common.details')}</Button>}>
      <Typography fontWeight={600}>{profile.full_name}</Typography>
      <Typography variant="caption">{t(`roles.${profile.role}`)}, {profile.employee_code}</Typography>
      <Box component="dl" sx={{ m: 0, mt: 1.5, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.75 }}>
        {rows.map(([k, v]) => (
          <Box key={k} sx={{ display: 'contents' }}>
            <Typography component="dt" variant="body2" color="text.secondary">{k}</Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 500 }}>{v}</Typography>
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}

function LearningCard({ learning }) {
  const t = useT();
  return (
    <SectionCard title={t('dashboard.learning')}
      action={<Button size="small" component={RouterLink} to="/academy">{t('dashboard.toAcademy')}</Button>}>
      {learning.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2 }}>{t('dashboard.noLearning')}</Typography>
      ) : (
        <Stack spacing={2}>
          {learning.map((a) => (
            <Box key={a.id} component={RouterLink} to={`/academy/${a.course_id}`} sx={{ color: 'inherit', textDecoration: 'none' }}>
              <Typography fontWeight={600} sx={{ mb: 0.75 }}>{a.course_title}</Typography>
              <AssignmentProgress assignment={a} compact />
            </Box>
          ))}
        </Stack>
      )}
    </SectionCard>
  );
}

export default function DashboardPage() {
  const t = useT();
  const deptName = useDeptName();
  const result = useApi('/me/dashboard');
  const { unreadCount } = useNotifications();

  return (
    <AsyncContent result={result} rows={4}>
      {(data) => {
        const { profile, recent_requests: requests } = data;
        const b = profile.leave_balance;
        const pendingMine = requests.filter((r) => r.status === 'pending').length;
        const isLead = data.team_pending_count != null;
        const activeCourses = data.learning.filter((a) => a.status !== 'completed').length;
        return (
          <>
            <PageHeader
              title={t('dashboard.greeting', { name: profile.first_name })}
              subtitle={`${profile.position}, ${deptName(profile.department)}`}
            />

            <QuickServices available={b.available_days} teamPending={data.team_pending_count} />

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={6} lg={3}>
                <KpiCard label={t('dashboard.available')} value={b.available_days} icon={BeachIcon} to="/profile"
                  hint={t('dashboard.availableHint', { remaining: b.remaining_days, pending: b.pending_days })} />
              </Grid>
              <Grid item xs={12} sm={6} lg={3}>
                <KpiCard label={t('dashboard.pendingRequests')} value={pendingMine} icon={HourglassIcon} to="/requests"
                  accent={pendingMine ? tokens.warning : tokens.primary} />
              </Grid>
              <Grid item xs={12} sm={6} lg={3}>
                <KpiCard label={t('dashboard.unread')} value={unreadCount} icon={NotificationsIcon} to="/notifications" />
              </Grid>
              {!isLead && (
                <Grid item xs={12} sm={6} lg={3}>
                  <KpiCard label={t('dashboard.learning')} value={activeCourses} icon={SchoolIcon} to="/academy"
                    hint={t('academy.myCourses') + `: ${data.learning.length}`} />
                </Grid>
              )}
              {isLead && (
                <Grid item xs={12} sm={6} lg={3}>
                  <KpiCard label={t('dashboard.teamPending')} value={data.team_pending_count} icon={GroupsIcon} to="/team"
                    accent={data.team_pending_count ? tokens.warning : tokens.primary} />
                </Grid>
              )}
            </Grid>

            {data.hr_stats && (
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {[['hrEmployees', data.hr_stats.employees, BadgeIcon, '/admin/employees'],
                  ['hrPending', data.hr_stats.pending_requests, HourglassIcon, '/team'],
                  ['hrOnLeave', data.hr_stats.on_leave_today, BeachIcon, '/team']].map(([key, value, Icon, to]) => (
                  <Grid item xs={12} sm={4} key={key}>
                    <KpiCard label={t(`dashboard.${key}`)} value={value} icon={Icon} to={to} />
                  </Grid>
                ))}
              </Grid>
            )}

            <Grid container spacing={2}>
              <Grid item xs={12} lg={8}>
                <SectionCard title={t('dashboard.recentRequests')}
                  action={requests.length > 0 && <Button size="small" component={RouterLink} to="/requests">{t('common.showAll')}</Button>}>
                  {requests.length === 0 ? (
                    <EmptyState title={t('dashboard.noRequests')} text={t('dashboard.noRequestsText')}
                      action={<Button variant="contained" component={RouterLink} to="/requests/new">{t('dashboard.newVacation')}</Button>} />
                  ) : (
                    <Stack spacing={1}>{requests.map((r) => <RequestRow key={r.id} request={r} />)}</Stack>
                  )}
                </SectionCard>
              </Grid>
              <Grid item xs={12} lg={4}>
                <Stack spacing={2}>
                  <LearningCard learning={data.learning} />
                  <ProfileSummary profile={profile} />
                  <RecentNotificationsCard title={t('dashboard.recentNotifications')} items={data.notifications.items} />
                </Stack>
              </Grid>
            </Grid>
          </>
        );
      }}
    </AsyncContent>
  );
}
