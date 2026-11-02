import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useState, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, X, XCircle, Inbox } from 'lucide-react';
import { cn, STATUS_TONE, Tone } from '../lib/utils';

// ───────────── Buttons ─────────────
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'; size?: 'sm' | 'md'; loading?: boolean };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(({ variant = 'primary', size = 'md', loading, className, children, disabled, ...p }, ref) => (
  <button ref={ref} type="button" disabled={disabled || loading} {...p}
    className={cn('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
      size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
      variant === 'primary' && 'bg-brand text-brandfg hover:opacity-90',
      variant === 'secondary' && 'bg-muted text-fg hover:bg-line',
      variant === 'outline' && 'border border-line bg-card text-fg hover:bg-muted',
      variant === 'danger' && 'bg-danger text-white hover:opacity-90',
      variant === 'ghost' && 'text-fg hover:bg-muted', className)}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}
  </button>
));

// ───────────── Form controls ─────────────
const ctl = 'w-full rounded-lg border border-line bg-card px-3 text-sm text-fg placeholder:text-mutedfg focus:border-brand disabled:opacity-60';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} {...p} className={cn(ctl, 'h-10', className)} />);
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} rows={3} {...p} className={cn(ctl, 'py-2', className)} />);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => <select ref={ref} {...p} className={cn(ctl, 'h-10', className)}>{children}</select>);

