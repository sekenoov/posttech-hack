import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Card, CardActions, CardContent, Grid, Stack, Typography } from '@mui/material';
import SchoolIcon from '@mui/icons-material/SchoolOutlined';
import ScheduleIcon from '@mui/icons-material/ScheduleRounded';
import useApi from '../hooks/useApi';
import { AsyncContent, EmptyState, PageHeader } from '../components/common/ui';
import AssignmentProgress from '../components/academy/AssignmentProgress';
import { useT } from '../i18n';
import { tokens } from '../theme/tokens';
import { fmtDate } from '../utils/format';

const actionLabel = (a) => (!a ? 'academy.enroll' : a.status === 'assigned' ? 'academy.start' : a.status === 'completed' ? 'academy.review' : 'academy.continue');

function CourseCard({ course }) {
  const t = useT();
  const a = course.assignment;
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flex: 1, p: 2.5 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: tokens.primarySoft, color: tokens.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5 }}>
          <SchoolIcon />
        </Box>
        <Typography variant="h3" component="h3">{course.title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{course.description}</Typography>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5, color: tokens.textMuted }}>
          <ScheduleIcon fontSize="inherit" />
          <Typography variant="caption">{t('academy.minutes', { n: course.duration_min })} · {t('academy.lessons', { n: course.lessons_total })}</Typography>
        </Stack>
        {a && (
          <Box sx={{ mt: 2 }}>
            <AssignmentProgress assignment={a} />
            {a.due_date && a.status !== 'completed' && (
              <Typography variant="caption" component="div" sx={{ mt: 0.5, color: tokens.warning }}>{t('academy.due', { date: fmtDate(a.due_date) })}</Typography>
            )}
          </Box>
        )}
      </CardContent>
      <CardActions sx={{ px: 2.5, pb: 2.5, pt: 0 }}>
        <Button variant={a && a.status !== 'completed' ? 'contained' : 'outlined'} component={RouterLink} to={`/academy/${course.id}`}>
          {t(actionLabel(a))}
        </Button>
      </CardActions>
    </Card>
  );
}

export default function AcademyPage() {
  const t = useT();
  const result = useApi('/academy/courses');
  return (
    <>
      <PageHeader title={t('academy.title')} subtitle={t('academy.subtitle')} />
      <AsyncContent result={result}>
        {(courses) => {
          const mine = courses.filter((c) => c.assignment);
          const rest = courses.filter((c) => !c.assignment);
          return (
            <Stack spacing={4}>
              <Box>
                <Typography variant="h2" component="h2" sx={{ mb: 1.5 }}>{t('academy.myCourses')}</Typography>
                {mine.length === 0 ? (
                  <Card><EmptyState icon={SchoolIcon} title={t('academy.emptyMy')} text={t('academy.emptyMyText')} /></Card>
                ) : (
                  <Grid container spacing={2}>{mine.map((c) => <Grid item xs={12} sm={6} lg={4} key={c.id}><CourseCard course={c} /></Grid>)}</Grid>
                )}
              </Box>
              {rest.length > 0 && (
                <Box>
                  <Typography variant="h2" component="h2" sx={{ mb: 1.5 }}>{t('academy.catalog')}</Typography>
                  <Grid container spacing={2}>{rest.map((c) => <Grid item xs={12} sm={6} lg={4} key={c.id}><CourseCard course={c} /></Grid>)}</Grid>
                </Box>
              )}
            </Stack>
          );
        }}
      </AsyncContent>
    </>
  );
}
