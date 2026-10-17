import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar, Avatar, Badge, Box, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, ListSubheader, Menu, MenuItem, Stack, Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/MenuRounded';
import LogoutIcon from '@mui/icons-material/LogoutRounded';
import PersonIcon from '@mui/icons-material/PersonOutlineRounded';
import Logo from '../common/Logo';
import { LoadingState } from '../common/ui';
import NotificationBell from './NotificationBell';
import LanguageSwitch from './LanguageSwitch';
import { visibleSections } from './navigation';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useI18n, useT } from '../../i18n';
import { tokens } from '../../theme/tokens';

const initials = (name = '') => name.split(' ').slice(0, 2).map((p) => p[0]).join('');

function SidebarContent({ onNavigate }) {
  const t = useT();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const { pathname } = useLocation();
  const isActive = (item) => (item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ px: 2.5, py: 2.25 }}>
        <Logo height={30} />
      </Box>
      <Divider />
      <Box component="nav" aria-label={t('nav.menu')} sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1 }}>
        {visibleSections(user.role).map((section) => (
          <List key={section.key} dense
            subheader={<ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: '32px', px: 1.5, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>{t(`nav.${section.key}`)}</ListSubheader>}>
            {section.items.map((item) => {
              const active = isActive(item);
              const label = t(user.role === 'hr' && item.labelHr ? item.labelHr : item.label);
              return (
                <ListItemButton key={item.to} component={NavLink} to={item.to} selected={active}
                  onClick={onNavigate} aria-current={active ? 'page' : undefined} sx={{ mb: 0.25, py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36, color: active ? tokens.primary : tokens.textMuted }}>
                    {item.badge === 'unread'
                      ? <Badge color="error" badgeContent={unreadCount} max={99}><item.icon fontSize="small" /></Badge>
                      : <item.icon fontSize="small" />}
                  </ListItemIcon>
                  <ListItemText primary={label} primaryTypographyProps={{ fontWeight: active ? 600 : 500, fontSize: 14 }} />
                </ListItemButton>
              );
            })}
          </List>
        ))}
      </Box>
      <Divider />
      <Box sx={{ px: 2.5, py: 1.5 }}>
        <Typography variant="caption">© Jana Post · {t('common.demo')}</Typography>
      </Box>
    </Box>
  );
}

export default function AppLayout() {
  const t = useT();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const { user, logout } = useAuth();
  const { locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const width = tokens.sidebarWidth;

  // apply the language saved in the user's profile after login
  useEffect(() => {
    if (user.locale && user.locale !== locale) setLocale(user.locale);
  }, [user.locale]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = () => {
    setMenuAnchor(null);
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant={desktop ? 'permanent' : 'temporary'}
        open={desktop || mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{ width: desktop ? width : 0, flexShrink: 0,
          '& .MuiDrawer-paper': { width, boxSizing: 'border-box', borderRight: `1px solid ${tokens.border}` } }}
      >
        <SidebarContent onNavigate={() => setMobileOpen(false)} />
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="sticky" color="inherit" elevation={0}
          sx={{ bgcolor: 'rgba(246,246,246,0.9)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${tokens.border}` }}>
          <Toolbar sx={{ gap: 1, minHeight: { xs: 56, md: 64 } }}>
            {!desktop && (
              <>
                <IconButton edge="start" aria-label={t('nav.menu')} onClick={() => setMobileOpen(true)}><MenuIcon /></IconButton>
                <Logo height={24} showProduct={false} />
              </>
            )}
            <Box sx={{ flex: 1 }} />
            <LanguageSwitch />
            <NotificationBell />
            <Tooltip title={user.full_name}>
              <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label={user.full_name} sx={{ p: 0.5 }}>
                <Avatar sx={{ width: 34, height: 34, bgcolor: tokens.primary, fontSize: 14, fontWeight: 600 }}>
                  {initials(`${user.first_name} ${user.last_name}`)}
                </Avatar>
              </IconButton>
            </Tooltip>
            <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
              <Box sx={{ px: 2, py: 1.25, maxWidth: 280 }}>
                <Typography fontWeight={600} noWrap>{user.full_name}</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>{user.position}</Typography>
                <Typography variant="caption">{t(`roles.${user.role}`)}</Typography>
              </Box>
              <Divider />
              <MenuItem onClick={() => { setMenuAnchor(null); navigate('/profile'); }}>
                <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>{t('nav.profile')}
              </MenuItem>
              <MenuItem onClick={handleLogout}>
                <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>{t('nav.logout')}
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ flex: 1, px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 2.5, md: 4 }, maxWidth: 1280, width: '100%', mx: 'auto' }}>
          <Stack>
            <Suspense fallback={<LoadingState rows={4} />}><Outlet /></Suspense>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
