import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Camera, CheckCircle2, Factory, GitBranch, Languages, MapPin, QrCode, ShieldCheck, Star, Store, Tag, XCircle } from 'lucide-react';
import { api, ApiError, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { setLang, Lang } from '../../i18n';
import { fmtDate } from '../../lib/utils';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Skeleton, Textarea, useToast } from '../../components/ui';

/** Accepts a full QR URL (…/q/<id>) or the bare identifier. */
export const parseCode = (s: string) => { const m = s.trim().match(/\/q\/([A-Za-z0-9_-]{8,32})/); if (m) return m[1]; return /^[A-Za-z0-9_-]{8,32}$/.test(s.trim()) ? s.trim() : null; };

function PublicShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation(); const { me } = useAuth();
  const lang = (i18n.language === 'ar' ? 'ar' : 'fr') as Lang;
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-navy text-navyfg"><div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-bold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brandfg"><GitBranch className="h-4 w-4" /></span>TraceFood DZ</Link>
        <div className="flex items-center gap-1 text-sm"><button onClick={() => setLang(lang === 'fr' ? 'ar' : 'fr')} className="flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10"><Languages className="h-4 w-4" />{lang === 'fr' ? 'العربية' : 'Français'}</button>
          <Link className="rounded px-2 py-1 hover:bg-white/10" to={me ? (me.isConsumer ? '/app/consumer' : '/app') : '/login'}>{me ? t('pub.myspace') : t('auth.login')}</Link></div></div></header>
      <main className="mx-auto max-w-4xl p-4 sm:p-6">{children}</main>
    </div>
  );
}

export function PublicHome() {
  const { t } = useTranslation(); const nav = useNavigate(); const [v, setV] = useState(''); const [err, setErr] = useState('');
  const go = () => { const id = parseCode(v); if (id) nav(`/q/${id}`); else setErr(t('pub.badCode')); };
  return (
    <PublicShell>
      <section className="py-8 text-center sm:py-14">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand/15 text-brand"><QrCode className="h-8 w-8" /></span>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('pub.title')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-mutedfg">{t('pub.sub')}</p>
        <div className="mx-auto mt-6 flex max-w-lg flex-col gap-2 sm:flex-row"><Input value={v} onChange={(e) => { setV(e.target.value); setErr(''); }} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder={t('pub.placeholder')} aria-label={t('pub.placeholder')} /><Button onClick={go}>{t('pub.consult')}</Button></div>
        {err && <p className="mt-2 text-sm text-danger">{err}</p>}
        <Link to="/scan" className="mt-4 inline-flex items-center gap-2 text-sm text-brand hover:underline"><Camera className="h-4 w-4" />{t('pub.scanCamera')}</Link>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">{[[Factory, t('pub.f1'), t('pub.f1d')], [Tag, t('pub.f2'), t('pub.f2d')], [Store, t('pub.f3'), t('pub.f3d')]].map(([I, a, b]: any) => <Card key={a} className="p-4"><I className="h-5 w-5 text-brand" /><p className="mt-2 font-semibold">{a}</p><p className="text-sm text-mutedfg">{b}</p></Card>)}</section>
      <p className="mt-8 text-center text-xs text-mutedfg">{t('pub.disclaimerShort')}</p>
      <p className="mt-4 text-center text-sm"><Link className="text-brand hover:underline" to="/login">{t('pub.pro')}</Link></p>
    </PublicShell>
  );
}

