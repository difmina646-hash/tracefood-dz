import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, ShieldCheck, ListPlus } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useApi } from '../lib/hooks';
import { fmtDate, fmtNum, UNITS } from '../lib/utils';
import { Alert, Badge, Button, Card, EmptyState, Modal, PageHeader, SkeletonRows, StatusBadge, TableWrap, Td, Th, Field, Input, Select } from '../components/ui';
import { CrudPage, DynamicForm, FieldDef, unitOptions } from '../components/common';

export function SuppliersPage() {
  const { t } = useTranslation(); const { can } = useAuth();
  return <CrudPage title={t('nav.suppliers')} subtitle={t('master.suppliersSub')} path="/suppliers" canWrite={can('master:write')}
    columns={[{ header: t('f.name'), cell: (r) => <b>{r.name}</b> }, { header: t('f.contact'), cell: (r) => r.contactName ?? '—' }, { header: t('f.phone'), cell: (r) => r.phone ?? '—' }, { header: t('f.wilaya'), cell: (r) => r.wilaya ?? '—' }, { header: t('f.approved'), cell: (r) => <StatusBadge status={r.approved ? 'ACTIVE' : 'SUSPENDED'} /> }]}
    fields={[{ name: 'name', label: t('f.name'), required: true }, { name: 'contactName', label: t('f.contact') }, { name: 'email', label: t('f.email'), type: 'email' }, { name: 'phone', label: t('f.phone') }, { name: 'address', label: t('f.address') }, { name: 'wilaya', label: t('f.wilaya') }, { name: 'approved', label: t('f.approved'), type: 'checkbox' }, { name: 'notes', label: t('f.notes'), type: 'textarea' }]} />;
}

export function MaterialsPage() {
  const { t } = useTranslation(); const { can } = useAuth();
  const [specFor, setSpecFor] = useState<any>(null);
  const addSpec = useAction((v: any) => api.post(`/materials/${specFor.id}/specifications`, v), { invalidate: ['/materials'], success: t('common.saved'), onSuccess: () => setSpecFor(null) });
  const specFields: FieldDef[] = [{ name: 'parameter', label: t('master.parameter'), required: true }, { name: 'minValue', label: t('f.min'), type: 'number' }, { name: 'maxValue', label: t('f.max'), type: 'number' }, { name: 'unit', label: t('f.unit') }, { name: 'notes', label: t('f.notes') }];
  return (<>
    <CrudPage title={t('nav.materials')} subtitle={t('master.materialsSub')} path="/materials" canWrite={can('master:write')}
      columns={[{ header: t('f.code'), cell: (r) => <b>{r.code}</b> }, { header: t('f.name'), cell: (r) => r.name }, { header: t('f.category'), cell: (r) => r.category ?? '—' }, { header: t('f.unit'), cell: (r) => t(`unit.${r.defaultUnit}`) }, { header: t('f.storage'), cell: (r) => r.storageRequirements ?? '—' },
        { header: t('master.specs'), cell: (r) => r.specifications?.length ? <span className="text-xs">{r.specifications.map((s: any) => `${s.parameter}${s.minValue != null ? ` ≥${fmtNum(s.minValue)}` : ''}${s.maxValue != null ? ` ≤${fmtNum(s.maxValue)}` : ''}`).join(' · ')}</span> : '—' }]}
      fields={[{ name: 'code', label: t('f.code'), required: true }, { name: 'name', label: t('f.name'), required: true }, { name: 'category', label: t('f.category') }, { name: 'defaultUnit', label: t('f.unit'), type: 'select', options: unitOptions(t), required: true }, { name: 'storageRequirements', label: t('f.storage') }, { name: 'shelfLifeDays', label: t('f.shelfLife'), type: 'number' }]}
      rowActions={(r) => can('master:write') && <Button size="sm" variant="ghost" onClick={() => setSpecFor(r)} title={t('master.addSpec')}><ListPlus className="h-3.5 w-3.5" /></Button>} />
    <Modal open={!!specFor} onClose={() => setSpecFor(null)} title={`${t('master.addSpec')} — ${specFor?.name ?? ''}`}>{specFor && <DynamicForm fields={specFields} submitting={addSpec.isPending} onCancel={() => setSpecFor(null)} onSubmit={(v) => addSpec.mutate(v)} />}</Modal>
  </>);
}

