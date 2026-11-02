import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Copy, Download, GitBranch, Plus, Printer, QrCode, Trash2, Wand2, Ban } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAction, useApi } from '../../lib/hooks';
import { addDays, fmtDate, fmtDateTime, fmtNum, toInputDate, toInputDateTime, UNITS } from '../../lib/utils';
import { Alert, Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, Input, KV, Modal, PageHeader, Pagination, Select, SkeletonRows, StatusBadge, TableWrap, Td, Th, Toolbar, useToast } from '../../components/ui';
import { DynamicForm, usePaged, useDebounced } from '../../components/common';
import { QualityPanel } from '../../components/QualityPanel';

export function OrdersPage() {
  const { t } = useTranslation(); const { can } = useAuth(); const nav = useNavigate();
  const l = usePaged('/production-orders'); const products = useApi<{ items: any[] }>('/products', { pageSize: 100 });
  const [open, setOpen] = useState(false);
  const create = useAction((v: any) => api.post('/production-orders', { ...v, plannedDate: new Date(v.plannedDate).toISOString() }), { invalidate: ['/production-orders'], success: t('common.saved'), onSuccess: () => setOpen(false) });
  return (<>
    <PageHeader title={t('nav.orders')} subtitle={t('orders.sub')} actions={can('production:write') && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t('common.new')}</Button>} />
    <Card>{l.isLoading ? <SkeletonRows /> : l.error ? <ErrorState error={l.error} /> : !l.items.length ? <EmptyState title={t('common.empty')} /> : <TableWrap><thead><tr><Th>N°</Th><Th>{t('f.product')}</Th><Th>{t('orders.planned')}</Th><Th>{t('f.quantity')}</Th><Th>{t('f.status')}</Th><Th /></tr></thead>
      <tbody>{l.items.map((o: any) => <tr key={o.id}><Td><b>{o.orderNumber}</b></Td><Td>{o.product.name}</Td><Td>{fmtDate(o.plannedDate)}</Td><Td>{fmtNum(o.plannedQty)} {t(`unit.${o.unit}`)}</Td><Td><StatusBadge status={o.status} /></Td><Td>{can('production:write') && o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && <Button size="sm" variant="outline" onClick={() => nav(`/app/batches/new?orderId=${o.id}&productId=${o.productId}&qty=${o.plannedQty}`)}>{t('orders.makeBatch')}</Button>}</Td></tr>)}</tbody></TableWrap>}
      <Pagination page={l.page} pageSize={l.pageSize} total={l.total} onChange={l.setPage} /></Card>
    <Modal open={open} onClose={() => setOpen(false)} title={t('orders.new')}><DynamicForm submitting={create.isPending} onCancel={() => setOpen(false)} onSubmit={(v) => create.mutate(v)}
      fields={[{ name: 'productId', label: t('f.product'), type: 'select', required: true, options: (products.data?.items ?? []).map((p) => ({ value: p.id, label: p.name })) }, { name: 'plannedQty', label: t('f.quantity'), type: 'number', required: true }, { name: 'unit', label: t('f.unit'), type: 'select', required: true, options: UNITS.map((u) => ({ value: u, label: t(`unit.${u}`) })) }, { name: 'plannedDate', label: t('orders.planned'), type: 'date', required: true }]} /></Modal>
  </>);
}

