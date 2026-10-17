import {
  Box, Card, CardContent, Chip, Grid, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import HubIcon from '@mui/icons-material/HubOutlined';
import useApi from '../../hooks/useApi';
import { AsyncContent, EmptyState, InfoAlert, PageHeader, SectionCard } from '../../components/common/ui';
import { useT } from '../../i18n';
import { tokens } from '../../theme/tokens';
import { fmtDateTime } from '../../utils/format';

function Row({ label, children }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 1, py: 0.5 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Box>{children}</Box>
    </Box>
  );
}

export default function IntegrationsPage() {
  const t = useT();
  const systems = useApi('/admin/integrations');
  const events = useApi('/admin/integration-events', { params: { limit: 30 } });

  return (
    <>
      <PageHeader title={t('integrations.title')} subtitle={t('integrations.subtitle')} />
      <AsyncContent result={systems}>
        {(rows) => (
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {rows.map((s) => (
              <Grid item xs={12} md={6} key={s.system}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                      <Box sx={{ p: 1, borderRadius: 2, bgcolor: tokens.primarySoft, color: tokens.primary, display: 'flex' }}><HubIcon /></Box>
                      <Typography variant="h3" sx={{ flex: 1 }}>{s.name}</Typography>
                      <Chip size="small" label={t('integrations.mock')} sx={{ bgcolor: tokens.warningSoft, color: tokens.warning }} />
                    </Stack>
                    <Row label={t('integrations.direction')}><Typography variant="body2" fontWeight={500}>{s.direction}</Typography></Row>
                    <Row label={t('integrations.port')}><Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>{s.port}</Typography></Row>
                    <Row label={t('integrations.adapter')}><Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>{s.adapter}</Typography></Row>
                    <Row label={t('integrations.data')}>
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        {s.data.map((d) => <Chip key={d} size="small" variant="outlined" label={d} />)}
                      </Stack>
                    </Row>
                    <Row label={t('integrations.lastEvent')}>
                      <Typography variant="body2">{s.last_event_at ? fmtDateTime(s.last_event_at) : t('integrations.never')}</Typography>
                    </Row>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </AsyncContent>
      <InfoAlert sx={{ mb: 2 }}>{t('integrations.note')}</InfoAlert>
      <SectionCard title={t('integrations.log')} contentSx={{ px: 0 }}>
        <AsyncContent result={events}>
          {(rows) => rows.length === 0 ? <EmptyState icon={HubIcon} title={t('integrations.emptyLog')} /> : (
            <TableContainer>
              <Table size="small" sx={{ minWidth: 640 }}>
                <TableHead>
                  <TableRow>
                    {['time', 'system', 'operation', 'reference', 'status'].map((k) => (
                      <TableCell key={k} sx={{ fontWeight: 600, color: tokens.textMuted }}>{t(`integrations.${k}`)}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((e) => (
                    <TableRow key={e.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.created_at)}</TableCell>
                      <TableCell>{e.system === '1c_zup' ? '1С:ЗУП' : 'Documentolog'}</TableCell>
                      <TableCell sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>{e.operation}</TableCell>
                      <TableCell>{e.reference || '—'}</TableCell>
                      <TableCell><Chip size="small" label={e.status}
                        sx={e.status === 'ok' ? { bgcolor: tokens.primarySoft, color: tokens.primaryStrong } : { bgcolor: tokens.dangerSoft, color: tokens.danger }} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </AsyncContent>
      </SectionCard>
    </>
  );
}
