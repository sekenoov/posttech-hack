import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, InputAdornment, MenuItem,
  Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/SearchRounded';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import NoteAddIcon from '@mui/icons-material/NoteAddOutlined';
import InboxIcon from '@mui/icons-material/InboxRounded';
import useApi from '../../hooks/useApi';
import api, { errorMessage } from '../../services/api';
import { AsyncContent, EmptyState, InfoAlert, PageHeader } from '../../components/common/ui';
import { useT } from '../../i18n';
import { tokens } from '../../theme/tokens';
import { fmtDateTime } from '../../utils/format';

const STATUSES = ['new', 'reviewing', 'resolved', 'ignored'];
const TYPES = ['no_match', 'negative_feedback'];
const STATUS_STYLE = {
  new: { color: tokens.info, bg: tokens.infoSoft },
  reviewing: { color: tokens.warning, bg: tokens.warningSoft },
  resolved: { color: tokens.primaryStrong, bg: tokens.primarySoft },
  ignored: { color: tokens.textMuted, bg: tokens.neutralSoft },
};

function GapStatusChip({ status }) {
  const t = useT();
  const s = STATUS_STYLE[status] || STATUS_STYLE.ignored;
  return <Chip size="small" label={t(`gaps.status.${status}`)} sx={{ color: s.color, bgcolor: s.bg }} />;
}

function Field({ label, children }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Box sx={{ mt: 0.25 }}>{children}</Box>
    </Box>
  );
}

function GapDialog({ gap, documents, onClose, onSaved }) {
  const t = useT();
  const navigate = useNavigate();
  // Category = the knowledge base document this question belongs to; the retrieval candidate is preselected.
  const [form, setForm] = useState({ status: gap.status, category: gap.category || gap.candidate_doc_id || '', hr_comment: gap.hr_comment || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.patch(`/admin/knowledge-gaps/${gap.id}`, { ...form, category: form.category || null });
      onSaved(data);
    } catch (err) {
      setError(errorMessage(err, t('states.errorTitle')));
    } finally {
      setBusy(false);
    }
  };

  // Opens the existing editor with the question as a draft section. Nothing is
  // saved or published until HR edits it and presses «Сохранить» there.
  const createArticle = () => {
    const params = new URLSearchParams({ draft: gap.question });
    if (form.category) params.set('doc', form.category);
    navigate(`/admin/knowledge?${params.toString()}`);
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('gaps.detailTitle', { id: gap.id })}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: tokens.bg }}>
          <Typography sx={{ whiteSpace: 'pre-line', wordBreak: 'break-word' }}>«{gap.question}»</Typography>
        </Box>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={6}><Field label={t('gaps.col.date')}>{fmtDateTime(gap.created_at)}</Field></Grid>
          <Grid item xs={6}><Field label={t('gaps.col.type')}>{t(`gaps.type.${gap.event_type}`)}</Field></Grid>
          <Grid item xs={6}><Field label={t('gaps.col.reason')}>{t(`gaps.reason.${gap.reason}`)}</Field></Grid>
          <Grid item xs={6}><Field label={t('gaps.col.language')}>{gap.language}</Field></Grid>
        </Grid>
        <Stack spacing={2}>
          <TextField select label={t('gaps.col.status')} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{t(`gaps.status.${s}`)}</MenuItem>)}
          </TextField>
          <TextField select label={t('gaps.category')} value={form.category} helperText={t('gaps.categoryHint')}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            <MenuItem value="">{t('gaps.categoryNone')}</MenuItem>
            {documents.map((d) => <MenuItem key={d.id} value={d.id}>{d.title}</MenuItem>)}
          </TextField>
          <TextField label={t('gaps.comment')} value={form.hr_comment} multiline minRows={2} inputProps={{ maxLength: 2000 }}
            onChange={(e) => setForm((f) => ({ ...f, hr_comment: e.target.value }))} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <Button startIcon={<NoteAddIcon />} onClick={createArticle}>{t('gaps.createArticle')}</Button>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} color="inherit">{t('common.cancel')}</Button>
          <Button variant="contained" onClick={save} disabled={busy}>{t('common.save')}</Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

