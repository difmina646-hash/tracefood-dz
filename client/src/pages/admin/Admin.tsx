import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, Check, RotateCcw, ShieldCheck, ShieldX, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { fmtDate, fmtDateTime, fmtNum } from '../../lib/utils';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, Select, SkeletonRows, StatusBadge, TableWrap, Td, Textarea, Th, Toolbar } from '../../components/ui';
import { useDebounced, usePaged } from '../../components/common';

export function AdminCompaniesPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState(''); const [type, setType] = useState(''); const [q, setQ] = useState(''); const dq = useDebounced(q);
  const l = usePaged('/admin/companies', { status: status || undefined, type: type || undefined, q: dq || undefined });
  const [dlg, setDlg] = useState<{ c: any; a: 'approve' | 'reject' | 'suspend' | 'deactivate' } | null>(null); const [reason, setReason] = useState('');
  const run = useAction(() => api.post(`/admin/companies/${dlg!.c.id}/${dlg!.a}`, { reason: reason || undefined }), { invalidate: ['/admin'], success: t('common.done'), onSuccess: () => { setDlg(null); setReason(''); } });
  const btn = (c: any, a: any, icon: any, label: string, v: any = 'outline') => <Button size="sm" variant={v} onClick={() => setDlg({ c, a })}>{icon}{label}</Button>;
  return (<>
    <PageHeader title={t('nav.companies')} subtitle={t('admin.compSub')} />
    <Card><Toolbar><Input className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} /><Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t('common.allStatus')}</option>{['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'DEACTIVATED'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select><Select className="w-44" value={type} onChange={(e) => setType(e.target.value)}><option value="">{t('admin.allTypes')}</option>{['MANUFACTURER', 'SUPPLIER', 'TRANSPORTER', 'DISTRIBUTOR', 'RETAILER'].map((s) => <option key={s} value={s}>{t(`ctype.${s}`)}</option>)}</Select></Toolbar>
      {l.isLoading ? <SkeletonRows /> : l.error ? <ErrorState error={l.error} /> : !l.items.length ? <EmptyState title={t('common.empty')} /> : <TableWrap><thead><tr><Th>{t('f.name')}</Th><Th>{t('f.type')}</Th><Th>{t('f.wilaya')}</Th><Th>{t('admin.users')}</Th><Th>{t('admin.registered')}</Th><Th>{t('f.status')}</Th><Th /></tr></thead>
        <tbody>{l.items.map((c: any) => <tr key={c.id}><Td><b>{c.name}</b><span className="block text-xs text-mutedfg">{c.email}{c.registrationNumber ? ` · RC ${c.registrationNumber}` : ''}</span></Td><Td>{t(`ctype.${c.type}`)}</Td><Td>{c.wilaya ?? '—'}</Td><Td>{c._count.memberships}</Td><Td>{fmtDate(c.createdAt)}</Td><Td><StatusBadge status={c.status} /></Td>
          <Td><div className="flex flex-wrap justify-end gap-1">{c.status === 'PENDING' && <>{btn(c, 'approve', <Check className="h-3.5 w-3.5" />, t('admin.approve'), 'primary')}{btn(c, 'reject', <X className="h-3.5 w-3.5" />, t('admin.reject'))}</>}{c.status === 'ACTIVE' && <>{btn(c, 'suspend', <Ban className="h-3.5 w-3.5" />, t('admin.suspend'))}</>}{(c.status === 'SUSPENDED' || c.status === 'REJECTED') && btn(c, 'approve', <RotateCcw className="h-3.5 w-3.5" />, t('admin.reactivate'), 'primary')}</div></Td></tr>)}</tbody></TableWrap>}
      <Pagination page={l.page} pageSize={l.pageSize} total={l.total} onChange={l.setPage} /></Card>
    <Modal open={!!dlg} onClose={() => setDlg(null)} title={dlg ? `${t(`admin.act.${dlg.a}`)} — ${dlg.c.name}` : ''} footer={<><Button variant="outline" onClick={() => setDlg(null)}>{t('common.cancel')}</Button><Button variant={dlg?.a === 'suspend' || dlg?.a === 'reject' ? 'danger' : 'primary'} loading={run.isPending} onClick={() => run.mutate(undefined)}>{t('common.confirm')}</Button></>}>
      <Field label={t('admin.reason')}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field></Modal>
  </>);
}

