import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, QrCode, ShieldCheck, Star, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useApi } from '../lib/hooks';
import { fmtDate, fmtDateTime } from '../lib/utils';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Field, Input, KV, Modal, PageHeader, SkeletonRows, StatusBadge, Textarea, useToast } from '../components/ui';
import { DynamicForm } from '../components/common';

const ADMIN_ROLES = ['MANUFACTURER_ADMIN', 'SUPPLIER_ADMIN', 'RETAIL_MANAGER', 'DISTRIBUTOR_MANAGER', 'TRANSPORTER'];

export function ProfilePage() {
  const { t } = useTranslation(); const { company, me } = useAuth(); const toast = useToast();
  const q = useApi<any>('/company/profile'); const members = useApi<{ items: any[] }>('/company/members');
  const isAdmin = ADMIN_ROLES.includes(company?.role ?? ''); const [cert, setCert] = useState(false);
  const save = useAction((v: any) => api.put('/company/profile', v), { invalidate: ['/company/profile'], success: t('common.saved') });
  const addCert = useAction((v: any) => api.post('/company/certifications', { ...v, validTo: v.validTo ? new Date(v.validTo).toISOString() : undefined, validFrom: v.validFrom ? new Date(v.validFrom).toISOString() : undefined }), { invalidate: ['/company/profile'], success: t('prof.certDeclared'), onSuccess: () => setCert(false) });
  const delCert = useAction((id: string) => api.del(`/company/certifications/${id}`), { invalidate: ['/company/profile'], success: t('common.done') });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const chg = useAction(() => api.post('/auth/change-password', pw), { success: t('prof.pwChanged'), onSuccess: () => setTimeout(() => { localStorage.removeItem('tf_token'); location.href = '/login'; }, 1200) });
  if (q.isLoading) return <SkeletonRows />; if (q.error) return <ErrorState error={q.error} />;
  const c = q.data; const fields = [{ name: 'phone', label: t('f.phone') }, { name: 'address', label: t('f.address') }, { name: 'city', label: t('f.city') }, { name: 'wilaya', label: t('f.wilaya') }, { name: 'website', label: t('prof.website') }, { name: 'description', label: t('f.description'), type: 'textarea' as const }, { name: 'publicDescription', label: t('prof.publicDesc'), type: 'textarea' as const }, { name: 'history', label: t('prof.history'), type: 'textarea' as const }];
  return (<>
    <PageHeader title={c.name} subtitle={`${t(`ctype.${c.type}`)} · ${me?.email}`} actions={<StatusBadge status={c.status} />} />
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2"><CardHeader title={t('prof.company')} /><CardBody>{isAdmin ? <DynamicForm fields={fields} initial={Object.fromEntries(fields.map((f) => [f.name, c[f.name] ?? '']))} submitting={save.isPending} onCancel={() => undefined} onSubmit={(v) => save.mutate(v)} /> : <p className="text-sm text-mutedfg">{t('prof.readonly')}</p>}</CardBody></Card>
      <div className="space-y-4">
        <Card><CardHeader title={t('prof.team')} /><CardBody><ul className="space-y-2 text-sm">{members.data?.items.map((m) => <li key={m.id} className="flex justify-between"><span>{m.fullName}<span className="block text-xs text-mutedfg">{m.email}</span></span><Badge>{m.roleName}</Badge></li>)}</ul></CardBody></Card>
        <Card><CardHeader title={t('prof.password')} /><CardBody className="space-y-2"><Input type="password" placeholder={t('prof.current')} value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /><Input type="password" placeholder={t('auth.newPassword')} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /><Button loading={chg.isPending} disabled={!pw.currentPassword || pw.newPassword.length < 10} onClick={() => chg.mutate(undefined)}>{t('common.save')}</Button></CardBody></Card></div>
    </div>
    <Card className="mt-4"><CardHeader title={t('prof.certs')} subtitle={t('prof.certsSub')} action={isAdmin && <Button size="sm" onClick={() => setCert(true)}><Plus className="h-3.5 w-3.5" />{t('prof.declare')}</Button>} />
      <CardBody>{!c.certifications.length ? <p className="text-sm text-mutedfg">{t('common.empty')}</p> : <ul className="divide-y divide-line">{c.certifications.map((x: any) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span><b>{x.name}</b> <span className="text-mutedfg">{x.issuer} {x.number && `· ${x.number}`} {x.validTo && `· → ${fmtDate(x.validTo)}`}</span></span><span className="flex items-center gap-2">{x.verified ? <Badge tone="ok"><ShieldCheck className="me-1 h-3 w-3" />{t('admin.verified')}</Badge> : <Badge tone="warn">{t('admin.toVerify')}</Badge>}{isAdmin && <Button size="sm" variant="ghost" onClick={() => delCert.mutate(x.id)}><Trash2 className="h-3.5 w-3.5 text-danger" /></Button>}</span></li>)}</ul>}</CardBody></Card>
    <Modal open={cert} onClose={() => setCert(false)} title={t('prof.declare')}><DynamicForm submitting={addCert.isPending} onCancel={() => setCert(false)} onSubmit={(v) => addCert.mutate(v)} fields={[{ name: 'name', label: t('f.name'), required: true }, { name: 'issuer', label: t('cert.issuer') }, { name: 'number', label: 'N°' }, { name: 'validFrom', label: t('cert.validFrom'), type: 'date' }, { name: 'validTo', label: t('cert.validTo'), type: 'date' }]} /></Modal>
  </>);
}

