import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import { Button, StatusBadge } from './ui';
import { fmtDate, fmtDateTime, fmtNum } from '../lib/utils';

export interface GNode { id: string; type: 'SUPPLIER' | 'MATERIAL_LOT' | 'BATCH' | 'SHIPMENT' | 'LOCATION'; label: string; status?: string; data: Record<string, any> }
export interface GEdge { from: string; to: string; kind: string; quantity?: number; unit?: string }
export interface Graph { nodes: GNode[]; edges: GEdge[] }

const W = 168, H = 54, GX = 70, GY = 22;
const COLORS: Record<string, string> = { SUPPLIER: '#6366f1', MATERIAL_LOT: '#0891b2', BATCH: '#059669', SHIPMENT: '#d97706', LOCATION: '#7c3aed' };
const statusRing = (s?: string) => (s === 'BLOCKED' || s === 'REJECTED' ? '#dc2626' : s === 'PENDING' || s === 'PLANNED' ? '#d97706' : undefined);

/** Layered left→right layout (longest-path layering). Pure SVG: no graph library, works offline. */
function layout(g: Graph) {
  const layer = new Map<string, number>(g.nodes.map((n) => [n.id, 0]));
  for (let i = 0; i < g.nodes.length; i++) {      // bounded relaxation: safe even if data contained a cycle
    let changed = false;
    for (const e of g.edges) { const l = (layer.get(e.from) ?? 0) + 1; if (l > (layer.get(e.to) ?? 0)) { layer.set(e.to, l); changed = true; } }
    if (!changed) break;
  }
  const cols = new Map<number, GNode[]>();
  for (const n of g.nodes) { const l = layer.get(n.id) ?? 0; cols.set(l, [...(cols.get(l) ?? []), n]); }
  const pos = new Map<string, { x: number; y: number }>();
  let maxRows = 0;
  for (const [l, ns] of cols) { ns.sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label)); ns.forEach((n, i) => pos.set(n.id, { x: l * (W + GX), y: i * (H + GY) })); maxRows = Math.max(maxRows, ns.length); }
  return { pos, width: (Math.max(...cols.keys(), 0) + 1) * (W + GX) - GX, height: Math.max(1, maxRows) * (H + GY) - GY };
}

export function TraceGraph({ graph, highlight }: { graph: Graph; highlight?: string[] }) {
  const { t } = useTranslation();
  const { pos, width, height } = useMemo(() => layout(graph), [graph]);
  const [sel, setSel] = useState<GNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const hl = new Set(highlight ?? []);
  if (!graph.nodes.length) return <p className="p-6 text-center text-sm text-mutedfg">{t('trace.emptyGraph')}</p>;

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
      <div className="relative rounded-lg border border-line bg-bg/50">
        <div className="absolute end-2 top-2 z-10 flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(2, z + 0.15))} aria-label="+"><Plus className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))} aria-label="-"><Minus className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="outline" onClick={() => setZoom(1)} aria-label="reset"><Maximize2 className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="max-h-[560px] overflow-auto p-4" dir="ltr">
          <svg width={(width + 20) * zoom} height={(height + 20) * zoom} viewBox={`-10 -10 ${width + 20} ${height + 20}`} role="img" aria-label={t('trace.graph')}>
            <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#94a3b8" /></marker></defs>
            {graph.edges.map((e, i) => {
              const a = pos.get(e.from), b = pos.get(e.to); if (!a || !b) return null;
              const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, mx = (x1 + x2) / 2;
              return (<g key={i}><path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arr)" />
                {e.quantity !== undefined && <text x={mx} y={(y1 + y2) / 2 - 4} fontSize="10" textAnchor="middle" fill="#64748b">{fmtNum(e.quantity)} {e.unit ? t(`unit.${e.unit}`) : ''}</text>}</g>);
            })}
            {graph.nodes.map((n) => {
              const p = pos.get(n.id)!; const ring = statusRing(n.status); const on = sel?.id === n.id || hl.has(n.id);
              return (
                <g key={n.id} transform={`translate(${p.x},${p.y})`} onClick={() => setSel(n)} className="cursor-pointer" tabIndex={0} role="button" onKeyDown={(ev) => ev.key === 'Enter' && setSel(n)} aria-label={n.label}>
                  <rect width={W} height={H} rx="9" fill="#fff" stroke={ring ?? COLORS[n.type]} strokeWidth={on ? 3.5 : ring ? 2.5 : 1.5} />
                  <rect width="6" height={H} rx="3" fill={COLORS[n.type]} />
                  <text x="16" y="20" fontSize="10" fill="#64748b">{t(`trace.type.${n.type}`)}</text>
                  <text x="16" y="38" fontSize="12.5" fontWeight="600" fill="#0f172a">{n.label.length > 20 ? n.label.slice(0, 19) + '…' : n.label}</text>
                  {n.status && <circle cx={W - 14} cy="14" r="5" fill={ring ?? (n.status === 'RELEASED' || n.status === 'RECEIVED' ? '#059669' : '#94a3b8')} />}
                </g>);
            })}
          </svg>
        </div>
        <div className="flex flex-wrap gap-3 border-t border-line px-3 py-2 text-[11px] text-mutedfg">{Object.entries(COLORS).map(([k, c]) => <span key={k} className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{t(`trace.type.${k}`)}</span>)}<span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-danger" />{t('status.BLOCKED')}</span></div>
      </div>
      <aside className="rounded-lg border border-line p-3 text-sm" aria-live="polite">
        {!sel ? <p className="text-mutedfg">{t('trace.clickNode')}</p> : (
          <div className="space-y-2"><div><p className="text-xs text-mutedfg">{t(`trace.type.${sel.type}`)}</p><p className="text-base font-bold">{sel.label}</p>{sel.status && <StatusBadge status={sel.status} />}</div>
            <dl>{Object.entries(sel.data).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line py-1 last:border-0"><dt className="text-mutedfg">{t(`trace.f.${k}`, { defaultValue: k })}</dt>
                <dd className="text-end font-medium">{typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? (k.endsWith('At') ? fmtDateTime(v) : fmtDate(v)) : typeof v === 'number' ? fmtNum(v) : typeof v === 'string' && ['KG', 'G', 'L', 'ML', 'UNIT', 'POT', 'CARTON', 'PALLET'].includes(v) ? t(`unit.${v}`) : String(v)}</dd></div>))}</dl>
          </div>)}
      </aside>
    </div>
  );
}
