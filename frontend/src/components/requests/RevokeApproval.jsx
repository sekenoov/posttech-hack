import { useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField,
} from '@mui/material';
import UndoIcon from '@mui/icons-material/UndoRounded';
import api, { errorMessage } from '../../services/api';
import { useNotifications } from '../../context/NotificationsContext';
import { useT } from '../../i18n';

/** Take back an approval before the leave starts; the reason is optional. */
export default function RevokeApproval({ request, onDone }) {
  const t = useT();
  const { refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/team/requests/${request.id}/revoke`, { comment: comment.trim() || null });
      setOpen(false);
      setComment('');
      refresh();
      onDone?.(data);
    } catch (err) {
      setError(errorMessage(err, t('states.errorTitle')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outlined" color="warning" startIcon={<UndoIcon />} onClick={() => { setError(''); setOpen(true); }}>
        {t('requests.revokeApproval')}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('requests.revokeTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {request.employee.full_name}. {t('requests.revokeHint')}
          </DialogContentText>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField autoFocus fullWidth multiline minRows={3} label={t('requests.revokeComment')}
            value={comment} onChange={(e) => setComment(e.target.value)} inputProps={{ maxLength: 500 }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)} color="inherit">{t('common.cancel')}</Button>
          <Button variant="contained" color="warning" disabled={busy} onClick={send}>{t('requests.revokeApproval')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
