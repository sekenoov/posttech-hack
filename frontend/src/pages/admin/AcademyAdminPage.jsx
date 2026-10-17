import { useState } from 'react';
import {
  Alert, Autocomplete, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Snackbar, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AssignmentIcon from '@mui/icons-material/PlaylistAddOutlined';
import useApi from '../../hooks/useApi';
import api, { errorMessage } from '../../services/api';
import { AsyncContent, EmptyState, PageHeader, StatusChip } from '../../components/common/ui';
import { useT } from '../../i18n';
import { tokens } from '../../theme/tokens';
import { fmtDate } from '../../utils/format';

function AssignDialog({ open, onClose, onDone }) {
  const t = useT();
  const courses = useApi('/academy/courses', { skip: !open });
  const employees = useApi('/admin/employees', { skip: !open });
  const [courseId, setCourseId] = useState('');
  const [people, setPeople] = useState([]);
  const [due, setDue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/admin/academy/assignments', {
        course_id: Number(courseId), user_ids: people.map((p) => p.id), due_date: due || null,
      });
      setPeople([]);
      onDone(data);
    } catch (err) {
      setError(errorMessage(err, t('states.errorTitle')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('academy.assignTitle')}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select label={t('academy.course')} value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
            {(courses.data || []).map((c) => <MenuItem key={c.id} value={c.id}>{c.title}</MenuItem>)}
          </TextField>
          <Autocomplete multiple options={(employees.data || []).filter((e) => e.is_active)} value={people}
            onChange={(_, v) => setPeople(v)} getOptionLabel={(o) => `${o.full_name}, ${o.position}`}
            isOptionEqualToValue={(a, b) => a.id === b.id} filterSelectedOptions
            renderInput={(params) => <TextField {...params} label={t('academy.employees')} />} />
          <TextField type="date" label={t('academy.dueDate')} value={due} onChange={(e) => setDue(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">{t('common.cancel')}</Button>
        <Button variant="contained" onClick={submit} disabled={busy || !courseId || people.length === 0}>{t('academy.assign')}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AcademyAdminPage() {
  const t = useT();
  const result = useApi('/admin/academy/assignments');
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState('');

  return (
    <>
      <PageHeader title={t('academy.adminTitle')} subtitle={t('academy.adminSubtitle')}
        actions={<Button variant="contained" startIcon={<AssignmentIcon />} onClick={() => setOpen(true)}>{t('academy.assign')}</Button>} />
      <AsyncContent result={result}>
        {(rows) => rows.length === 0 ? <Card><EmptyState title={t('academy.emptyAdmin')} /></Card> : (
          <Card>
            <TableContainer>
              <Table size="small" sx={{ minWidth: 760 }}>
                <TableHead>
                  <TableRow>
                    {['employee', 'course', 'status', 'progress', 'result', 'dueDate'].map((k) => (
                      <TableCell key={k} sx={{ fontWeight: 600, color: tokens.textMuted, whiteSpace: 'nowrap' }}>{t(`academy.${k}`)}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((a) => (
                    <TableRow key={a.id} hover>
                      <TableCell><Typography fontSize={14} fontWeight={600}>{a.employee.full_name}</Typography><Typography variant="caption">{a.department}</Typography></TableCell>
                      <TableCell>{a.course_title}</TableCell>
                      <TableCell><StatusChip status={a.status} /></TableCell>
                      <TableCell>{a.progress_pct}% ({a.lessons_done}/{a.lessons_total})</TableCell>
                      <TableCell>{a.score != null ? `${a.score}%` : '-'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{a.due_date ? fmtDate(a.due_date) : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}
      </AsyncContent>
      <AssignDialog open={open} onClose={() => setOpen(false)}
        onDone={(data) => {
          setOpen(false);
          setFlash(`${t('academy.assigned', { n: data.created.length })}${data.skipped.length ? `, ${t('academy.skipped', { n: data.skipped.length })}` : ''}`);
          result.reload();
        }} />
      <Snackbar open={Boolean(flash)} autoHideDuration={3500} onClose={() => setFlash('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled">{flash}</Alert>
      </Snackbar>
    </>
  );
}
