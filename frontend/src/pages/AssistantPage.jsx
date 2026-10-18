import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Avatar, Box, Button, Card, Chip, CircularProgress, IconButton, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/SendRounded';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeOutlined';
import DescriptionIcon from '@mui/icons-material/DescriptionOutlined';
import SupportAgentIcon from '@mui/icons-material/SupportAgentOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAltRounded';
import InfoIcon from '@mui/icons-material/InfoOutlined';
import EventIcon from '@mui/icons-material/EventOutlined';
import SchoolIcon from '@mui/icons-material/SchoolOutlined';
import ThumbDownIcon from '@mui/icons-material/ThumbDownOffAltOutlined';
import useApi from '../hooks/useApi';
import api, { errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { PageHeader, StatusChip } from '../components/common/ui';
import { useT } from '../i18n';
import { tokens } from '../theme/tokens';

const MODE_STYLE = {
  llm: { color: tokens.primaryStrong, bg: tokens.primarySoft },
  extractive: { color: tokens.info, bg: tokens.infoSoft },
  personal: { color: tokens.primaryStrong, bg: tokens.primaryTint },
  refusal: { color: tokens.warning, bg: tokens.warningSoft },
};

// Button label for the section a personal answer links to
const LINK_LABELS = {
  '/requests/new': 'ai.newRequest', '/requests': 'nav.requests', '/academy': 'nav.academy', '/team': 'nav.team',
};

/** A record behind a personal answer: one request or course, opens its page. */
function ItemCard({ item }) {
  const Icon = item.kind === 'course' ? SchoolIcon : EventIcon;
  return (
    <Box component={RouterLink} to={item.link}
      sx={{ display: 'block', textDecoration: 'none', color: 'inherit', p: 1.5, borderRadius: 2,
        border: `1px solid ${tokens.border}`, bgcolor: 'background.paper', '&:hover': { borderColor: tokens.primary } }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Icon fontSize="small" sx={{ color: tokens.primary }} />
        <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 0 }} noWrap>{item.title}</Typography>
        <StatusChip status={item.status} />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{item.subtitle}</Typography>
    </Box>
  );
}

function SourceCard({ source }) {
  const t = useT();
  return (
    <Box component={RouterLink} to={`/knowledge/${source.id}#${source.anchor}`}
      sx={{ display: 'block', textDecoration: 'none', color: 'inherit', p: 1.5, borderRadius: 2,
        border: `1px solid ${tokens.border}`, bgcolor: 'background.paper', '&:hover': { borderColor: tokens.primary } }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <DescriptionIcon fontSize="small" sx={{ color: tokens.primary }} />
        <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 0 }} noWrap>{source.title}</Typography>
        <Chip size="small" label={`${source.id} v${source.version}`} sx={{ bgcolor: tokens.bg, fontWeight: 500 }} />
      </Stack>
      <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>{t('ai.source')}: {source.section}</Typography>
      {source.snippet && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>«{source.snippet}»</Typography>}
    </Box>
  );
}

function BotMessage({ msg, onEscalate, onFeedback }) {
  const t = useT();
  const { user } = useAuth();
  const a = msg.answer;
  const style = a ? MODE_STYLE[a.mode] : null;
  const personal = a?.mode === 'personal';
  const linkLabel = a?.link === '/team' && user?.role === 'hr' ? 'nav.teamHr' : (personal && LINK_LABELS[a?.link]) || 'ai.goTo';
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start" role="article" aria-label="AI Jana">
      <Avatar sx={{ bgcolor: tokens.primary, width: 32, height: 32 }}><AutoAwesomeIcon fontSize="small" /></Avatar>
      <Box sx={{ flex: 1, minWidth: 0, maxWidth: 720 }}>
        <Box sx={{ p: 2, borderRadius: 3, borderTopLeftRadius: 4, bgcolor: 'background.paper', border: `1px solid ${tokens.border}` }}>
          {a && (
            <Chip size="small" label={t(`ai.mode${a.mode[0].toUpperCase()}${a.mode.slice(1)}`)}
              sx={{ mb: 1, color: style.color, bgcolor: style.bg }} />
          )}
          <Typography sx={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>{msg.text}</Typography>
          {a?.provider_error && <Typography variant="caption" component="p" sx={{ mt: 1 }}>{t('ai.providerDown')}</Typography>}
          {a?.items?.length > 0 && (
            <Stack spacing={1} sx={{ mt: 1.5 }}>{a.items.map((it) => <ItemCard key={it.link} item={it} />)}</Stack>
          )}
          {a?.sources?.length > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="overline" color="text.secondary">{t('ai.sources')}</Typography>
              <Stack spacing={1} sx={{ mt: 0.5 }}>{a.sources.map((s) => <SourceCard key={`${s.id}-${s.anchor}`} source={s} />)}</Stack>
            </Box>
          )}
          {(a?.escalation_suggested || a?.link) && (
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
              {a.escalation_suggested && (
                msg.escalated
                  ? <Alert severity="success" sx={{ py: 0 }}>{t('ai.escalated')}</Alert>
                  : <Button size="small" variant="outlined" startIcon={<SupportAgentIcon />} onClick={onEscalate}>{t('ai.escalate')}</Button>
              )}
              {a.link && (
                <Button size="small" component={RouterLink} to={a.link} variant={personal ? 'contained' : 'text'}>
                  {t(linkLabel)}
                </Button>
              )}
            </Stack>
          )}
          {a && a.mode !== 'refusal' && (
            <Box sx={{ mt: 1.25 }}>
              {msg.feedbackSent
                ? <Typography variant="caption">{t('ai.feedbackThanks')}</Typography>
                : <Button size="small" color="inherit" startIcon={<ThumbDownIcon fontSize="small" />} onClick={onFeedback}
                    sx={{ color: tokens.textMuted }}>{t('ai.notHelpful')}</Button>}
            </Box>
          )}
        </Box>
      </Box>
    </Stack>
  );
}

