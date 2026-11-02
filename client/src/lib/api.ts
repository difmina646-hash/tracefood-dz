/** Thin fetch wrapper around the TraceFood DZ REST API. Authorization is ALWAYS enforced by the server; this only transports. */
const BASE = '/api';
const TOKEN_KEY = 'tf_token';
const COMPANY_KEY = 'tf_company';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) { super(message); }
}

export const session = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set token(v: string | null) { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); },
  get company() { return localStorage.getItem(COMPANY_KEY); },
  set company(v: string | null) { v ? localStorage.setItem(COMPANY_KEY, v) : localStorage.removeItem(COMPANY_KEY); },
};

function qs(params?: Record<string, unknown>) {
  if (!params) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function raw(method: string, path: string, body?: unknown, extra?: { form?: FormData }): Promise<Response> {
  const headers: Record<string, string> = {};
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  if (session.company) headers['X-Company-Id'] = session.company;
  let payload: BodyInit | undefined;
  if (extra?.form) payload = extra.form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res: Response;
  try { res = await fetch(BASE + path, { method, headers, body: payload }); }
  catch { throw new ApiError(0, 'NETWORK', 'Serveur injoignable — vérifiez que « npm run dev » tourne.'); }
  if (!res.ok) {
    let e: any = {};
    try { e = (await res.json()).error ?? {}; } catch { /* non-JSON error */ }
    if (res.status === 401 && session.token && ['SESSION_ENDED', 'INVALID_TOKEN'].includes(e.code)) {
      session.token = null; window.dispatchEvent(new Event('tf-logout'));
    }
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? res.statusText, e.details);
  }
  return res;
}
async function json<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const res = await raw(method, path, body, { form });
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T = any>(path: string, params?: Record<string, unknown>) => json<T>('GET', path + qs(params)),
  post: <T = any>(path: string, body?: unknown) => json<T>('POST', path, body ?? {}),
  put: <T = any>(path: string, body?: unknown) => json<T>('PUT', path, body ?? {}),
  patch: <T = any>(path: string, body?: unknown) => json<T>('PATCH', path, body ?? {}),
  del: <T = any>(path: string) => json<T>('DELETE', path),
  upload: <T = any>(path: string, form: FormData) => json<T>('POST', path, undefined, form),
  /** Authenticated file download (images/PDF) → object URL */
  async blobUrl(path: string): Promise<string> { return URL.createObjectURL(await (await raw('GET', path)).blob()); },
  async download(path: string, filename: string) {
    const url = await api.blobUrl(path);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};

export const errMsg = (e: unknown): string => {
  if (e instanceof ApiError) {
    const d = e.details;
    const extra = d?.parameters ? ` (${d.parameters.join(', ')})` : d?.lot ? ` (${d.lot})` : Array.isArray(d) ? ' — ' + d.map((x: any) => `${x.path}: ${x.message}`).join('; ') : '';
    return e.message + extra;
  }
  return e instanceof Error ? e.message : String(e);
};
