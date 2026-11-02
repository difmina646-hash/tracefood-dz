import { ReactNode, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { GitBranch, Languages, Moon, Sun } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';
import { setLang, Lang } from '../i18n';
import { useTheme } from '../components/Layout';
import { Alert, Button, Field, Input, Select } from '../components/ui';

export function AuthShell({ title, subtitle, children, wide }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; wide?: boolean }) {
  const { i18n, t } = useTranslation(); const { dark, toggle } = useTheme();
  const lang = (i18n.language === 'ar' ? 'ar' : 'fr') as Lang;
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden bg-navy p-10 text-navyfg lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold"><span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-brandfg"><GitBranch className="h-5 w-5" /></span>TraceFood DZ</Link>
        <div><h2 className="text-3xl font-bold leading-tight">{t('auth.hero')}</h2>
          <p className="mt-4 max-w-md text-sm opacity-80">{t('auth.heroSub')}</p></div>
        <p className="text-xs opacity-60">{t('auth.dz')}</p>
      </div>
      <div className="flex flex-col p-4 sm:p-8">
        <div className="mb-6 flex justify-end gap-1"><button onClick={() => setLang(lang === 'fr' ? 'ar' : 'fr')} className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm hover:bg-muted"><Languages className="h-4 w-4" />{lang === 'fr' ? 'العربية' : 'Français'}</button><button onClick={toggle} className="rounded-lg p-2 hover:bg-muted" aria-label="theme">{dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button></div>
        <div className={`m-auto w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}><h1 className="text-2xl font-bold">{title}</h1>{subtitle && <p className="mb-6 mt-1 text-sm text-mutedfg">{subtitle}</p>}{children}</div>
      </div>
    </div>
  );
}

const DEMO = [['admin@tracefood.dz', 'Super admin'], ['admin@laiterie.demo', 'Fabricant'], ['qualite@laiterie.demo', 'Qualité'], ['operateur@laiterie.demo', 'Production'], ['fournisseur@baraka.demo', 'Fournisseur'], ['transport@froid.demo', 'Transport'], ['distribution@alger.demo', 'Distribution'], ['magasin@elamel.demo', 'Magasin'], ['consommateur@demo.dz', 'Consommateur']];

export function LoginPage() {
  const { t } = useTranslation(); const { login, me } = useAuth(); const nav = useNavigate();
  const schema = z.object({ email: z.string().email(t('val.email')), password: z.string().min(1, t('common.required')) });
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  if (me) return <Navigate to={me.isConsumer ? '/app/consumer' : '/app'} replace />;
  return (
    <AuthShell title={t('auth.login')} subtitle={t('auth.loginSub')}>
      <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => { setBusy(true); setErr(''); try { const m = await login(v.email, v.password); nav(m.isConsumer ? '/app/consumer' : '/app'); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } })}>
        {err && <Alert tone="danger">{err}</Alert>}
        <Field label={t('f.email')} error={errors.email?.message}><Input type="email" autoComplete="username" {...register('email')} /></Field>
        <Field label={t('auth.password')} error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
        <Button className="w-full" loading={busy} onClick={handleSubmit(async (v) => { setBusy(true); setErr(''); try { const m = await login(v.email, v.password); nav(m.isConsumer ? '/app/consumer' : '/app'); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } })}>{t('auth.login')}</Button>
        <div className="flex justify-between text-sm"><Link className="text-brand hover:underline" to="/forgot">{t('auth.forgot')}</Link><Link className="text-brand hover:underline" to="/">{t('auth.backHome')}</Link></div>
      </form>
      <div className="mt-6 border-t border-line pt-4 text-sm"><p className="mb-2 text-mutedfg">{t('auth.noAccount')}</p><div className="flex flex-wrap gap-2"><Link to="/register"><Button variant="outline" size="sm">{t('auth.regCompany')}</Button></Link><Link to="/register-consumer"><Button variant="outline" size="sm">{t('auth.regConsumer')}</Button></Link></div></div>
      {import.meta.env.DEV && (
        <details className="mt-6 rounded-lg border border-dashed border-line p-3 text-xs"><summary className="cursor-pointer font-medium">{t('auth.demo')}</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">{DEMO.map(([e, l]) => <button key={e} className="rounded-md bg-muted px-2 py-1 hover:bg-line" onClick={() => { setValue('email', e); setValue('password', 'Demo@12345'); }}>{l}</button>)}</div>
          <p className="mt-2 text-mutedfg">{t('auth.demoHint')}</p></details>)}
    </AuthShell>
  );
}

const pwd = (t: any) => z.string().min(10, t('val.pwdLen')).regex(/[A-Za-z]/, t('val.pwdLetter')).regex(/[0-9]/, t('val.pwdDigit'));

export function RegisterCompanyPage() {
  const { t } = useTranslation(); const [done, setDone] = useState(false); const [err, setErr] = useState('');
  const req = t('common.required');
  const schema = z.object({ cName: z.string().min(2, req), cType: z.string().min(1, req), cEmail: z.string().email(t('val.email')), phone: z.string().optional(), wilaya: z.string().optional(), registrationNumber: z.string().optional(), fullName: z.string().min(2, req), email: z.string().email(t('val.email')), password: pwd(t) });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  if (done) return <AuthShell title={t('auth.regDone')}><Alert tone="ok">{t('auth.regDoneMsg')}</Alert><Link to="/login" className="mt-4 inline-block text-brand hover:underline">{t('auth.login')}</Link></AuthShell>;
  return (
    <AuthShell wide title={t('auth.regCompany')} subtitle={t('auth.regCompanySub')}>
      <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => { setErr(''); try { await api.post('/auth/register-company', { company: { name: v.cName, type: v.cType, email: v.cEmail, phone: v.phone || undefined, wilaya: v.wilaya || undefined, registrationNumber: v.registrationNumber || undefined }, user: { fullName: v.fullName, email: v.email, password: v.password } }); setDone(true); } catch (e) { setErr(errMsg(e)); } })}>
        {err && <Alert tone="danger">{err}</Alert>}
        <p className="text-sm font-semibold">{t('auth.company')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('f.name')} error={errors.cName?.message}><Input {...register('cName')} /></Field>
          <Field label={t('auth.companyType')} error={errors.cType?.message}><Select {...register('cType')}><option value="">—</option>{['MANUFACTURER', 'SUPPLIER', 'TRANSPORTER', 'DISTRIBUTOR', 'RETAILER'].map((x) => <option key={x} value={x}>{t(`ctype.${x}`)}</option>)}</Select></Field>
          <Field label={t('auth.companyEmail')} error={errors.cEmail?.message}><Input type="email" {...register('cEmail')} /></Field>
          <Field label={t('f.phone')}><Input {...register('phone')} /></Field>
          <Field label={t('f.wilaya')}><Input {...register('wilaya')} /></Field>
          <Field label={t('auth.rc')}><Input {...register('registrationNumber')} /></Field>
        </div>
        <p className="pt-2 text-sm font-semibold">{t('auth.admin')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('auth.fullName')} error={errors.fullName?.message}><Input {...register('fullName')} /></Field>
          <Field label={t('f.email')} error={errors.email?.message}><Input type="email" autoComplete="username" {...register('email')} /></Field>
          <Field label={t('auth.password')} error={errors.password?.message} hint={t('auth.pwdHint')}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
        </div>
        <Button className="w-full" loading={isSubmitting} type="submit">{t('auth.sendRequest')}</Button>
        <Link to="/login" className="block text-center text-sm text-brand hover:underline">{t('auth.haveAccount')}</Link>
      </form>
    </AuthShell>
  );
}

export function RegisterConsumerPage() {
  const { t } = useTranslation(); const nav = useNavigate(); const [err, setErr] = useState('');
  const schema = z.object({ displayName: z.string().min(2, t('common.required')), email: z.string().email(t('val.email')), password: pwd(t) });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  return (
    <AuthShell title={t('auth.regConsumer')} subtitle={t('auth.regConsumerSub')}>
      <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => { setErr(''); try { await api.post('/auth/register-consumer', { ...v, language: document.documentElement.lang === 'ar' ? 'ar' : 'fr' }); nav('/login'); } catch (e) { setErr(errMsg(e)); } })}>
        {err && <Alert tone="danger">{err}</Alert>}
        <Field label={t('auth.displayName')} error={errors.displayName?.message}><Input {...register('displayName')} /></Field>
        <Field label={t('f.email')} error={errors.email?.message}><Input type="email" {...register('email')} /></Field>
        <Field label={t('auth.password')} error={errors.password?.message}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
        <Button className="w-full" type="submit" loading={isSubmitting}>{t('auth.create')}</Button>
      </form>
    </AuthShell>
  );
}

export function ForgotPage() {
  const { t } = useTranslation(); const [sent, setSent] = useState(false); const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <AuthShell title={t('auth.forgot')} subtitle={t('auth.forgotSub')}>
      {sent ? <Alert tone="ok">{t('auth.forgotSent')}</Alert> : (
        <div className="space-y-4"><Field label={t('f.email')}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button className="w-full" loading={busy} disabled={!email.includes('@')} onClick={async () => { setBusy(true); try { await api.post('/auth/forgot-password', { email }); setSent(true); } finally { setBusy(false); } }}>{t('auth.sendLink')}</Button></div>)}
      <p className="mt-4 text-sm"><Link to="/reset" className="text-brand hover:underline">{t('auth.haveToken')}</Link> · <Link to="/login" className="text-brand hover:underline">{t('auth.login')}</Link></p>
    </AuthShell>
  );
}

export function ResetPage() {
  const { t } = useTranslation(); const [sp] = useSearchParams(); const nav = useNavigate();
  const [token, setToken] = useState(sp.get('token') ?? ''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <AuthShell title={t('auth.reset')}>
      <div className="space-y-4">{err && <Alert tone="danger">{err}</Alert>}
        <Field label={t('auth.token')}><Input value={token} onChange={(e) => setToken(e.target.value)} /></Field>
        <Field label={t('auth.newPassword')} hint={t('auth.pwdHint')}><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Button className="w-full" loading={busy} onClick={async () => { setBusy(true); setErr(''); try { await api.post('/auth/reset-password', { token, newPassword: pw }); nav('/login'); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } }}>{t('common.save')}</Button></div>
    </AuthShell>
  );
}
