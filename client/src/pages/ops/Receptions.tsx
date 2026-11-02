import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, GitBranch } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAction, useApi } from '../../lib/hooks';
import { fmtDate, fmtDateTime, fmtNum, toInputDateTime, UNITS, daysUntil } from '../../lib/utils';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Field, Input, KV, Pagination, PageHeader, Select, SkeletonRows, StatusBadge, TableWrap, Td, Th, Toolbar, Textarea } from '../../components/ui';
import { DocLink, DocUpload, useDebounced, usePaged } from '../../components/common';
import { QualityPanel } from '../../components/QualityPanel';

export function ReceptionsPage() {
  const { t } = useTranslation(); const { can } = useAuth();
  const l = usePaged('/receptions');
  return (<>
    <PageHeader title={t('nav.receptions')} subtitle={t('rec.sub')} actions={can('reception:write') && <Link to="/app/receptions/new"><Button><Plus className="h-4 w-4" />{t('rec.new')}</Button></Link>} />
    <Card>{l.isLoading ? <SkeletonRows /> : l.error ? <ErrorState error={l.error} /> : !l.items.length ? <EmptyState title={t('common.empty')} /> : <TableWrap><thead><tr><Th>N°</Th><Th>{t('rec.date')}</Th><Th>{t('rec.supplier')}</Th><Th>{t('rec.bl')}</Th><Th>{t('rec.by')}</Th></tr></thead>
      <tbody>{l.items.map((r: any) => <tr key={r.id}><Td><b>{r.receptionNumber}</b></Td><Td>{fmtDateTime(r.receivedAt)}</Td><Td>{r.supplier.name}</Td><Td>{r.deliveryNoteNumber ?? '—'}</Td><Td>{r.receivedBy.fullName}</Td></tr>)}</tbody></TableWrap>}
      <Pagination page={l.page} pageSize={l.pageSize} total={l.total} onChange={l.setPage} /></Card>
  </>);
}

