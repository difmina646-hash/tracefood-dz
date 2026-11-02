import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, Bell, Boxes, Building2, ClipboardCheck, Factory, FileWarning, FlaskConical, GitBranch, Handshake, LayoutDashboard, Languages, LogOut, Menu, MessageSquare, Moon, Package, PackageCheck, PackageSearch, Percent, QrCode, ScrollText, Search, ShieldCheck, ShoppingBag, Store, Sun, Tag, Truck, Users, Warehouse, X, MapPin, Ruler, ListChecks, UserRound, Settings, CheckCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { api } from '../lib/api';
import { cn, fmtDateTime } from '../lib/utils';
import { setLang, Lang } from '../i18n';
import { Badge, Button, StatusBadge } from './ui';

interface NavItem { to: string; label: string; icon: any; any?: string[]; portals?: string[]; end?: boolean }
interface NavGroup { title: string; items: NavItem[] }

const NAV: NavGroup[] = [
  { title: 'nav.g.main', items: [
    { to: '/app', label: 'nav.dashboard', icon: LayoutDashboard, end: true },
    { to: '/app/notifications', label: 'nav.notifications', icon: Bell },
  ] },
  { title: 'nav.g.operations', items: [
    { to: '/app/receptions', label: 'nav.receptions', icon: PackageCheck, any: ['reception:read'] },
    { to: '/app/lots', label: 'nav.lots', icon: Boxes, any: ['reception:read'] },
    { to: '/app/orders', label: 'nav.orders', icon: ClipboardCheck, any: ['production:read'] },
    { to: '/app/batches', label: 'nav.batches', icon: Factory, any: ['production:read'] },
    { to: '/app/inventory', label: 'nav.inventory', icon: Warehouse, any: ['inventory:read'] },
    { to: '/app/shipments', label: 'nav.shipments', icon: Truck, any: ['shipment:read'] },
  ] },
  { title: 'nav.g.trace', items: [
    { to: '/app/trace', label: 'nav.trace', icon: GitBranch, any: ['trace:read'], portals: ['MANUFACTURER', 'QUALITY'] },
    { to: '/app/received', label: 'nav.received', icon: PackageSearch, any: ['trace:read'], portals: ['RETAIL', 'DISTRIBUTOR'] },
  ] },
  { title: 'nav.g.quality', items: [
    { to: '/app/incidents', label: 'nav.incidents', icon: AlertOctagon, any: ['incident:read'] },
    { to: '/app/risk', label: 'nav.risk', icon: ShieldCheck, any: ['incident:read'] },
    { to: '/app/complaints', label: 'nav.complaints', icon: FileWarning, any: ['complaint:read'] },
    { to: '/app/quality-params', label: 'nav.qparams', icon: FlaskConical, any: ['quality:read'] },
  ] },
  { title: 'nav.g.master', items: [
    { to: '/app/suppliers', label: 'nav.suppliers', icon: Handshake, any: ['master:read'] },
    { to: '/app/materials', label: 'nav.materials', icon: Package, any: ['master:read'] },
    { to: '/app/products', label: 'nav.products', icon: Tag, any: ['master:read'] },
    { to: '/app/recipes', label: 'nav.recipes', icon: ListChecks, any: ['master:read'] },
    { to: '/app/locations', label: 'nav.locations', icon: MapPin, any: ['master:read', 'inventory:write'] },
    { to: '/app/transporters', label: 'nav.transporters', icon: Truck, any: ['master:write'] },
  ] },
  { title: 'nav.g.market', items: [
    { to: '/app/market', label: 'nav.market', icon: ShoppingBag, any: ['request:write'] },
    { to: '/app/offers', label: 'nav.offers', icon: Tag, any: ['offer:write'] },
    { to: '/app/requests', label: 'nav.requests', icon: Ruler, any: ['offer:write'] },
    { to: '/app/promotions', label: 'nav.promotions', icon: Percent, any: ['promotion:write'] },
    { to: '/app/messages', label: 'nav.messages', icon: MessageSquare, any: ['message:write'] },
  ] },
  { title: 'nav.g.admin', items: [
    { to: '/app/admin/companies', label: 'nav.companies', icon: Building2, any: ['admin:companies'] },
    { to: '/app/admin/users', label: 'nav.users', icon: Users, any: ['admin:users'] },
    { to: '/app/admin/certs', label: 'nav.certs', icon: ShieldCheck, any: ['admin:companies'] },
    { to: '/app/admin/offers', label: 'nav.adminOffers', icon: Store, any: ['admin:companies'] },
    { to: '/app/admin/audit', label: 'nav.audit', icon: ScrollText, any: ['admin:audit'] },
  ] },
  { title: 'nav.g.account', items: [
    { to: '/app/consumer', label: 'nav.myspace', icon: UserRound, portals: ['CONSUMER'] },
    { to: '/scan', label: 'nav.scan', icon: QrCode, portals: ['CONSUMER'] },
    { to: '/app/profile', label: 'nav.profile', icon: Settings, portals: ['MANUFACTURER', 'QUALITY', 'SUPPLIER', 'TRANSPORT', 'RETAIL', 'DISTRIBUTOR'] },
  ] },
];

export function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem('tf_theme') === 'dark' || (!localStorage.getItem('tf_theme') && matchMedia('(prefers-color-scheme: dark)').matches));
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('tf_theme', dark ? 'dark' : 'light'); }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

