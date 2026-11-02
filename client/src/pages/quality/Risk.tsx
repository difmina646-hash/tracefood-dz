import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, ShieldAlert } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAction, useApi } from '../../lib/hooks';
import { fmtDate, fmtDateTime } from '../../lib/utils';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, SkeletonRows, StatusBadge, TableWrap, Td, Textarea, Th } from '../../components/ui';
import { DynamicForm } from '../../components/common';

export function RiskListPage() {
  const { t } = useTranslation(); const { can } = useAuth(); const nav = useNavigate();
  const q = useApi<{ items: any[] }>('/risk-assessments'); const products = useApi<{ items: any[] }>('/products', { pageSize: 100 }, { enabled: can('master:read') });
  const [open, setOpen] = useState(false);
  const create = useAction((v: any) => api.post('/risk-assessments', v), { invalidate: ['/risk-assessments'], success: t('common.saved'), onSuccess: (r) => nav(`/app/risk/${r.id}`) });
  return (<>
    <PageHeader title={t('nav.risk')} subtitle={t('risk.sub')} actions={can('risk:write') && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t('common.new')}</Button>} />
    <Card>{q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !q.data?.items.length ? <EmptyState title={t('common.empty')} /> : <TableWrap><thead><tr><Th>{t('nc.title')}</Th><Th>{t('risk.items')}</Th><Th>{t('f.status')}</Th><Th>{t('rec.date')}</Th></tr></thead><tbody>{q.data.items.map((r) => <tr key={r.id} className="hover:bg-muted/40"><Td><Link className="font-semibold text-brand" to={`/app/risk/${r.id}`}>{r.title}</Link></Td><Td>{r._count.items}</Td><Td><Badge>{r.status}</Badge></Td><Td>{fmtDate(r.createdAt)}</Td></tr>)}</tbody></TableWrap>}</Card>
    <Modal open={open} onClose={() => setOpen(false)} title={t('risk.new')}><DynamicForm submitting={create.isPending} onCancel={() => setOpen(false)} onSubmit={(v) => create.mutate(v)} fields={[{ name: 'title', label: t('nc.title'), required: true }, { name: 'productId', label: t('f.product'), type: 'select', options: (products.data?.items ?? []).map((p) => ({ value: p.id, label: p.name })) }, { name: 'scope', label: t('risk.scope'), type: 'textarea' }]} /></Modal>
  </>);
}

const LEVEL = { HIGH: 'bg-danger/80 text-white', MEDIUM: 'bg-warn/70 text-black', LOW: 'bg-ok/50 text-black' } as const;
export function RiskDetailPage() {
  const { t } = useTranslation(); const { id } = useParams(); const { can } = useAuth();
  const q = useApi<any>(`/risk-assessments/${id}`); const [open, setOpen] = useState(false);
  const add = useAction((v: any) => api.post(`/risk-assessments/${id}/items`, { ...v, severity: Number(v.severity), likelihood: Number(v.likelihood), isCcp: !!v.isCcp }), { invalidate: [`/risk-assessments`], success: t('common.saved'), onSuccess: () => setOpen(false) });
  if (q.isLoading) return <SkeletonRows />; if (q.error) return <ErrorState error={q.error} />;
  const a = q.data; const num5 = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));
  const cell = (s: number, l: number) => a.items.filter((i: any) => i.severity === s && i.likelihood === l);
  return (<>
    <PageHeader title={a.title} subtitle={a.product?.name} actions={can('risk:write') && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t('risk.addHazard')}</Button>} />
    <Alert tone="warn" className="mb-4">{a.disclaimer}</Alert>
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card><CardHeader title={t('risk.matrix')} subtitle={t('risk.matrixHint')} /><CardBody>
        <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-1 text-center text-xs" dir="ltr"><span />{[1, 2, 3, 4, 5].map((l) => <span key={l} className="text-mutedfg">P{l}</span>)}
          {[5, 4, 3, 2, 1].map((s) => (<><span key={`s${s}`} className="self-center text-mutedfg">G{s}</span>{[1, 2, 3, 4, 5].map((l) => { const lv = s * l >= 15 ? 'HIGH' : s * l >= 8 ? 'MEDIUM' : 'LOW'; const n = cell(s, l).length; return <div key={`${s}${l}`} className={`grid h-11 place-items-center rounded font-bold ${LEVEL[lv]} ${n ? '' : 'opacity-30'}`}>{n || ''}</div>; })}</>))}</div></CardBody></Card>
      <Card><CardHeader title={t('risk.hazards')} />{!a.items.length ? <EmptyState title={t('risk.noItems')} /> : <TableWrap><thead><tr><Th>{t('risk.step')}</Th><Th>{t('risk.hazard')}</Th><Th>{t('f.type')}</Th><Th>{t('risk.score')}</Th><Th>CCP</Th><Th>{t('risk.measure')}</Th></tr></thead>
        <tbody>{[...a.items].sort((x: any, y: any) => y.score - x.score).map((i: any) => <tr key={i.id}><Td><b>{i.processStep}</b></Td><Td>{i.hazard}{i.cause && <span className="block text-xs text-mutedfg">{i.cause}</span>}</Td><Td>{t(`hz.${i.hazardType}`)}</Td><Td><span className={`rounded px-2 py-0.5 text-xs font-bold ${LEVEL[i.level as keyof typeof LEVEL]}`}>{i.score}</span></Td><Td>{i.isCcp ? <Badge tone="danger">CCP</Badge> : '—'}</Td><Td className="text-xs">{i.preventiveMeasure ?? '—'}{i.isCcp && <span className="block text-mutedfg">{t('risk.limit')}: {i.criticalLimit ?? '—'} · {t('risk.monitoring')}: {i.monitoring ?? '—'}</span>}</Td></tr>)}</tbody></TableWrap>}</Card></div>
    <Modal open={open} onClose={() => setOpen(false)} wide title={t('risk.addHazard')}><DynamicForm submitting={add.isPending} onCancel={() => setOpen(false)} onSubmit={(v) => add.mutate(v)} initial={{ severity: '3', likelihood: '3', hazardType: 'BIOLOGICAL' }}
      fields={[{ name: 'processStep', label: t('risk.step'), required: true }, { name: 'hazard', label: t('risk.hazard'), required: true }, { name: 'hazardType', label: t('f.type'), type: 'select', required: true, options: ['BIOLOGICAL', 'CHEMICAL', 'PHYSICAL', 'ALLERGEN'].map((x) => ({ value: x, label: t(`hz.${x}`) })) }, { name: 'cause', label: t('risk.cause') }, { name: 'severity', label: t('risk.severity'), type: 'select', required: true, options: num5 }, { name: 'likelihood', label: t('risk.likelihood'), type: 'select', required: true, options: num5 },
        { name: 'preventiveMeasure', label: t('risk.measure'), type: 'textarea' }, { name: 'isCcp', label: t('risk.isCcp'), type: 'checkbox' }, { name: 'criticalLimit', label: t('risk.limit') }, { name: 'monitoring', label: t('risk.monitoring') }, { name: 'correctiveAction', label: t('risk.corrective'), type: 'textarea' }]} /></Modal>
  </>);
}

