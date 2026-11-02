import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertOctagon, Ban, Boxes, Building2, Clock, Factory, FileWarning, FlaskConical, Handshake, Package, ShieldAlert, Tag, Truck, Users, Warehouse, Percent, PackageCheck, Thermometer, ClipboardCheck, MessageSquare, GitBranch, Check, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { fmtDate, fmtDateTime, fmtNum } from '../lib/utils';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, StatusBadge, TableWrap, Td, Th } from '../components/ui';

const PALETTE = ['#059669', '#0f2a4a', '#d97706', '#2563eb', '#dc2626', '#7c3aed', '#0891b2', '#64748b'];
const chartText = { fontSize: 11, fill: '#64748b' };

function Loading() { return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>; }

export default function Dashboard() {
  const { portal } = useAuth(); const { t } = useTranslation();
  switch (portal) {
    case 'MANUFACTURER': return <ManufacturerDash />;
    case 'QUALITY': return <QualityDash />;
    case 'SUPPLIER': return <SupplierDash />;
    case 'TRANSPORT': return <TransportDash />;
    case 'RETAIL': case 'DISTRIBUTOR': return <RetailDash />;
    case 'ADMIN': return <AdminDash />;
    case 'CONSUMER': return <Navigate to="/app/consumer" replace />;
    default: return <EmptyState title={t('dash.none')} />;
  }
}

const Alerts = ({ items }: { items?: any[] }) => {
  const { t } = useTranslation();
  return <Card><CardHeader title={t('dash.alerts')} action={<Link className="text-xs text-brand" to="/app/notifications">{t('notif.all')}</Link>} />
    <CardBody className="space-y-2">{!items?.length ? <p className="text-sm text-mutedfg">{t('dash.noAlerts')}</p> : items.map((a) => <div key={a.id} className="flex items-start gap-2 text-sm"><StatusBadge status={a.severity} /><div><p className="font-medium">{a.title}</p>{a.message && <p className="text-xs text-mutedfg">{a.message}</p>}<p className="text-[11px] text-mutedfg">{fmtDateTime(a.createdAt)}</p></div></div>)}</CardBody></Card>;
};

