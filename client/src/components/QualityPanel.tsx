import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ShieldBan, XCircle, FlaskConical, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useApi } from '../lib/hooks';
import { fmtDateTime, fmtNum } from '../lib/utils';
import { Alert, Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, Field, Input, Modal, Select, StatusBadge, Textarea } from './ui';
import { DocUpload } from './common';

interface Props { kind: 'LOT' | 'BATCH'; id: string; status: string; checks: any[]; results: any[]; invalidate: string[] }

/** Quality history + new check form + block action. All rules (release needs compliance, mandatory params, roles) are enforced by the API; messages are surfaced here. */
export function QualityPanel({ kind, id, status, checks, results, invalidate }: Props) {
  const { t } = useTranslation(); const { can } = useAuth();
  const base = kind === 'LOT' ? `/lots/${id}` : `/batches/${id}`;
  const [open, setOpen] = useState(false); const [block, setBlock] = useState(false); const [reason, setReason] = useState('');
  const params = useApi<{ items: any[] }>('/quality-parameters', { pageSize: 100 }, { enabled: open && can('quality:read') });
  const scopes = kind === 'LOT' ? ['RAW_MATERIAL', 'BOTH'] : ['FINISHED_PRODUCT', 'BOTH'];
  const applicable = useMemo(() => (params.data?.items ?? []).filter((p) => p.active && scopes.includes(p.scope)), [params.data]); // eslint-disable-line
  const [vals, setVals] = useState<Record<string, string>>({}); const [decision, setDecision] = useState('PENDING'); const [notes, setNotes] = useState(''); const [docs, setDocs] = useState<{ id: string; originalName: string }[]>([]);
  const submit = useAction(() => api.post(`${base}/quality-checks`, {
    decision, notes: notes || undefined, documentIds: docs.map((d) => d.id),
    results: applicable.filter((p) => vals[p.id] !== undefined && vals[p.id] !== '').map((p) => (p.paramType === 'NUMERIC' ? { parameterId: p.id, valueNumeric: Number(vals[p.id]) } : p.paramType === 'BOOLEAN' ? { parameterId: p.id, valueText: vals[p.id] } : { parameterId: p.id, valueText: vals[`${p.id}_t`] ?? '', compliant: vals[p.id] === 'true' })),
  }), { invalidate, success: t('qc.recorded'), onSuccess: () => { setOpen(false); setVals({}); setDocs([]); setNotes(''); setDecision('PENDING'); } });
  const doBlock = useAction(() => api.post(`${base}/block`, { reason }), { invalidate, success: t('qc.blocked'), onSuccess: () => { setBlock(false); setReason(''); } });

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><FlaskConical className="h-4 w-4" />{t('qc.title')} <StatusBadge status={status} /></span>}
        action={<div className="flex gap-2">{can('quality:write') && <Button size="sm" onClick={() => setOpen(true)}>{t('qc.new')}</Button>}{can('quality:release') && status !== 'BLOCKED' && status !== 'REJECTED' && <Button size="sm" variant="danger" onClick={() => setBlock(true)}><ShieldBan className="h-3.5 w-3.5" />{t('qc.block')}</Button>}</div>} />
      <CardBody className="space-y-3">
        {status === 'PENDING' && <Alert tone="warn">{kind === 'LOT' ? t('qc.pendingLot') : t('qc.pendingBatch')}</Alert>}
        {!checks.length ? <p className="text-sm text-mutedfg">{t('qc.none')}</p> : checks.map((c) => (
          <div key={c.id} className="rounded-lg border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{fmtDateTime(c.checkedAt)}{c.checkedBy?.fullName && ` · ${c.checkedBy.fullName}`}</span><StatusBadge status={c.decision} /></div>
            {c.reviewer?.fullName && <p className="text-xs text-mutedfg">{t('qc.reviewer')} {c.reviewer.fullName} · {fmtDateTime(c.reviewedAt)}</p>}
            {c.notes && <p className="mt-1">{c.notes}</p>}
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">{results.filter((r) => r.checkId === c.id).map((r) => <li key={r.id} className="flex items-center justify-between rounded bg-muted px-2 py-1 text-xs"><span>{r.parameterName}</span><span className="flex items-center gap-1 font-medium">{r.valueNumeric != null ? `${fmtNum(r.valueNumeric)} ${r.unit ?? ''}` : r.valueText}{r.compliant === true ? <CheckCircle2 className="h-3.5 w-3.5 text-ok" /> : r.compliant === false ? <XCircle className="h-3.5 w-3.5 text-danger" /> : null}</span></li>)}</ul>
          </div>))}
      </CardBody>

      <Modal open={open} onClose={() => setOpen(false)} wide title={t('qc.new')} footer={<><Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button loading={submit.isPending} onClick={() => submit.mutate(undefined)}>{t('common.save')}</Button></>}>
        <div className="space-y-4">
          {!applicable.length && !params.isLoading && <Alert tone="info">{t('qc.noParams')}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">{applicable.map((p) => (
            <Field key={p.id} label={<span className="flex items-center gap-1">{p.name}{p.mandatory && <span className="text-danger">*</span>}{!p.validatedAt && <span title={t('qp.notValidated')}><AlertTriangle className="h-3 w-3 text-warn" /></span>}</span>} hint={p.paramType === 'NUMERIC' ? `${p.minValue != null ? fmtNum(p.minValue) : '−∞'} → ${p.maxValue != null ? fmtNum(p.maxValue) : '+∞'} ${p.unit ?? ''}` : undefined}>
              {p.paramType === 'NUMERIC' ? <Input type="number" step="any" value={vals[p.id] ?? ''} onChange={(e) => setVals({ ...vals, [p.id]: e.target.value })} />
                : p.paramType === 'BOOLEAN' ? <Select value={vals[p.id] ?? ''} onChange={(e) => setVals({ ...vals, [p.id]: e.target.value })}><option value="">—</option><option value="true">{t('qc.pass')}</option><option value="false">{t('qc.fail')}</option></Select>
                : <div className="flex gap-2"><Input value={vals[`${p.id}_t`] ?? ''} onChange={(e) => setVals({ ...vals, [`${p.id}_t`]: e.target.value })} /><Select className="w-40" value={vals[p.id] ?? ''} onChange={(e) => setVals({ ...vals, [p.id]: e.target.value })}><option value="">—</option><option value="true">{t('qc.pass')}</option><option value="false">{t('qc.fail')}</option></Select></div>}
            </Field>))}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('qc.decision')} hint={!can('quality:release') ? t('qc.noRelease') : undefined}>
              <Select value={decision} onChange={(e) => setDecision(e.target.value)} disabled={!can('quality:release')}>{['PENDING', 'RELEASED', 'BLOCKED', 'REJECTED'].map((d) => <option key={d} value={d}>{t(`status.${d}`)}</option>)}</Select></Field>
            <Field label={t('qc.attach')}><div className="space-y-1"><DocUpload kind="LAB_REPORT" target={kind === 'LOT' ? { materialLotId: id } : { productionBatchId: id }} onUploaded={(d) => setDocs((x) => [...x, d])} />{docs.map((d) => <Badge key={d.id} tone="ok">{d.originalName}</Badge>)}</div></Field>
          </div>
          <Field label={t('f.notes')}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </Modal>
      <ConfirmDialog open={block} danger confirmDisabled={reason.trim().length < 3} onClose={() => setBlock(false)} loading={doBlock.isPending} onConfirm={() => doBlock.mutate(undefined)} confirmLabel={t('qc.block')} title={t('qc.blockTitle')}
        message={<div className="space-y-3"><p>{kind === 'LOT' ? t('qc.blockLotMsg') : t('qc.blockBatchMsg')}</p><Field label={t('qc.reason')}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>{reason.trim().length < 3 && <p className="text-xs text-warn">{t('qc.reasonMin')}</p>}</div>} />
    </Card>
  );
}
