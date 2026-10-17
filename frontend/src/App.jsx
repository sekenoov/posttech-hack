import { lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import theme from './theme/theme';
import { I18nProvider, useT } from './i18n';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationsProvider } from './context/NotificationsContext';
import AppLayout from './components/layout/AppLayout';
import { ForbiddenState, LoadingState, NotFoundState } from './components/common/ui';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const RequestsPage = lazy(() => import('./pages/RequestsPage'));
const RequestNewPage = lazy(() => import('./pages/RequestNewPage'));
const RequestDetailPage = lazy(() => import('./pages/RequestDetailPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const AcademyPage = lazy(() => import('./pages/AcademyPage'));
const CoursePage = lazy(() => import('./pages/CoursePage'));
const AssistantPage = lazy(() => import('./pages/AssistantPage'));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage'));
const EmployeesPage = lazy(() => import('./pages/admin/EmployeesPage'));
const AcademyAdminPage = lazy(() => import('./pages/admin/AcademyAdminPage'));
const KnowledgeAdminPage = lazy(() => import('./pages/admin/KnowledgeAdminPage'));
const IntegrationsPage = lazy(() => import('./pages/admin/IntegrationsPage'));

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState inline />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}

// UX guard only: every API behind these pages enforces the same rule.
function RequireRole({ roles, children }) {
  const { user } = useAuth();
  return roles.includes(user.role) ? children : <ForbiddenState />;
}

const TITLES = [
  ['/requests/new', 'requests.newTitle'], ['/requests', 'nav.requests'], ['/profile', 'nav.profile'],
  ['/team', 'nav.team'], ['/academy', 'nav.academy'], ['/admin/academy', 'nav.adminAcademy'], ['/assistant', 'nav.assistant'], ['/knowledge', 'nav.knowledge'], ['/admin/knowledge', 'kb.adminTitle'], ['/admin/integrations', 'nav.integrations'], ['/notifications', 'nav.notifications'], ['/admin/employees', 'nav.employees'],
  ['/login', 'auth.title'],
];

function DocumentTitle() {
  const t = useT();
  const { pathname } = useLocation();
  useEffect(() => {
    const match = TITLES.find(([prefix]) => pathname.startsWith(prefix));
    document.title = match ? `${t(match[1])} · JanaМен` : 'JanaМен · Jana Post';
  }, [pathname, t]);
  return null;
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <I18nProvider>
        <AuthProvider>
          <NotificationsProvider>
            <BrowserRouter>
              <DocumentTitle />
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
                  <Route index element={<DashboardPage />} />
                  <Route path="dashboard" element={<Navigate to="/" replace />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="requests" element={<RequestsPage />} />
                  <Route path="requests/new" element={<RequestNewPage />} />
                  <Route path="requests/:id" element={<RequestDetailPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="academy" element={<AcademyPage />} />
                  <Route path="academy/:id" element={<CoursePage />} />
                  <Route path="assistant" element={<AssistantPage />} />
                  <Route path="knowledge" element={<KnowledgePage />} />
                  <Route path="knowledge/:id" element={<KnowledgePage />} />
                  <Route path="team" element={<RequireRole roles={['manager', 'hr']}><TeamPage /></RequireRole>} />
                  <Route path="admin/employees" element={<RequireRole roles={['hr']}><EmployeesPage /></RequireRole>} />
                  <Route path="admin/academy" element={<RequireRole roles={['hr']}><AcademyAdminPage /></RequireRole>} />
                  <Route path="admin/knowledge" element={<RequireRole roles={['hr']}><KnowledgeAdminPage /></RequireRole>} />
                  <Route path="admin/integrations" element={<RequireRole roles={['hr']}><IntegrationsPage /></RequireRole>} />
                  <Route path="*" element={<NotFoundState />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </NotificationsProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