export function ScanPage() {
  const { t } = useTranslation(); const nav = useNavigate(); const video = useRef<HTMLVideoElement>(null); const [msg, setMsg] = useState('');
  useEffect(() => {
    let stream: MediaStream | undefined; let stop = false;
    (async () => {
      const BD = (window as any).BarcodeDetector;
      if (!BD) { setMsg(t('pub.noDetector')); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        const det = new BD({ formats: ['qr_code'] });
        const tick = async () => { if (stop || !video.current) return; try { const r = await det.detect(video.current); const id = r[0] && parseCode(r[0].rawValue); if (id) { nav(`/q/${id}`); return; } } catch { /* frame not ready */ } requestAnimationFrame(tick); };
        tick();
      } catch { setMsg(t('pub.noCamera')); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((x) => x.stop()); };
  }, [nav, t]);
  return <PublicShell><h1 className="mb-4 text-xl font-bold">{t('pub.scanCamera')}</h1>{msg ? <Alert tone="warn">{msg}</Alert> : <video ref={video} className="aspect-square w-full max-w-md rounded-xl bg-black object-cover" playsInline muted />}<p className="mt-4"><Link to="/" className="text-brand hover:underline">{t('pub.enterCode')}</Link></p></PublicShell>;
}

export function QrPage() {
  const { t } = useTranslation(); const { id } = useParams();
  const q = useApi<any>(id ? `/public/qr/${id}` : null);
  const err = q.error as ApiError | null;
  return (
    <PublicShell>
      {q.isLoading ? <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>
        : err ? <Card className="p-8 text-center"><XCircle className="mx-auto h-10 w-10 text-danger" /><h1 className="mt-3 text-lg font-bold">{err.code === 'QR_INACTIVE' ? t('pub.inactive') : err.code === 'QR_UNKNOWN' ? t('pub.unknown') : t('pub.error')}</h1>
            <p className="mt-1 text-sm text-mutedfg">{err.code === 'QR_INACTIVE' ? t('pub.inactiveHint') : err.code === 'QR_UNKNOWN' ? t('pub.unknownHint') : err.message}</p><Link to="/" className="mt-4 inline-block text-brand hover:underline">{t('pub.again')}</Link></Card>
        : q.data && <QrBody d={q.data} id={id!} />}
    </PublicShell>
  );
}

function QrBody({ d, id }: { d: any; id: string }) {
  const { t } = useTranslation();
  const st = d.batch.status as string;
  return (
    <div className="space-y-4">
      <div><p className="text-sm text-mutedfg">{d.manufacturer.name}</p><h1 className="text-2xl font-bold sm:text-3xl">{d.product.name}</h1>{d.product.description && <p className="mt-1 text-mutedfg">{d.product.description}</p>}</div>
      {st === 'OK' ? <Alert tone="ok" title={t('pub.statusOk')}>{t('pub.statusOkHint')}</Alert>
        : <Alert tone="danger" title={st === 'EXPIRED' ? t('pub.expired') : t('pub.review')}>{d.batch.notice ?? t('pub.unknownStatus')}</Alert>}
      <Card><CardHeader title={t('pub.batch')} /><CardBody><dl className="grid gap-3 sm:grid-cols-3">{[[t('pub.batchNo'), d.batch.number], [t('pub.producedAt'), fmtDate(d.batch.producedAt)], [t('pub.expiry'), fmtDate(d.batch.expiryDate)]].map(([k, v]) => <div key={k as string}><dt className="text-xs text-mutedfg">{k}</dt><dd className="font-semibold">{v}</dd></div>)}</dl>{d.product.varieties?.length > 0 && <p className="mt-3 text-sm text-mutedfg">{t('pub.varieties')} : {d.product.varieties.join(', ')}</p>}</CardBody></Card>
      <Card><CardHeader title={t('pub.manufacturer')} /><CardBody className="space-y-3">
        <p className="font-semibold">{d.manufacturer.name} {d.manufacturer.city && <span className="font-normal text-mutedfg">— {d.manufacturer.city}{d.manufacturer.wilaya ? `, ${d.manufacturer.wilaya}` : ''}</span>}</p>
        {d.manufacturer.description && <p className="text-sm">{d.manufacturer.description}</p>}{d.manufacturer.history && <p className="text-sm text-mutedfg">{d.manufacturer.history}</p>}
        {d.manufacturer.certifications.length > 0 ? <div><p className="mb-1 text-xs font-medium text-mutedfg">{t('pub.certs')}</p><div className="flex flex-wrap gap-2">{d.manufacturer.certifications.map((c: any, i: number) => <Badge key={i} tone="ok"><ShieldCheck className="me-1 h-3 w-3" />{c.name}{c.validTo ? ` · ${fmtDate(c.validTo)}` : ''}</Badge>)}</div></div> : <p className="text-xs text-mutedfg">{t('pub.noCerts')}</p>}
      </CardBody></Card>
      {d.processSteps.length > 0 && <Card><CardHeader title={t('pub.process')} subtitle={d.product.manufacturingSummary} /><CardBody><ol className="flex flex-wrap gap-2">{d.processSteps.map((s: string, i: number) => <li key={i} className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm"><CheckCircle2 className="h-3.5 w-3.5 text-ok" />{s}</li>)}</ol></CardBody></Card>}
      <Card><CardHeader title={t('pub.where')} /><CardBody>{d.availability.stores.length ? <ul className="grid gap-2 sm:grid-cols-2">{d.availability.stores.map((s: any) => <li key={s.id} className="rounded-lg border border-line p-3 text-sm"><p className="flex items-center gap-1 font-semibold"><MapPin className="h-4 w-4 text-brand" />{s.name}</p><p className="text-mutedfg">{[s.address, s.city, s.wilaya].filter(Boolean).join(', ')}</p>{s.openingHours && <p className="text-xs text-mutedfg">{s.openingHours}</p>}{s.phone && <p className="text-xs">{s.phone}</p>}</li>)}</ul> : <p className="text-sm text-mutedfg">{t('pub.noStores')}</p>}</CardBody></Card>
      {d.promotions.length > 0 && <Card><CardHeader title={t('pub.promos')} /><CardBody className="space-y-2">{d.promotions.map((p: any, i: number) => <div key={i} className="rounded-lg bg-brand/10 p-3 text-sm"><p className="font-semibold">{p.title}{p.discountPercent ? ` — −${Number(p.discountPercent)}%` : ''} <span className="font-normal text-mutedfg">· {p.retailStore?.name}</span></p>{p.description && <p>{p.description}</p>}<p className="text-xs text-mutedfg">{fmtDate(p.startsAt)} → {fmtDate(p.endsAt)}</p></div>)}</CardBody></Card>}
      <Feedback id={id} />
      <p className="flex gap-2 rounded-lg bg-muted p-3 text-xs text-mutedfg"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{d.disclaimer}</p>
    </div>
  );
}

function Feedback({ id }: { id: string }) {
  const { t } = useTranslation(); const toast = useToast(); const { me } = useAuth();
  const [type, setType] = useState('REVIEW'); const [rating, setRating] = useState(5); const [message, setMessage] = useState(''); const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  if (done) return <Alert tone="ok">{t('pub.thanks')}</Alert>;
  return (
    <Card><CardHeader title={t('pub.feedback')} subtitle={me?.isConsumer ? t('pub.linked') : t('pub.anon')} /><CardBody className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2"><Field label={t('pub.kind')}><Select value={type} onChange={(e) => setType(e.target.value)}>{['REVIEW', 'QUESTION', 'COMPLAINT', 'SAFETY_SIGNAL'].map((x) => <option key={x} value={x}>{t(`fb.${x}`)}</option>)}</Select></Field>
        {type === 'REVIEW' ? <Field label={t('pub.rating')}><div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n}`}><Star className={`h-6 w-6 ${n <= rating ? 'fill-warn text-warn' : 'text-mutedfg'}`} /></button>)}</div></Field>
          : <Field label={t('pub.contact')}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>}</div>
      {type === 'SAFETY_SIGNAL' && <Alert tone="warn">{t('pub.safetyHint')}</Alert>}
      <Field label={t('pub.yourMessage')}><Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} /></Field>
      <Button loading={busy} disabled={message.trim().length < 3} onClick={async () => { setBusy(true); try { await api.post(`/public/qr/${id}/feedback`, { type, message, rating: type === 'REVIEW' ? rating : undefined, contactEmail: email || undefined }); setDone(true); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } }}>{t('pub.send')}</Button>
    </CardBody></Card>
  );
}
