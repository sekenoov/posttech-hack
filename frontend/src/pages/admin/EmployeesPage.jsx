import { useState } from 'react';
import {
  Alert, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Snackbar,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import useApi from '../../hooks/useApi';
import api, { errorMessage } from '../../services/api';
import { AsyncContent, InfoAlert, PageHeader } from '../../components/common/ui';
import { useT } from '../../i18n';
import { tokens } from '../../theme/tokens';
import { fmtDate, todayISO } from '../../utils/format';

const EMPTY = {
  last_name: '', first_name: '', middle_name: '', email: '', password: '', role: 'employee',
  position: '', department_id: '', manager_id: '', hire_date: todayISO(), annual_leave_days: 24,
};

function AddEmployeeDialog({ open, onClose, onCreated, employees }) {
  const t = useT();
  const departments = useApi('/admin/departments', { skip: !open });
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const managers = employees.filter((e) => e.role !== 'employee');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/admin/employees', {
        ...form,
        middle_name: form.middle_name || null,
        department_id: Number(form.department_id),
        manager_id: form.manager_id ? Number(form.manager_id) : null,
        annual_leave_days: Number(form.annual_leave_days),
      });
      setForm(EMPTY);
      onCreated();
    } catch (err) {
      setError(errorMessage(err, t('states.errorTitle')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" component="form" onSubmit={submit}>
      <DialogTitle>{t('admin.addTitle')}</DialogTitle>
      <DialogContent>
        <InfoAlert sx={{ mb: 2 }}>{t('admin.addHint')}</InfoAlert>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}><TextField fullWidth required label={t('admin.lastName')} value={form.last_name} onChange={set('last_name')} /></Grid>
          <Grid item xs={12} sm={4}><TextField fullWidth required label={t('admin.firstName')} value={form.first_name} onChange={set('first_name')} /></Grid>
          <Grid item xs={12} sm={4}><TextField fullWidth label={t('admin.middleName')} value={form.middle_name} onChange={set('middle_name')} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth required type="email" label={t('admin.email')} value={form.email} onChange={set('email')} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth required type="password" label={t('admin.password')} value={form.password} onChange={set('password')} inputProps={{ minLength: 8 }} helperText={t('admin.passwordHint')} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth required label={t('admin.position')} value={form.position} onChange={set('position')} /></Grid>
          <Grid item xs={12} sm={6}>
            <TextField select fullWidth required label={t('admin.role')} value={form.role} onChange={set('role')}>
              {['employee', 'manager', 'hr'].map((r) => <MenuItem key={r} value={r}>{t(`roles.${r}`)}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField select fullWidth required label={t('admin.department')} value={form.department_id} onChange={set('department_id')}>
              {(departments.data || []).map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField select fullWidth label={t('admin.manager')} value={form.manager_id} onChange={set('manager_id')}>
              <MenuItem value="">{t('admin.none')}</MenuItem>
              {managers.map((m) => <MenuItem key={m.id} value={m.id}>{m.full_name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth required type="date" label={t('admin.hireDate')} value={form.hire_date} onChange={set('hire_date')} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth required type="number" label={t('admin.leaveDays')} value={form.annual_leave_days} onChange={set('annual_leave_days')} inputProps={{ min: 0, max: 60 }} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">{t('common.cancel')}</Button>
        <Button type="submit" variant="contained" disabled={busy}>{t('common.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function EmployeesPage() {
  const t = useT();
  const result = useApi('/admin/employees');
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState('');

  return (
    <>
      <PageHeader title={t('admin.employeesTitle')} subtitle={t('admin.employeesSubtitle')}
        actions={<Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setOpen(true)}>{t('admin.add')}</Button>} />
      <AsyncContent result={result}>
        {(rows) => (
          <Card>
            <TableContainer>
              <Table size="small" sx={{ minWidth: 720 }}>
                <TableHead>
                  <TableRow>
                    {['fullName', 'position', 'department', 'manager', 'hireDate', 'role'].map((k) => (
                      <TableCell key={k} sx={{ fontWeight: 600, color: tokens.textMuted, whiteSpace: 'nowrap' }}>{t(`profile.${k}`)}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((e) => (
                    <TableRow key={e.id} hover>
                      <TableCell><Typography fontWeight={600} fontSize={14}>{e.full_name}</Typography><Typography variant="caption">{e.email}</Typography></TableCell>
                      <TableCell>{e.position}</TableCell>
                      <TableCell>{e.department}</TableCell>
                      <TableCell>{e.manager?.full_name || '-'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(e.hire_date)}</TableCell>
                      <TableCell><Chip size="small" label={t(`roles.${e.role}`)} sx={{ bgcolor: tokens.primarySoft, color: tokens.primaryStrong }} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}
      </AsyncContent>
      <AddEmployeeDialog open={open} onClose={() => setOpen(false)} employees={result.data || []}
        onCreated={() => { setOpen(false); setFlash(t('admin.created')); result.reload(); }} />
      <Snackbar open={Boolean(flash)} autoHideDuration={3000} onClose={() => setFlash('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled">{flash}</Alert>
      </Snackbar>
    </>
  );
}
