import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Plus, Search, Send } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAction, useApi } from '../../lib/hooks';
import { fmtDate, fmtDateTime, fmtNum, UNITS } from '../../lib/utils';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, Select, SkeletonRows, StatusBadge, TableWrap, Tabs, Td, Textarea, Th, Toolbar, useToast } from '../../components/ui';
import { DocLink, DocUpload, DynamicForm, unitOptions, useDebounced, usePaged } from '../../components/common';

// ───────── Manufacturer: search supplier offers & send requests ─────────
export function MarketPage() {
  const { t } = useTranslation(); const [tab, setTab] = useState('search');
  const [q, setQ] = useState(''); const [wilaya, setWilaya] = useState(''); const [minQty, setMinQty] = useState(''); const dq = useDebounced(q);
  const l = usePaged('/offers', { q: dq || undefined, wilaya: wilaya || undefined, minQty: minQty || undefined }, 12);
  const sent = useApi<{ items: any[] }>('/requests/sent', undefined, { enabled: tab === 'sent' });
  const [req, setReq] = useState<any>(null); const [msg, setMsg] = useState(''); const [qty, setQty] = useState(''); const [unit, setUnit] = useState('L');
  const send = useAction(() => api.post(`/offers/${req.id}/requests`, { message: msg, quantity: qty ? Number(qty) : undefined, unit: qty ? unit : undefined }), { invalidate: ['/requests'], success: t('mk.sent'), onSuccess: () => { setReq(null); setMsg(''); setQty(''); } });
  return (<>
    <PageHeader title={t('nav.market')} subtitle={t('mk.sub')} />
    <Card><Tabs value={tab} onChange={setTab} tabs={[{ id: 'search', label: t('mk.search') }, { id: 'sent', label: t('mk.sentTab') }]} />
      {tab === 'search' ? <>
        <Toolbar><div className="relative"><Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-mutedfg" /><Input className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('mk.q')} /></div><Input className="w-40" value={wilaya} onChange={(e) => setWilaya(e.target.value)} placeholder={t('f.wilaya')} /><Input className="w-36" type="number" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder={t('mk.minQty')} /></Toolbar>
        {l.isLoading ? <SkeletonRows /> : l.error ? <ErrorState error={l.error} /> : !l.items.length ? <EmptyState title={t('mk.none')} /> : <div className="grid gap-3 p-3 md:grid-cols-2">{l.items.map((o: any) => (
          <Card key={o.id} className="p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{o.title}</p><p className="text-xs text-mutedfg">{o.company.name} · {o.company.wilaya ?? '—'}</p></div><Badge tone="info">{o.category}</Badge></div>
            {o.description && <p className="mt-2 text-sm">{o.description}</p>}{o.specifications && <p className="mt-1 text-xs text-mutedfg">{o.specifications}</p>}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span><b>{fmtNum(o.quantityAvailable)} {t(`unit.${o.unit}`)}</b>{o.unitPrice != null && <span className="text-mutedfg"> · {fmtNum(o.unitPrice)} {o.currency}/{t(`unit.${o.unit}`)}</span>}</span><Button size="sm" onClick={() => { setReq(o); setUnit(o.unit); }}><Send className="h-3.5 w-3.5" />{t('mk.request')}</Button></div>
            {o.uploadedDocuments.length > 0 && <p className="mt-2 flex flex-wrap gap-3 text-xs">{o.uploadedDocuments.map((d: any) => <DocLink key={d.id} doc={d} />)}</p>}</Card>))}</div>}
        <Pagination page={l.page} pageSize={l.pageSize} total={l.total} onChange={l.setPage} /></> : (
        sent.isLoading ? <SkeletonRows /> : !sent.data?.items.length ? <EmptyState title={t('common.empty')} /> : <ul className="divide-y divide-line">{sent.data.items.map((r) => <li key={r.id} className="p-4 text-sm"><div className="flex justify-between"><b>{r.offer.title} <span className="font-normal text-mutedfg">— {r.offer.company.name}</span></b><StatusBadge status={r.status} /></div><p className="mt-1">{r.message}</p>{r.response && <p className="mt-2 rounded bg-brand/10 p-2"><b>{t('mk.response')} :</b> {r.response}</p>}<p className="text-xs text-mutedfg">{fmtDateTime(r.createdAt)}</p></li>)}</ul>)}</Card>
    <Modal open={!!req} onClose={() => setReq(null)} title={`${t('mk.request')} — ${req?.title ?? ''}`} footer={<><Button variant="outline" onClick={() => setReq(null)}>{t('common.cancel')}</Button><Button loading={send.isPending} disabled={msg.trim().length < 3} onClick={() => send.mutate(undefined)}>{t('mk.send')}</Button></>}>
      <div className="space-y-3"><div className="grid grid-cols-[1fr_110px] gap-2"><Field label={t('f.quantity')}><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></Field><Field label={t('f.unit')}><Select value={unit} onChange={(e) => setUnit(e.target.value)}>{UNITS.map((u) => <option key={u} value={u}>{t(`unit.${u}`)}</option>)}</Select></Field></div><Field label={t('pub.message')}><Textarea value={msg} onChange={(e) => setMsg(e.target.value)} /></Field></div></Modal>
  </>);
}

