import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const NotificationsContext = createContext(null);
const POLL_MS = 30000;

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get('/notifications', { params: { limit: 8 } });
      setItems(data.items);
      setUnreadCount(data.unread_count);
    } catch { /* bell is non-critical; next poll retries */ }
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [user, refresh]);

  const markRead = useCallback(async (id) => {
    await api.post(`/notifications/${id}/read`);
    refresh();
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    await api.post('/notifications/read-all');
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ items, unreadCount, refresh, markRead, markAllRead }),
    [items, unreadCount, refresh, markRead, markAllRead],
  );
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotifications = () => useContext(NotificationsContext);
