import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, errMsg } from './api';
import { useToast } from '../components/ui';

/** GET with caching. `key` also controls invalidation. */
export function useApi<T = any>(path: string | null, params?: Record<string, unknown>, opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery<T>({
    queryKey: [path, params ?? {}], queryFn: () => api.get<T>(path!, params), enabled: !!path && opts.enabled !== false,
    placeholderData: keepPreviousData, refetchInterval: opts.refetchInterval,
  });
}

/** Mutation with success/error toasts and cache invalidation by path prefix. */
export function useAction<TVars = any, TRes = any>(fn: (v: TVars) => Promise<TRes>, o: { invalidate?: string[]; success?: string; onSuccess?: (r: TRes, v: TVars) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<TRes, Error, TVars>({
    mutationFn: fn,
    onSuccess: (r, v) => {
      for (const p of o.invalidate ?? []) qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith(p) });
      if (o.success) toast.success(o.success);
      o.onSuccess?.(r, v);
    },
    onError: (e) => toast.error(errMsg(e)),
  });
}
