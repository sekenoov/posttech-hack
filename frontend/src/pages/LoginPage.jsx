import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider, Stack, TextField, Typography,
} from '@mui/material';
import Logo from '../components/common/Logo';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../services/api';
import { useT } from '../i18n';
import { tokens } from '../theme/tokens';

const DEMO_PASSWORD = 'JanaDemo2026!';
const DEMO_ACCOUNTS = [
  { email: 'employee@janamen.example', role: 'employee', name: 'Айдана Касымова' },
  { email: 'manager@janamen.example', role: 'manager', name: 'Нурлан Абдрахманов' },
  { email: 'hr@janamen.example', role: 'hr', name: 'Сауле Ермекова' },
];

export default function LoginPage() {
  const t = useT();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(params.get('expired') ? t('states.sessionExpired') : '');
  const [busy, setBusy] = useState(false);
  const next = params.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (user) return <Navigate to={target} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(errorMessage(err, t('auth.error')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2, py: 4,
      background: `radial-gradient(1200px 500px at 10% -10%, ${tokens.primarySoft}, transparent), ${tokens.bg}` }}>
      <Box sx={{ width: '100%', maxWidth: 440 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}><Logo height={40} /></Box>
        <Card>
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Typography variant="h2" component="h1">{t('auth.title')}</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>{t('auth.subtitle')}</Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }} role="alert">{error}</Alert>}
            <Stack component="form" spacing={2} onSubmit={submit} noValidate>
              <TextField label={t('auth.email')} type="email" autoComplete="username" required autoFocus
                value={email} onChange={(e) => setEmail(e.target.value)} size="medium" />
              <TextField label={t('auth.password')} type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} size="medium" />
              <Button type="submit" variant="contained" size="large" disabled={busy || !email || !password}>
                {busy ? t('auth.submitting') : t('auth.submit')}
              </Button>
            </Stack>

            <Divider sx={{ my: 3 }}>
              <Typography variant="caption">{t('auth.demoTitle')}</Typography>
            </Divider>
            <Stack spacing={1}>
              {DEMO_ACCOUNTS.map((a) => (
                <Button key={a.email} variant="outlined" color="inherit"
                  onClick={() => { setEmail(a.email); setPassword(DEMO_PASSWORD); }}
                  sx={{ justifyContent: 'space-between', borderColor: tokens.border, fontWeight: 500 }}>
                  <span>{a.name}</span>
                  <Chip size="small" label={t(`roles.${a.role}`)} sx={{ bgcolor: tokens.primarySoft, color: tokens.primaryStrong }} />
                </Button>
              ))}
            </Stack>
            <Typography variant="caption" component="p" sx={{ mt: 1.5 }}>
              {t('auth.demoHint', { password: DEMO_PASSWORD })}. {t('auth.synthetic')}
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