export function NotificationsPage() {
  const { t } = useTranslation(); const q = useApi<{ items: any[] }>('/notifications');
  const read = useAction((id: string) => api.post(`/notifications/${id}/read`), { invalidate: ['/notifications'] });
  return (<>
    <PageHeader title={t('nav.notifications')} />
    <Card>{q.isLoading ? <SkeletonRows /> : !q.data?.items.length ? <EmptyState title={t('notif.none')} /> : <ul className="divide-y divide-line">{q.data.items.map((n) => <li key={n.id} className={`flex items-start justify-between gap-3 px-4 py-3 text-sm ${n.readAt ? 'opacity-60' : ''}`}><div><div className="flex items-center gap-2"><StatusBadge status={n.severity} /><b>{n.title}</b></div>{n.message && <p className="text-mutedfg">{n.message}</p>}<p className="text-xs text-mutedfg">{fmtDateTime(n.createdAt)}</p></div>{!n.readAt && <Button size="sm" variant="ghost" onClick={() => read.mutate(n.id)}>{t('notif.read')}</Button>}</li>)}</ul>}</Card>
  </>);
}

export function ConsumerPage() {
  const { t } = useTranslation(); const { me } = useAuth();
  const p = useApi<any>('/consumer/profile'); const fb = useApi<any>('/consumer/feedback');
  const [name, setName] = useState<string | null>(null); const [age, setAge] = useState<string | null>(null); const [pub, setPub] = useState<boolean | null>(null);
  const save = useAction(() => api.put('/consumer/profile', { displayName: name ?? p.data?.displayName, age: (age ?? String(p.data?.age ?? '')) === '' ? null : Number(age ?? p.data?.age), showNamePublicly: pub ?? !!p.data?.showNamePublicly }), { invalidate: ['/consumer/profile'], success: t('common.saved') });
  return (<>
    <PageHeader title={t('nav.myspace')} subtitle={me?.email} actions={<Link to="/scan"><Button><QrCode className="h-4 w-4" />{t('nav.scan')}</Button></Link>} />
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader title={t('cons.profile')} /><CardBody className="space-y-3">{p.isLoading ? <SkeletonRows rows={3} /> : <>
        <Field label={t('auth.displayName')}><Input value={name ?? p.data?.displayName ?? ''} onChange={(e) => setName(e.target.value)} /></Field><Field label={t('cons.age')}><Input type="number" value={age ?? p.data?.age ?? ''} onChange={(e) => setAge(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" checked={pub ?? !!p.data?.showNamePublicly} onChange={(e) => setPub(e.target.checked)} />{t('cons.showName')}</label><Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('common.save')}</Button></>}</CardBody></Card>
      <Card><CardHeader title={t('cons.feedback')} />{fb.isLoading ? <SkeletonRows rows={3} /> : !fb.data?.complaints.length && !fb.data?.reviews.length ? <EmptyState title={t('cons.noFeedback')} hint={t('cons.noFeedbackHint')} /> : <ul className="divide-y divide-line text-sm">
        {fb.data.reviews.map((r: any) => <li key={r.id} className="px-4 py-2.5"><div className="flex items-center gap-1">{Array.from({ length: r.rating }, (_, i) => <Star key={i} className="h-3.5 w-3.5 fill-warn text-warn" />)}<b className="ms-2">{r.product.name}</b></div>{r.comment && <p>{r.comment}</p>}<p className="text-xs text-mutedfg">{fmtDate(r.createdAt)}</p></li>)}
        {fb.data.complaints.map((c: any) => <li key={c.id} className="px-4 py-2.5"><div className="flex justify-between"><b>{t(`fb.${c.type}`)} {c.batch && `· ${c.batch.batchNumber}`}</b><StatusBadge status={c.status} /></div><p>{c.message}</p><p className="text-xs text-mutedfg">{fmtDate(c.createdAt)}</p></li>)}</ul>}</Card></div>
  </>);
}