// ───────── Supplier: own offers ─────────
export function OffersPage() {
  const { t } = useTranslation();
  const q = useApi<{ items: any[] }>('/offers/mine'); const [edit, setEdit] = useState<any | 'new' | null>(null);
  const save = useAction((v: any) => (edit && edit !== 'new' ? api.put(`/offers/${edit.id}`, v) : api.post('/offers', v)), { invalidate: ['/offers'], success: t('common.saved'), onSuccess: () => setEdit(null) });
  const fields = [{ name: 'title', label: t('nc.title'), required: true }, { name: 'category', label: t('f.category'), required: true }, { name: 'quantityAvailable', label: t('mk.available'), type: 'number' as const, required: true }, { name: 'unit', label: t('f.unit'), type: 'select' as const, required: true, options: unitOptions(t) }, { name: 'unitPrice', label: t('mk.price'), type: 'number' as const }, { name: 'wilaya', label: t('f.wilaya') },
    { name: 'status', label: t('f.status'), type: 'select' as const, options: ['ACTIVE', 'PAUSED', 'SOLD_OUT'].map((s) => ({ value: s, label: t(`status.${s}`) })) }, { name: 'description', label: t('nc.description'), type: 'textarea' as const }, { name: 'specifications', label: t('mk.specs'), type: 'textarea' as const }];
  return (<>
    <PageHeader title={t('nav.offers')} subtitle={t('mk.offersSub')} actions={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />{t('common.new')}</Button>} />
    <Card>{q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !q.data?.items.length ? <EmptyState title={t('common.empty')} /> : <TableWrap><thead><tr><Th>{t('nc.title')}</Th><Th>{t('f.category')}</Th><Th>{t('mk.available')}</Th><Th>{t('mk.price')}</Th><Th>{t('nav.requests')}</Th><Th>{t('f.status')}</Th><Th /></tr></thead>
      <tbody>{q.data.items.map((o) => <tr key={o.id}><Td><b>{o.title}</b></Td><Td>{o.category}</Td><Td>{fmtNum(o.quantityAvailable)} {t(`unit.${o.unit}`)}</Td><Td>{o.unitPrice != null ? fmtNum(o.unitPrice) : '—'}</Td><Td>{o._count.supplierRequests}</Td><Td><StatusBadge status={o.status} /></Td><Td><div className="flex justify-end gap-1"><DocUpload kind="TECHNICAL_SHEET" label={t('mk.techSheet')} target={{ offerId: o.id }} onUploaded={() => q.refetch()} /><Button size="sm" variant="outline" onClick={() => setEdit(o)}>{t('common.edit')}</Button></div></Td></tr>)}</tbody></TableWrap>}</Card>
    <Modal open={!!edit} onClose={() => setEdit(null)} wide title={edit === 'new' ? t('common.new') : t('common.edit')}>{edit && <DynamicForm fields={fields} initial={edit === 'new' ? { unit: 'L', status: 'ACTIVE' } : Object.fromEntries(fields.map((f) => [f.name, edit[f.name] ?? '']))} submitting={save.isPending} onCancel={() => setEdit(null)} onSubmit={(v) => save.mutate(v)} />}</Modal>
  </>);
}

