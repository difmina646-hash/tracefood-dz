import type { TraceRepository, LotRecord, BatchRecord, ConsumptionRecord, ShipmentRecord, ShipmentItemRecord, LocationRecord, StockRecord, QualityCheckRecord } from '../src/core/traceability';

/** In-memory TraceRepository used by unit tests. Mirrors the company filtering of the Prisma repository. */
export class MemoryRepo implements TraceRepository {
  lots: Array<LotRecord & { companyId: string }> = [];
  batches: Array<BatchRecord & { companyId: string }> = [];
  consumptions: Array<ConsumptionRecord & { companyId: string }> = [];
  shipments: ShipmentRecord[] = [];
  items: ShipmentItemRecord[] = [];
  locations: LocationRecord[] = [];
  stock: StockRecord[] = [];
  checks: Array<QualityCheckRecord & { companyId: string }> = [];

  async getLots(c: string, ids: string[]) { return this.lots.filter((l) => l.companyId === c && ids.includes(l.id)); }
  async getBatches(c: string, ids: string[]) { return this.batches.filter((b) => b.companyId === c && ids.includes(b.id)); }
  async consumptionsByLots(c: string, ids: string[]) { return this.consumptions.filter((x) => x.companyId === c && ids.includes(x.lotId)); }
  async consumptionsByBatches(c: string, ids: string[]) { return this.consumptions.filter((x) => x.companyId === c && ids.includes(x.batchId)); }
  async shipmentItemsByBatches(ids: string[]) { return this.items.filter((i) => ids.includes(i.batchId)); }
  async shipmentItemsByShipments(ids: string[]) { return this.items.filter((i) => ids.includes(i.shipmentId)); }
  async getShipments(ids: string[]) { return this.shipments.filter((s) => ids.includes(s.id)); }
  async getLocations(ids: string[]) { return this.locations.filter((l) => ids.includes(l.id)); }
  async stockByBatches(ids: string[]) { return this.stock.filter((s) => ids.includes(s.batchId)); }
  async qualityChecks(c: string, lotIds: string[], batchIds: string[]) {
    return this.checks.filter((q) => q.companyId === c && ((q.lotId && lotIds.includes(q.lotId)) || (q.batchId && batchIds.includes(q.batchId))));
  }
}

export const CO = 'company-A';
export const d = (s: string) => new Date(s);

/** Yogurt scenario: 3 raw-material lots, 3 batches (many-to-many), repeated transfer, planned + cancelled shipments. */
export function yogurtFixture(): MemoryRepo {
  const r = new MemoryRepo();
  const lot = (id: string, no: string, mat: string, qty: number, unit: 'L' | 'KG', status = 'RELEASED'): LotRecord & { companyId: string } => ({
    companyId: CO, id, internalLotNumber: no, supplierLotNumber: `S-${no}`, materialName: mat, supplierId: 'sup1', supplierName: 'Laiterie Atlas',
    receivedQty: qty, remainingQty: 0, unit, status, receivedAt: d('2026-10-01'), receptionNumber: 'REC-1', origin: 'Bouira' });
  r.lots = [lot('l1', 'MP-001', 'Lait cru', 1000, 'L'), lot('l2', 'MP-002', 'Lait cru', 500, 'L'), lot('l3', 'MP-003', 'Ferments', 5, 'KG')];
  const batch = (id: string, no: string, qty: number, fac = 'fac') => ({ companyId: CO, id, batchNumber: no, productName: 'Yaourt nature', producedQty: qty, unit: 'POT' as const,
    producedAt: d('2026-10-03'), expiryDate: d('2026-10-24'), status: 'RELEASED', factoryLocationId: fac });
  r.batches = [batch('y1', 'YG-001', 500), batch('y2', 'YG-002', 400), batch('y3', 'YG-003', 100)];
  const cons = (batchId: string, lotId: string, quantity: number, unit: 'L' | 'KG') => ({ companyId: CO, batchId, lotId, quantity, unit });
  r.consumptions = [cons('y1', 'l1', 300, 'L'), cons('y1', 'l3', 1, 'KG'), cons('y2', 'l1', 200, 'L'), cons('y2', 'l2', 300, 'L'), cons('y3', 'l2', 100, 'L')];
  r.locations = [
    { id: 'fac', name: 'Usine Bouira', type: 'FACTORY' }, { id: 'dist', name: 'Distributeur Alger', type: 'DISTRIBUTION_CENTER' },
    { id: 'stA', name: 'Supérette A', type: 'STORE' }, { id: 'stB', name: 'Supérette B', type: 'STORE' }, { id: 'stC', name: 'Supérette C', type: 'STORE' },
  ];
  const sh = (id: string, no: string, status: string, from: string, to: string) => ({ id, shipmentNumber: no, status, fromLocationId: from, toLocationId: to });
  r.shipments = [sh('s1', 'EXP-1', 'RECEIVED', 'fac', 'dist'), sh('s2', 'EXP-2', 'RECEIVED', 'dist', 'stA'), sh('s3', 'EXP-3', 'DELIVERED', 'dist', 'stB'),
    sh('s4', 'EXP-4', 'RECEIVED', 'fac', 'stC'), sh('s5', 'EXP-5', 'PLANNED', 'dist', 'stA'), sh('s6', 'EXP-6', 'CANCELLED', 'fac', 'stB')];
  const it = (shipmentId: string, batchId: string, quantity: number) => ({ shipmentId, batchId, quantity, receivedQty: quantity, damagedQty: 0, unit: 'POT' as const });
  r.items = [it('s1', 'y1', 400), it('s1', 'y2', 300), it('s2', 'y1', 150), it('s3', 'y1', 100), it('s3', 'y2', 100), it('s4', 'y3', 50), it('s5', 'y2', 50), it('s6', 'y1', 30)];
  const st = (batchId: string, locationId: string, quantity: number) => ({ batchId, locationId, quantity, unit: 'POT' as const });
  r.stock = [st('y1', 'dist', 150), st('y2', 'dist', 200), st('y1', 'stA', 100), st('y1', 'stB', 60), st('y2', 'stB', 80), st('y3', 'stC', 50), st('y1', 'fac', 100)];
  r.checks = [{ companyId: CO, lotId: 'l1', decision: 'RELEASED', checkedAt: d('2026-10-01'), reviewer: 'Resp. Qualité' }, { companyId: CO, batchId: 'y1', decision: 'RELEASED', checkedAt: d('2026-10-04') }];
  return r;
}
