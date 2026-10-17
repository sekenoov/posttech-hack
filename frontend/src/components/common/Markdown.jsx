import { Box, Typography } from '@mui/material';
import { tokens } from '../../theme/tokens';

// Minimal, safe Markdown subset for lesson and knowledge-base content:
// "## heading", "- list", "> note", **bold**, paragraphs. Builds React
// elements only — no HTML injection, no extra dependency.
const inline = (text, keyBase) =>
  text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>
      : <span key={`${keyBase}-${i}`}>{part}</span>,
  );

export default function Markdown({ source }) {
  const blocks = [];
  let list = null;
  (source || '').split('\n').forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (line.startsWith('- ')) {
      list = list || [];
      list.push(line.slice(2));
      return;
    }
    if (list) { blocks.push({ type: 'ul', items: list, key: `ul-${idx}` }); list = null; }
    if (!line.trim()) return;
    if (line.startsWith('## ')) blocks.push({ type: 'h', text: line.slice(3), key: `h-${idx}` });
    else if (line.startsWith('# ')) blocks.push({ type: 'h', text: line.slice(2), key: `h-${idx}` });
    else if (line.startsWith('> ')) blocks.push({ type: 'note', text: line.slice(2), key: `n-${idx}` });
    else blocks.push({ type: 'p', text: line, key: `p-${idx}` });
  });
  if (list) blocks.push({ type: 'ul', items: list, key: 'ul-end' });

  return (
    <Box sx={{ '& > *:first-of-type': { mt: 0 } }}>
      {blocks.map((b) => {
        if (b.type === 'h') return <Typography key={b.key} variant="h3" component="h3" sx={{ mt: 3, mb: 1 }}>{b.text}</Typography>;
        if (b.type === 'ul') {
          return (
            <Box key={b.key} component="ul" sx={{ pl: 3, my: 1.5 }}>
              {b.items.map((item, i) => <Typography key={i} component="li" sx={{ mb: 0.75, lineHeight: 1.6 }}>{inline(item, `${b.key}-${i}`)}</Typography>)}
            </Box>
          );
        }
        if (b.type === 'note') {
          return (
            <Typography key={b.key} variant="body2" sx={{ my: 2, p: 1.5, borderLeft: `3px solid ${tokens.primary}`, bgcolor: tokens.primarySoft, borderRadius: 1, color: tokens.textMuted }}>
              {inline(b.text, b.key)}
            </Typography>
          );
        }
        return <Typography key={b.key} sx={{ my: 1.25, lineHeight: 1.65 }}>{inline(b.text, b.key)}</Typography>;
      })}
    </Box>
  );
}
