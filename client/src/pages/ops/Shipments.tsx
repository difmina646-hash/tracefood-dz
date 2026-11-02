import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Ban, MapPin, PackageCheck, Plus, Send, Thermometer, Trash2, Truck } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAction, useApi } from '../../lib/hooks';
import { fmtDateTime, fmtNum, toInputDateTime } from '../../lib/utils';
import { Alert, Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, Input, KV, Modal, PageHeader, Pagination, Select, SkeletonRows, StatusBadge, TableWrap, Td, Th, Toolbar, Textarea } from '../../components/ui';
import { usePaged, useDebounced } from '../../components/common';

export function ShipmentsPage() {
  const { t } = useTranslation(); const { can, company } = useAuth();
  const [status, setStatus] = useState(''); const [q, setQ] = useState(''); const dq = useDebounced(q);
  const l = usePaged('/shipments', { status: status || undefined, q: dq || undefined });
  return (<>
    <PageHeader title={t('nav.shipments')} subtitle={t('ship.sub')} actions={can('shipment:create') && <Link to="/app/shipments/new"><Button><Plus className="h-4 w-4" />{t('ship.new')}</Button></Link>} />
    <Card><Toolbar><Input className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ship.search')} /><Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t('common.allStatus')}</option>{['PLANNED', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'INCIDENT', 'CANCELLED'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select></Toolbar>
      {l.isLoading ? <SkeletonRows /> : l.error ? <ErrorState error={l.error} /> : !l.items.length ? <EmptyState title={t('ship.none')} /> : <TableWrap><thead><tr><Th>N°</Th><Th>{t('ship.dir')}</Th><Th>{t('ship.from')}</Th><Th>{t('ship.to')}</Th><Th>{t('ship.transporter')}</Th><Th>{t('f.status')}</Th></tr></thead>
        <tbody>{l.items.map((s: any) => <tr key={s.id} className="hover:bg-muted/40"><Td><Link className="font-semibold text-brand" to={`/app/shipments/${s.id}`}>{s.shipmentNumber}</Link><span className="block text-xs text-mutedfg">{fmtDateTime(s.createdAt)}</span></Td><Td><Badge tone={s.companyId === company?.id ? 'info' : 'neutral'}>{s.companyId === company?.id ? t('ship.out') : s.toLocation?.companyId === company?.id ? t('ship.in') : t('ship.carried')}</Badge></Td><Td>{s.fromLocation.name}</Td><Td>{s.toLocation.name}<span className="block text-xs text-mutedfg">{s.toLocation.company?.name}</span></Td><Td>{s.transporter?.name ?? '—'}</Td><Td><StatusBadge status={s.status} /></Td></tr>)}</tbody></TableWrap>}
      <Pagination page={l.page} pageSize={l.pageSize} total={l.total} onChange={l.setPage} /></Card>
  </>);
}

