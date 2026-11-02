import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertOctagon, ArrowDownToLine, ArrowUpFromLine, Search } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { fmtDate, fmtNum } from '../../lib/utils';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Input, PageHeader, SkeletonRows, StatCard, StatusBadge, Tabs, TableWrap, Td, Th } from '../../components/ui';
import { TraceGraph } from '../../components/TraceGraph';
import { Boxes, Factory, MapPin, Truck } from 'lucide-react';

const u = (t: any, x: string) => t(`unit.${x}`);

export default function TracePage() {
  const { t } = useTranslation(); const { can } = useAuth(); const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const type = sp.get('type'); const id = sp.get('id'); const dir = sp.get('dir') ?? 'forward'; const label = sp.get('label');
  const search = useApi<{ results: any[] }>(sp.get('q') ? '/trace/search' : null, { q: sp.get('q') ?? '' });
  useEffect(() => setQ(sp.get('q') ?? ''), [sp]);
  const path = !id ? null : type === 'lot' ? `/trace/lots/${id}/forward` : type === 'batch' ? `/trace/batches/${id}/${dir}` : type === 'shipment' ? `/trace/shipments/${id}/backward` : null;
  const res = useApi<any>(path);
  const pick = (r: any) => setSp({ type: r.type === 'MATERIAL_LOT' ? 'lot' : 'batch', id: r.id, dir: 'forward', label: r.number, q: sp.get('q') ?? '' });
  const [tab, setTab] = useState('graph');
  return (<>
    <PageHeader title={t('nav.trace')} subtitle={t('trace.sub')} />
    <Card className="mb-4"><CardBody>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) setSp({ q: q.trim() }); }}>
        <div className="relative flex-1"><Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-mutedfg" /><Input className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('trace.placeholder')} /></div>
        <Button type="submit"><Search className="h-4 w-4" />{t('pub.search')}</Button></form>
      {search.data && <div className="mt-3 divide-y divide-line rounded-lg border border-line">{!search.data.results.length ? <p className="p-3 text-sm text-mutedfg">{t('trace.noResult')}</p> : search.data.results.map((r) => (
        <button key={r.type + r.id} onClick={() => pick(r)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start text-sm hover:bg-muted/50"><span><Badge tone={r.type === 'MATERIAL_LOT' ? 'info' : 'ok'}>{t(r.type === 'MATERIAL_LOT' ? 'trace.type.MATERIAL_LOT' : 'trace.type.BATCH')}</Badge> <b className="ms-1">{r.number}</b> <span className="text-mutedfg">{r.label}</span></span><StatusBadge status={r.status} /></button>))}</div>}
    </CardBody></Card>

    {!id ? <Card><EmptyState title={t('trace.start')} hint={t('trace.startHint')} /></Card> : (
      <>
        <div className="mb-3 flex flex-wrap items-center gap-2"><span className="text-sm text-mutedfg">{t('trace.selected')} :</span><b>{label ?? id}</b>
          {type === 'batch' && <div className="ms-2 flex gap-1"><Button size="sm" variant={dir === 'backward' ? 'primary' : 'outline'} onClick={() => setSp({ type: 'batch', id, dir: 'backward', label: label ?? '' })}><ArrowUpFromLine className="h-3.5 w-3.5" />{t('trace.backward')}</Button><Button size="sm" variant={dir === 'forward' ? 'primary' : 'outline'} onClick={() => setSp({ type: 'batch', id, dir: 'forward', label: label ?? '' })}><ArrowDownToLine className="h-3.5 w-3.5" />{t('trace.forward')}</Button></div>}
          {type === 'lot' && <Badge tone="info">{t('trace.forward')}</Badge>}
          {can('incident:write') && (type === 'lot' || type === 'batch') && <Button size="sm" variant="danger" className="ms-auto" onClick={() => nav(`/app/incidents?newFor=${type}:${id}`)}><AlertOctagon className="h-3.5 w-3.5" />{t('trace.openNc')}</Button>}</div>
        {res.isLoading ? <Card><SkeletonRows rows={8} /></Card> : res.error ? <ErrorState error={res.error} retry={() => res.refetch()} /> : res.data && <TraceResult d={res.data} forward={path?.includes('forward') ?? false} tab={tab} setTab={setTab} />}
      </>)}
  </>);
}

export function TraceResult({ d, forward, tab, setTab }: { d: any; forward: boolean; tab: string; setTab: (t: string) => void }) {
  const { t } = useTranslation();
  const tot = d.totals;
  return (<div className="space-y-4">
    {forward ? (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><StatCard icon={Factory} label={t('trace.affBatches')} value={tot.batches} tone={tot.batches ? 'warn' : 'ok'} /><StatCard icon={Truck} label={t('trace.affShipments')} value={tot.shipments} /><StatCard icon={MapPin} label={t('trace.affLocations')} value={tot.locations} />
        <StatCard icon={Boxes} label={t('trace.dispatched')} value={`${fmtNum(tot.dispatchedQty, 0)} ${tot.unit !== 'MIXED' ? u(t, tot.unit) : ''}`} /><StatCard icon={Boxes} label={t('trace.onHand')} value={fmtNum(tot.onHandQty, 0)} hint={`${t('trace.unaccounted')}: ${fmtNum(tot.unaccountedQty, 0)}`} tone={tot.unaccountedQty ? 'warn' : 'neutral'} /></div>
    ) : (
      <div className="grid gap-3 sm:grid-cols-3"><StatCard icon={Factory} label={t('trace.batches')} value={d.batches.length} /><StatCard icon={Boxes} label={t('trace.lots')} value={d.lots.length} /><StatCard icon={MapPin} label={t('trace.suppliers')} value={d.suppliers.length} /></div>)}
    {d.notes.map((n: string) => <Alert key={n} tone="warn">{t(`trace.note.${n.split(':')[0]}`, { defaultValue: n })}</Alert>)}
    <Card>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'graph', label: t('trace.graph') }, { id: 'tables', label: t('trace.details') }, ...(forward ? [{ id: 'exposure', label: t('trace.exposure'), count: d.locations.length }] : [])]} />
      <CardBody>
        {tab === 'graph' && <TraceGraph graph={d.graph} />}
        {tab === 'tables' && (forward ? (
          <div className="space-y-6"><Section title={t('trace.lots')}><LotsTable lots={d.lots} /></Section>
            <Section title={t('trace.batches')}><TableWrap><thead><tr><Th>{t('f.batch')}</Th><Th>{t('f.product')}</Th><Th>{t('trace.lotUsed')}</Th><Th>{t('trace.share')}</Th><Th>{t('trace.produced')}</Th><Th>{t('trace.dispatched')}</Th><Th>{t('trace.onHandAll')}</Th><Th>{t('f.status')}</Th></tr></thead><tbody>{d.batches.map((b: any) => <tr key={b.id}><Td><Link className="font-semibold text-brand" to={`/app/batches/${b.id}`}>{b.batchNumber}</Link></Td><Td>{b.productName}</Td><Td>{fmtNum(b.lotQuantityUsed)}</Td><Td>{b.lotShareOfInputs != null ? `${fmtNum(b.lotShareOfInputs * 100, 1)} %` : <span className="text-xs text-mutedfg">{t('trace.notComparable')}</span>}</Td><Td>{fmtNum(b.producedQty)} {u(t, b.unit)}</Td><Td>{fmtNum(b.dispatchedQty)}</Td><Td>{fmtNum(b.onHandQty)}</Td><Td><StatusBadge status={b.status} /></Td></tr>)}</tbody></TableWrap></Section>
            <Section title={t('nav.shipments')}><TableWrap><thead><tr><Th>N°</Th><Th>{t('f.status')}</Th><Th>{t('trace.counted')}</Th><Th>{t('f.batch')}</Th></tr></thead><tbody>{d.shipments.map((s: any) => <tr key={s.id}><Td><b>{s.shipmentNumber}</b></Td><Td><StatusBadge status={s.status} /></Td><Td>{s.dispatched ? '✔' : <Badge tone="warn">{t('trace.notDispatched')}</Badge>}</Td><Td className="text-xs">{s.items.map((i: any) => `${fmtNum(i.quantity)}`).join(' + ')}</Td></tr>)}</tbody></TableWrap></Section></div>
        ) : (
          <div className="space-y-6"><Section title={t('trace.lots')}><LotsTable lots={d.lots} extra /></Section>
            <Section title={t('trace.suppliers')}><ul className="space-y-1 text-sm">{d.suppliers.map((s: any) => <li key={s.id}><b>{s.name}</b> <span className="text-mutedfg">— {s.lots.join(', ')}</span></li>)}</ul></Section></div>))}
        {tab === 'exposure' && (!d.locations.length ? <EmptyState title={t('trace.noExposure')} /> : <TableWrap><thead><tr><Th>{t('inv.location')}</Th><Th>{t('f.type')}</Th><Th>{t('f.batch')}</Th><Th>{t('trace.recv')}</Th><Th>{t('trace.fwd')}</Th><Th>{t('trace.stockNow')}</Th><Th>{t('trace.unaccounted')}</Th></tr></thead>
          <tbody>{d.locations.map((e: any, i: number) => <tr key={i}><Td><b>{e.locationName}</b></Td><Td><Badge tone="info">{t(`loc.${e.locationType}`)}</Badge></Td><Td>{e.batchNumber}</Td><Td>{fmtNum(e.receivedQty)}</Td><Td>{fmtNum(e.forwardedQty)}</Td><Td className="font-semibold">{fmtNum(e.onHandQty)}</Td><Td>{e.unaccountedQty > 0 ? <Badge tone="warn">{fmtNum(e.unaccountedQty)}</Badge> : '0'}</Td></tr>)}</tbody></TableWrap>)}
      </CardBody></Card>
  </div>);
}
const Section = ({ title, children }: any) => <div><h4 className="mb-2 text-sm font-semibold">{title}</h4>{children}</div>;
function LotsTable({ lots, extra }: { lots: any[]; extra?: boolean }) {
  const { t } = useTranslation();
  return <TableWrap><thead><tr><Th>{t('f.lot')}</Th><Th>{t('rec.material')}</Th><Th>{t('rec.supplier')}</Th><Th>{t('rec.origin')}</Th>{extra && <Th>{t('trace.qtyUsed')}</Th>}{extra && <Th>{t('qc.title')}</Th>}<Th>{t('f.status')}</Th></tr></thead>
    <tbody>{lots.map((l) => <tr key={l.id}><Td><Link className="font-semibold text-brand" to={`/app/lots/${l.id}`}>{l.internalLotNumber}</Link><span className="block text-xs text-mutedfg">{l.supplierLotNumber}</span></Td><Td>{l.materialName}</Td><Td>{l.supplierName}</Td><Td>{l.origin ?? '—'}</Td>{extra && <Td>{fmtNum(l.quantityUsed)} {u(t, l.unit)}</Td>}{extra && <Td className="text-xs">{l.checks?.map((c: any) => `${t(`status.${c.decision}`)} (${fmtDate(c.checkedAt)})`).join(', ') || '—'}</Td>}<Td><StatusBadge status={l.status} /></Td></tr>)}</tbody></TableWrap>;
}