export function ReceptionNewPage() {
  const { t } = useTranslation(); const nav = useNavigate();
  const suppliers = useApi<{ items: any[] }>('/suppliers', { pageSize: 100 }); const materials = useApi<{ items: any[] }>('/materials', { pageSize: 100 });
  const [created, setCreated] = useState<any>(null);
  const req = t('common.required');
  const schema = z.object({
    supplierId: z.string().min(1, req), deliveryNoteNumber: z.string().optional(), vehiclePlate: z.string().optional(), receivedAt: z.string().min(1, req), notes: z.string().optional(),
    lots: z.array(z.object({ materialId: z.string().min(1, req), supplierLotNumber: z.string().optional(), internalLotNumber: z.string().optional(), origin: z.string().optional(), quantity: z.coerce.number({ invalid_type_error: req }).positive(t('val.positive')), unit: z.string().min(1), productionDate: z.string().optional(), expiryDate: z.string().optional(), storageRequirements: z.string().optional() })).min(1),
  });
  type F = z.infer<typeof schema>;
  const { register, control, handleSubmit, setValue, formState: { errors } } = useForm<F>({ resolver: zodResolver(schema), defaultValues: { receivedAt: toInputDateTime(), lots: [{ materialId: '', quantity: undefined as never, unit: 'L' }] } });
  const { fields, append, remove } = useFieldArray({ control, name: 'lots' });
  const create = useAction((v: F) => api.post('/receptions', {
    ...v, receivedAt: new Date(v.receivedAt).toISOString(),
    lots: v.lots.map((l) => ({ ...l, productionDate: l.productionDate ? new Date(l.productionDate).toISOString() : undefined, expiryDate: l.expiryDate ? new Date(l.expiryDate).toISOString() : undefined, internalLotNumber: l.internalLotNumber || undefined, supplierLotNumber: l.supplierLotNumber || undefined, origin: l.origin || undefined, storageRequirements: l.storageRequirements || undefined })),
  }), { invalidate: ['/receptions', '/lots', '/dashboard'], success: t('rec.created'), onSuccess: (r) => setCreated(r) });

  if (created) return (<><PageHeader title={t('rec.done')} subtitle={created.reception.receptionNumber} />
    <Alert tone="warn" className="mb-4">{t('rec.pendingNote')}</Alert>
    <Card><TableWrap><thead><tr><Th>{t('f.internalLot')}</Th><Th>{t('f.quantity')}</Th><Th>{t('f.status')}</Th><Th /></tr></thead><tbody>{created.lots.map((l: any) => <tr key={l.id}><Td><b>{l.internalLotNumber}</b></Td><Td>{fmtNum(l.receivedQty)} {t(`unit.${l.unit}`)}</Td><Td><StatusBadge status={l.status} /></Td><Td><Link to={`/app/lots/${l.id}`}><Button size="sm">{t('rec.control')}</Button></Link></Td></tr>)}</tbody></TableWrap></Card>
    <div className="mt-4 flex gap-2"><Button variant="outline" onClick={() => nav('/app/receptions')}>{t('rec.list')}</Button></div></>);

  return (<>
    <PageHeader title={t('rec.new')} subtitle={t('rec.newSub')} />
    {!suppliers.data?.items.length && !suppliers.isLoading && <Alert tone="warn" className="mb-4" title={t('rec.noSupplier')}>{t('rec.noSupplierMsg')} <Link className="underline" to="/app/suppliers">{t('nav.suppliers')}</Link></Alert>}
    <form onSubmit={handleSubmit((v) => create.mutate(v))} noValidate className="space-y-4">
      <Card><CardHeader title={t('rec.delivery')} /><CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('rec.supplier')} error={errors.supplierId?.message}><Select {...register('supplierId')}><option value="">—</option>{suppliers.data?.items.filter((s) => s.approved).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label={t('rec.datetime')} error={errors.receivedAt?.message}><Input type="datetime-local" {...register('receivedAt')} /></Field>
        <Field label={t('rec.bl')}><Input {...register('deliveryNoteNumber')} /></Field>
        <Field label={t('rec.vehicle')}><Input {...register('vehiclePlate')} /></Field>
        <Field label={t('f.notes')} className="sm:col-span-2 lg:col-span-4"><Textarea {...register('notes')} /></Field></CardBody></Card>
      {fields.map((f, i) => (
        <Card key={f.id}><CardHeader title={`${t('f.lot')} ${i + 1}`} action={fields.length > 1 && <Button size="sm" variant="ghost" onClick={() => remove(i)}><Trash2 className="h-4 w-4 text-danger" /></Button>} />
          <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('rec.material')} error={errors.lots?.[i]?.materialId?.message}><Select {...register(`lots.${i}.materialId`, { onChange: (e) => { const m = materials.data?.items.find((x) => x.id === e.target.value); if (m) { setValue(`lots.${i}.unit`, m.defaultUnit); if (m.storageRequirements) setValue(`lots.${i}.storageRequirements`, m.storageRequirements); } } })}><option value="">—</option>{materials.data?.items.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
            <Field label={t('rec.supplierLot')}><Input {...register(`lots.${i}.supplierLotNumber`)} /></Field>
            <Field label={t('rec.internalLot')} hint={t('rec.autoLot')}><Input {...register(`lots.${i}.internalLotNumber`)} /></Field>
            <Field label={t('rec.origin')}><Input {...register(`lots.${i}.origin`)} /></Field>
            <Field label={t('f.quantity')} error={errors.lots?.[i]?.quantity?.message}><Input type="number" step="any" {...register(`lots.${i}.quantity`)} /></Field>
            <Field label={t('f.unit')}><Select {...register(`lots.${i}.unit`)}>{UNITS.map((u) => <option key={u} value={u}>{t(`unit.${u}`)}</option>)}</Select></Field>
            <Field label={t('rec.prodDate')}><Input type="date" {...register(`lots.${i}.productionDate`)} /></Field>
            <Field label={t('rec.expiry')}><Input type="date" {...register(`lots.${i}.expiryDate`)} /></Field>
            <Field label={t('f.storage')} className="sm:col-span-2 lg:col-span-4"><Input {...register(`lots.${i}.storageRequirements`)} /></Field>
          </CardBody></Card>))}
      <div className="flex flex-wrap justify-between gap-2"><Button variant="outline" onClick={() => append({ materialId: '', quantity: undefined as never, unit: 'L' })}><Plus className="h-4 w-4" />{t('rec.addLot')}</Button><Button type="submit" loading={create.isPending}>{t('rec.submit')}</Button></div>
    </form>
  </>);
}