export function ShipmentNewPage() {
  const { t } = useTranslation(); const nav = useNavigate(); const { can } = useAuth();
  const locs = useApi<{ items: any[] }>('/locations'); const [from, setFrom] = useState(''); const [dq, setDq] = useState(''); const ddq = useDebounced(dq);
  const dir = useApi<{ items: any[] }>('/directory/locations', { q: ddq || undefined }); const trs = useApi<{ items: any[] }>('/transporters', { pageSize: 100 }, { enabled: can('master:read') });
  const stock = useApi<{ items: any[] }>('/inventory', { locationId: from, pageSize: 100 }, { enabled: !!from });
  const [to, setTo] = useState(''); const [tr, setTr] = useState(''); const [plannedAt, setPlannedAt] = useState(toInputDateTime()); const [minT, setMinT] = useState(''); const [maxT, setMaxT] = useState(''); const [notes, setNotes] = useState('');
  const [items, setItems] = useState<{ batchId: string; quantity: string }[]>([{ batchId: '', quantity: '' }]);
  const lines = useMemo(() => (stock.data?.items ?? []).filter((x) => x.available > 0 && x.batchStatus === 'RELEASED' && x.alert !== 'EXPIRED'), [stock.data]);
  const create = useAction(() => api.post('/shipments', { fromLocationId: from, toLocationId: to, transporterId: tr || undefined, plannedAt: new Date(plannedAt).toISOString(), notes: notes || undefined, minTempC: minT === '' ? undefined : Number(minT), maxTempC: maxT === '' ? undefined : Number(maxT), items: items.map((i) => ({ batchId: i.batchId, quantity: Number(i.quantity) })) }),
    { invalidate: ['/shipments', '/inventory', '/dashboard'], success: t('ship.created'), onSuccess: (s) => nav(`/app/shipments/${s.id}`) });
  const valid = from && to && items.every((i) => { const l = lines.find((x) => x.batchId === i.batchId); return l && Number(i.quantity) > 0 && Number(i.quantity) <= l.available; }) && new Set(items.map((i) => i.batchId)).size === items.length;
  return (<>
    <PageHeader title={t('ship.new')} subtitle={t('ship.newSub')} />
    <div className="space-y-4">
      <Card><CardHeader title={t('ship.route')} /><CardBody className="grid gap-3 sm:grid-cols-2">
        <Field label={t('ship.from')}><Select value={from} onChange={(e) => { setFrom(e.target.value); setItems([{ batchId: '', quantity: '' }]); }}><option value="">—</option>{locs.data?.items.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
        <Field label={t('ship.to')}><div className="space-y-1.5"><Input value={dq} onChange={(e) => setDq(e.target.value)} placeholder={t('ship.searchDest')} /><Select value={to} onChange={(e) => setTo(e.target.value)}><option value="">—</option>{dir.data?.items.filter((l) => l.id !== from).map((l) => <option key={l.id} value={l.id}>{l.name} — {l.company.name}</option>)}</Select></div></Field>
        {can('master:read') && <Field label={t('ship.transporter')}><Select value={tr} onChange={(e) => setTr(e.target.value)}><option value="">—</option>{trs.data?.items.map((x) => <option key={x.id} value={x.id}>{x.name}{x.refrigerated ? ' ❄️' : ''}{x.linkedCompanyId ? '' : ` (${t('ship.notLinked')})`}</option>)}</Select></Field>}
        <Field label={t('ship.planned')}><Input type="datetime-local" value={plannedAt} onChange={(e) => setPlannedAt(e.target.value)} /></Field>
        <Field label={t('ship.tempRange')} hint={t('ship.tempHint')}><div className="flex gap-2"><Input type="number" step="any" placeholder="min" value={minT} onChange={(e) => setMinT(e.target.value)} /><Input type="number" step="any" placeholder="max" value={maxT} onChange={(e) => setMaxT(e.target.value)} /></div></Field>
        <Field label={t('f.notes')}><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></CardBody></Card>
      <Card><CardHeader title={t('ship.items')} />
        <CardBody className="space-y-2">{!from ? <p className="text-sm text-mutedfg">{t('ship.pickFrom')}</p> : !lines.length && !stock.isLoading ? <Alert tone="warn">{t('ship.noStock')}</Alert> : items.map((it, i) => { const l = lines.find((x) => x.batchId === it.batchId); return (
          <div key={i} className="grid items-start gap-2 sm:grid-cols-[1fr_150px_auto]">
            <Field hint={l ? `${t('inv.available')}: ${fmtNum(l.available)} · ${t('rec.expiry')}: ${new Date(l.expiryDate).toLocaleDateString()}` : undefined}><Select value={it.batchId} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, batchId: e.target.value } : x)))}><option value="">{t('batches.chooseLot')}</option>{lines.map((x) => <option key={x.batchId} value={x.batchId}>{x.batchNumber} — {x.product} ({fmtNum(x.available)})</option>)}</Select></Field>
            <Field error={l && Number(it.quantity) > l.available ? t('ship.tooMuch') : undefined}><Input type="number" step="any" value={it.quantity} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} placeholder={t('f.quantity')} /></Field>
            <Button variant="ghost" size="sm" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-danger" /></Button></div>); })}
          {from && <Button size="sm" variant="outline" onClick={() => setItems([...items, { batchId: '', quantity: '' }])}><Plus className="h-3.5 w-3.5" />{t('batches.addLot')}</Button>}</CardBody></Card>
      <div className="flex justify-end"><Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate(undefined)}>{t('ship.plan')}</Button></div>
    </div>
  </>);
}