export function ProductsPage() {
  const { t } = useTranslation(); const { can } = useAuth();
  const [varFor, setVarFor] = useState<any>(null);
  const addVar = useAction((v: any) => api.post(`/products/${varFor.id}/variants`, v), { invalidate: ['/products'], success: t('common.saved'), onSuccess: () => setVarFor(null) });
  return (<>
    <CrudPage title={t('nav.products')} subtitle={t('master.productsSub')} path="/products" canWrite={can('master:write')}
      columns={[{ header: t('f.sku'), cell: (r) => <b>{r.sku}</b> }, { header: t('f.name'), cell: (r) => r.name }, { header: t('f.category'), cell: (r) => r.category ?? '—' }, { header: t('f.shelfLife'), cell: (r) => r.shelfLifeDays }, { header: t('master.variants'), cell: (r) => r.variants?.map((v: any) => v.name).join(', ') || '—' }]}
      fields={[{ name: 'sku', label: t('f.sku'), required: true }, { name: 'name', label: t('f.name'), required: true }, { name: 'category', label: t('f.category') }, { name: 'shelfLifeDays', label: t('f.shelfLife'), type: 'number', required: true }, { name: 'unit', label: t('f.unit'), type: 'select', options: unitOptions(t) },
        { name: 'description', label: t('f.description'), type: 'textarea' }, { name: 'publicDescription', label: t('f.publicDescription'), type: 'textarea' }, { name: 'manufacturingSummary', label: t('f.mfgSummary'), type: 'textarea' }]}
      rowActions={(r) => can('master:write') && <Button size="sm" variant="ghost" onClick={() => setVarFor(r)} title={t('master.addVariant')}><ListPlus className="h-3.5 w-3.5" /></Button>} />
    <Modal open={!!varFor} onClose={() => setVarFor(null)} title={`${t('master.addVariant')} — ${varFor?.name ?? ''}`}>{varFor && <DynamicForm fields={[{ name: 'code', label: t('f.code'), required: true }, { name: 'name', label: t('f.name'), required: true }]} submitting={addVar.isPending} onCancel={() => setVarFor(null)} onSubmit={(v) => addVar.mutate(v)} />}</Modal>
  </>);
}

export function LocationsPage() {
  const { t } = useTranslation(); const { can, company } = useAuth();
  const types: Record<string, string[]> = { MANUFACTURER: ['FACTORY', 'WAREHOUSE'], DISTRIBUTOR: ['DISTRIBUTION_CENTER', 'WAREHOUSE'], RETAILER: ['STORE', 'WAREHOUSE'], SUPPLIER: ['SUPPLIER_SITE', 'WAREHOUSE'], TRANSPORTER: ['WAREHOUSE'] };
  const q = useApi<{ items: any[] }>('/locations');
  const [open, setOpen] = useState(false);
  const create = useAction((v: any) => api.post('/locations', v), { invalidate: ['/locations'], success: t('common.saved'), onSuccess: () => setOpen(false) });
  const allowed = types[company?.type ?? ''] ?? [];
  const canWrite = can('master:write') || can('inventory:write');
  return (<>
    <PageHeader title={t('nav.locations')} subtitle={t('master.locationsSub')} actions={canWrite && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t('common.new')}</Button>} />
    <Card>{q.isLoading ? <SkeletonRows /> : !q.data?.items.length ? <EmptyState title={t('common.empty')} /> : (
      <TableWrap><thead><tr><Th>{t('f.name')}</Th><Th>{t('f.type')}</Th><Th>{t('f.city')}</Th><Th>{t('f.wilaya')}</Th><Th>{t('f.address')}</Th></tr></thead>
        <tbody>{q.data.items.map((l) => <tr key={l.id}><Td><b>{l.name}</b></Td><Td><Badge tone="info">{t(`loc.${l.type}`)}</Badge></Td><Td>{l.city ?? '—'}</Td><Td>{l.wilaya ?? '—'}</Td><Td>{l.address ?? '—'}</Td></tr>)}</tbody></TableWrap>)}</Card>
    <Modal open={open} onClose={() => setOpen(false)} title={t('common.new')} wide>
      <DynamicForm fields={[{ name: 'name', label: t('f.name'), required: true }, { name: 'type', label: t('f.type'), type: 'select', required: true, options: allowed.map((x) => ({ value: x, label: t(`loc.${x}`) })) }, { name: 'city', label: t('f.city') }, { name: 'wilaya', label: t('f.wilaya') }, { name: 'address', label: t('f.address') },
        ...(allowed.includes('STORE') ? [{ name: 'openingHours', label: t('f.hours') } as FieldDef, { name: 'phone', label: t('f.phone') } as FieldDef, { name: 'publicListing', label: t('f.publicListing'), type: 'checkbox' } as FieldDef] : [])]}
        submitting={create.isPending} onCancel={() => setOpen(false)} onSubmit={(v) => create.mutate(v)} />
    </Modal>
  </>);
}

