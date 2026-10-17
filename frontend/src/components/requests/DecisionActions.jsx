import { useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/CheckRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import api, { errorMessage } from '../../services/api';
import { useNotifications } from '../../context/NotificationsContext';
import { useT } from '../../i18n';

/** Approve / reject buttons for a pending request; reject asks for a comment. */
export default function DecisionActions({ request, onDone, size = 'medium' }) {
  const t = useT();
  const { refresh } = useNotifications();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (decision) => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/team/requests/${request.id}/decision`, {
        decision, comment: decision === 'reject' ? comment || null : null,
      });
      setRejectOpen(false);
      refresh();
      onDone?.(data, decision);
    } catch (err) {
      setError(errorMessage(err, t('states.errorTitle')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="contained" size={size} startIcon={<CheckIcon />} disabled={busy} onClick={() => send('approve')}>
        {t('requests.approve')}
      </Button>
      <Button variant="outlined" color="error" size={size} startIcon={<CloseIcon />} disabled={busy}
        onClick={() => { setError(''); setRejectOpen(true); }}>
        {t('requests.reject')}
      </Button>
      {error && !rejectOpen && <Alert severity="error" sx={{ ml: 1 }}>{error}</Alert>}
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('requests.rejectTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {request.employee.full_name} · {t('requests.rejectHint')}
          </DialogContentText>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField autoFocus fullWidth multiline minRows={3} label={t('requests.rejectComment')}
            value={comment} onChange={(e) => setComment(e.target.value)} inputProps={{ maxLength: 500 }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRejectOpen(false)} color="inherit">{t('common.cancel')}</Button>
          <Button variant="contained" color="error" disabled={busy} onClick={() => send('reject')}>{t('requests.reject')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
