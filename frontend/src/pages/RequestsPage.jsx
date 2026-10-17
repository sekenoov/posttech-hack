import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, Stack, Tab, Tabs } from '@mui/material';
import AddIcon from '@mui/icons-material/AddRounded';
import useApi from '../hooks/useApi';
import { AsyncContent, EmptyState, PageHeader } from '../components/common/ui';
import RequestRow from '../components/requests/RequestRow';
import { useT } from '../i18n';

const FILTERS = ['all', 'pending', 'approved', 'rejected', 'cancelled'];

export default function RequestsPage() {
  const t = useT();
  const [filter, setFilter] = useState('all');
  const result = useApi('/requests');

  return (
    <>
      <PageHeader title={t('requests.title')} subtitle={t('requests.subtitle')}
        actions={<Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to="/requests/new">{t('requests.new')}</Button>} />
      <Card sx={{ mb: 2, px: 1 }}>
        <Tabs value={filter} onChange={(_, v) => setFilter(v)} variant="scrollable" allowScrollButtonsMobile>
          {FILTERS.map((f) => <Tab key={f} value={f} label={f === 'all' ? t('common.all') : t(`status.${f}`)} />)}
        </Tabs>
      </Card>
      <AsyncContent result={result}>
        {(rows) => {
          const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
          if (rows.length === 0) {
            return (
              <Card><EmptyState title={t('requests.emptyTitle')} text={t('requests.emptyText')}
                action={<Button variant="contained" component={RouterLink} to="/requests/new">{t('requests.new')}</Button>} /></Card>
            );
          }
          if (shown.length === 0) return <Card><EmptyState title={t('requests.emptyFiltered')} /></Card>;
          return <Stack spacing={1}>{shown.map((r) => <RequestRow key={r.id} request={r} />)}</Stack>;
        }}
      </AsyncContent>
    </>
  );
}