export function TransportersPage() {
  const { t } = useTranslation(); const { can } = useAuth();
  const dir = useApi<{ items: any[] }>('/directory/companies', { type: 'TRANSPORTER' });
  return <CrudPage title={t('nav.transporters')} subtitle={t('master.transportersSub')} path="/transporters" canWrite={can('master:write')}
    columns={[{ header: t('f.name'), cell: (r) => <b>{r.name}</b> }, { header: t('f.phone'), cell: (r) => r.phone ?? '—' }, { header: t('f.vehicle'), cell: (r) => r.vehicleInfo ?? '—' }, { header: t('f.refrigerated'), cell: (r) => (r.refrigerated ? '❄️' : '—') }, { header: t('f.linked'), cell: (r) => (r.linkedCompanyId ? <Badge tone="ok">{t('common.yes')}</Badge> : '—') }]}
    fields={[{ name: 'name', label: t('f.name'), required: true }, { name: 'phone', label: t('f.phone') }, { name: 'vehicleInfo', label: t('f.vehicle') }, { name: 'refrigerated', label: t('f.refrigerated'), type: 'checkbox' },
      { name: 'linkedCompanyId', label: t('f.linkedCompany'), type: 'select', options: (dir.data?.items ?? []).map((c) => ({ value: c.id, label: c.name })) }]} />;
}

export function QualityParamsPage() {
  const { t } = useTranslation(); const { can } = useAuth();
  const validate = useAction((id: string) => api.post(`/quality-parameters/${id}/validate`), { invalidate: ['/quality-parameters'], success: t('qp.validated') });
  return (<>
    <Alert tone="warn" className="mb-4" title={t('qp.warnTitle')}>{t('qp.warn')}</Alert>
    <CrudPage title={t('nav.qparams')} path="/quality-parameters" canWrite={can('master:write')}
      columns={[{ header: t('f.code'), cell: (r) => <b>{r.code}</b> }, { header: t('f.name'), cell: (r) => r.name }, { header: t('f.scope'), cell: (r) => t(`scope.${r.scope}`) }, { header: t('f.limits'), cell: (r) => (r.paramType === 'NUMERIC' ? `${r.minValue != null ? fmtNum(r.minValue) : '−∞'} → ${r.maxValue != null ? fmtNum(r.maxValue) : '+∞'} ${r.unit ?? ''}` : t(`ptype.${r.paramType}`)) },
        { header: t('f.mandatory'), cell: (r) => (r.mandatory ? <Badge tone="warn">{t('common.yes')}</Badge> : '—') }, { header: t('qp.validation'), cell: (r) => (r.validatedAt ? <Badge tone="ok">{fmtDate(r.validatedAt)}</Badge> : <Badge tone="warn">{t('qp.notValidated')}</Badge>) }]}
      fields={[{ name: 'code', label: t('f.code'), required: true }, { name: 'name', label: t('f.name'), required: true }, { name: 'paramType', label: t('f.type'), type: 'select', options: ['NUMERIC', 'BOOLEAN', 'TEXT'].map((x) => ({ value: x, label: t(`ptype.${x}`) })) }, { name: 'scope', label: t('f.scope'), type: 'select', options: ['RAW_MATERIAL', 'FINISHED_PRODUCT', 'BOTH'].map((x) => ({ value: x, label: t(`scope.${x}`) })) },
        { name: 'unit', label: t('f.unit') }, { name: 'minValue', label: t('f.min'), type: 'number' }, { name: 'maxValue', label: t('f.max'), type: 'number' }, { name: 'mandatory', label: t('f.mandatory'), type: 'checkbox' }]}
      rowActions={(r) => can('quality:release') && !r.validatedAt && <Button size="sm" variant="outline" loading={validate.isPending} onClick={() => validate.mutate(r.id)}><ShieldCheck className="h-3.5 w-3.5" />{t('qp.validate')}</Button>} />
  </>);
}