export function Field({ label, error, hint, children, className }: { label?: ReactNode; error?: string; hint?: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <label htmlFor={id} className="block text-xs font-medium text-mutedfg">{label}</label>}
      <div id={id}>{children}</div>
      {hint && !error && <p className="text-xs text-mutedfg">{hint}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// ───────────── Layout blocks ─────────────
export const Card = ({ className, children }: { className?: string; children: ReactNode }) => <div className={cn('rounded-xl border border-line bg-card shadow-card', className)}>{children}</div>;
export const CardHeader = ({ title, action, subtitle }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
    <div><h3 className="text-sm font-semibold">{title}</h3>{subtitle && <p className="text-xs text-mutedfg">{subtitle}</p>}</div>{action}
  </div>
);
export const CardBody = ({ className, children }: { className?: string; children: ReactNode }) => <div className={cn('p-4', className)}>{children}</div>;

export const PageHeader = ({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div><h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>{subtitle && <p className="mt-1 text-sm text-mutedfg">{subtitle}</p>}</div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

const TONES: Record<Tone, string> = {
  ok: 'bg-ok/15 text-ok', warn: 'bg-warn/15 text-warn', danger: 'bg-danger/15 text-danger', info: 'bg-info/15 text-info', neutral: 'bg-muted text-mutedfg',
};
export const Badge = ({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) => <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>{children}</span>;
export function StatusBadge({ status }: { status?: string | null }) {
  const { t } = useTranslation();
  if (!status) return <span className="text-mutedfg">—</span>;
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{t(`status.${status}`)}</Badge>;
}

export function Alert({ tone = 'info', title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const Icon = tone === 'danger' ? XCircle : tone === 'warn' ? AlertTriangle : tone === 'ok' ? CheckCircle2 : Info;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border p-3 text-sm', tone === 'danger' ? 'border-danger/40 bg-danger/10' : tone === 'warn' ? 'border-warn/40 bg-warn/10' : tone === 'ok' ? 'border-ok/40 bg-ok/10' : 'border-info/40 bg-info/10', className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0">{title && <p className="font-semibold">{title}</p>}{children && <div className="text-fg/90">{children}</div>}</div>
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, tone = 'neutral', hint }: { label: string; value: ReactNode; icon?: any; tone?: Tone; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="truncate text-xs font-medium text-mutedfg">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>{hint && <p className="mt-0.5 text-xs text-mutedfg">{hint}</p>}</div>
        {Icon && <span className={cn('rounded-lg p-2', TONES[tone])}><Icon className="h-5 w-5" /></span>}
      </div>
    </Card>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('skeleton h-4', className)} />;
export const SkeletonRows = ({ rows = 5 }: { rows?: number }) => <div className="space-y-3 p-4">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>;
export const Spinner = () => <Loader2 className="h-5 w-5 animate-spin text-mutedfg" />;
export function EmptyState({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return <div className="flex flex-col items-center gap-2 px-4 py-10 text-center"><Inbox className="h-9 w-9 text-mutedfg" /><p className="font-medium">{title}</p>{hint && <p className="max-w-md text-sm text-mutedfg">{hint}</p>}{action}</div>;
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useTranslation();
  return <div className="p-4"><Alert tone="danger" title={t('common.loadError')}>{(error as Error)?.message}{retry && <button className="ms-2 underline" onClick={retry}>{t('common.retry')}</button>}</Alert></div>;
}

// ───────────── Tables ─────────────
export const TableWrap = ({ children }: { children: ReactNode }) => <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">{children}</table></div>;
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => <th scope="col" className={cn('whitespace-nowrap bg-muted/60 px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-mutedfg', className)}>{children}</th>;
export const Td = ({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) => <td colSpan={colSpan} className={cn('border-t border-line px-3 py-2.5 align-middle', className)}>{children}</td>;

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2 text-xs text-mutedfg">
      <span>{t('common.pageOf', { page, pages, total })}</span>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t('common.prev')}><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></Button>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label={t('common.next')}><ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
      </div>
    </div>
  );
}

// ───────────── Tabs ─────────────
export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: ReactNode; count?: number }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', value === t.id ? 'border-brand text-brand' : 'border-transparent text-mutedfg hover:text-fg')}>
          {t.label}{t.count !== undefined && <span className="ms-1.5 rounded-full bg-muted px-1.5 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ───────────── Modal & confirm ─────────────
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f); document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', f); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={cn('flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-card shadow-xl sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-semibold">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button></div>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
export function ConfirmDialog({ open, title, message, confirmLabel, danger, loading, confirmDisabled, onConfirm, onClose }: { open: boolean; title: ReactNode; message?: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; confirmDisabled?: boolean; onConfirm: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} disabled={confirmDisabled} onClick={onConfirm}>{confirmLabel ?? t('common.confirm')}</Button></>}>
      <div className="text-sm">{message}</div>
    </Modal>
  );
}

// ───────────── Toasts ─────────────
interface Toast { id: number; tone: 'ok' | 'danger' | 'info'; text: string }
const ToastCtx = createContext<{ success: (t: string) => void; error: (t: string) => void; info: (t: string) => void }>(null as never);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random(); setItems((x) => [...x, { id, tone, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'danger' ? 7000 : 4000);
  }, []);
  const api = { success: (t: string) => push('ok', t), error: (t: string) => push('danger', t), info: (t: string) => push('info', t) };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 end-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={cn('pointer-events-auto rounded-lg border p-3 text-sm shadow-lg', t.tone === 'ok' ? 'border-ok/40 bg-card' : t.tone === 'danger' ? 'border-danger/50 bg-card' : 'border-info/40 bg-card')}>
            <span className={cn('me-2 font-semibold', t.tone === 'ok' ? 'text-ok' : t.tone === 'danger' ? 'text-danger' : 'text-info')}>{t.tone === 'ok' ? '✓' : t.tone === 'danger' ? '✕' : 'ℹ'}</span>{t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ───────────── Small helpers ─────────────
export const KV = ({ k, v }: { k: ReactNode; v: ReactNode }) => <div className="flex justify-between gap-4 border-b border-line py-1.5 text-sm last:border-0"><dt className="text-mutedfg">{k}</dt><dd className="text-end font-medium">{v ?? '—'}</dd></div>;
export const Toolbar = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-end gap-2 border-b border-line p-3">{children}</div>;
export const Section = ({ title, children, action }: { title: ReactNode; children: ReactNode; action?: ReactNode }) => <Card><CardHeader title={title} action={action} /><CardBody>{children}</CardBody></Card>;