export function BatchesPage() {
  const { t } = useTranslation(); const { can } = useAuth();
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const dq = useDebounced(q);
  const l = usePaged('/batches', { q: dq || undefined, status: status || undefined });
  return (<>
    <PageHeader title={t('nav.batches')} subtitle={t('batches.sub')} actions={can('production:write') && <Link to="/app/batches/new"><Button><Plus className="h-4 w-4" />{t('batches.new')}</Button></Link>} />
    <Card><Toolbar><Input className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('batches.search')} /><Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t('common.allStatus')}</option>{['PENDING', 'RELEASED', 'BLOCKED', 'REJECTED'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select></Toolbar>
      {l.isLoading ? <SkeletonRows /> : l.error ? <ErrorState error={l.error} /> : !l.items.length ? <EmptyState title={t('common.empty')} /> : <TableWrap><thead><tr><Th>{t('f.batch')}</Th><Th>{t('f.product')}</Th><Th>{t('batches.produced')}</Th><Th>{t('f.quantity')}</Th><Th>{t('rec.expiry')}</Th><Th>{t('f.status')}</Th></tr></thead>
        <tbody>{l.items.map((b: any) => <tr key={b.id} className="hover:bg-muted/40"><Td><Link className="font-semibold text-brand" to={`/app/batches/${b.id}`}>{b.batchNumber}</Link></Td><Td>{b.product.name}{b.variant && <span className="text-xs text-mutedfg"> · {b.variant.name}</span>}</Td><Td>{fmtDateTime(b.producedAt)}</Td><Td>{fmtNum(b.producedQty)} {t(`unit.${b.unit}`)}</Td><Td>{fmtDate(b.expiryDate)}</Td><Td><StatusBadge status={b.status} /></Td></tr>)}</tbody></TableWrap>}
      <Pagination page={l.page} pageSize={l.pageSize} total={l.total} onChange={l.setPage} /></Card>
  </>);
}

