import { Box, Typography } from '@mui/material';
import { tokens } from '../../theme/tokens';

// Official Jana Post logo (from janapost.kz header, unmodified, 77:40 ratio)
// next to the JanaМен product wordmark.
export default function Logo({ height = 32, showProduct = true }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <Box
        component="img"
        src="/brand/jana-post-logo.svg"
        alt="Jana Post"
        sx={{ height, width: (height * 77) / 40, display: 'block' }}
      />
      {showProduct && (
        <Box sx={{ borderLeft: `1px solid ${tokens.border}`, pl: 1.25, lineHeight: 1 }}>
          <Typography component="span" sx={{ fontWeight: 700, fontSize: height * 0.56, color: tokens.text, letterSpacing: '-0.01em' }}>
            JanaМен
          </Typography>
        </Box>
      )}
    </Box>
  );
}