function UserMessage({ text }) {
  return (
    <Stack direction="row" justifyContent="flex-end">
      <Box sx={{ maxWidth: 560, p: 1.75, borderRadius: 3, borderTopRightRadius: 4, bgcolor: tokens.primaryStrong, color: '#fff' }}>
        <Typography sx={{ whiteSpace: 'pre-line' }}>{text}</Typography>
      </Box>
    </Stack>
  );
}

export default function AssistantPage() {
  const t = useT();
  const status = useApi('/ai/status');
  const { refresh } = useNotifications();
  const greeting = { role: 'bot', text: t('ai.greeting') };
  const [messages, setMessages] = useState([greeting]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (question.length < 2 || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setBusy(true);
    try {
      const { data } = await api.post('/ai/ask', { question });
      setMessages((m) => [...m, { role: 'bot', text: data.answer, answer: data, question }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'bot', text: errorMessage(err, t('ai.error')) }]);
    } finally {
      setBusy(false);
    }
  };

  // «Не помогло»: anonymous negative_feedback event for the HR knowledge gap journal
  const feedback = async (index) => {
    const msg = messages[index];
    const a = msg.answer;
    try {
      await api.post('/ai/feedback', {
        question: msg.question, answer_mode: a.mode,
        source_ids: [...new Set((a.sources || []).map((s) => s.id))].slice(0, 5),
      });
      setMessages((m) => m.map((x, i) => (i === index ? { ...x, feedbackSent: true } : x)));
    } catch (err) {
      setMessages((m) => [...m, { role: 'bot', text: errorMessage(err, t('ai.error')) }]);
    }
  };

  const escalate = async (index) => {
    const msg = messages[index];
    try {
      await api.post('/ai/escalate', { question: msg.question });
      setMessages((m) => m.map((x, i) => (i === index ? { ...x, escalated: true } : x)));
      refresh();
    } catch (err) {
      setMessages((m) => [...m, { role: 'bot', text: errorMessage(err, t('ai.error')) }]);
    }
  };

  const s = status.data;
  return (
    <>
      <PageHeader title={t('ai.title')} subtitle={t('ai.subtitle')}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            {s && (
              <Chip size="small" icon={<InfoIcon />} variant="outlined"
                label={s.llm_enabled ? t('ai.statusLlm', { model: s.model }) : t('ai.statusOffline')} />
            )}
            <Tooltip title={t('ai.clear')}>
              <IconButton onClick={() => setMessages([greeting])} aria-label={t('ai.clear')}><RestartAltIcon /></IconButton>
            </Tooltip>
          </Stack>
        } />
      <Card sx={{ display: 'flex', flexDirection: 'column', height: { xs: 'calc(100vh - 220px)', md: 'calc(100vh - 230px)' }, minHeight: 420 }}>
        <Box role="log" aria-live="polite" sx={{ flex: 1, overflowY: 'auto', p: { xs: 2, md: 3 }, bgcolor: tokens.bg }}>
          <Stack spacing={2.5}>
            {messages.map((m, i) => (m.role === 'user'
              ? <UserMessage key={i} text={m.text} />
              : <BotMessage key={i} msg={m} onEscalate={() => escalate(i)} onFeedback={() => feedback(i)} />))}
            {messages.length === 1 && (
              <Box sx={{ pl: { sm: 6 } }}>
                <Typography variant="overline" color="text.secondary">{t('ai.suggestions')}</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                  {['s1', 's2', 's3', 's4'].map((k) => (
                    <Chip key={k} label={t(`ai.${k}`)} onClick={() => send(t(`ai.${k}`))} variant="outlined"
                      sx={{ bgcolor: 'background.paper', fontWeight: 500 }} />
                  ))}
                </Stack>
              </Box>
            )}
            {busy && (
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ pl: 6 }}>
                <CircularProgress size={16} /><Typography variant="body2" color="text.secondary">{t('ai.thinking')}</Typography>
              </Stack>
            )}
            <div ref={endRef} />
          </Stack>
        </Box>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); send(); }}
          sx={{ p: 2, borderTop: `1px solid ${tokens.border}`, display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField fullWidth multiline maxRows={4} value={input} onChange={(e) => setInput(e.target.value)}
            placeholder={t('ai.placeholder')} inputProps={{ maxLength: 1000, 'aria-label': t('ai.placeholder') }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <Button type="submit" variant="contained" disabled={busy || input.trim().length < 2} endIcon={<SendIcon />} sx={{ flexShrink: 0 }}>
            {t('ai.send')}
          </Button>
        </Box>
      </Card>
      <Typography variant="caption" component="p" sx={{ mt: 1.5 }}>{t('ai.disclaimer')}</Typography>
    </>
  );
}
