import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, ClipboardList, Hammer, ShoppingCart, SlidersHorizontal } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAction, useApi } from '../../lib/hooks';
import { fmtDate, fmtDateTime, fmtNum } from '../../lib/utils';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, Select, SkeletonRows, StatusBadge, TableWrap, Td, Th, Toolbar, Tabs } from '../../components/ui';
import { useDebounced, usePaged } from '../../components/common';

type Act = { kind: 'transfer' | 'damage' | 'sale' | 'adjust'; row: any } | null;

export default function InventoryPage() {
  const { t } = useTranslation(); const { can, portal } = useAuth();
  const [tab, setTab] = useState('stock'); const [loc, setLoc] = useState(''); const [q, setQ] = useState(''); const dq = useDebounced(q);
  const locations = useApi<{ items: any[] }>('/locations');
  const stock = usePaged('/inventory', { locationId: loc || undefined, q: dq || undefined }, 25);
  const fefo = useApi<{ items: any[] }>('/inventory/fefo', { locationId: loc || undefined }, { enabled: tab === 'fefo' });
  const moves = usePaged('/stock-movements', {}, 25);
  const [act, setAct] = useState<Act>(null); const [count, setCount] = useState(false);
  const w = can('inventory:write');
  const rows = tab === 'fefo' ? fefo.data?.items ?? [] : stock.items;
  return (<>
    <PageHeader title={t('nav.inventory')} subtitle={t('inv.sub')} actions={w && loc && <Button variant="outline" onClick={() => setCount(true)}><ClipboardList className="h-4 w-4" />{t('inv.count')}</Button>} />
    <Card>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'stock', label: t('inv.stock') }, { id: 'fefo', label: t('inv.fefo') }, { id: 'moves', label: t('inv.moves') }]} />
      {tab !== 'moves' && <Toolbar><Select className="w-56" value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">{t('inv.allLoc')}</option>{locations.data?.items.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>{tab === 'stock' && <Input className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('inv.search')} />}</Toolbar>}
      {tab === 'fefo' && <div className="p-3"><Alert tone="info">{t('inv.fefoNote')}</Alert></div>}
      {tab === 'moves' ? (moves.isLoading ? <SkeletonRows /> : !moves.items.length ? <EmptyState title={t('common.empty')} /> : <><TableWrap><thead><tr><Th>{t('rec.date')}</Th><Th>{t('inv.type')}</Th><Th>{t('f.batch')}</Th><Th>{t('inv.fromTo')}</Th><Th>{t('f.quantity')}</Th><Th>{t('inv.reason')}</Th></tr></thead><tbody>{moves.items.map((m: any) => <tr key={m.id}><Td>{fmtDateTime(m.createdAt)}</Td><Td><Badge>{t(`mv.${m.type}`)}</Badge></Td><Td>{m.batch?.batchNumber ?? '—'}</Td><Td>{m.fromLocation?.name ?? '—'} → {m.toLocation?.name ?? '—'}</Td><Td>{fmtNum(m.quantity)} {t(`unit.${m.unit}`)}</Td><Td className="text-xs text-mutedfg">{m.reason ?? ''}</Td></tr>)}</tbody></TableWrap><Pagination page={moves.page} pageSize={moves.pageSize} total={moves.total} onChange={moves.setPage} /></>)
        : (tab === 'stock' ? stock.isLoading : fefo.isLoading) ? <SkeletonRows /> : stock.error ? <ErrorState error={stock.error} /> : !rows.length ? <EmptyState title={t('inv.empty')} /> : <>
          <TableWrap><thead><tr>{tab === 'fefo' && <Th>#</Th>}<Th>{t('f.product')}</Th><Th>{t('f.batch')}</Th><Th>{t('inv.location')}</Th><Th>{t('inv.available')}</Th><Th>{t('inv.reserved')}</Th><Th>{t('rec.expiry')}</Th><Th>{t('f.status')}</Th>{w && <Th />}</tr></thead>
            <tbody>{rows.map((r: any, i: number) => <tr key={r.id} className="hover:bg-muted/40">{tab === 'fefo' && <Td><b>{i + 1}</b></Td>}<Td><b>{r.product}</b></Td><Td>{r.batchNumber}</Td><Td>{r.location}</Td><Td className="tabular-nums">{fmtNum(r.available)} {t(`unit.${r.unit}`)}</Td><Td className="tabular-nums">{fmtNum(r.reserved)}</Td><Td>{fmtDate(r.expiryDate)} <span className="text-xs text-mutedfg">({r.daysToExpiry} j)</span></Td><Td>{r.alert ? <StatusBadge status={r.alert} /> : <StatusBadge status="RELEASED" />}</Td>
              {w && <Td><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" title={t('inv.transfer')} onClick={() => setAct({ kind: 'transfer', row: r })}><ArrowRightLeft className="h-3.5 w-3.5" /></Button>{portal === 'RETAIL' && <Button size="sm" variant="ghost" title={t('inv.sale')} onClick={() => setAct({ kind: 'sale', row: r })}><ShoppingCart className="h-3.5 w-3.5" /></Button>}<Button size="sm" variant="ghost" title={t('inv.damage')} onClick={() => setAct({ kind: 'damage', row: r })}><Hammer className="h-3.5 w-3.5" /></Button>{can('quality:release') && <Button size="sm" variant="ghost" title={t('inv.adjust')} onClick={() => setAct({ kind: 'adjust', row: r })}><SlidersHorizontal className="h-3.5 w-3.5" /></Button>}</div></Td>}</tr>)}</tbody></TableWrap>
          {tab === 'stock' && <Pagination page={stock.page} pageSize={stock.pageSize} total={stock.total} onChange={stock.setPage} />}</>}
    </Card>
    {act && <ActionModal act={act} locations={locations.data?.items ?? []} onClose={() => setAct(null)} />}
    {count && <CountModal locationId={loc} onClose={() => setCount(false)} />}
  </>);
}

function ActionModal({ act, locations, onClose }: { act: NonNullable<Act>; locations: any[]; onClose: () => void }) {
  const { t } = useTranslation(); const r = act.row;
  const [qty, setQty] = useState(''); const [to, setTo] = useState(''); const [reason, setReason] = useState('');
  const inv = { invalidate: ['/inventory', '/stock-movements', '/dashboard'], success: t('common.saved'), onSuccess: onClose };
  const run = useAction(() => act.kind === 'transfer' ? api.post('/inventory/transfer', { fromLocationId: r.locationId, toLocationId: to, batchId: r.batchId, quantity: Number(qty) })
    : act.kind === 'damage' ? api.post('/inventory/damage', { locationId: r.locationId, batchId: r.batchId, quantity: Number(qty), reason })
    : act.kind === 'sale' ? api.post('/inventory/sale-exit', { locationId: r.locationId, batchId: r.batchId, quantity: Number(qty), reason: reason || undefined })
    : api.post('/inventory/adjust', { locationId: r.locationId, batchId: r.batchId, newQuantity: Number(qty), reason }), inv);
  const needReason = act.kind === 'damage' ? reason.trim().length >= 3 : act.kind === 'adjust' ? reason.trim().length >= 5 : true;
  const ok = qty !== '' && Number(qty) >= (act.kind === 'adjust' ? 0 : 0.0001) && needReason && (act.kind !== 'transfer' || !!to);
  return (
    <Modal open onClose={onClose} title={`${t(`inv.act.${act.kind}`)} — ${r.batchNumber}`} footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button loading={run.isPending} disabled={!ok} onClick={() => run.mutate(undefined)}>{t('common.confirm')}</Button></>}>
      <div className="space-y-3"><p className="text-sm text-mutedfg">{r.product} · {r.location} · {t('inv.available')}: <b>{fmtNum(r.available)}</b> / {t('f.quantity')}: <b>{fmtNum(r.quantity)}</b></p>
        {act.kind === 'transfer' && <Field label={t('inv.dest')}><Select value={to} onChange={(e) => setTo(e.target.value)}><option value="">—</option>{locations.filter((l) => l.id !== r.locationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>}
        <Field label={act.kind === 'adjust' ? t('inv.newQty') : t('f.quantity')}><Input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        {act.kind !== 'transfer' && <Field label={t('inv.reason')} hint={act.kind === 'adjust' ? t('inv.adjustHint') : undefined}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}</div>
    </Modal>
  );
}

function CountModal({ locationId, onClose }: { locationId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const q = useApi<{ items: any[] }>('/inventory', { locationId, pageSize: 100 });
  const [counts, setCounts] = useState<Record<string, string>>({}); const [note, setNote] = useState('');
  const run = useAction(() => api.post('/inventory/reconcile', { locationId, note: note || undefined, counts: Object.entries(counts).filter(([, v]) => v !== '').map(([batchId, v]) => ({ batchId, countedQuantity: Number(v) })) }), { invalidate: ['/inventory', '/stock-movements'], success: t('inv.countSaved'), onSuccess: onClose });
  return (
    <Modal open onClose={onClose} wide title={t('inv.count')} footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button loading={run.isPending} disabled={!Object.values(counts).some((v) => v !== '')} onClick={() => run.mutate(undefined)}>{t('inv.applyCount')}</Button></>}>
      <p className="mb-3 text-sm text-mutedfg">{t('inv.countHint')}</p>
      {q.isLoading ? <SkeletonRows /> : <TableWrap><thead><tr><Th>{t('f.batch')}</Th><Th>{t('f.product')}</Th><Th>{t('inv.system')}</Th><Th>{t('inv.counted')}</Th></tr></thead><tbody>{q.data?.items.map((r) => <tr key={r.id}><Td>{r.batchNumber}</Td><Td>{r.product}</Td><Td>{fmtNum(r.quantity)}</Td><Td><Input className="h-8 w-28" type="number" step="any" value={counts[r.batchId] ?? ''} onChange={(e) => setCounts({ ...counts, [r.batchId]: e.target.value })} /></Td></tr>)}</tbody></TableWrap>}
      <Field label={t('f.notes')} className="mt-3"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}
