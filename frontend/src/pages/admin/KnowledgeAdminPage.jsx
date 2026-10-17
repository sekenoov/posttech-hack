import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Grid, List, ListItemButton, ListItemText, Snackbar, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import useApi from '../../hooks/useApi';
import api, { errorMessage } from '../../services/api';
import { AsyncContent, PageHeader } from '../../components/common/ui';
import Markdown from '../../components/common/Markdown';
import { useT } from '../../i18n';
import { tokens } from '../../theme/tokens';
import { fmtDateTime } from '../../utils/format';

function Editor({ id, onSaved }) {
  const t = useT();
  const doc = useApi(`/kb/${id}`);
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState('edit');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (doc.data) setForm({ title: doc.data.title, body_md: doc.data.body_md }); }, [doc.data]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.put(`/admin/kb/${id}`, form);
      onSaved(data);
      doc.reload();
    } catch (err) {
      setError(errorMessage(err, t('states.errorTitle')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AsyncContent result={doc}>
      {(d) => form && (
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="caption">{d.id} v{d.version}, {fmtDateTime(d.updated_at)}</Typography>
            </Stack>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField fullWidth label={t('kb.docTitle')} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} sx={{ mb: 2 }} />
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
              <Tab value="edit" label={t('kb.edit')} /><Tab value="preview" label={t('kb.preview')} />
            </Tabs>
            {tab === 'edit' ? (
              <TextField fullWidth multiline minRows={16} label={t('kb.body')} value={form.body_md}
                onChange={(e) => setForm((f) => ({ ...f, body_md: e.target.value }))}
                InputProps={{ sx: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 } }} />
            ) : (
              <Box sx={{ p: 2, border: `1px solid ${tokens.border}`, borderRadius: 2, maxHeight: 520, overflowY: 'auto' }}><Markdown source={form.body_md} /></Box>
            )}
            <Button variant="contained" sx={{ mt: 2 }} onClick={save}
              disabled={busy || (form.title === d.title && form.body_md === d.body_md)}>{t('common.save')}</Button>
          </CardContent>
        </Card>
      )}
    </AsyncContent>
  );
}

export default function KnowledgeAdminPage() {
  const t = useT();
  const docs = useApi('/kb');
  const [selected, setSelected] = useState(null);
  const [flash, setFlash] = useState('');
  const current = selected || docs.data?.[0]?.id;

  return (
    <>
      <PageHeader title={t('kb.adminTitle')} subtitle={t('kb.adminSubtitle')} />
      <AsyncContent result={docs}>
        {(rows) => (
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Card>
                <List>
                  {rows.map((d) => (
                    <ListItemButton key={d.id} selected={d.id === current} onClick={() => setSelected(d.id)}>
                      <ListItemText primary={d.title} secondary={`${d.id} v${d.version}`} />
                    </ListItemButton>
                  ))}
                </List>
              </Card>
            </Grid>
            <Grid item xs={12} md={8}>
              {current && <Editor key={current} id={current} onSaved={(d) => { setFlash(t('kb.saved', { v: d.version })); docs.reload(); }} />}
            </Grid>
          </Grid>
        )}
      </AsyncContent>
      <Snackbar open={Boolean(flash)} autoHideDuration={4000} onClose={() => setFlash('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled">{flash}</Alert>
      </Snackbar>
    </>
  );
}
