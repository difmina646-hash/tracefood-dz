import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api, session } from './api';

export interface Me {
  id: string; email: string; fullName: string; language: string; isSuperAdmin: boolean; isConsumer: boolean;
  companies: { id: string; name: string; type: string; status: string; role: string }[]; activeCompanyId: string | null; permissions: string[];
}
export type Portal = 'ADMIN' | 'CONSUMER' | 'MANUFACTURER' | 'QUALITY' | 'SUPPLIER' | 'TRANSPORT' | 'RETAIL' | 'DISTRIBUTOR' | 'NONE';

interface AuthCtx {
  me: Me | null; loading: boolean; portal: Portal; company: Me['companies'][number] | null;
  can: (...p: string[]) => boolean; canAny: (...p: string[]) => boolean;
  login: (email: string, password: string) => Promise<Me>; logout: () => Promise<void>; refresh: () => Promise<void>; switchCompany: (id: string) => Promise<void>;
}
const Ctx = createContext<AuthCtx>(null as never);
export const useAuth = () => useContext(Ctx);

const portalOf = (me: Me | null): Portal => {
  if (!me) return 'NONE';
  if (me.isSuperAdmin) return 'ADMIN';
  if (me.isConsumer) return 'CONSUMER';
  const role = me.companies.find((c) => c.id === me.activeCompanyId)?.role;
  switch (role) {
    case 'MANUFACTURER_ADMIN': case 'PRODUCTION_OPERATOR': return 'MANUFACTURER';
    case 'QUALITY_MANAGER': return 'QUALITY';
    case 'SUPPLIER_ADMIN': return 'SUPPLIER';
    case 'TRANSPORTER': return 'TRANSPORT';
    case 'RETAIL_MANAGER': return 'RETAIL';
    case 'DISTRIBUTOR_MANAGER': return 'DISTRIBUTOR';
    default: return 'NONE';
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(!!session.token);

  const refresh = useCallback(async () => {
    if (!session.token) { setMe(null); setLoading(false); return; }
    try { setMe(await api.get<Me>('/auth/me')); } catch { setMe(null); }
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { const f = () => setMe(null); window.addEventListener('tf-logout', f); return () => window.removeEventListener('tf-logout', f); }, []);

  const value = useMemo<AuthCtx>(() => ({
    me, loading, portal: portalOf(me), company: me?.companies.find((c) => c.id === me.activeCompanyId) ?? null,
    can: (...p) => !!me && p.every((x) => me.permissions.includes(x)),
    canAny: (...p) => !!me && p.some((x) => me.permissions.includes(x)),
    login: async (email, password) => {
      const r = await api.post<{ token: string }>('/auth/login', { email, password });
      session.token = r.token; session.company = null;
      const m = await api.get<Me>('/auth/me'); setMe(m); return m;
    },
    logout: async () => { try { await api.post('/auth/logout'); } catch { /* already ended */ } session.token = null; session.company = null; setMe(null); },
    refresh,
    switchCompany: async (id) => { session.company = id; await refresh(); },
  }), [me, loading, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