export function RequestsPage() {
  const { t } = useTranslation(); const toast = useToast();
  const q = useApi<{ items: any[] }>('/requests'); const [r, setR] = useState<any>(null); const [text, setText] = useState(''); const [st, setSt] = useState('ANSWERED');
  const respond = useAction(() => api.post(`/requests/${r.id}/respond`, { response: text, status: st }), { invalidate: ['/requests', '/dashboard'], success: t('common.saved'), onSuccess: () => { setR(null); setText(''); } });
  return (<>
    <PageHeader title={t('nav.requests')} subtitle={t('mk.requestsSub')} />
    <Card>{q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !q.data?.items.length ? <EmptyState title={t('common.empty')} /> : <ul className="divide-y divide-line">{q.data.items.map((x) => (
      <li key={x.id} className="p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span><b>{x.requesterCompany.name}</b> <span className="text-mutedfg">— {x.offer.title}</span></span><StatusBadge status={x.status} /></div>
        <p className="mt-1">{x.message}</p>{x.quantity != null && <p className="text-xs text-mutedfg">{t('f.quantity')}: {fmtNum(x.quantity)} {x.unit && t(`unit.${x.unit}`)}</p>}{x.response && <p className="mt-2 rounded bg-muted p-2"><b>{t('mk.response')}:</b> {x.response}</p>}
        <div className="mt-2 flex items-center gap-2"><span className="text-xs text-mutedfg">{fmtDateTime(x.createdAt)} · {x.requesterCompany.email ?? ''} {x.requesterCompany.phone ?? ''}</span><Button size="sm" variant="outline" className="ms-auto" onClick={() => { setR(x); setText(x.response ?? ''); }}>{t('mk.respond')}</Button></div></li>))}</ul>}</Card>
    <Modal open={!!r} onClose={() => setR(null)} title={t('mk.respond')} footer={<><Button variant="outline" onClick={() => setR(null)}>{t('common.cancel')}</Button><Button loading={respond.isPending} disabled={text.trim().length < 2} onClick={() => respond.mutate(undefined)}>{t('mk.send')}</Button></>}><div className="space-y-3"><Field label={t('f.status')}><Select value={st} onChange={(e) => setSt(e.target.value)}>{['ANSWERED', 'ACCEPTED', 'DECLINED', 'CLOSED'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select></Field><Field label={t('mk.response')}><Textarea value={text} onChange={(e) => setText(e.target.value)} /></Field></div></Modal>
  </>);
}

export function MessagesPage() {
  const { t } = useTranslation(); const { company } = useAuth(); const toast = useToast();
  const q = useApi<{ items: any[] }>('/messages', undefined, { refetchInterval: 30_000 }); const dir = useApi<{ items: any[] }>('/directory/companies');
  const [to, setTo] = useState(''); const [body, setBody] = useState('');
  const send = useAction(() => api.post('/messages', { recipientCompanyId: to, body }), { invalidate: ['/messages'], success: t('mk.sent'), onSuccess: () => setBody('') });
  return (<>
    <PageHeader title={t('nav.messages')} subtitle={t('msg.sub')} />
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card><CardHeader title={t('msg.new')} /><CardBody className="space-y-3"><Field label={t('msg.to')}><Select value={to} onChange={(e) => setTo(e.target.value)}><option value="">—</option>{dir.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name} ({t(`ctype.${c.type}`)})</option>)}</Select></Field><Field label={t('pub.message')}><Textarea value={body} onChange={(e) => setBody(e.target.value)} /></Field><Button className="w-full" loading={send.isPending} disabled={!to || !body.trim()} onClick={() => send.mutate(undefined)}><Send className="h-4 w-4" />{t('mk.send')}</Button></CardBody></Card>
      <Card><CardHeader title={<span className="flex items-center gap-2"><MessageSquare className="h-4 w-4" />{t('nav.messages')}</span>} />{q.isLoading ? <SkeletonRows /> : !q.data?.items.length ? <EmptyState title={t('common.empty')} /> : <ul className="divide-y divide-line">{q.data.items.map((m) => { const mine = m.senderCompanyId === company?.id; return <li key={m.id} className="px-4 py-3 text-sm"><div className="flex justify-between text-xs text-mutedfg"><span>{mine ? `${t('msg.sentTo')} ${m.recipientCompany.name}` : `${t('msg.from')} ${m.senderCompany.name}`}</span><span>{fmtDateTime(m.createdAt)}</span></div><p className="mt-1 whitespace-pre-wrap">{m.body}</p></li>; })}</ul>}</Card></div>
  </>);
}

