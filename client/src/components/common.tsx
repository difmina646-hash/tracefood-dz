import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Download, Paperclip, Plus, Pencil, Search } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { Button, Card, EmptyState, ErrorState, Field, Input, Modal, Pagination, Select, SkeletonRows, TableWrap, Td, Textarea, Th, Toolbar, useToast, PageHeader } from './ui';

export function useDebounced<T>(v: T, ms = 350) { const [d, setD] = useState(v); useEffect(() => { const h = setTimeout(() => setD(v), ms); return () => clearTimeout(h); }, [v, ms]); return d; }

/** Generic paged list: returns data + paging state wired to the `{items,total,page,pageSize}` envelope of the API. */
export function usePaged<T = any>(path: string, extra: Record<string, unknown> = {}, pageSize = 20) {
  const [page, setPage] = useState(1);
  const key = JSON.stringify(extra);
  useEffect(() => setPage(1), [key]);
  const q = useApi<{ items: T[]; total: number; page: number; pageSize: number }>(path, { ...extra, page, pageSize });
  return { ...q, page, setPage, pageSize, items: q.data?.items ?? [], total: q.data?.total ?? 0 };
}

// ───────────── Documents ─────────────
export function DocUpload({ kind = 'LAB_REPORT', target, onUploaded, label }: { kind?: string; target?: Record<string, string>; onUploaded?: (doc: { id: string; originalName: string }) => void; label?: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm hover:bg-muted">
      <Paperclip className="h-4 w-4" />{busy ? t('common.uploading') : label ?? t('doc.attach')}
      <input type="file" className="sr-only" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
        if (f.size > 10 * 1024 * 1024) return toast.error(t('doc.tooBig'));
        const fd = new FormData(); fd.append('kind', kind); Object.entries(target ?? {}).forEach(([k, v]) => fd.append(k, v)); fd.append('file', f);
        setBusy(true);
        try { const d = await api.upload('/documents', fd); toast.success(t('doc.uploaded')); onUploaded?.(d); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
      }} />
    </label>
  );
}
export const DocLink = ({ doc }: { doc: { id: string; originalName: string } }) => (
  <button className="inline-flex items-center gap-1 text-brand hover:underline" onClick={() => api.download(`/documents/${doc.id}/download`, doc.originalName).catch((e) => alert(errMsg(e)))}><Download className="h-3.5 w-3.5" />{doc.originalName}</button>
);

// ───────────── Generic CRUD page ─────────────
export interface FieldDef { name: string; label: string; type?: 'text' | 'number' | 'email' | 'select' | 'textarea' | 'checkbox' | 'date'; options?: { value: string; label: string }[]; required?: boolean; step?: string; hint?: string; editable?: boolean }
export interface Col { header: string; cell: (r: any) => ReactNode }

export function DynamicForm({ fields, initial, onSubmit, submitting, onCancel, submitLabel }: { fields: FieldDef[]; initial?: Record<string, any>; onSubmit: (v: Record<string, any>) => void; submitting?: boolean; onCancel: () => void; submitLabel?: string }) {
  const { t } = useTranslation();
  const schema = useMemo(() => z.object(Object.fromEntries(fields.map((f) => {
    const req = t('common.required');
    let s: z.ZodTypeAny;
    if (f.type === 'number') s = z.preprocess((v) => (v === '' || v === null || v === undefined || Number.isNaN(v) ? undefined : Number(v)), f.required ? z.number({ required_error: req, invalid_type_error: req }) : z.number().optional());
    else if (f.type === 'checkbox') s = z.boolean().optional();
    else s = f.required ? z.string().trim().min(1, req) : z.string().optional();
    return [f.name, s];
  }))), [fields, t]);
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: initial ?? {} });
  const clean = (v: Record<string, any>) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined && x !== null));
  return (
    <form onSubmit={handleSubmit((v) => onSubmit(clean(v)))} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.name} label={<>{f.label}{f.required && <span className="text-danger"> *</span>}</>} error={(errors as any)[f.name]?.message as string} hint={f.hint} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
            {f.type === 'select' ? <Select {...register(f.name)}><option value="">—</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
              : f.type === 'textarea' ? <Textarea {...register(f.name)} />
              : f.type === 'checkbox' ? <input type="checkbox" className="h-4 w-4 accent-brand" {...register(f.name)} />
              : <Input type={f.type === 'number' ? 'number' : f.type ?? 'text'} step={f.step ?? (f.type === 'number' ? 'any' : undefined)} {...register(f.name)} />}
          </Field>))}
      </div>
      <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button><Button loading={submitting} onClick={handleSubmit((v) => onSubmit(clean(v)))}>{submitLabel ?? t('common.save')}</Button></div>
    </form>
  );
}

export function CrudPage({ title, subtitle, path, columns, fields, canWrite, searchable = true, rowActions, headerExtra, newLabel, params }: {
  title: string; subtitle?: string; path: string; columns: Col[]; fields: FieldDef[]; canWrite: boolean; searchable?: boolean; rowActions?: (r: any) => ReactNode; headerExtra?: ReactNode; newLabel?: string; params?: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const list = usePaged(path, { q: dq || undefined, ...params });
  const [editing, setEditing] = useState<any | null | 'new'>(null);
  const save = useAction((v: Record<string, any>) => (editing && editing !== 'new' ? api.put(`${path}/${editing.id}`, v) : api.post(path, v)), { invalidate: [path], success: t('common.saved'), onSuccess: () => setEditing(null) });
  const initial = editing && editing !== 'new' ? Object.fromEntries(fields.map((f) => [f.name, editing[f.name] ?? (f.type === 'checkbox' ? false : '')])) : undefined;
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={<>{headerExtra}{canWrite && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" />{newLabel ?? t('common.new')}</Button>}</>} />
      <Card>
        {searchable && <Toolbar><div className="relative w-full max-w-xs"><Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-mutedfg" /><Input className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} /></div></Toolbar>}
        {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} retry={() => list.refetch()} /> : !list.items.length ? <EmptyState title={t('common.empty')} hint={canWrite ? t('common.emptyHint') : undefined} /> : (
          <TableWrap><thead><tr>{columns.map((c) => <Th key={c.header}>{c.header}</Th>)}{(canWrite || rowActions) && <Th className="w-28" />}</tr></thead>
            <tbody>{list.items.map((r: any) => (<tr key={r.id} className="hover:bg-muted/40">{columns.map((c) => <Td key={c.header}>{c.cell(r)}</Td>)}
              {(canWrite || rowActions) && <Td><div className="flex justify-end gap-1">{rowActions?.(r)}{canWrite && <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label={t('common.edit')}><Pencil className="h-3.5 w-3.5" /></Button>}</div></Td>}</tr>))}</tbody></TableWrap>)}
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onChange={list.setPage} />
      </Card>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? (newLabel ?? t('common.new')) : t('common.edit')} wide>
        {editing && <DynamicForm fields={fields} initial={initial} submitting={save.isPending} onCancel={() => setEditing(null)} onSubmit={(v) => save.mutate(v)} />}
      </Modal>
    </>
  );
}

export const unitOptions = (t: (k: string) => string) => ['KG', 'G', 'L', 'ML', 'UNIT', 'POT', 'CARTON', 'PALLET'].map((u) => ({ value: u, label: t(`unit.${u}`) }));