export function AdminUsersPage() {
  const { t } = useTranslation(); const l = usePaged('/admin/users');
  const set = useAction((v: { id: string; status: string }) => api.patch(`/admin/users/${v.id}/status`, { status: v.status }), { invalidate: ['/admin/users'], success: t('common.done') });
  return (<>
    <PageHeader title={t('nav.users')} subtitle={t('admin.usersSub')} />
    <Card>{l.isLoading ? <SkeletonRows /> : l.error ? <ErrorState error={l.error} /> : !l.items.length ? <EmptyState title={t('common.empty')} /> : <TableWrap><thead><tr><Th>{t('f.name')}</Th><Th>{t('f.email')}</Th><Th>{t('admin.company')}</Th><Th>{t('admin.lastLogin')}</Th><Th>{t('f.status')}</Th><Th /></tr></thead>
      <tbody>{l.items.map((u: any) => <tr key={u.id}><Td><b>{u.fullName}</b></Td><Td>{u.email}</Td><Td className="text-xs">{u.memberships.map((m: any) => `${m.company.name} (${m.role.code})`).join(', ')}</Td><Td>{fmtDateTime(u.lastLoginAt)}</Td><Td><StatusBadge status={u.status} /></Td><Td>{u.status === 'ACTIVE' ? <Button size="sm" variant="outline" onClick={() => set.mutate({ id: u.id, status: 'SUSPENDED' })}>{t('admin.suspend')}</Button> : <Button size="sm" onClick={() => set.mutate({ id: u.id, status: 'ACTIVE' })}>{t('admin.reactivate')}</Button>}</Td></tr>)}</tbody></TableWrap>}
      <Pagination page={l.page} pageSize={l.pageSize} total={l.total} onChange={l.setPage} /></Card>
  </>);
}

export function AdminCertsPage() {
  const { t } = useTranslation(); const [f, setF] = useState('false');
  const q = useApi<{ items: any[] }>('/admin/certifications', { verified: f || undefined });
  const set = useAction((v: { id: string; verified: boolean }) => api.post(`/admin/certifications/${v.id}/verify`, { verified: v.verified }), { invalidate: ['/admin/certifications'], success: t('common.done') });
  return (<>
    <PageHeader title={t('nav.certs')} subtitle={t('admin.certSub')} />
    <Card><Toolbar><Select className="w-48" value={f} onChange={(e) => setF(e.target.value)}><option value="false">{t('admin.toVerify')}</option><option value="true">{t('admin.verified')}</option><option value="">{t('common.allStatus')}</option></Select></Toolbar>
      {q.isLoading ? <SkeletonRows /> : !q.data?.items.length ? <EmptyState title={t('common.empty')} /> : <TableWrap><thead><tr><Th>{t('admin.company')}</Th><Th>{t('f.name')}</Th><Th>{t('cert.issuer')}</Th><Th>N°</Th><Th>{t('cert.validTo')}</Th><Th>{t('f.status')}</Th><Th /></tr></thead>
        <tbody>{q.data.items.map((c) => <tr key={c.id}><Td><b>{c.company.name}</b></Td><Td>{c.name}</Td><Td>{c.issuer ?? '—'}</Td><Td>{c.number ?? '—'}</Td><Td>{fmtDate(c.validTo)}</Td><Td>{c.verified ? <Badge tone="ok">{t('admin.verified')}</Badge> : <Badge tone="warn">{t('admin.toVerify')}</Badge>}</Td><Td>{c.verified ? <Button size="sm" variant="outline" onClick={() => set.mutate({ id: c.id, verified: false })}><ShieldX className="h-3.5 w-3.5" />{t('admin.unverify')}</Button> : <Button size="sm" onClick={() => set.mutate({ id: c.id, verified: true })}><ShieldCheck className="h-3.5 w-3.5" />{t('admin.verify')}</Button>}</Td></tr>)}</tbody></TableWrap>}</Card>
  </>);
}

