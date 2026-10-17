import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, List, ListItemButton, ListItemText, Typography } from '@mui/material';
import { SectionCard } from '../common/ui';
import { useOpenNotification } from '../layout/NotificationBell';
import { useT } from '../../i18n';
import { tokens } from '../../theme/tokens';
import { fmtRelative } from '../../utils/format';

/** Latest notifications with a link to the notification center; used on the dashboard and the profile. */
export default function RecentNotificationsCard({ title, items }) {
  const t = useT();
  const open = useOpenNotification();
  return (
    <SectionCard title={title}
      action={<Button size="small" component={RouterLink} to="/notifications">{t('common.showAll')}</Button>}>
      {items.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2 }}>{t('dashboard.noNotifications')}</Typography>
      ) : (
        <List dense disablePadding>
          {items.map((n) => (
            <ListItemButton key={n.id} onClick={() => open(n)} sx={{ px: 1, alignItems: 'flex-start' }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', mt: 1, mr: 1.25, flexShrink: 0,
                bgcolor: n.is_read ? tokens.border : tokens.primary }} />
              <ListItemText primary={n.title} secondary={fmtRelative(n.created_at)}
                primaryTypographyProps={{ fontWeight: n.is_read ? 500 : 600, fontSize: 14 }} />
            </ListItemButton>
          ))}
        </List>
      )}
    </SectionCard>
  );
}