function ManufacturerDash() {
  const { t } = useTranslation();
  const d = useApi<any>('/dashboard'); const r = useApi<any>('/reports/production', { days: 30 });
  if (d.isLoading) return <Loading />; if (d.error) return <ErrorState error={d.error} retry={() => d.refetch()} />;
  const k = d.data.kpis;
  return (<>
    <PageHeader title={t('dash.manufacturer')} subtitle={t('dash.live')} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={Boxes} label={t('kpi.rawMaterialLots')} value={k.rawMaterialLots} />
      <StatCard icon={Factory} label={t('kpi.activeBatches')} value={k.activeBatches} tone="ok" />
      <StatCard icon={Warehouse} label={t('kpi.availableInventory')} value={fmtNum(k.availableInventory, 0)} />
      <StatCard icon={FlaskConical} label={t('kpi.pendingQuality')} value={k.lotsPendingQuality + k.batchesPendingQuality} tone={k.lotsPendingQuality + k.batchesPendingQuality ? 'warn' : 'neutral'} hint={`${k.lotsPendingQuality} ${t('nav.lots')} · ${k.batchesPendingQuality} ${t('nav.batches')}`} />
      <StatCard icon={Clock} label={t('kpi.expiring')} value={k.expiringBatches} tone={k.expiringBatches ? 'warn' : 'neutral'} />
      <StatCard icon={Truck} label={t('kpi.activeShipments')} value={k.activeShipments} tone="info" />
      <StatCard icon={Ban} label={t('kpi.blockedBatches')} value={k.blockedBatches} tone={k.blockedBatches ? 'danger' : 'neutral'} />
      <StatCard icon={AlertOctagon} label={t('kpi.openNc')} value={k.openNonConformities} tone={k.openNonConformities ? 'danger' : 'neutral'} />
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2"><CardHeader title={t('dash.production30')} /><CardBody>{!r.data?.producedPerDay.length ? <p className="py-10 text-center text-sm text-mutedfg">{t('dash.noProd')}</p> :
        <div className="h-64"><ResponsiveContainer><AreaChart data={r.data.producedPerDay}><CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" /><XAxis dataKey="date" tick={chartText} tickFormatter={(x) => x.slice(5)} /><YAxis tick={chartText} /><Tooltip /><Area type="monotone" dataKey="quantity" name={t('dash.qty')} stroke="#059669" fill="#05966933" /></AreaChart></ResponsiveContainer></div>}</CardBody></Card>
      <Card><CardHeader title={t('dash.batchStatus')} /><CardBody><div className="h-64"><ResponsiveContainer><PieChart><Pie data={d.data.batchesByStatus.map((s: any) => ({ name: t(`status.${s.status}`), value: s._count }))} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>{d.data.batchesByStatus.map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></CardBody></Card>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Card><CardHeader title={t('dash.stockProduct')} /><CardBody>{!r.data?.stockByProduct.length ? <p className="py-6 text-center text-sm text-mutedfg">{t('common.empty')}</p> : <div className="h-56"><ResponsiveContainer><BarChart data={r.data.stockByProduct}><CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" /><XAxis dataKey="product" tick={chartText} /><YAxis tick={chartText} /><Tooltip /><Bar dataKey="quantity" fill="#0f2a4a" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>}</CardBody></Card>
      <Alerts items={d.data.alerts} />
      <Card><CardHeader title={t('dash.recent')} /><CardBody className="space-y-2">{d.data.recentActivity.map((a: any, i: number) => <div key={i} className="flex justify-between gap-2 text-sm"><span><b>{a.action}</b> <span className="text-mutedfg">{a.entity}</span></span><span className="whitespace-nowrap text-xs text-mutedfg">{a.by} · {fmtDateTime(a.at)}</span></div>)}</CardBody></Card>
    </div>
  </>);
}

function QualityDash() {
  const { t } = useTranslation();
  const d = useApi<any>('/dashboard');
  const lots = useApi<any>('/lots', { status: 'PENDING', pageSize: 6 });
  const batches = useApi<any>('/batches', { status: 'PENDING', pageSize: 6 });
  const blocked = useApi<any>('/batches', { status: 'BLOCKED', pageSize: 6 });
  const nc = useApi<any>('/incidents', { pageSize: 6 });
  const cp = useApi<any>('/complaints');
  if (d.isLoading) return <Loading />; if (d.error) return <ErrorState error={d.error} retry={() => d.refetch()} />;
  const k = d.data.kpis; const openNc = (nc.data?.items ?? []).filter((x: any) => x.status !== 'CLOSED');
  const newComplaints = (cp.data?.items ?? []).filter((x: any) => x.status === 'NEW').length;
  const List = ({ title, items, to, label, link }: any) => (
    <Card><CardHeader title={title} />{!items?.length ? <p className="p-4 text-sm text-mutedfg">{t('dash.nothing')}</p> : <ul className="divide-y divide-line">{items.map((x: any) => <li key={x.id}><Link to={`${to}/${x.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-muted/50"><span><b>{label(x)}</b></span><StatusBadge status={x.status} /></Link></li>)}</ul>}{link && <Link to={link} className="block border-t border-line px-4 py-2 text-xs text-brand">{t('common.seeAll')}</Link>}</Card>);
  return (<>
    <PageHeader title={t('dash.quality')} subtitle={t('dash.qualitySub')} actions={<><Link to="/app/trace"><Button variant="outline"><GitBranch className="h-4 w-4" />{t('nav.trace')}</Button></Link><Link to="/app/incidents"><Button variant="danger"><ShieldAlert className="h-4 w-4" />{t('dash.recallSim')}</Button></Link></>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={FlaskConical} label={t('kpi.pendingControls')} value={k.lotsPendingQuality + k.batchesPendingQuality} tone={k.lotsPendingQuality + k.batchesPendingQuality ? 'warn' : 'ok'} />
      <StatCard icon={AlertOctagon} label={t('kpi.nonConformities')} value={k.openNonConformities} tone={k.openNonConformities ? 'danger' : 'ok'} />
      <StatCard icon={Ban} label={t('kpi.blockedBatches')} value={k.blockedBatches} tone={k.blockedBatches ? 'danger' : 'neutral'} />
      <StatCard icon={FileWarning} label={t('kpi.newComplaints')} value={newComplaints} tone={newComplaints ? 'warn' : 'neutral'} />
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <List title={t('dash.lotsToControl')} items={lots.data?.items} to="/app/lots" label={(x: any) => `${x.internalLotNumber} — ${x.material?.name}`} link="/app/lots" />
      <List title={t('dash.batchesToControl')} items={batches.data?.items} to="/app/batches" label={(x: any) => `${x.batchNumber} — ${x.product?.name}`} link="/app/batches" />
      <List title={t('dash.openNc')} items={openNc} to="/app/incidents" label={(x: any) => `${x.code} — ${x.title}`} link="/app/incidents" />
      <List title={t('dash.blocked')} items={blocked.data?.items} to="/app/batches" label={(x: any) => `${x.batchNumber} — ${x.product?.name}`} />
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><Alerts items={d.data.alerts} />
      <Card><CardHeader title={t('dash.tools')} /><CardBody className="grid gap-2 sm:grid-cols-2">{[['/app/risk', t('nav.risk'), ShieldAlert], ['/app/quality-params', t('nav.qparams'), FlaskConical], ['/app/complaints', t('nav.complaints'), FileWarning], ['/app/incidents', t('nav.incidents'), AlertOctagon]].map(([to, l, I]: any) => <Link key={to} to={to} className="flex items-center gap-2 rounded-lg border border-line p-3 text-sm hover:bg-muted"><I className="h-4 w-4 text-brand" />{l}</Link>)}</CardBody></Card></div>
  </>);
}

function SupplierDash() {
  const { t } = useTranslation();
  const d = useApi<any>('/dashboard'); const reqs = useApi<any>('/requests'); const offers = useApi<any>('/offers/mine');
  if (d.isLoading) return <Loading />; if (d.error) return <ErrorState error={d.error} retry={() => d.refetch()} />;
  const k = d.data.kpis;
  return (<>
    <PageHeader title={t('dash.supplier')} actions={<Link to="/app/offers"><Button><Tag className="h-4 w-4" />{t('nav.offers')}</Button></Link>} />
    <div className="grid gap-4 sm:grid-cols-3"><StatCard icon={Tag} label={t('kpi.activeOffers')} value={k.activeOffers} tone="ok" /><StatCard icon={MessageSquare} label={t('kpi.openRequests')} value={k.openRequests} tone={k.openRequests ? 'warn' : 'neutral'} /><StatCard icon={Check} label={t('kpi.answered')} value={k.answeredRequests} /></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card><CardHeader title={t('dash.recentRequests')} action={<Link className="text-xs text-brand" to="/app/requests">{t('common.seeAll')}</Link>} />{!reqs.data?.items.length ? <p className="p-4 text-sm text-mutedfg">{t('common.empty')}</p> : <ul className="divide-y divide-line">{reqs.data.items.slice(0, 5).map((r: any) => <li key={r.id} className="px-4 py-2.5 text-sm"><div className="flex justify-between"><b>{r.requesterCompany.name}</b><StatusBadge status={r.status} /></div><p className="text-xs text-mutedfg">{r.offer.title}</p><p className="line-clamp-1">{r.message}</p></li>)}</ul>}</Card>
      <Card><CardHeader title={t('dash.myOffers')} action={<Link className="text-xs text-brand" to="/app/offers">{t('common.seeAll')}</Link>} />{!offers.data?.items.length ? <EmptyState title={t('common.empty')} /> : <ul className="divide-y divide-line">{offers.data.items.slice(0, 5).map((o: any) => <li key={o.id} className="flex items-center justify-between px-4 py-2.5 text-sm"><span><b>{o.title}</b><span className="block text-xs text-mutedfg">{fmtNum(o.quantityAvailable)} {t(`unit.${o.unit}`)} · {o._count.supplierRequests} {t('nav.requests').toLowerCase()}</span></span><StatusBadge status={o.status} /></li>)}</ul>}</Card>
    </div>
  </>);
}

function TransportDash() {
  const { t } = useTranslation();
  const d = useApi<any>('/dashboard'); const s = useApi<any>('/shipments', { pageSize: 8 });
  if (d.isLoading) return <Loading />; if (d.error) return <ErrorState error={d.error} retry={() => d.refetch()} />;
  const k = d.data.kpis;
  return (<>
    <PageHeader title={t('dash.transport')} actions={<Link to="/app/shipments"><Button><Truck className="h-4 w-4" />{t('nav.shipments')}</Button></Link>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard icon={Truck} label={t('kpi.assigned')} value={k.assignedShipments} tone="info" /><StatCard icon={AlertOctagon} label={t('kpi.incidents')} value={k.incidents} tone={k.incidents ? 'danger' : 'neutral'} /><StatCard icon={Thermometer} label={t('kpi.tempExc')} value={k.temperatureExcursions} tone={k.temperatureExcursions ? 'danger' : 'neutral'} /><StatCard icon={PackageCheck} label={t('kpi.delivered')} value={k.deliveredShipments} tone="ok" /></div>
    <Card className="mt-4"><CardHeader title={t('dash.assigned')} />{!s.data?.items.length ? <EmptyState title={t('ship.none')} /> : <TableWrap><thead><tr><Th>N°</Th><Th>{t('ship.from')}</Th><Th>{t('ship.to')}</Th><Th>{t('f.status')}</Th></tr></thead><tbody>{s.data.items.map((x: any) => <tr key={x.id} className="hover:bg-muted/40"><Td><Link className="font-semibold text-brand" to={`/app/shipments/${x.id}`}>{x.shipmentNumber}</Link></Td><Td>{x.fromLocation.name}</Td><Td>{x.toLocation.name}</Td><Td><StatusBadge status={x.status} /></Td></tr>)}</tbody></TableWrap>}</Card>
  </>);
}

function RetailDash() {
  const { t } = useTranslation(); const { portal } = useAuth();
  const d = useApi<any>('/dashboard'); const incoming = useApi<any>('/shipments', { pageSize: 50 }); const inv = useApi<any>('/inventory', { pageSize: 100 });
  if (d.isLoading) return <Loading />; if (d.error) return <ErrorState error={d.error} retry={() => d.refetch()} />;
  const k = d.data.kpis; const inc = (incoming.data?.items ?? []).filter((s: any) => ['IN_TRANSIT', 'DELIVERED', 'INCIDENT'].includes(s.status));
  const alerts = (inv.data?.items ?? []).filter((x: any) => x.alert);
  return (<>
    <PageHeader title={portal === 'RETAIL' ? t('dash.retail') : t('dash.distributor')} />
    {k.blockedBatchesInStock > 0 && <Alert tone="danger" className="mb-4" title={t('dash.blockedInStock')}>{t('dash.blockedInStockMsg')}</Alert>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard icon={Truck} label={t('kpi.incoming')} value={k.incomingDeliveries} tone={k.incomingDeliveries ? 'info' : 'neutral'} /><StatCard icon={Warehouse} label={t('kpi.stockLines')} value={k.stockLines} /><StatCard icon={Clock} label={t('kpi.expiringStock')} value={k.expiringOrExpired} tone={k.expiringOrExpired ? 'warn' : 'neutral'} /><StatCard icon={Percent} label={t('kpi.promos')} value={k.activePromotions} /></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card><CardHeader title={t('dash.incoming')} action={<Link className="text-xs text-brand" to="/app/shipments">{t('common.seeAll')}</Link>} />{!inc.length ? <p className="p-4 text-sm text-mutedfg">{t('dash.noIncoming')}</p> : <ul className="divide-y divide-line">{inc.slice(0, 6).map((s: any) => <li key={s.id}><Link to={`/app/shipments/${s.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/50"><span><b>{s.shipmentNumber}</b><span className="block text-xs text-mutedfg">{s.fromLocation.name} → {s.toLocation.name}</span></span><StatusBadge status={s.status} /></Link></li>)}</ul>}</Card>
      <Card><CardHeader title={t('dash.expiryAlerts')} action={<Link className="text-xs text-brand" to="/app/inventory">{t('nav.inventory')}</Link>} />{!alerts.length ? <p className="p-4 text-sm text-mutedfg">{t('dash.noExpiry')}</p> : <ul className="divide-y divide-line">{alerts.slice(0, 6).map((x: any) => <li key={x.id} className="flex items-center justify-between px-4 py-2.5 text-sm"><span><b>{x.product}</b> · {x.batchNumber}<span className="block text-xs text-mutedfg">{x.location} · {fmtNum(x.available)} · {fmtDate(x.expiryDate)}</span></span><StatusBadge status={x.alert} /></li>)}</ul>}</Card>
    </div>
    <div className="mt-4"><Alerts items={d.data.alerts} /></div>
  </>);
}

function AdminDash() {
  const { t } = useTranslation();
  const s = useApi<any>('/admin/stats'); const pending = useApi<any>('/admin/companies', { status: 'PENDING', pageSize: 10 });
  const act = useAction(({ id, a }: { id: string; a: string }) => api.post(`/admin/companies/${id}/${a}`, {}), { invalidate: ['/admin'], success: t('common.done') });
  if (s.isLoading) return <Loading />; if (s.error) return <ErrorState error={s.error} retry={() => s.refetch()} />;
  const st = (n: string) => s.data.companiesByStatus.find((x: any) => x.status === n)?._count ?? 0;
  return (<>
    <PageHeader title={t('dash.admin')} subtitle={t('dash.adminSub')} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard icon={Clock} label={t('dash.pendingCompanies')} value={st('PENDING')} tone={st('PENDING') ? 'warn' : 'neutral'} /><StatCard icon={Building2} label={t('dash.activeCompanies')} value={st('ACTIVE')} tone="ok" /><StatCard icon={Ban} label={t('dash.suspended')} value={st('SUSPENDED')} tone={st('SUSPENDED') ? 'danger' : 'neutral'} /><StatCard icon={Users} label={t('dash.proUsers')} value={s.data.professionalUsers} /></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2"><CardHeader title={t('dash.pendingRequests')} action={<Link className="text-xs text-brand" to="/app/admin/companies">{t('common.seeAll')}</Link>} />
        {!pending.data?.items.length ? <p className="p-4 text-sm text-mutedfg">{t('dash.noPending')}</p> : <TableWrap><thead><tr><Th>{t('f.name')}</Th><Th>{t('f.type')}</Th><Th>{t('f.wilaya')}</Th><Th /></tr></thead><tbody>{pending.data.items.map((c: any) => <tr key={c.id}><Td><b>{c.name}</b><span className="block text-xs text-mutedfg">{c.email}</span></Td><Td>{t(`ctype.${c.type}`)}</Td><Td>{c.wilaya ?? '—'}</Td><Td><div className="flex justify-end gap-1"><Button size="sm" onClick={() => act.mutate({ id: c.id, a: 'approve' })}><Check className="h-3.5 w-3.5" />{t('admin.approve')}</Button><Button size="sm" variant="outline" onClick={() => act.mutate({ id: c.id, a: 'reject' })}><X className="h-3.5 w-3.5" /></Button></div></Td></tr>)}</tbody></TableWrap>}</Card>
      <Card><CardHeader title={t('dash.byType')} /><CardBody><div className="h-56"><ResponsiveContainer><PieChart><Pie data={s.data.companiesByType.map((x: any) => ({ name: t(`ctype.${x.type}`), value: x._count }))} dataKey="value" nameKey="name" outerRadius={75}>{s.data.companiesByType.map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></CardBody></Card>
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['materialLots', Package], ['productionBatches', Factory], ['shipments', Truck], ['openNonConformities', AlertOctagon]].map(([k, I]: any) => <StatCard key={k} icon={I} label={t(`admin.tot.${k}`)} value={s.data.totals[k]} />)}</div>
  </>);
}