// ───────── Retail ─────────
export function PromotionsPage() {
  const { t } = useTranslation();
  const q = useApi<{ items: any[] }>('/promotions'); const locs = useApi<{ items: any[] }>('/locations'); const inv = useApi<{ items: any[] }>('/inventory', { pageSize: 100 });
  const [open, setOpen] = useState(false); const [f, setF] = useState<any>({ retailStoreId: '', title: '', discountPercent: '', startsAt: '', endsAt: '', productIds: [] as string[], description: '' });
  const products = [...new Map((inv.data?.items ?? []).map((x) => [x.productId, x.product])).entries()];
  const stores = (locs.data?.items ?? []).filter((l) => l.retailStore);
  const create = useAction(() => api.post('/promotions', { retailStoreId: f.retailStoreId, title: f.title, description: f.description || undefined, discountPercent: f.discountPercent === '' ? undefined : Number(f.discountPercent), startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(), productIds: f.productIds }), { invalidate: ['/promotions'], success: t('common.saved'), onSuccess: () => setOpen(false) });
  const off = useAction((id: string) => api.post(`/promotions/${id}/deactivate`), { invalidate: ['/promotions'], success: t('common.done') });
  return (<>
    <PageHeader title={t('nav.promotions')} subtitle={t('promo.sub')} actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t('common.new')}</Button>} />
    <Card>{q.isLoading ? <SkeletonRows /> : !q.data?.items.length ? <EmptyState title={t('common.empty')} /> : <TableWrap><thead><tr><Th>{t('nc.title')}</Th><Th>{t('promo.store')}</Th><Th>{t('nav.products')}</Th><Th>{t('promo.period')}</Th><Th>{t('f.status')}</Th><Th /></tr></thead><tbody>{q.data.items.map((p) => <tr key={p.id}><Td><b>{p.title}</b>{p.discountPercent != null && <Badge tone="ok" className="ms-1">−{fmtNum(p.discountPercent)}%</Badge>}</Td><Td>{p.retailStore?.name}</Td><Td className="text-xs">{p.promotionProducts.map((x: any) => x.product.name).join(', ')}</Td><Td className="text-xs">{fmtDate(p.startsAt)} → {fmtDate(p.endsAt)}</Td><Td><StatusBadge status={p.active ? 'ACTIVE' : 'PAUSED'} /></Td><Td>{p.active && <Button size="sm" variant="ghost" onClick={() => off.mutate(p.id)}>{t('promo.stop')}</Button>}</Td></tr>)}</tbody></TableWrap>}</Card>
    <Modal open={open} onClose={() => setOpen(false)} wide title={t('common.new')} footer={<><Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button loading={create.isPending} disabled={!f.retailStoreId || f.title.length < 3 || !f.startsAt || !f.endsAt || !f.productIds.length} onClick={() => create.mutate(undefined)}>{t('common.save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2"><Field label={t('promo.store')}><Select value={f.retailStoreId} onChange={(e) => setF({ ...f, retailStoreId: e.target.value })}><option value="">—</option>{stores.map((s) => <option key={s.retailStore.id} value={s.retailStore.id}>{s.name}</option>)}</Select></Field><Field label={t('nc.title')}><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field><Field label={t('promo.discount')}><Input type="number" value={f.discountPercent} onChange={(e) => setF({ ...f, discountPercent: e.target.value })} /></Field><div />
        <Field label={t('promo.start')}><Input type="date" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field><Field label={t('promo.end')}><Input type="date" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
        <Field label={t('nav.products')} className="sm:col-span-2" hint={t('promo.prodHint')}><div className="flex flex-wrap gap-2">{products.map(([id, name]) => <label key={id} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-sm"><input type="checkbox" className="accent-brand" checked={f.productIds.includes(id)} onChange={(e) => setF({ ...f, productIds: e.target.checked ? [...f.productIds, id] : f.productIds.filter((x: string) => x !== id) })} />{name}</label>)}</div></Field>
        <Field label={t('nc.description')} className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field></div></Modal>
  </>);
}

export function ReceivedLookupPage() {
  const { t } = useTranslation(); const [v, setV] = useState(''); const [no, setNo] = useState('');
  const q = useApi<any>(no ? `/trace/received/${encodeURIComponent(no)}` : null);
  return (<>
    <PageHeader title={t('nav.received')} subtitle={t('recv.sub')} />
    <Card className="mb-4"><CardBody><form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setNo(v.trim()); }}><Input value={v} onChange={(e) => setV(e.target.value)} placeholder={t('batches.search')} /><Button type="submit"><Search className="h-4 w-4" />{t('pub.search')}</Button></form></CardBody></Card>
    {q.isLoading ? <SkeletonRows /> : q.error ? <Alert tone="warn">{(q.error as Error).message}</Alert> : q.data && (<>
      {q.data.blockedNotice && <Alert tone="danger" className="mb-3" title={q.data.blockedNotice} />}
      <Card><CardHeader title={`${q.data.batchNumber} — ${q.data.product}`} subtitle={q.data.manufacturer} action={<StatusBadge status={q.data.status} />} /><CardBody><p className="mb-3 text-sm">{t('batches.producedAt')}: {fmtDate(q.data.producedAt)} · {t('rec.expiry')}: {fmtDate(q.data.expiryDate)}</p><TableWrap><thead><tr><Th>N°</Th><Th>{t('ship.from')}</Th><Th>{t('ship.to')}</Th><Th>{t('f.quantity')}</Th><Th>{t('f.status')}</Th></tr></thead><tbody>{q.data.shipments.map((s: any) => <tr key={s.shipmentNumber}><Td><b>{s.shipmentNumber}</b></Td><Td>{s.from}</Td><Td>{s.to}</Td><Td>{fmtNum(s.quantity)} → {s.receivedQty != null ? fmtNum(s.receivedQty) : '—'} {t(`unit.${s.unit}`)}</Td><Td><StatusBadge status={s.status} /></Td></tr>)}</tbody></TableWrap></CardBody></Card></>)}
  </>);
}