export function LotsPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const dq = useDebounced(q);
  const l = usePaged('/lots', { q: dq || undefined, status: status || undefined });
  return (<>
    <PageHeader title={t('nav.lots')} subtitle={t('lots.sub')} />
    <Card><Toolbar><Input className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('lots.search')} /><Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t('common.allStatus')}</option>{['PENDING', 'RELEASED', 'BLOCKED', 'REJECTED'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select></Toolbar>
      {l.isLoading ? <SkeletonRows /> : l.error ? <ErrorState error={l.error} /> : !l.items.length ? <EmptyState title={t('common.empty')} /> : <TableWrap><thead><tr><Th>{t('f.lot')}</Th><Th>{t('rec.material')}</Th><Th>{t('rec.supplier')}</Th><Th>{t('lots.remaining')}</Th><Th>{t('rec.expiry')}</Th><Th>{t('f.status')}</Th></tr></thead>
        <tbody>{l.items.map((x: any) => { const d = x.expiryDate ? daysUntil(x.expiryDate) : null; return <tr key={x.id} className="hover:bg-muted/40"><Td><Link className="font-semibold text-brand" to={`/app/lots/${x.id}`}>{x.internalLotNumber}</Link>{x.supplierLotNumber && <span className="block text-xs text-mutedfg">{x.supplierLotNumber}</span>}</Td><Td>{x.material.name}</Td><Td>{x.supplier.name}</Td><Td>{fmtNum(x.remainingQty)} / {fmtNum(x.receivedQty)} {t(`unit.${x.unit}`)}</Td><Td>{fmtDate(x.expiryDate)}{d !== null && d <= 3 && <Badge tone={d < 0 ? 'danger' : 'warn'} className="ms-1">{d < 0 ? t('status.EXPIRED') : `${d} j`}</Badge>}</Td><Td><StatusBadge status={x.status} /></Td></tr>; })}</tbody></TableWrap>}
      <Pagination page={l.page} pageSize={l.pageSize} total={l.total} onChange={l.setPage} /></Card>
  </>);
}

export function LotDetailPage() {
  const { t } = useTranslation(); const { id } = useParams(); const { can } = useAuth();
  const q = useApi<any>(`/lots/${id}`);
  if (q.isLoading) return <SkeletonRows />; if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const l = q.data;
  return (<>
    <PageHeader title={<span className="flex items-center gap-3">{l.internalLotNumber}<StatusBadge status={l.status} /></span>} subtitle={`${l.material.name} — ${l.supplier.name}`}
      actions={can('trace:read') && <Link to={`/app/trace?type=lot&id=${l.id}&label=${encodeURIComponent(l.internalLotNumber)}`}><Button variant="outline"><GitBranch className="h-4 w-4" />{t('trace.forward')}</Button></Link>} />
    {l.blockedReason && l.status !== 'RELEASED' && <Alert tone="danger" className="mb-4" title={t('lot.blockedReason')}>{l.blockedReason}</Alert>}
    <div className="grid gap-4 lg:grid-cols-3">
      <Card><CardHeader title={t('lot.info')} /><CardBody><dl>
        <KV k={t('lot.supplierLot')} v={l.supplierLotNumber} /><KV k={t('rec.origin')} v={l.origin} /><KV k={t('lot.reception')} v={`${l.reception?.receptionNumber ?? '—'} · ${fmtDateTime(l.receivedAt)}`} />
        <KV k={t('lots.remaining')} v={`${fmtNum(l.remainingQty)} / ${fmtNum(l.receivedQty)} ${t(`unit.${l.unit}`)}`} /><KV k={t('rec.prodDate')} v={fmtDate(l.productionDate)} /><KV k={t('rec.expiry')} v={fmtDate(l.expiryDate)} /><KV k={t('f.storage')} v={l.storageRequirements} /></dl></CardBody></Card>
      <div className="lg:col-span-2"><QualityPanel kind="LOT" id={l.id} status={l.status} checks={l.qualityChecks} results={l.qualityResults} invalidate={['/lots', '/dashboard']} /></div>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card><CardHeader title={t('lot.usedIn')} />{!l.batchMaterials.length ? <p className="p-4 text-sm text-mutedfg">{t('lot.notUsed')}</p> : <ul className="divide-y divide-line">{l.batchMaterials.map((b: any) => <li key={b.id}><Link to={`/app/batches/${b.batch.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/50"><span><b>{b.batch.batchNumber}</b> <span className="text-mutedfg">{b.batch.product.name}</span></span><span>{fmtNum(b.quantity)} {t(`unit.${b.unit}`)}</span></Link></li>)}</ul>}</Card>
      <Card><CardHeader title={t('lot.docs')} action={can('document:write') && <DocUpload kind="CERTIFICATE" target={{ materialLotId: l.id }} onUploaded={() => q.refetch()} />} /><CardBody>{!l.uploadedDocuments.length ? <p className="text-sm text-mutedfg">{t('lot.noDocs')}</p> : <ul className="space-y-1 text-sm">{l.uploadedDocuments.map((d: any) => <li key={d.id}><DocLink doc={d} /> <span className="text-xs text-mutedfg">· {t(`doc.${d.kind}`)}</span></li>)}</ul>}</CardBody></Card>
    </div>
  </>);
}