export function ShipmentDetailPage() {
  const { t } = useTranslation(); const { id } = useParams(); const { can, company } = useAuth();
  const q = useApi<any>(`/shipments/${id}`);
  const inv = { invalidate: [`/shipments`, '/inventory', '/dashboard', '/notifications'], success: t('common.done') };
  const dispatch = useAction(() => api.post(`/shipments/${id}/dispatch`), inv);
  const cancel = useAction(() => api.post(`/shipments/${id}/cancel`), { ...inv, onSuccess: () => setConfirm(null) });
  const pickup = useAction(() => api.post(`/shipments/${id}/pickup`, {}), inv);
  const deliver = useAction(() => api.post(`/shipments/${id}/deliver`, {}), inv);
  const [confirm, setConfirm] = useState<null | 'cancel'>(null); const [ev, setEv] = useState(false); const [temp, setTemp] = useState(false); const [rcv, setRcv] = useState(false);
  if (q.isLoading) return <SkeletonRows />; if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const s = q.data; const cid = company?.id;
  const isSender = s.companyId === cid; const isReceiver = s.toLocation.companyId === cid; const isTransporter = s.transporter?.linkedCompanyId === cid;
  const tc = s.transportCondition; const temps = [...s.temperatureRecords].reverse().map((x: any) => ({ at: new Date(x.recordedAt).toLocaleTimeString(), v: Number(x.temperatureC), out: x.outOfRange }));
  const active = ['IN_TRANSIT', 'INCIDENT'].includes(s.status);
  return (<>
    <PageHeader title={<span className="flex items-center gap-3"><Truck className="h-6 w-6" />{s.shipmentNumber}<StatusBadge status={s.status} /></span>} subtitle={`${s.fromLocation.name} → ${s.toLocation.name} (${s.toLocation.company?.name ?? ''})`}
      actions={<>
        {isSender && can('shipment:create') && s.status === 'PLANNED' && <><Button loading={dispatch.isPending} onClick={() => dispatch.mutate(undefined)}><Send className="h-4 w-4" />{t('ship.dispatch')}</Button><Button variant="outline" onClick={() => setConfirm('cancel')}><Ban className="h-4 w-4" />{t('ship.cancel')}</Button></>}
        {isTransporter && can('shipment:update') && active && <><Button variant="outline" loading={pickup.isPending} onClick={() => pickup.mutate(undefined)}>{t('ship.pickup')}</Button><Button variant="outline" onClick={() => setTemp(true)}><Thermometer className="h-4 w-4" />{t('ship.temp')}</Button><Button variant="outline" onClick={() => setEv(true)}>{t('ship.event')}</Button><Button loading={deliver.isPending} onClick={() => deliver.mutate(undefined)}><PackageCheck className="h-4 w-4" />{t('ship.deliver')}</Button></>}
        {isReceiver && can('shipment:receive') && ['IN_TRANSIT', 'DELIVERED', 'INCIDENT'].includes(s.status) && <Button onClick={() => setRcv(true)}><PackageCheck className="h-4 w-4" />{t('ship.receive')}</Button>}</>} />
    {s.status === 'INCIDENT' && <Alert tone="danger" className="mb-4" title={t('ship.incident')}>{s.events.find((e: any) => e.type === 'INCIDENT')?.message}</Alert>}
    {s.status === 'PARTIALLY_RECEIVED' && <Alert tone="warn" className="mb-4">{t('ship.partial')}</Alert>}
    <div className="grid gap-4 lg:grid-cols-3">
      <Card><CardHeader title={t('lot.info')} /><CardBody><dl><KV k={t('ship.transporter')} v={s.transporter?.name} /><KV k={t('ship.planned')} v={fmtDateTime(s.plannedAt)} /><KV k={t('ship.dispatched')} v={fmtDateTime(s.dispatchedAt)} /><KV k={t('ship.delivered')} v={fmtDateTime(s.deliveredAt)} /><KV k={t('ship.tempRange')} v={tc ? `${tc.minTempC ?? '–'} → ${tc.maxTempC ?? '–'} °C` : '—'} /></dl>{s.notes && <p className="mt-2 text-sm text-mutedfg">{s.notes}</p>}</CardBody></Card>
      <Card className="lg:col-span-2"><CardHeader title={t('ship.items')} /><TableWrap><thead><tr><Th>{t('f.batch')}</Th><Th>{t('f.product')}</Th><Th>{t('ship.shipped')}</Th><Th>{t('ship.recv')}</Th><Th>{t('ship.damaged')}</Th></tr></thead><tbody>{s.items.map((i: any) => <tr key={i.id}><Td><b>{i.batch.batchNumber}</b> <StatusBadge status={i.batch.status} /></Td><Td>{i.batch.product.name}</Td><Td>{fmtNum(i.quantity)} {t(`unit.${i.unit}`)}</Td><Td>{i.receivedQty != null ? fmtNum(i.receivedQty) : '—'}</Td><Td>{Number(i.damagedQty) ? <Badge tone="danger">{fmtNum(i.damagedQty)}</Badge> : '—'}</Td></tr>)}</tbody></TableWrap></Card>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card><CardHeader title={t('ship.timeline')} /><ul className="divide-y divide-line">{s.events.map((e: any) => <li key={e.id} className="flex items-start gap-3 px-4 py-2.5 text-sm"><MapPin className="mt-0.5 h-4 w-4 text-brand" /><div><p className="font-medium">{t(`evt.${e.type}`, { defaultValue: e.type })}</p>{e.message && <p className="text-mutedfg">{e.message}</p>}<p className="text-[11px] text-mutedfg">{fmtDateTime(e.createdAt)}</p></div></li>)}</ul></Card>
      <Card><CardHeader title={t('ship.tempLog')} />{!temps.length ? <p className="p-4 text-sm text-mutedfg">{t('ship.noTemp')}</p> : <CardBody><div className="h-48"><ResponsiveContainer><LineChart data={temps}><CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" /><XAxis dataKey="at" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} /><Tooltip />{tc?.maxTempC != null && <ReferenceLine y={Number(tc.maxTempC)} stroke="#dc2626" strokeDasharray="4 4" />}{tc?.minTempC != null && <ReferenceLine y={Number(tc.minTempC)} stroke="#2563eb" strokeDasharray="4 4" />}<Line dataKey="v" stroke="#059669" dot={(p: any) => <circle key={p.index} cx={p.cx} cy={p.cy} r={4} fill={p.payload.out ? '#dc2626' : '#059669'} />} /></LineChart></ResponsiveContainer></div>{s.temperatureRecords.some((x: any) => x.outOfRange) && <Alert tone="danger" className="mt-2">{t('ship.excursion')}</Alert>}</CardBody>}</Card>
    </div>
    {s.deliveryConfirmations.length > 0 && <Card className="mt-4"><CardHeader title={t('ship.confirmations')} /><ul className="divide-y divide-line">{s.deliveryConfirmations.map((c: any) => <li key={c.id} className="px-4 py-2.5 text-sm"><b>{t(`ctype2.${c.confirmType}`)}</b> · {fmtDateTime(c.confirmedAt)}{c.signatureName && ` · ${c.signatureName}`}</li>)}</ul></Card>}
    <ConfirmDialog open={confirm === 'cancel'} danger onClose={() => setConfirm(null)} loading={cancel.isPending} onConfirm={() => cancel.mutate(undefined)} title={t('ship.cancel')} message={t('ship.cancelMsg')} />
    {ev && <EventModal id={s.id} onClose={() => setEv(false)} />}{temp && <TempModal id={s.id} onClose={() => setTemp(false)} />}{rcv && <ReceiveModal s={s} onClose={() => setRcv(false)} />}
  </>);
}

function EventModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation(); const [type, setType] = useState('POSITION'); const [message, setMessage] = useState('');
  const run = useAction(() => api.post(`/shipments/${id}/events`, { type, message: message || undefined }), { invalidate: ['/shipments', '/dashboard'], success: t('common.done'), onSuccess: onClose });
  return <Modal open onClose={onClose} title={t('ship.event')} footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button loading={run.isPending} onClick={() => run.mutate(undefined)}>{t('common.confirm')}</Button></>}><div className="space-y-3"><Field label={t('f.type')}><Select value={type} onChange={(e) => setType(e.target.value)}>{['POSITION', 'DELAY', 'INCIDENT', 'NOTE'].map((x) => <option key={x} value={x}>{t(`evt.${x}`)}</option>)}</Select></Field><Field label={t('ship.msg')}><Textarea value={message} onChange={(e) => setMessage(e.target.value)} /></Field>{type === 'INCIDENT' && <Alert tone="warn">{t('ship.incidentWarn')}</Alert>}</div></Modal>;
}
function TempModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation(); const [v, setV] = useState(''); const toast = useAction((x: number) => api.post(`/shipments/${id}/temperature`, { temperatureC: x }), { invalidate: ['/shipments', '/notifications'], onSuccess: (r: any) => { if (r.outOfRange) alert(t('ship.excursion')); onClose(); } });
  return <Modal open onClose={onClose} title={t('ship.temp')} footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button loading={toast.isPending} disabled={v === ''} onClick={() => toast.mutate(Number(v))}>{t('common.save')}</Button></>}><Field label="°C"><Input type="number" step="0.1" value={v} onChange={(e) => setV(e.target.value)} /></Field></Modal>;
}
function ReceiveModal({ s, onClose }: { s: any; onClose: () => void }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(s.items.map((i: any) => ({ batchId: i.batchId, receivedQty: String(Number(i.quantity)), damagedQty: '0' }))); const [notes, setNotes] = useState('');
  const run = useAction(() => api.post(`/shipments/${s.id}/receive`, { notes: notes || undefined, items: rows.map((r: any) => ({ batchId: r.batchId, receivedQty: Number(r.receivedQty), damagedQty: Number(r.damagedQty || 0) })) }), { invalidate: ['/shipments', '/inventory', '/dashboard'], success: t('ship.received'), onSuccess: onClose });
  return (
    <Modal open onClose={onClose} wide title={`${t('ship.receive')} — ${s.shipmentNumber}`} footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button loading={run.isPending} onClick={() => run.mutate(undefined)}>{t('ship.confirmReceive')}</Button></>}>
      <p className="mb-3 text-sm text-mutedfg">{t('ship.receiveHint')}</p>
      <TableWrap><thead><tr><Th>{t('f.batch')}</Th><Th>{t('ship.shipped')}</Th><Th>{t('ship.recv')}</Th><Th>{t('ship.damaged')}</Th></tr></thead><tbody>{s.items.map((i: any, k: number) => <tr key={i.id}><Td><b>{i.batch.batchNumber}</b><span className="block text-xs text-mutedfg">{i.batch.product.name}</span>{i.batch.status !== 'RELEASED' && <StatusBadge status={i.batch.status} />}</Td><Td>{fmtNum(i.quantity)}</Td>
        <Td><Input className="h-8 w-28" type="number" step="any" value={rows[k].receivedQty} onChange={(e) => setRows(rows.map((r: any, j: number) => (j === k ? { ...r, receivedQty: e.target.value } : r)))} /></Td><Td><Input className="h-8 w-28" type="number" step="any" value={rows[k].damagedQty} onChange={(e) => setRows(rows.map((r: any, j: number) => (j === k ? { ...r, damagedQty: e.target.value } : r)))} /></Td></tr>)}</tbody></TableWrap>
      <Field label={t('f.notes')} className="mt-3"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </Modal>
  );
}