export function RecipesPage() {
  const { t } = useTranslation(); const { can } = useAuth();
  const q = useApi<{ items: any[] }>('/recipes');
  const products = useApi<{ items: any[] }>('/products', { pageSize: 100 });
  const materials = useApi<{ items: any[] }>('/materials', { pageSize: 100 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ productId: '', name: '', outputQty: '', outputUnit: 'POT', ingredients: [{ materialId: '', quantity: '', unit: 'L' }] });
  const create = useAction(() => api.post('/recipes', { ...form, outputQty: Number(form.outputQty), ingredients: form.ingredients.map((i: any) => ({ ...i, quantity: Number(i.quantity) })) }), { invalidate: ['/recipes'], success: t('common.saved'), onSuccess: () => setOpen(false) });
  const setIng = (i: number, k: string, v: string) => setForm((f: any) => ({ ...f, ingredients: f.ingredients.map((x: any, j: number) => (j === i ? { ...x, [k]: v, ...(k === 'materialId' ? { unit: materials.data?.items.find((m) => m.id === v)?.defaultUnit ?? x.unit } : {}) } : x)) }));
  const ok = form.productId && form.name && Number(form.outputQty) > 0 && form.ingredients.every((i: any) => i.materialId && Number(i.quantity) > 0);
  return (<>
    <PageHeader title={t('nav.recipes')} subtitle={t('recipe.sub')} actions={can('master:write') && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t('common.new')}</Button>} />
    <div className="grid gap-4 md:grid-cols-2">{q.isLoading ? <SkeletonRows /> : !q.data?.items.length ? <Card><EmptyState title={t('common.empty')} /></Card> : q.data.items.map((r) => (
      <Card key={r.id} className="p-4"><div className="flex items-start justify-between"><div><p className="font-semibold">{r.name}</p><p className="text-xs text-mutedfg">{r.product.name} · v{r.version}</p></div><Badge tone="info">{fmtNum(r.outputQty)} {t(`unit.${r.outputUnit}`)}</Badge></div>
        <ul className="mt-3 space-y-1 text-sm">{r.ingredients.map((i: any) => <li key={i.id} className="flex justify-between border-b border-line py-1 last:border-0"><span>{i.material.name}</span><span className="font-medium">{fmtNum(i.quantity)} {t(`unit.${i.unit}`)}</span></li>)}</ul></Card>))}</div>
    <Modal open={open} onClose={() => setOpen(false)} wide title={t('recipe.new')} footer={<><Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button disabled={!ok} loading={create.isPending} onClick={() => create.mutate(undefined)}>{t('common.save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('f.product')}><Select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}><option value="">—</option>{products.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label={t('f.name')}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label={t('recipe.outQty')}><Input type="number" value={form.outputQty} onChange={(e) => setForm({ ...form, outputQty: e.target.value })} /></Field>
        <Field label={t('f.unit')}><Select value={form.outputUnit} onChange={(e) => setForm({ ...form, outputUnit: e.target.value })}>{unitOptions(t).map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</Select></Field>
      </div>
      <p className="mb-2 mt-4 text-sm font-semibold">{t('recipe.ingredients')}</p>
      {form.ingredients.map((i: any, idx: number) => (
        <div key={idx} className="mb-2 grid grid-cols-[1fr_90px_90px_auto] gap-2">
          <Select value={i.materialId} onChange={(e) => setIng(idx, 'materialId', e.target.value)}><option value="">—</option>{materials.data?.items.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
          <Input type="number" value={i.quantity} onChange={(e) => setIng(idx, 'quantity', e.target.value)} />
          <Select value={i.unit} onChange={(e) => setIng(idx, 'unit', e.target.value)}>{UNITS.map((u) => <option key={u} value={u}>{t(`unit.${u}`)}</option>)}</Select>
          <Button variant="ghost" size="sm" disabled={form.ingredients.length === 1} onClick={() => setForm({ ...form, ingredients: form.ingredients.filter((_: any, j: number) => j !== idx) })}>✕</Button>
        </div>))}
      <Button size="sm" variant="outline" onClick={() => setForm({ ...form, ingredients: [...form.ingredients, { materialId: '', quantity: '', unit: 'L' }] })}><Plus className="h-3.5 w-3.5" />{t('recipe.addIng')}</Button>
    </Modal>
  </>);
}