export default function KnowledgeGapsPage() {
  const t = useT();
  const [filters, setFilters] = useState({ q: '', status: '', event_type: '', date_from: '', date_to: '' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState(null);
  const [flash, setFlash] = useState('');
  const [exportError, setExportError] = useState('');

  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  const result = useApi('/admin/knowledge-gaps', { params: { ...activeFilters, page: page + 1, page_size: pageSize } });
  const docs = useApi('/kb');
  const documents = docs.data || [];
  const docTitle = (id) => documents.find((d) => d.id === id)?.title || id;
  const set = (key) => (e) => { setPage(0); setFilters((f) => ({ ...f, [key]: e.target.value })); };

  const exportXlsx = async () => {
    setExportError('');
    try {
      const { data } = await api.get('/admin/knowledge-gaps/export.xlsx', { params: activeFilters, responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `janamen-knowledge-gaps-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(errorMessage(err, t('states.errorTitle')));
    }
  };

  return (
    <>
      <PageHeader title={t('gaps.title')} subtitle={t('gaps.subtitle')}
        actions={<Button variant="contained" startIcon={<DownloadIcon />} onClick={exportXlsx}>{t('gaps.export')}</Button>} />
      <InfoAlert sx={{ mb: 2 }}>{t('gaps.privacy')}</InfoAlert>
      {exportError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setExportError('')}>{exportError}</Alert>}

      <Card sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={1.5}>
          <Grid item xs={12} md={4}>
            <TextField fullWidth label={t('gaps.search')} value={filters.q} onChange={set('q')} inputProps={{ maxLength: 200 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField select fullWidth label={t('gaps.col.status')} value={filters.status} onChange={set('status')}>
              <MenuItem value="">{t('common.all')}</MenuItem>
              {STATUSES.map((s) => <MenuItem key={s} value={s}>{t(`gaps.status.${s}`)}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField select fullWidth label={t('gaps.col.type')} value={filters.event_type} onChange={set('event_type')}>
              <MenuItem value="">{t('common.all')}</MenuItem>
              {TYPES.map((s) => <MenuItem key={s} value={s}>{t(`gaps.type.${s}`)}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField fullWidth type="date" label={t('gaps.dateFrom')} value={filters.date_from} onChange={set('date_from')} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField fullWidth type="date" label={t('gaps.dateTo')} value={filters.date_to} onChange={set('date_to')} InputLabelProps={{ shrink: true }} />
          </Grid>
        </Grid>
      </Card>

      <AsyncContent result={result}>
        {(data) => data.total === 0 ? (
          <Card><EmptyState icon={InboxIcon} title={t('gaps.empty')} text={t('gaps.emptyText')} /></Card>
        ) : (
          <Card>
            <TableContainer>
              <Table size="small" sx={{ minWidth: 820 }}>
                <TableHead>
                  <TableRow>
                    {['date', 'question', 'type', 'language', 'reason', 'category', 'status'].map((k) => (
                      <TableCell key={k} sx={{ fontWeight: 600, color: tokens.textMuted, whiteSpace: 'nowrap' }}>{t(`gaps.col.${k}`)}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.items.map((g) => (
                    <TableRow key={g.id} hover onClick={() => setSelected(g)} sx={{ cursor: 'pointer' }}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDateTime(g.created_at)}</TableCell>
                      <TableCell sx={{ maxWidth: 360 }}>
                        <Typography variant="body2" noWrap title={g.question}>{g.question}</Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{t(`gaps.type.${g.event_type}`)}</TableCell>
                      <TableCell>{g.language}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{t(`gaps.reason.${g.reason}`)}</TableCell>
                      <TableCell sx={{ maxWidth: 220 }}><Typography variant="body2" noWrap>{g.category ? docTitle(g.category) : '—'}</Typography></TableCell>
                      <TableCell><GapStatusChip status={g.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination component="div" count={data.total} page={page} rowsPerPage={pageSize}
              rowsPerPageOptions={[10, 20, 50, 100]} onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} />
          </Card>
        )}
      </AsyncContent>

      {selected && (
        <GapDialog gap={selected} documents={documents} onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); setFlash(t('gaps.saved')); result.reload(); }} />
      )}
      <Snackbar open={Boolean(flash)} autoHideDuration={3000} onClose={() => setFlash('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled">{flash}</Alert>
      </Snackbar>
    </>
  );
}