export function AdminOffersPage() {
  const { t } = useTranslation(); const q = useApi<{ items: any[] }>('/admin/offers');
  const set = useAction((v: { id: string; status: string }) => api.post(`/admin/offers/${v.id}/status`, { status: v.status }), { invalidate: ['/admin/offers'], success: t('common.done') });
  return (<>
    <PageHeader title={t('nav.adminOffers')} subtitle={t('admin.offersSub')} />
    <Card>{q.isLoading ? <SkeletonRows /> : !q.data?.items.length ? <EmptyState title={t('common.empty')} /> : <TableWrap><thead><tr><Th>{t('nc.title')}</Th><Th>{t('rec.supplier')}</Th><Th>{t('mk.available')}</Th><Th>{t('nav.requests')}</Th><Th>{t('f.status')}</Th><Th /></tr></thead>
      <tbody>{q.data.items.map((o) => <tr key={o.id}><Td><b>{o.title}</b><span className="block text-xs text-mutedfg">{o.category}</span></Td><Td>{o.company.name}</Td><Td>{fmtNum(o.quantityAvailable)} {t(`unit.${o.unit}`)}</Td><Td>{o._count.supplierRequests}</Td><Td><StatusBadge status={o.status} /></Td><Td>{o.status === 'ACTIVE' ? <Button size="sm" variant="outline" onClick={() => set.mutate({ id: o.id, status: 'PAUSED' })}>{t('admin.pause')}</Button> : o.status === 'PAUSED' ? <Button size="sm" onClick={() => set.mutate({ id: o.id, status: 'ACTIVE' })}>{t('admin.reactivate')}</Button> : null}</Td></tr>)}</tbody></TableWrap>}</Card>
  </>);
}

export function AdminAuditPage() {
  const { t } = useTranslation(); const [entity, setEntity] = useState(''); const dq = useDebounced(entity);
  const l = usePaged('/admin/audit', { entity: dq || undefined }, 30);
  return (<>
    <PageHeader title={t('nav.audit')} subtitle={t('admin.auditSub')} />
    <Card><Toolbar><Input className="max-w-xs" value={entity} onChange={(e) => setEntity(e.target.value)} placeholder={t('admin.entity')} /></Toolbar>
      {l.isLoading ? <SkeletonRows /> : l.error ? <ErrorState error={l.error} /> : !l.items.length ? <EmptyState title={t('common.empty')} /> : <TableWrap><thead><tr><Th>{t('rec.date')}</Th><Th>{t('admin.user')}</Th><Th>{t('admin.company')}</Th><Th>{t('admin.action')}</Th><Th>{t('admin.entity')}</Th><Th>IP</Th></tr></thead>
        <tbody>{l.items.map((a: any) => <tr key={a.id}><Td className="whitespace-nowrap text-xs">{fmtDateTime(a.createdAt)}</Td><Td>{a.user?.fullName ?? '—'}</Td><Td>{a.company?.name ?? '—'}</Td><Td><Badge>{a.action}</Badge></Td><Td className="text-xs">{a.entity} <span className="text-mutedfg">{a.entityId?.slice(0, 8)}</span></Td><Td className="text-xs text-mutedfg">{a.ip}</Td></tr>)}</tbody></TableWrap>}
      <Pagination page={l.page} pageSize={l.pageSize} total={l.total} onChange={l.setPage} /></Card>
  </>);
}
