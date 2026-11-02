import clsx, { ClassValue } from 'clsx';
export const cn = (...a: ClassValue[]) => clsx(a);

export const UNITS = ['KG', 'G', 'L', 'ML', 'UNIT', 'POT', 'CARTON', 'PALLET'] as const;
const loc = () => (document.documentElement.lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-DZ');
export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString(loc(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
export const fmtDateTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleString(loc(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtNum = (n?: number | string | null, max = 2) => (n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString(loc(), { maximumFractionDigits: max }));
export const toInputDateTime = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export const toInputDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const addDays = (d: Date | string, n: number) => new Date(new Date(d).getTime() + n * 86_400_000);
export const daysUntil = (d: string | Date) => Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
export const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';
/** Status → colour. Texts come from i18n (status.<VALUE>). */
export const STATUS_TONE: Record<string, Tone> = {
  RELEASED: 'ok', ACTIVE: 'ok', RECEIVED: 'ok', DONE: 'ok', RESOLVED: 'ok', APPROVED: 'ok', COMPLETED: 'ok', CLOSED: 'neutral', ANSWERED: 'info', ACCEPTED: 'ok',
  PENDING: 'warn', PLANNED: 'warn', IN_TRANSIT: 'info', DELIVERED: 'info', PARTIALLY_RECEIVED: 'warn', IN_PROGRESS: 'info', INVESTIGATING: 'info', ACTION_PLANNED: 'info', OPEN: 'warn', NEW: 'warn', IN_REVIEW: 'info', DRAFT: 'neutral', PAUSED: 'neutral',
  BLOCKED: 'danger', REJECTED: 'danger', CANCELLED: 'neutral', SUSPENDED: 'danger', INCIDENT: 'danger', DEACTIVATED: 'neutral', DECLINED: 'danger', EXPIRED: 'danger', EXPIRING_SOON: 'warn', UNDER_REVIEW: 'danger', SOLD_OUT: 'neutral', DISABLED: 'danger',
  LOW: 'neutral', MEDIUM: 'warn', HIGH: 'danger', CRITICAL: 'danger',
};