function Bell_() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useApi<{ items: any[] }>('/notifications', undefined, { refetchInterval: 60_000 });
  useEffect(() => { const f = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false); document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
  const unread = (data?.items ?? []).filter((n) => !n.readAt);
  const markAll = async () => { await Promise.all(unread.map((n) => api.post(`/notifications/${n.id}/read`))); qc.invalidateQueries({ queryKey: ['/notifications'] }); };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-label={t('nav.notifications')} className="relative rounded-lg p-2 hover:bg-muted">
        <Bell className="h-5 w-5" />{unread.length > 0 && <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>
      {open && (
        <div className="absolute end-0 z-40 mt-2 w-[min(92vw,360px)] rounded-xl border border-line bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-3 py-2"><span className="text-sm font-semibold">{t('nav.notifications')}</span>
            {unread.length > 0 && <button className="flex items-center gap-1 text-xs text-brand" onClick={markAll}><CheckCheck className="h-3.5 w-3.5" />{t('notif.markAll')}</button>}</div>
          <ul className="max-h-80 divide-y divide-line overflow-y-auto">
            {(data?.items ?? []).slice(0, 8).map((n) => (
              <li key={n.id} className={cn('px-3 py-2 text-sm', !n.readAt && 'bg-brand/5')}><div className="flex items-center gap-2"><StatusBadge status={n.severity} /><span className="font-medium">{n.title}</span></div>{n.message && <p className="mt-0.5 line-clamp-2 text-xs text-mutedfg">{n.message}</p>}<p className="mt-0.5 text-[11px] text-mutedfg">{fmtDateTime(n.createdAt)}</p></li>
            ))}
            {!data?.items?.length && <li className="px-3 py-6 text-center text-sm text-mutedfg">{t('notif.none')}</li>}
          </ul>
          <Link to="/app/notifications" onClick={() => setOpen(false)} className="block border-t border-line px-3 py-2 text-center text-xs text-brand">{t('notif.all')}</Link>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const { t, i18n } = useTranslation();
  const { me, portal, company, can, logout, switchCompany } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const { dark, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => setOpen(false), [loc.pathname]);

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => (!i.portals || i.portals.includes(portal)) && (!i.any || i.any.some((p) => can(p)))) })).filter((g) => g.items.length);
  const lang = (i18n.language === 'ar' ? 'ar' : 'fr') as Lang;

  const side = (
    <nav className="flex h-full flex-col bg-navy text-navyfg">
      <div className="flex h-16 items-center gap-2 border-b border-white/10 px-4"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brandfg"><GitBranch className="h-5 w-5" /></span><div className="leading-tight"><p className="font-bold">TraceFood DZ</p><p className="text-[11px] opacity-70">{t(`portal.${portal}`)}</p></div></div>
      <div className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {groups.map((g) => (
          <div key={g.title}><p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider opacity-50">{t(g.title)}</p>
            {g.items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm', isActive ? 'bg-white/15 font-semibold text-white' : 'opacity-80 hover:bg-white/10 hover:opacity-100')}>
                <i.icon className="h-4 w-4 shrink-0" />{t(i.label)}
              </NavLink>))}
          </div>))}
      </div>
      <div className="border-t border-white/10 p-3 text-xs opacity-70">v0.2 · {t('layout.demo')}</div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 lg:block">{side}</aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} /><aside className="absolute inset-y-0 start-0 w-72 max-w-[85vw]">{side}<button className="absolute end-2 top-3 rounded p-1 text-white" onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button></aside></div>}
      <div className="lg:ps-64">
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-card/90 px-3 backdrop-blur sm:px-5">
          <button className="rounded-lg p-2 hover:bg-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Menu"><Menu className="h-5 w-5" /></button>
          {can('trace:read') && portal !== 'RETAIL' && portal !== 'DISTRIBUTOR' ? (
            <form className="relative hidden max-w-sm flex-1 sm:block" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) nav(`/app/trace?q=${encodeURIComponent(q.trim())}`); }}>
              <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-mutedfg" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('layout.searchLot')} className="h-10 w-full rounded-lg border border-line bg-bg ps-9 pe-3 text-sm" />
            </form>) : <div className="flex-1" />}
          <div className="flex-1" />
          {me && me.companies.length > 1 && <select value={me.activeCompanyId ?? ''} onChange={(e) => switchCompany(e.target.value)} className="hidden h-9 max-w-[180px] rounded-lg border border-line bg-card px-2 text-sm sm:block">{me.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          <button onClick={() => setLang(lang === 'fr' ? 'ar' : 'fr')} className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm hover:bg-muted" aria-label="Language"><Languages className="h-4 w-4" />{lang === 'fr' ? 'العربية' : 'Français'}</button>
          <button onClick={toggle} className="rounded-lg p-2 hover:bg-muted" aria-label={t('layout.theme')}>{dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
          <Bell_ />
          <div className="ms-1 hidden items-center gap-2 border-s border-line ps-3 md:flex"><div className="text-end leading-tight"><p className="text-sm font-medium">{me?.fullName}</p><p className="text-[11px] text-mutedfg">{company?.name ?? t(`portal.${portal}`)}</p></div></div>
          <Button variant="ghost" size="sm" onClick={async () => { await logout(); nav('/login'); }} aria-label={t('auth.logout')}><LogOut className="h-4 w-4 rtl:rotate-180" /></Button>
        </header>
        <main className="mx-auto max-w-[1400px] p-3 sm:p-5"><Outlet /></main>
      </div>
    </div>
  );
}
export { Badge };
