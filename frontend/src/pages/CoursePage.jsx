import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, FormControl, FormControlLabel, Grid, List, ListItemButton,
  ListItemIcon, ListItemText, Radio, RadioGroup, Stack, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import CheckCircleIcon from '@mui/icons-material/CheckCircleRounded';
import RadioUncheckedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import QuizIcon from '@mui/icons-material/QuizOutlined';
import LockIcon from '@mui/icons-material/LockOutlined';
import useApi from '../hooks/useApi';
import api, { errorMessage } from '../services/api';
import { useNotifications } from '../context/NotificationsContext';
import { AsyncContent, EmptyState, InfoAlert, PageHeader, SectionCard } from '../components/common/ui';
import AssignmentProgress from '../components/academy/AssignmentProgress';
import Markdown from '../components/common/Markdown';
import { useT } from '../i18n';
import { tokens } from '../theme/tokens';

function Quiz({ course, onResult }) {
  const t = useT();
  const { refresh } = useNotifications();
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const complete = course.questions.every((q) => answers[q.id] !== undefined);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/academy/courses/${course.id}/quiz`, {
        answers: course.questions.map((q) => Number(answers[q.id])),
      });
      setResult(data);
      refresh();
      onResult();
    } catch (err) {
      setError(errorMessage(err, t('states.errorTitle')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>{t('academy.quizIntro', { n: course.questions.length, pass: course.pass_score })}</Typography>
      {result && (
        <Alert severity={result.passed ? 'success' : 'warning'} sx={{ mb: 2 }} role="status">
          {result.passed ? t('academy.passed', { score: result.score }) : t('academy.failed', { score: result.score, pass: result.pass_score })}
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack spacing={2.5}>
        {course.questions.map((q, i) => {
          const verdict = result?.results?.[i];
          return (
            <FormControl key={q.id} component="fieldset">
              <Typography component="legend" fontWeight={600} sx={{ mb: 0.5 }}>
                {i + 1}. {q.text}
                {result && <Typography component="span" sx={{ ml: 1, fontSize: 13, color: verdict ? tokens.primaryStrong : tokens.danger }}>
                  {verdict ? t('academy.correct') : t('academy.wrong')}
                </Typography>}
              </Typography>
              <RadioGroup value={answers[q.id] ?? ''} onChange={(e) => { setResult(null); setAnswers((a) => ({ ...a, [q.id]: e.target.value })); }}>
                {q.options.map((opt, oi) => (
                  <FormControlLabel key={oi} value={String(oi)} control={<Radio size="small" />} label={opt} />
                ))}
              </RadioGroup>
            </FormControl>
          );
        })}
      </Stack>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 3 }}>
        <Button variant="contained" size="large" disabled={!complete || busy} onClick={submit}>
          {result && !result.passed ? t('academy.retry') : t('academy.submitQuiz')}
        </Button>
        {!complete && <Typography variant="body2" color="text.secondary">{t('academy.answerAll')}</Typography>}
      </Stack>
    </Box>
  );
}

export default function CoursePage() {
  const t = useT();
  const { id } = useParams();
  const result = useApi(`/academy/courses/${id}`);
  const [course, setCourse] = useState(null);
  const [step, setStep] = useState(null); // lesson index or 'quiz'
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!result.data) return;
    setCourse(result.data);
    setStep((s) => {
      if (s !== null) return s;
      const firstOpen = result.data.lessons.findIndex((l) => !l.completed);
      return firstOpen === -1 ? 'quiz' : firstOpen;
    });
  }, [result.data]);

  const call = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (err) { setError(errorMessage(err, t('states.errorTitle'))); } finally { setBusy(false); }
  };

  const enroll = () => call(async () => {
    const { data } = await api.post(`/academy/courses/${id}/enroll`);
    setCourse(data);
    setStep(0);
  });

  const completeLesson = (lesson, index) => call(async () => {
    const { data } = await api.post(`/academy/courses/${id}/lessons/${lesson.id}/complete`);
    setCourse(data);
    setStep(index + 1 < data.lessons.length ? index + 1 : 'quiz');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const back = <Button size="small" startIcon={<ArrowBackIcon />} component={RouterLink} to="/academy" sx={{ mb: 1, ml: -1 }}>{t('academy.title')}</Button>;

  return (
    <AsyncContent result={result}>
      {() => {
        if (!course) return null;
        const a = course.assignment;
        const allDone = course.lessons.every((l) => l.completed);
        const lesson = typeof step === 'number' ? course.lessons[step] : null;
        return (
          <>
            <PageHeader back={back} title={course.title} subtitle={course.description} />
            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
            {!a ? (
              <Card>
                <EmptyState title={t('academy.notAssigned')} text={t('academy.notAssignedText')}
                  action={<Button variant="contained" onClick={enroll} disabled={busy}>{t('academy.enroll')}</Button>} />
              </Card>
            ) : (
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <SectionCard>
                    <AssignmentProgress assignment={a} />
                    <List dense sx={{ mt: 1.5, mx: -1 }}>
                      {course.lessons.map((l, i) => (
                        <ListItemButton key={l.id} selected={step === i} onClick={() => setStep(i)}>
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            {l.completed ? <CheckCircleIcon fontSize="small" sx={{ color: tokens.primary }} /> : <RadioUncheckedIcon fontSize="small" sx={{ color: tokens.textMuted }} />}
                          </ListItemIcon>
                          <ListItemText primary={l.title} secondary={l.completed ? t('academy.done') : t('academy.lessonOf', { n: i + 1, total: course.lessons.length })} />
                        </ListItemButton>
                      ))}
                      <ListItemButton selected={step === 'quiz'} onClick={() => setStep('quiz')} disabled={!allDone}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          {allDone ? <QuizIcon fontSize="small" sx={{ color: a.status === 'completed' ? tokens.primary : tokens.text }} /> : <LockIcon fontSize="small" />}
                        </ListItemIcon>
                        <ListItemText primary={t('academy.quiz')} secondary={!allDone ? t('academy.quizLocked') : a.score != null ? t('academy.score', { n: a.score }) : null} />
                      </ListItemButton>
                    </List>
                  </SectionCard>
                </Grid>
                <Grid item xs={12} md={8}>
                  <Card>
                    <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
                      {lesson ? (
                        <>
                          <Typography variant="overline" color="text.secondary">{t('academy.lessonOf', { n: step + 1, total: course.lessons.length })}</Typography>
                          <Typography variant="h2" component="h2" sx={{ mb: 2 }}>{lesson.title}</Typography>
                          <Markdown source={lesson.body_md} />
                          <Box sx={{ mt: 4 }}>
                            <Button variant="contained" size="large" disabled={busy} onClick={() => completeLesson(lesson, step)}>
                              {step + 1 < course.lessons.length ? t('academy.markDone') : t('academy.markDoneLast')}
                            </Button>
                          </Box>
                        </>
                      ) : (
                        <>
                          <Typography variant="h2" component="h2" sx={{ mb: 1 }}>{t('academy.quiz')}</Typography>
                          {allDone
                            ? <Quiz course={course} onResult={result.reload} />
                            : <InfoAlert>{t('academy.quizLocked')}</InfoAlert>}
                        </>
                      )}
                    </CardContent>
                  </Card>
                  <Typography variant="caption" component="p" sx={{ mt: 1.5 }}>{t('academy.demoNote')}</Typography>
                </Grid>
              </Grid>
            )}
          </>
        );
      }}
    </AsyncContent>
  );
}
