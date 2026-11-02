import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertOctagon, FileText, Lock, Play, Plus, Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAction, useApi } from '../../lib/hooks';
import { fmtDate, fmtDateTime, fmtNum } from '../../lib/utils';
import { Alert, Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, Input, KV, Modal, PageHeader, Pagination, Select, SkeletonRows, StatusBadge, TableWrap, Td, Textarea, Th, Toolbar } from '../../components/ui';
import { usePaged } from '../../components/common';
import { TraceResult } from './Trace';

export function IncidentsPage() {
  const { t } = useTranslation(); const { can } = useAuth(); const nav = useNavigate(); const [sp, setSp] = useSearchParams();
  const [status, setStatus] = useState('');
  const l = usePaged('/incidents', { status: status || undefined });
  const [open, setOpen] = useState(false);
  useEffect(() => { if (sp.get('newFor')) setOpen(true); }, [sp]);
  const close = () => { setOpen(false); if (sp.get('newFor')) { sp.delete('newFor'); setSp(sp, { replace: true }); } };
  return (<>
    <PageHeader title={t('nav.incidents')} subtitle={t('nc.sub')} actions={can('incident:write') && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t('nc.new')}</Button>} />
    <Card><Toolbar><Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t('common.allStatus')}</option>{['OPEN', 'INVESTIGATING', 'ACTION_PLANNED', 'CLOSED'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select></Toolbar>
      {l.isLoading ? <SkeletonRows /> : l.error ? <ErrorState error={l.error} /> : !l.items.length ? <EmptyState title={t('nc.none')} /> : <TableWrap><thead><tr><Th>Code</Th><Th>{t('nc.title')}</Th><Th>{t('nc.target')}</Th><Th>{t('nc.severity')}</Th><Th>{t('f.status')}</Th><Th>{t('nc.detected')}</Th></tr></thead>
        <tbody>{l.items.map((n: any) => <tr key={n.id} className="hover:bg-muted/40"><Td><Link className="font-semibold text-brand" to={`/app/incidents/${n.id}`}>{n.code}</Link></Td><Td>{n.title}</Td><Td>{n.materialLot?.internalLotNumber ?? n.productionBatch?.batchNumber}</Td><Td><StatusBadge status={n.severity} /></Td><Td><StatusBadge status={n.status} /></Td><Td>{fmtDate(n.detectedAt)}</Td></tr>)}</tbody></TableWrap>}
      <Pagination page={l.page} pageSize={l.pageSize} total={l.total} onChange={l.setPage} /></Card>
    {open && <NewIncident initial={sp.get('newFor')} onClose={close} onDone={(n) => { close(); nav(`/app/incidents/${n.id}`); }} />}
  </>);
}

