import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

/**
 * GET a resource and expose { data, loading, error, status, reload }.
 * `status` is the HTTP status of a failed request (403/404 drive dedicated screens).
 */
export default function useApi(url, { params, skip = false } = {}) {
  const [state, setState] = useState({ data: null, loading: !skip, error: null, status: null });
  const paramsKey = JSON.stringify(params || {});
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (skip || !url) return;
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true, error: null, status: null }));
    try {
      const { data } = await api.get(url, { params: JSON.parse(paramsKey) });
      if (id === requestId.current) setState({ data, loading: false, error: null, status: null });
    } catch (error) {
      if (id === requestId.current) {
        setState({ data: null, loading: false, error, status: error.response?.status ?? null });
      }
    }
  }, [url, paramsKey, skip]);

  useEffect(() => { load(); }, [load]);

  return { ...state, reload: load };
}
