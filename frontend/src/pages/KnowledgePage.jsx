import { useEffect } from 'react';
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom';
import { Box, Button, Card, CardActionArea, CardContent, Chip, Grid, List, ListItemButton, ListItemText, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import DescriptionIcon from '@mui/icons-material/DescriptionOutlined';
import useApi from '../hooks/useApi';
import { AsyncContent, InfoAlert, PageHeader, SectionCard } from '../components/common/ui';
import Markdown from '../components/common/Markdown';
import { useT } from '../i18n';
import { tokens } from '../theme/tokens';
import { fmtDate, fmtDateTime } from '../utils/format';

const slugify = (text) => text.toLowerCase().replace(/[^0-9a-zа-яёәғқңөұүһі]+/g, '-').replace(/^-+|-+$/g, '');

// Renders the document section by section so that source links (#anchor) land on the right heading.
function DocumentBody({ body, highlight }) {
  const parts = body.split(/\n(?=## )/);
  return parts.map((part) => {
    const heading = part.startsWith('## ') ? part.split('\n')[0].slice(3).trim() : null;
    const id = heading ? slugify(heading) : undefined;
    const active = id && id === highlight;
    return (
      <Box key={id || 'intro'} id={id} sx={{ scrollMarginTop: 90, mx: -2, px: 2, py: 0.5, borderRadius: 2,
        bgcolor: active ? tokens.primarySoft : 'transparent', transition: 'background-color .6s' }}>
        <Markdown source={part} />
      </Box>
    );
  });
}

function DocumentView({ id }) {
  const t = useT();
  const { hash } = useLocation();
  const anchor = decodeURIComponent(hash.replace('#', ''));
  const result = useApi(`/kb/${id}`);

  useEffect(() => {
    if (result.data && anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result.data, anchor]);

  return (
    <AsyncContent result={result}>
      {(d) => (
        <>
          <PageHeader title={d.title}
            back={<Button size="small" startIcon={<ArrowBackIcon />} component={RouterLink} to="/knowledge" sx={{ mb: 1, ml: -1 }}>{t('kb.title')}</Button>}
            subtitle={<Stack direction="row" spacing={1} component="span" flexWrap="wrap" useFlexGap>
              <Chip size="small" label={d.id} /><Chip size="small" label={t('kb.version', { v: d.version })} sx={{ bgcolor: tokens.primarySoft, color: tokens.primaryStrong }} />
              {d.effective_date && <Chip size="small" variant="outlined" label={t('kb.effective', { date: fmtDate(d.effective_date) })} />}
            </Stack>} />
          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <Card><CardContent sx={{ p: { xs: 2.5, md: 4 } }}><DocumentBody body={d.body_md} highlight={anchor} /></CardContent></Card>
              <Typography variant="caption" component="p" sx={{ mt: 1.5 }}>{t('kb.updated', { date: fmtDateTime(d.updated_at), name: d.updated_by?.full_name })}</Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <SectionCard title={t('kb.sections')}>
                <List dense sx={{ mx: -1 }}>
                  {d.sections.map((s) => (
                    <ListItemButton key={s} component="a" href={`#${slugify(s)}`} selected={slugify(s) === anchor}>
                      <ListItemText primary={s} />
                    </ListItemButton>
                  ))}
                </List>
              </SectionCard>
            </Grid>
          </Grid>
        </>
      )}
    </AsyncContent>
  );
}

function DocumentList() {
  const t = useT();
  const result = useApi('/kb');
  return (
    <>
      <PageHeader title={t('kb.title')} subtitle={t('kb.subtitle')} />
      <InfoAlert sx={{ mb: 2 }}>{t('ai.disclaimer')}</InfoAlert>
      <AsyncContent result={result}>
        {(docs) => (
          <Grid container spacing={2}>
            {docs.map((d) => (
              <Grid item xs={12} sm={6} lg={4} key={d.id}>
                <Card sx={{ height: '100%' }}>
                  <CardActionArea component={RouterLink} to={`/knowledge/${d.id}`} sx={{ height: '100%' }}>
                    <CardContent>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <DescriptionIcon sx={{ color: tokens.primary }} /><Typography variant="caption">{d.id} · v{d.version}</Typography>
                      </Stack>
                      <Typography variant="h3" component="h2">{d.title}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{d.sections.slice(0, 4).join(' · ')}</Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </AsyncContent>
    </>
  );
}

export default function KnowledgePage() {
  const { id } = useParams();
  return id ? <DocumentView id={id} /> : <DocumentList />;
}