export function ComplaintsPage() {
  const { t } = useTranslation(); const { can } = useAuth();
  const q = useApi<{ items: any[] }>('/complaints'); const [edit, setEdit] = useState<any>(null); const [st, setSt] = useState('IN_REVIEW'); const [notes, setNotes] = useState('');
  const save = useAction(() => api.patch(`/complaints/${edit.id}`, { status: st, internalNotes: notes || undefined }), { invalidate: ['/complaints', '/dashboard'], success: t('common.saved'), onSuccess: () => setEdit(null) });
  return (<>
    <PageHeader title={t('nav.complaints')} subtitle={t('cp.sub')} />
    <Card>{q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !q.data?.items.length ? <EmptyState title={t('common.empty')} /> : <TableWrap><thead><tr><Th>{t('rec.date')}</Th><Th>{t('f.type')}</Th><Th>{t('f.batch')}</Th><Th>{t('pub.message')}</Th><Th>{t('f.status')}</Th><Th /></tr></thead>
      <tbody>{q.data.items.map((c) => <tr key={c.id}><Td className="whitespace-nowrap">{fmtDateTime(c.createdAt)}</Td><Td><Badge tone={c.type === 'SAFETY_SIGNAL' ? 'danger' : 'neutral'}>{t(`fb.${c.type}`)}</Badge></Td><Td>{c.batch?.batchNumber ?? '—'}</Td><Td className="max-w-md"><p className="line-clamp-3">{c.message}</p>{c.internalNotes && <p className="mt-1 text-xs text-mutedfg">↳ {c.internalNotes}</p>}</Td><Td><StatusBadge status={c.status} /></Td><Td>{can('incident:write') && <Button size="sm" variant="outline" onClick={() => { setEdit(c); setSt(c.status === 'NEW' ? 'IN_REVIEW' : c.status); setNotes(c.internalNotes ?? ''); }}>{t('cp.handle')}</Button>}</Td></tr>)}</tbody></TableWrap>}</Card>
    <Modal open={!!edit} onClose={() => setEdit(null)} title={t('cp.handle')} footer={<><Button variant="outline" onClick={() => setEdit(null)}>{t('common.cancel')}</Button><Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('common.save')}</Button></>}>{edit && <div className="space-y-3"><p className="text-sm">{edit.message}</p>{edit.type === 'SAFETY_SIGNAL' && <Alert tone="warn">{t('cp.safetyHint')} <Link className="underline" to="/app/incidents">{t('nav.incidents')}</Link></Alert>}<Field label={t('f.status')}><Select value={st} onChange={(e) => setSt(e.target.value)}>{['NEW', 'IN_REVIEW', 'RESOLVED', 'REJECTED'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select></Field><Field label={t('cp.notes')}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>}</Modal>
  </>);
}
