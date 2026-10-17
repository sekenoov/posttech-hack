import { useState } from 'react';
import { Box, Button, Card, FormControlLabel, List, ListItemButton, ListItemText, Stack, Switch, Typography } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/NotificationsNoneRounded';
import useApi from '../hooks/useApi';
import { useNotifications } from '../context/NotificationsContext';
import { useOpenNotification } from '../components/layout/NotificationBell';
import { AsyncContent, EmptyState, PageHeader } from '../components/common/ui';
import { useT } from '../i18n';
import { tokens } from '../theme/tokens';
import { fmtDateTime } from '../utils/format';

export default function NotificationsPage() {
  const t = useT();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const result = useApi('/notifications', { params: { unread_only: unreadOnly, limit: 100 } });
  const { markAllRead } = useNotifications();
  const open = useOpenNotification();

  return (
    <>
      <PageHeader title={t('notifications.title')}
        actions={<Button variant="outlined" onClick={async () => { await markAllRead(); result.reload(); }}
          disabled={!result.data?.unread_count}>{t('notifications.markAll')}</Button>} />
      <Stack direction="row" sx={{ mb: 1.5 }}>
        <FormControlLabel control={<Switch checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />}
          label={t('notifications.unreadOnly')} />
      </Stack>
      <AsyncContent result={result}>
        {(data) => data.items.length === 0 ? (
          <Card><EmptyState icon={NotificationsIcon}
            title={unreadOnly ? t('notifications.noUnread') : t('notifications.empty')} text={t('notifications.emptyText')} /></Card>
        ) : (
          <Card>
            <List disablePadding>
              {data.items.map((n, i) => (
                <ListItemButton key={n.id} divider={i < data.items.length - 1}
                  onClick={async () => { await open(n); result.reload(); }}
                  sx={{ borderRadius: 0, py: 1.75, alignItems: 'flex-start', bgcolor: n.is_read ? 'transparent' : tokens.primarySoft }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', mt: 0.9, mr: 2, flexShrink: 0,
                    bgcolor: n.is_read ? tokens.border : tokens.primary }} aria-hidden />
                  <ListItemText
                    primary={n.title}
                    secondary={<>{n.body && <Typography variant="body2" component="span" display="block">{n.body}</Typography>}
                      <Typography variant="caption" component="span">{fmtDateTime(n.created_at)}</Typography></>}
                    primaryTypographyProps={{ fontWeight: n.is_read ? 500 : 700 }}
                    secondaryTypographyProps={{ component: 'div' }} />
                </ListItemButton>
              ))}
            </List>
          </Card>
        )}
      </AsyncContent>
    </>
  );
}