export function BatchNewPage() {
  const { t } = useTranslation(); const nav = useNavigate(); const [sp] = useSearchParams(); const toast = useToast();
  const products = useApi<{ items: any[] }>('/products', { pageSize: 100 }); const locations = useApi<{ items: any[] }>('/locations');
  const lots = useApi<{ items: any[] }>('/lots', { status: 'RELEASED', pageSize: 100 }); const recipes = useApi<{ items: any[] }>('/recipes');
  const req = t('common.required');
  const schema = z.object({
    productId: z.string().min(1, req), variantId: z.string().optional(), factoryLocationId: z.string().min(1, req), batchNumber: z.string().optional(),
    producedAt: z.string().min(1, req), producedQty: z.coerce.number({ invalid_type_error: req }).positive(t('val.positive')), unit: z.string().min(1), expiryDate: z.string().min(1, req), notes: z.string().optional(),
    materials: z.array(z.object({ lotId: z.string().min(1, req), quantity: z.coerce.number({ invalid_type_error: req }).positive(t('val.positive')), unit: z.string().min(1) })).min(1, t('batches.needLot')),
    steps: z.array(z.object({ name: z.string().min(1, req), temperatureC: z.union([z.literal(''), z.coerce.number()]).optional(), durationMin: z.union([z.literal(''), z.coerce.number().int()]).optional(), notes: z.string().optional() })),
  });
  type F = z.infer<typeof schema>;
  const { register, control, handleSubmit, watch, setValue, getValues, formState: { errors } } = useForm<F>({ resolver: zodResolver(schema), defaultValues: { productId: sp.get('productId') ?? '', producedAt: toInputDateTime(), producedQty: sp.get('qty') ? Number(sp.get('qty')) : (undefined as never), unit: 'POT', materials: [{ lotId: '', quantity: undefined as never, unit: 'L' }], steps: [] } });
  const mats = useFieldArray({ control, name: 'materials' }); const steps = useFieldArray({ control, name: 'steps' });
  const productId = watch('productId'); const producedAt = watch('producedAt'); const product = products.data?.items.find((p) => p.id === productId);
  const [recipeId, setRecipeId] = useState('');
  const factories = (locations.data?.items ?? []).filter((l) => l.type === 'FACTORY' || l.type === 'WAREHOUSE');
  useEffect(() => { if (product) { setValue('unit', product.unit); if (producedAt) setValue('expiryDate', toInputDate(addDays(producedAt, product.shelfLifeDays))); } }, [product?.id, producedAt]); // eslint-disable-line
  useEffect(() => { if (factories.length === 1) setValue('factoryLocationId', factories[0].id); }, [factories.length]); // eslint-disable-line

  /** FEFO allocation: for each recipe ingredient, take from released lots with the earliest expiry first. */
  const applyRecipe = () => {
    const r = recipes.data?.items.find((x) => x.id === recipeId); const qty = Number(getValues('producedQty'));
    if (!r || !qty) return toast.error(t('batches.recipeNeedQty'));
    const pool = [...(lots.data?.items ?? [])].filter((l) => Number(l.remainingQty) > 0 && (!l.expiryDate || new Date(l.expiryDate) >= new Date())).sort((a, b) => (a.expiryDate ? +new Date(a.expiryDate) : Infinity) - (b.expiryDate ? +new Date(b.expiryDate) : Infinity));
    const left = new Map(pool.map((l) => [l.id, Number(l.remainingQty)])); const out: any[] = []; const missing: string[] = [];
    for (const ing of r.ingredients) {
      let need = (Number(ing.quantity) * qty) / Number(r.outputQty);
      for (const l of pool.filter((x) => x.materialId === ing.materialId && x.unit === ing.unit)) {
        if (need <= 0) break; const take = Math.min(need, left.get(l.id) ?? 0); if (take <= 0) continue;
        out.push({ lotId: l.id, quantity: Math.round(take * 10000) / 10000, unit: l.unit }); left.set(l.id, (left.get(l.id) ?? 0) - take); need -= take;
      }
      if (need > 0.0001) missing.push(`${ing.material.name} (${fmtNum(need)} ${t(`unit.${ing.unit}`)})`);
    }
    mats.replace(out.length ? out : [{ lotId: '', quantity: undefined as never, unit: 'L' }]);
    if (missing.length) toast.error(`${t('batches.insufficient')} : ${missing.join(', ')}`); else toast.success(t('batches.recipeApplied'));
  };
  const create = useAction((v: F) => api.post('/batches', {
    productId: v.productId, variantId: v.variantId || undefined, orderId: sp.get('orderId') || undefined, factoryLocationId: v.factoryLocationId, batchNumber: v.batchNumber || undefined,
    producedAt: new Date(v.producedAt).toISOString(), producedQty: v.producedQty, unit: v.unit, expiryDate: new Date(v.expiryDate).toISOString(), notes: v.notes || undefined,
    materials: v.materials, steps: v.steps.map((s) => ({ name: s.name, temperatureC: s.temperatureC === '' ? undefined : s.temperatureC, durationMin: s.durationMin === '' ? undefined : s.durationMin, notes: s.notes || undefined })),
  }), { invalidate: ['/batches', '/lots', '/production-orders', '/dashboard'], success: t('batches.created'), onSuccess: (b) => nav(`/app/batches/${b.id}`) });
  const lotOptions = lots.data?.items ?? [];

  return (<>
    <PageHeader title={t('batches.new')} subtitle={t('batches.newSub')} />
    <form noValidate onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-4">
      <Card><CardHeader title={t('batches.general')} /><CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('f.product')} error={errors.productId?.message}><Select {...register('productId')}><option value="">—</option>{products.data?.items.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label={t('master.variants')}><Select {...register('variantId')}><option value="">—</option>{product?.variants?.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
        <Field label={t('batches.factory')} error={errors.factoryLocationId?.message}><Select {...register('factoryLocationId')}><option value="">—</option>{factories.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
        <Field label={t('batches.number')} hint={t('rec.autoLot')}><Input {...register('batchNumber')} /></Field>
        <Field label={t('batches.producedAt')} error={errors.producedAt?.message}><Input type="datetime-local" {...register('producedAt')} /></Field>
        <Field label={t('f.quantity')} error={errors.producedQty?.message}><Input type="number" step="any" {...register('producedQty')} /></Field>
        <Field label={t('f.unit')}><Select {...register('unit')}>{UNITS.map((u) => <option key={u} value={u}>{t(`unit.${u}`)}</option>)}</Select></Field>
        <Field label={t('rec.expiry')} error={errors.expiryDate?.message} hint={product ? `${t('batches.shelf')} : ${product.shelfLifeDays} j` : undefined}><Input type="date" {...register('expiryDate')} /></Field></CardBody></Card>

      <Card><CardHeader title={t('batches.materials')} subtitle={t('batches.materialsSub')}
        action={<div className="flex items-center gap-2"><Select className="h-8 w-48 text-xs" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}><option value="">{t('batches.recipe')}</option>{recipes.data?.items.filter((r) => !productId || r.productId === productId).map((r) => <option key={r.id} value={r.id}>{r.name} v{r.version}</option>)}</Select><Button size="sm" variant="outline" disabled={!recipeId} onClick={applyRecipe}><Wand2 className="h-3.5 w-3.5" />{t('batches.applyRecipe')}</Button></div>} />
        <CardBody className="space-y-2">
          {!lotOptions.length && !lots.isLoading && <Alert tone="warn">{t('batches.noReleased')} <Link className="underline" to="/app/lots">{t('nav.lots')}</Link></Alert>}
          {mats.fields.map((f, i) => { const lot = lotOptions.find((l) => l.id === watch(`materials.${i}.lotId`)); return (
            <div key={f.id} className="grid items-start gap-2 sm:grid-cols-[1fr_130px_110px_auto]">
              <Field error={errors.materials?.[i]?.lotId?.message} hint={lot ? `${t('lots.remaining')}: ${fmtNum(lot.remainingQty)} ${t(`unit.${lot.unit}`)} · ${t('rec.expiry')}: ${fmtDate(lot.expiryDate)}` : undefined}><Select {...register(`materials.${i}.lotId`, { onChange: (e) => { const l = lotOptions.find((x) => x.id === e.target.value); if (l) setValue(`materials.${i}.unit`, l.unit); } })}><option value="">{t('batches.chooseLot')}</option>{lotOptions.map((l) => <option key={l.id} value={l.id}>{l.internalLotNumber} — {l.material.name}</option>)}</Select></Field>
              <Field error={errors.materials?.[i]?.quantity?.message}><Input type="number" step="any" placeholder={t('f.quantity')} {...register(`materials.${i}.quantity`)} /></Field>
              <Select {...register(`materials.${i}.unit`)}>{UNITS.map((u) => <option key={u} value={u}>{t(`unit.${u}`)}</option>)}</Select>
              <Button variant="ghost" size="sm" disabled={mats.fields.length === 1} onClick={() => mats.remove(i)} aria-label="remove"><Trash2 className="h-4 w-4 text-danger" /></Button></div>); })}
          {errors.materials?.message && <p className="text-xs text-danger">{errors.materials.message}</p>}
          <Button size="sm" variant="outline" onClick={() => mats.append({ lotId: '', quantity: undefined as never, unit: 'L' })}><Plus className="h-3.5 w-3.5" />{t('batches.addLot')}</Button></CardBody></Card>

      <Card><CardHeader title={t('batches.steps')} action={<Button size="sm" variant="outline" onClick={() => steps.append({ name: '', temperatureC: '', durationMin: '', notes: '' })}><Plus className="h-3.5 w-3.5" />{t('batches.addStep')}</Button>} />
        <CardBody className="space-y-2">{!steps.fields.length && <p className="text-sm text-mutedfg">{t('batches.stepsHint')}</p>}
          {steps.fields.map((f, i) => <div key={f.id} className="grid gap-2 sm:grid-cols-[1.4fr_110px_110px_1fr_auto]"><Field error={errors.steps?.[i]?.name?.message}><Input placeholder={t('batches.stepName')} {...register(`steps.${i}.name`)} /></Field><Input type="number" step="any" placeholder="°C" {...register(`steps.${i}.temperatureC`)} /><Input type="number" placeholder="min" {...register(`steps.${i}.durationMin`)} /><Input placeholder={t('f.notes')} {...register(`steps.${i}.notes`)} /><Button variant="ghost" size="sm" onClick={() => steps.remove(i)}><Trash2 className="h-4 w-4 text-danger" /></Button></div>)}
          <Field label={t('f.notes')}><Input {...register('notes')} /></Field></CardBody></Card>
      <div className="flex justify-end"><Button type="submit" loading={create.isPending}>{t('batches.create')}</Button></div>
    </form>
  </>);
}

export function BatchDetailPage() {
  const { t } = useTranslation(); const { id } = useParams(); const { can } = useAuth(); const toast = useToast();
  const q = useApi<any>(`/batches/${id}`);
  const qr = q.data?.productQrCodes?.[0]; const [img, setImg] = useState<string>(''); const [confirmQr, setConfirmQr] = useState(false);
  useEffect(() => { let url = ''; if (qr?.active) api.blobUrl(`/batches/${id}/qr?format=png`).then((u) => { url = u; setImg(u); }).catch(() => setImg('')); return () => { if (url) URL.revokeObjectURL(url); }; }, [id, qr?.publicId, qr?.active]);
  const deact = useAction(() => api.post(`/batches/${id}/qr/deactivate`), { invalidate: [`/batches/${id}`], success: t('qr.deactivated'), onSuccess: () => setConfirmQr(false) });
  const publicUrl = qr ? `${window.location.origin}/q/${qr.publicId}` : '';
  if (q.isLoading) return <SkeletonRows />; if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const b = q.data; const stock = (b.inventoryBalances ?? []).filter((x: any) => Number(x.quantity) > 0);
  return (<>
    <PageHeader title={<span className="flex items-center gap-3">{b.batchNumber}<StatusBadge status={b.status} /></span>} subtitle={`${b.product.name}${b.variant ? ` · ${b.variant.name}` : ''}`}
      actions={can('trace:read') && <><Link to={`/app/trace?type=batch&id=${b.id}&dir=backward&label=${encodeURIComponent(b.batchNumber)}`}><Button variant="outline"><GitBranch className="h-4 w-4" />{t('trace.backward')}</Button></Link><Link to={`/app/trace?type=batch&id=${b.id}&dir=forward&label=${encodeURIComponent(b.batchNumber)}`}><Button variant="outline"><GitBranch className="h-4 w-4 rotate-180" />{t('trace.forward')}</Button></Link></>} />
    {b.blockedReason && b.status !== 'RELEASED' && <Alert tone="danger" className="mb-4" title={t('lot.blockedReason')}>{b.blockedReason}</Alert>}
    <div className="grid gap-4 lg:grid-cols-3">
      <Card><CardHeader title={t('lot.info')} /><CardBody><dl><KV k={t('batches.producedAt')} v={fmtDateTime(b.producedAt)} /><KV k={t('f.quantity')} v={`${fmtNum(b.producedQty)} ${t(`unit.${b.unit}`)}`} /><KV k={t('rec.expiry')} v={fmtDate(b.expiryDate)} /><KV k={t('batches.factory')} v={b.factoryLocation?.name} /><KV k={t('batches.releasedAt')} v={b.releasedAt ? fmtDateTime(b.releasedAt) : '—'} /></dl>
        {b.notes && <p className="mt-2 text-sm text-mutedfg">{b.notes}</p>}</CardBody></Card>
      <div className="lg:col-span-2"><QualityPanel kind="BATCH" id={b.id} status={b.status} checks={b.qualityChecks} results={b.qualityResults ?? []} invalidate={[`/batches/${id}`, '/batches', '/dashboard', '/inventory']} /></div>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card><CardHeader title={t('batches.materials')} />{!b.batchMaterials.length ? <p className="p-4 text-sm text-mutedfg">—</p> : <ul className="divide-y divide-line">{b.batchMaterials.map((m: any) => <li key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm"><span>{can('reception:read') ? <Link className="font-semibold text-brand" to={`/app/lots/${m.materialLot.id}`}>{m.materialLot.internalLotNumber}</Link> : <b>{m.materialLot.internalLotNumber}</b>} <span className="text-mutedfg">{m.materialLot.material.name} · {m.materialLot.supplier.name}</span></span><span className="font-medium">{fmtNum(m.quantity)} {t(`unit.${m.unit}`)}</span></li>)}</ul>}</Card>
      <Card><CardHeader title={t('batches.steps')} />{!b.productionSteps.length ? <p className="p-4 text-sm text-mutedfg">—</p> : <ol className="divide-y divide-line">{b.productionSteps.map((s: any) => <li key={s.id} className="flex justify-between gap-2 px-4 py-2.5 text-sm"><span><b>{s.stepOrder}. {s.name}</b>{s.notes && <span className="block text-xs text-mutedfg">{s.notes}</span>}</span><span className="text-xs text-mutedfg">{s.temperatureC != null && `${fmtNum(s.temperatureC)} °C`} {s.durationMin != null && `· ${s.durationMin} min`}</span></li>)}</ol>}</Card>
      <Card><CardHeader title={t('batches.stock')} />{!stock.length ? <p className="p-4 text-sm text-mutedfg">{t('batches.noStock')}</p> : <ul className="divide-y divide-line">{stock.map((x: any) => <li key={x.id} className="flex justify-between px-4 py-2.5 text-sm"><span>{x.location.name}</span><b>{fmtNum(x.quantity)} {t(`unit.${x.unit}`)}</b></li>)}</ul>}</Card>
      <Card><CardHeader title={<span className="flex items-center gap-2"><QrCode className="h-4 w-4" />{t('qr.title')}</span>} />
        <CardBody>{!qr ? <p className="text-sm text-mutedfg">{t('qr.afterRelease')}</p> : (
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="print-area flex w-48 shrink-0 flex-col items-center rounded-lg border border-line bg-white p-3 text-center text-black">{img ? <img src={img} alt="QR" className="h-40 w-40" /> : <div className="skeleton h-40 w-40" />}<p className="mt-1 text-xs font-bold">{b.product.name}</p><p className="text-[11px]">{b.batchNumber} · {fmtDate(b.expiryDate)}</p><p className="break-all text-[9px] text-gray-500">{qr.publicId}</p></div>
            <div className="space-y-2 text-sm"><p className="break-all text-xs text-mutedfg">{publicUrl}</p><p>{t('qr.scans')} : <b>{qr.scanCount}</b> · {qr.active ? <Badge tone="ok">{t('status.ACTIVE')}</Badge> : <Badge tone="danger">{t('qr.inactive')}</Badge>}</p>
              <div className="no-print flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => api.download(`/batches/${id}/qr?format=png`, `qr-${b.batchNumber}.png`).catch(() => toast.error('Error'))}><Download className="h-3.5 w-3.5" />PNG</Button><Button size="sm" variant="outline" onClick={() => api.download(`/batches/${id}/qr?format=svg`, `qr-${b.batchNumber}.svg`).catch(() => toast.error('Error'))}><Download className="h-3.5 w-3.5" />SVG</Button><Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" />{t('qr.print')}</Button><Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(publicUrl).then(() => toast.success(t('qr.copied')))}><Copy className="h-3.5 w-3.5" />{t('qr.copy')}</Button><a href={`/q/${qr.publicId}`} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">{t('qr.preview')}</Button></a>{can('quality:release') && qr.active && <Button size="sm" variant="danger" onClick={() => setConfirmQr(true)}><Ban className="h-3.5 w-3.5" />{t('qr.deactivate')}</Button>}</div>
              <p className="text-xs text-mutedfg">{t('qr.note')}</p></div></div>)}</CardBody></Card>
    </div>
    <ConfirmDialog open={confirmQr} danger onClose={() => setConfirmQr(false)} loading={deact.isPending} onConfirm={() => deact.mutate(undefined)} title={t('qr.deactivate')} message={t('qr.deactivateMsg')} />
  </>);
}