function NewIncident({ initial, onClose, onDone }: { initial: string | null; onClose: () => void; onDone: (n: any) => void }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState(initial?.split(':')[0] ?? 'lot'); const [target, setTarget] = useState(initial?.split(':')[1] ?? '');
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [severity, setSeverity] = useState('MEDIUM');
  const lots = useApi<{ items: any[] }>('/lots', { pageSize: 100 }, { enabled: kind === 'lot' }); const batches = useApi<{ items: any[] }>('/batches', { pageSize: 100 }, { enabled: kind === 'batch' });
  const run = useAction(() => api.post('/incidents', { title, description, severity, ...(kind === 'lot' ? { materialLotId: target } : { productionBatchId: target }) }), { invalidate: ['/incidents', '/dashboard'], success: t('nc.created'), onSuccess: onDone });
  return (
    <Modal open onClose={onClose} wide title={t('nc.new')} footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button loading={run.isPending} disabled={!target || title.length < 3 || description.length < 5} onClick={() => run.mutate(undefined)}>{t('common.save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('nc.kind')}><Select value={kind} onChange={(e) => { setKind(e.target.value); setTarget(''); }}><option value="lot">{t('trace.type.MATERIAL_LOT')}</option><option value="batch">{t('trace.type.BATCH')}</option></Select></Field>
        <Field label={t('f.lot')}><Select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">—</option>{(kind === 'lot' ? lots.data?.items : batches.data?.items)?.map((x) => <option key={x.id} value={x.id}>{x.internalLotNumber ?? x.batchNumber} — {x.material?.name ?? x.product?.name}</option>)}</Select></Field>
        <Field label={t('nc.title')} className="sm:col-span-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label={t('nc.severity')}><Select value={severity} onChange={(e) => setSeverity(e.target.value)}>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select></Field>
        <Field label={t('nc.description')} className="sm:col-span-2"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field></div>
    </Modal>
  );
}

export function IncidentDetailPage() {
  const { t } = useTranslation(); const { id } = useParams(); const { can } = useAuth();
  const q = useApi<any>(`/incidents/${id}`); const sims = useApi<any>(`/incidents/${id}/simulations`, undefined, { enabled: can('recall:simulate') });
  const [sim, setSim] = useState<any>(null); const [tab, setTab] = useState('graph'); const [hold, setHold] = useState(false); const [report, setReport] = useState(false); const [closing, setClosing] = useState(false); const [act, setAct] = useState<null | 'corrective-actions' | 'preventive-actions'>(null);
  const run = useAction(() => api.post(`/incidents/${id}/recall-simulation`, {}), { invalidate: [`/incidents/${id}`], success: t('nc.simDone'), onSuccess: (r) => { setSim(r); setTab('graph'); } });
  const setStatus = useAction((v: { status: string; closureNotes?: string }) => api.patch(`/incidents/${id}/status`, v), { invalidate: [`/incidents`, '/dashboard'], success: t('common.saved'), onSuccess: () => setClosing(false) });
  const actStatus = useAction((v: { kind: string; actionId: string; status: string }) => api.patch(`/incidents/${id}/${v.kind}/${v.actionId}`, { status: v.status }), { invalidate: [`/incidents/${id}`] });
  if (q.isLoading) return <SkeletonRows />; if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const n = q.data; const target = n.materialLot ?? n.productionBatch;
  const actions = (kind: 'corrective-actions' | 'preventive-actions', list: any[]) => (
    <Card><CardHeader title={t(kind === 'corrective-actions' ? 'nc.corrective' : 'nc.preventive')} action={can('incident:write') && n.status !== 'CLOSED' && <Button size="sm" variant="outline" onClick={() => setAct(kind)}><Plus className="h-3.5 w-3.5" />{t('common.new')}</Button>} />
      {!list.length ? <p className="p-4 text-sm text-mutedfg">—</p> : <ul className="divide-y divide-line">{list.map((a) => <li key={a.id} className="px-4 py-2.5 text-sm"><div className="flex items-start justify-between gap-2"><p>{a.description}</p><StatusBadge status={a.status} /></div><p className="text-xs text-mutedfg">{a.responsible?.fullName ?? '—'} · {t('nc.due')} {fmtDate(a.dueDate)}</p>
        {can('incident:write') && n.status !== 'CLOSED' && a.status !== 'DONE' && a.status !== 'CANCELLED' && <div className="mt-1 flex gap-1">{a.status === 'PLANNED' && <Button size="sm" variant="outline" onClick={() => actStatus.mutate({ kind, actionId: a.id, status: 'IN_PROGRESS' })}>{t('nc.start')}</Button>}<Button size="sm" onClick={() => actStatus.mutate({ kind, actionId: a.id, status: 'DONE' })}>{t('nc.markDone')}</Button><Button size="sm" variant="ghost" onClick={() => actStatus.mutate({ kind, actionId: a.id, status: 'CANCELLED' })}>{t('ship.cancel')}</Button></div>}</li>)}</ul>}</Card>);
  return (<>
    <PageHeader title={<span className="flex flex-wrap items-center gap-3"><AlertOctagon className="h-6 w-6 text-danger" />{n.code}<StatusBadge status={n.severity} /><StatusBadge status={n.status} /></span>} subtitle={n.title}
      actions={<><Button variant="outline" onClick={() => setReport(true)}><FileText className="h-4 w-4" />{t('nc.report')}</Button>{can('incident:write') && n.status !== 'CLOSED' && <>{n.status === 'OPEN' && <Button variant="outline" onClick={() => setStatus.mutate({ status: 'INVESTIGATING' })}>{t('nc.investigate')}</Button>}<Button variant="outline" onClick={() => setClosing(true)}>{t('nc.close')}</Button></>}</>} />
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1"><CardHeader title={t('lot.info')} /><CardBody><dl><KV k={t('nc.target')} v={n.materialLot ? <Link className="text-brand" to={`/app/lots/${n.materialLot.id}`}>{n.materialLot.internalLotNumber} ({n.materialLot.material.name})</Link> : <Link className="text-brand" to={`/app/batches/${n.productionBatch.id}`}>{n.productionBatch.batchNumber}</Link>} /><KV k={t('nc.detected')} v={fmtDateTime(n.detectedAt)} /><KV k={t('nc.reportedBy')} v={n.reportedBy.fullName} />{n.materialLot && <KV k={t('rec.supplier')} v={n.materialLot.supplier.name} />}<KV k={t('f.status')} v={<StatusBadge status={target?.status} />} /></dl><p className="mt-3 whitespace-pre-wrap text-sm">{n.description}</p>{n.closureNotes && <Alert tone="ok" className="mt-3" title={t('nc.closure')}>{n.closureNotes}</Alert>}</CardBody></Card>
      <div className="grid gap-4 lg:col-span-2 lg:grid-cols-2">{actions('corrective-actions', n.correctiveActions)}{actions('preventive-actions', n.preventiveActions)}</div>
    </div>

    {can('recall:simulate') && (
      <Card className="mt-4"><CardHeader title={t('nc.simTitle')} subtitle={t('nc.simSub')}
        action={<div className="flex gap-2"><Button loading={run.isPending} onClick={() => run.mutate(undefined)}><Play className="h-4 w-4" />{sim ? t('nc.rerun') : t('nc.runSim')}</Button>{can('recall:hold') && can('quality:release') && sim && n.status !== 'CLOSED' && <Button variant="danger" onClick={() => setHold(true)}><Lock className="h-4 w-4" />{t('nc.hold')}</Button>}</div>} />
        <CardBody>{!sim ? <p className="text-sm text-mutedfg">{t('nc.simEmpty')}{sims.data?.items?.length ? ` ${t('nc.simHistory')} : ${sims.data.items.length}` : ''}</p> : <>
          <Alert tone="info" className="mb-3">{sim.disclaimer}</Alert><TraceResult d={sim} forward tab={tab} setTab={setTab} />
          <Button className="mt-3" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />{t('nc.printSim')}</Button></>}
          {sims.data?.items?.length > 0 && <div className="mt-4"><p className="mb-1 text-xs font-semibold text-mutedfg">{t('nc.simHistory')}</p><ul className="text-xs text-mutedfg">{sims.data.items.map((s: any) => <li key={s.id}>{fmtDateTime(s.createdAt)} — {s.createdBy.fullName}: {s.affectedBatches} {t('trace.batches').toLowerCase()}, {s.affectedShipments} {t('nav.shipments').toLowerCase()}, {s.affectedLocations} {t('trace.affLocations').toLowerCase()}</li>)}</ul></div>}</CardBody></Card>)}

    {act && <ActionModal id={n.id} kind={act} onClose={() => setAct(null)} />}
    {hold && <HoldModal id={n.id} onClose={() => setHold(false)} sim={sim} />}
    {closing && <CloseModal onClose={() => setClosing(false)} onSubmit={(v) => setStatus.mutate({ status: 'CLOSED', closureNotes: v })} loading={setStatus.isPending} />}
    {report && <ReportModal id={n.id} onClose={() => setReport(false)} />}
  </>);
}

function ActionModal({ id, kind, onClose }: { id: string; kind: string; onClose: () => void }) {
  const { t } = useTranslation(); const members = useApi<{ items: any[] }>('/company/members');
  const [description, setDescription] = useState(''); const [responsibleId, setR] = useState(''); const [dueDate, setDue] = useState('');
  const run = useAction(() => api.post(`/incidents/${id}/${kind}`, { description, responsibleId: responsibleId || undefined, dueDate: dueDate ? new Date(dueDate).toISOString() : undefined }), { invalidate: [`/incidents/${id}`], success: t('common.saved'), onSuccess: onClose });
  return <Modal open onClose={onClose} title={t(kind === 'corrective-actions' ? 'nc.corrective' : 'nc.preventive')} footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button loading={run.isPending} disabled={description.length < 3} onClick={() => run.mutate(undefined)}>{t('common.save')}</Button></>}>
    <div className="space-y-3"><Field label={t('nc.description')}><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field><Field label={t('nc.responsible')}><Select value={responsibleId} onChange={(e) => setR(e.target.value)}><option value="">—</option>{members.data?.items.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}</Select></Field><Field label={t('nc.due')}><Input type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} /></Field></div></Modal>;
}
function CloseModal({ onClose, onSubmit, loading }: { onClose: () => void; onSubmit: (v: string) => void; loading: boolean }) {
  const { t } = useTranslation(); const [v, setV] = useState('');
  return <Modal open onClose={onClose} title={t('nc.close')} footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button loading={loading} disabled={v.trim().length < 3} onClick={() => onSubmit(v)}>{t('nc.close')}</Button></>}><Alert tone="info" className="mb-3">{t('nc.closeHint')}</Alert><Field label={t('nc.closure')}><Textarea value={v} onChange={(e) => setV(e.target.value)} /></Field></Modal>;
}
function HoldModal({ id, onClose, sim }: { id: string; onClose: () => void; sim: any }) {
  const { t } = useTranslation(); const [reason, setReason] = useState(''); const [ok, setOk] = useState(false);
  const run = useAction(() => api.post(`/incidents/${id}/hold`, { confirm: true, reason }), { invalidate: [`/incidents`, '/lots', '/batches', '/dashboard'], success: t('nc.holdDone'), onSuccess: (r: any) => { alert(`${t('nc.holdResult')}: ${r.lotsBlocked} · ${t('nc.holdResultB')}: ${r.batchesBlocked}${r.plannedShipmentsToReview?.length ? `\n${t('nc.holdPlanned')}: ${r.plannedShipmentsToReview.join(', ')}` : ''}`); onClose(); } });
  return (
    <Modal open onClose={onClose} title={t('nc.hold')} footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" loading={run.isPending} disabled={!ok || reason.trim().length < 5} onClick={() => run.mutate(undefined)}>{t('nc.applyHold')}</Button></>}>
      <div className="space-y-3"><Alert tone="danger" title={t('nc.holdWarnTitle')}>{t('nc.holdWarn')}</Alert>
        {sim && <p className="text-sm">{t('nc.holdScope')} : <b>{sim.totals.batches}</b> {t('trace.batches').toLowerCase()}, <b>{sim.totals.locations}</b> {t('trace.affLocations').toLowerCase()}.</p>}
        <Field label={t('qc.reason')}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-danger" checked={ok} onChange={(e) => setOk(e.target.checked)} />{t('nc.holdConfirm')}</label></div>
    </Modal>
  );
}
function ReportModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation(); const q = useApi<any>(`/incidents/${id}/report`);
  return (
    <Modal open onClose={onClose} wide title={t('nc.report')} footer={<><Button variant="outline" onClick={onClose}>{t('common.close')}</Button><Button onClick={() => window.print()}><Printer className="h-4 w-4" />{t('nc.printSim')}</Button></>}>
      {q.isLoading ? <SkeletonRows /> : q.data && (() => { const r = q.data; const n = r.nonConformity; const sim = r.latestSimulation?.result; return (
        <div className="print-area space-y-4 text-sm">
          <div><h2 className="text-lg font-bold">{t('nc.reportTitle')} {n.code}</h2><p className="text-xs text-mutedfg">{t('nc.generated')} {fmtDateTime(r.generatedAt)}</p></div>
          <dl><KV k={t('nc.title')} v={n.title} /><KV k={t('nc.severity')} v={t(`status.${n.severity}`)} /><KV k={t('f.status')} v={t(`status.${n.status}`)} /><KV k={t('nc.target')} v={n.materialLot?.internalLotNumber ?? n.productionBatch?.batchNumber} /><KV k={t('nc.detected')} v={fmtDateTime(n.detectedAt)} /></dl><p className="whitespace-pre-wrap">{n.description}</p>
          <div><h3 className="font-semibold">{t('nc.corrective')}</h3><ul className="list-disc ps-5">{n.correctiveActions.map((a: any) => <li key={a.id}>{a.description} — {t(`status.${a.status}`)}</li>)}</ul></div>
          <div><h3 className="font-semibold">{t('nc.preventive')}</h3><ul className="list-disc ps-5">{n.preventiveActions.map((a: any) => <li key={a.id}>{a.description} — {t(`status.${a.status}`)}</li>)}</ul></div>
          {sim ? <div><h3 className="font-semibold">{t('nc.simTitle')} ({fmtDateTime(r.latestSimulation.createdAt)})</h3><p>{sim.totals.batches} {t('trace.batches').toLowerCase()} · {sim.totals.shipments} {t('nav.shipments').toLowerCase()} · {sim.totals.locations} {t('trace.affLocations').toLowerCase()} · {t('trace.onHand')}: {fmtNum(sim.totals.onHandQty, 0)}</p>
            <table className="mt-2 w-full text-xs"><thead><tr><th className="text-start">{t('f.batch')}</th><th className="text-start">{t('inv.location')}</th><th className="text-start">{t('trace.recv')}</th><th className="text-start">{t('trace.stockNow')}</th></tr></thead><tbody>{sim.locations.map((e: any, i: number) => <tr key={i}><td>{e.batchNumber}</td><td>{e.locationName}</td><td>{fmtNum(e.receivedQty)}</td><td>{fmtNum(e.onHandQty)}</td></tr>)}</tbody></table></div> : <p className="text-mutedfg">{t('nc.noSimYet')}</p>}
          <div><h3 className="font-semibold">{t('nc.audit')}</h3><ul className="text-xs">{r.auditTrail.map((a: any, i: number) => <li key={i}>{fmtDateTime(a.at)} — {a.by} — {a.action}</li>)}</ul></div>
          <p className="text-xs text-mutedfg">{t('nc.reportDisclaimer')}</p>
        </div>); })()}
    </Modal>
  );
}
