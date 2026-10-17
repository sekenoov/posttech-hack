import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge, Box, Button, Divider, IconButton, List, ListItemButton, ListItemText, Popover, Stack, Tooltip, Typography,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/NotificationsNoneRounded';
import { useNotifications } from '../../context/NotificationsContext';
import { useT } from '../../i18n';
import { tokens } from '../../theme/tokens';
import { fmtRelative } from '../../utils/format';

export function useOpenNotification() {
  const { markRead } = useNotifications();
  const navigate = useNavigate();
  return async (n) => {
    if (!n.is_read) await markRead(n.id).catch(() => {});
    if (n.link) navigate(n.link);
  };
}

export default function NotificationBell() {
  const t = useT();
  const [anchor, setAnchor] = useState(null);
  const { items, unreadCount, markAllRead } = useNotifications();
  const open = useOpenNotification();
  const navigate = useNavigate();
  const latest = items.slice(0, 6);

  return (
    <>
      <Tooltip title={t('notifications.bellTitle')}>
        <IconButton onClick={(e) => setAnchor(e.currentTarget)}
          aria-label={`${t('notifications.bellTitle')}: ${unreadCount}`}>
          <Badge color="error" badgeContent={unreadCount} max={99}><NotificationsIcon /></Badge>
        </IconButton>
      </Tooltip>
      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: { xs: 'calc(100vw - 32px)', sm: 380 }, borderRadius: 3, border: `1px solid ${tokens.border}` } } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.5 }}>
          <Typography variant="h4">{t('notifications.title')}</Typography>
          {unreadCount > 0 && <Button size="small" onClick={markAllRead}>{t('notifications.markAll')}</Button>}
        </Stack>
        <Divider />
        {latest.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>{t('notifications.empty')}</Typography>
        ) : (
          <List dense disablePadding sx={{ maxHeight: 400, overflowY: 'auto' }}>
            {latest.map((n) => (
              <ListItemButton key={n.id} onClick={() => { setAnchor(null); open(n); }}
                sx={{ borderRadius: 0, alignItems: 'flex-start', bgcolor: n.is_read ? 'transparent' : tokens.primarySoft }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', mt: 1, mr: 1.5, flexShrink: 0,
                  bgcolor: n.is_read ? 'transparent' : tokens.primary }} />
                <ListItemText
                  primary={n.title}
                  secondary={<><span>{n.body}</span><br /><span>{fmtRelative(n.created_at)}</span></>}
                  primaryTypographyProps={{ fontWeight: n.is_read ? 500 : 600, fontSize: 14 }}
                  secondaryTypographyProps={{ component: 'div', fontSize: 13 }} />
              </ListItemButton>
            ))}
          </List>
        )}
        <Divider />
        <Box sx={{ p: 1 }}>
          <Button fullWidth onClick={() => { setAnchor(null); navigate('/notifications'); }}>{t('notifications.openAll')}</Button>
        </Box>
      </Popover>
    </>
  );
}
