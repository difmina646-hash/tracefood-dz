/**
 * Bidirectional traceability engine — pure logic, no database access.
 * All data comes through TraceRepository, so the same algorithm is unit-tested with an
 * in-memory repository and runs in production with the Prisma repository.
 *
 * Chain:  Supplier → MaterialLot ⇢(BatchMaterial)⇢ ProductionBatch ⇢(ShipmentItem)⇢ Shipment → Location(s)
 * Repeated transfers (factory → distributor → store) appear as several shipments of the same batch.
 */
import { Unit, canConvert, convert, round4 } from './units';

// ─────────── Records returned by the repository ───────────
export interface LotRecord {
  id: string; internalLotNumber: string; supplierLotNumber?: string | null;
  materialName: string; supplierId: string; supplierName: string;
  receivedQty: number; remainingQty: number; unit: Unit; status: string;
  receivedAt: Date; receptionNumber?: string | null; origin?: string | null;
}
export interface BatchRecord {
  id: string; batchNumber: string; productName: string; producedQty: number; unit: Unit;
  producedAt: Date; expiryDate: Date; status: string; factoryLocationId?: string | null;
}
export interface ConsumptionRecord { batchId: string; lotId: string; quantity: number; unit: Unit }
export interface ShipmentRecord {
  id: string; shipmentNumber: string; status: string;
  fromLocationId: string; toLocationId: string; dispatchedAt?: Date | null; deliveredAt?: Date | null;
}
export interface ShipmentItemRecord {
  shipmentId: string; batchId: string; quantity: number; receivedQty?: number | null; damagedQty: number; unit: Unit;
}
export interface LocationRecord { id: string; name: string; type: string; city?: string | null; companyName?: string | null }
export interface StockRecord { batchId: string; locationId: string; quantity: number; unit: Unit }
export interface QualityCheckRecord { lotId?: string; batchId?: string; decision: string; checkedAt: Date; reviewer?: string | null }

export interface TraceRepository {
  getLots(companyId: string, ids: string[]): Promise<LotRecord[]>;
  getBatches(companyId: string, ids: string[]): Promise<BatchRecord[]>;
  consumptionsByLots(companyId: string, lotIds: string[]): Promise<ConsumptionRecord[]>;
  consumptionsByBatches(companyId: string, batchIds: string[]): Promise<ConsumptionRecord[]>;
  /** Intentionally NOT filtered by shipment owner: batch ids come from the caller's own batches, and
   *  downstream transfers of those batches must be visible for recalls. */
  shipmentItemsByBatches(batchIds: string[]): Promise<ShipmentItemRecord[]>;
  shipmentItemsByShipments(shipmentIds: string[]): Promise<ShipmentItemRecord[]>;
  getShipments(ids: string[]): Promise<ShipmentRecord[]>;
  getLocations(ids: string[]): Promise<LocationRecord[]>;
  stockByBatches(batchIds: string[]): Promise<StockRecord[]>;
  qualityChecks(companyId: string, lotIds: string[], batchIds: string[]): Promise<QualityCheckRecord[]>;
}

// ─────────── Output model ───────────
export type NodeType = 'SUPPLIER' | 'MATERIAL_LOT' | 'BATCH' | 'SHIPMENT' | 'LOCATION';
export interface GraphNode { id: string; type: NodeType; label: string; status?: string; data: Record<string, unknown> }
export interface GraphEdge { from: string; to: string; kind: 'SUPPLIES' | 'CONSUMED_IN' | 'SHIPPED_IN' | 'SHIPPED_FROM' | 'DELIVERED_TO'; quantity?: number; unit?: string }
export interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }

export interface LocationExposure {
  locationId: string; locationName: string; locationType: string; batchId: string; batchNumber: string;
  receivedQty: number; forwardedQty: number; onHandQty: number; unaccountedQty: number; unit: Unit;
}
export interface ForwardResult {
  root: { type: 'MATERIAL_LOT' | 'PRODUCTION_BATCH'; ids: string[] };
  lots: LotRecord[];
  batches: Array<BatchRecord & { lotQuantityUsed: number; lotShareOfInputs: number | null; dispatchedQty: number; onHandQty: number }>;
  shipments: Array<ShipmentRecord & { items: ShipmentItemRecord[]; dispatched: boolean }>;
  locations: LocationExposure[];
  totals: { batches: number; shipments: number; locations: number; producedQty: number; dispatchedQty: number; onHandQty: number; unaccountedQty: number; unit: Unit | 'MIXED' };
  graph: Graph;
  notes: string[];
}
export interface BackwardResult {
  root: { type: 'PRODUCTION_BATCH' | 'SHIPMENT'; ids: string[] };
  batches: BatchRecord[];
  lots: Array<LotRecord & { quantityUsed: number; usedInBatches: string[]; checks: QualityCheckRecord[] }>;
  suppliers: Array<{ id: string; name: string; lots: string[] }>;
  graph: Graph;
  notes: string[];
}

const uniq = <T>(a: T[]): T[] => Array.from(new Set(a));
const NOT_SHIPPED = new Set(['DRAFT', 'CANCELLED']);
const isDispatched = (s: ShipmentRecord) => !NOT_SHIPPED.has(s.status) && s.status !== 'PLANNED';

class GraphBuilder {
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, GraphEdge>();
  node(n: GraphNode) { if (!this.nodes.has(n.id)) this.nodes.set(n.id, n); }
  edge(e: GraphEdge) { this.edges.set(`${e.kind}|${e.from}|${e.to}`, e); }
  build(): Graph { return { nodes: [...this.nodes.values()], edges: [...this.edges.values()] }; }
}
const lotNode = (l: LotRecord): GraphNode => ({ id: `lot:${l.id}`, type: 'MATERIAL_LOT', label: l.internalLotNumber, status: l.status,
  data: { material: l.materialName, supplierLot: l.supplierLotNumber, receivedQty: l.receivedQty, remainingQty: l.remainingQty, unit: l.unit, receivedAt: l.receivedAt, reception: l.receptionNumber, origin: l.origin } });
const batchNode = (b: BatchRecord): GraphNode => ({ id: `batch:${b.id}`, type: 'BATCH', label: b.batchNumber, status: b.status,
  data: { product: b.productName, producedQty: b.producedQty, unit: b.unit, producedAt: b.producedAt, expiryDate: b.expiryDate } });
const supplierNode = (id: string, name: string): GraphNode => ({ id: `supplier:${id}`, type: 'SUPPLIER', label: name, data: {} });
const locationNode = (l: LocationRecord): GraphNode => ({ id: `loc:${l.id}`, type: 'LOCATION', label: l.name, data: { type: l.type, city: l.city, company: l.companyName } });
const shipmentNode = (s: ShipmentRecord): GraphNode => ({ id: `ship:${s.id}`, type: 'SHIPMENT', label: s.shipmentNumber, status: s.status,
  data: { dispatchedAt: s.dispatchedAt, deliveredAt: s.deliveredAt } });

export class TraceabilityEngine {
  constructor(private repo: TraceRepository) {}

  /** FORWARD: contaminated raw material lot(s) (or batch(es)) → batches → shipments → locations. */
  async forward(companyId: string, root: { type: 'MATERIAL_LOT' | 'PRODUCTION_BATCH'; ids: string[] }): Promise<ForwardResult> {
    const notes: string[] = [];
    const g = new GraphBuilder();
    let lots: LotRecord[] = [];
    let consumptions: ConsumptionRecord[] = [];
    let batchIds: string[];

    if (root.type === 'MATERIAL_LOT') {
      lots = await this.repo.getLots(companyId, root.ids);
      if (lots.length !== uniq(root.ids).length) throw new TraceabilityError('ROOT_NOT_FOUND', 'Unknown material lot');
      consumptions = await this.repo.consumptionsByLots(companyId, lots.map((l) => l.id));
      batchIds = uniq(consumptions.map((c) => c.batchId));
    } else {
      batchIds = uniq(root.ids);
    }
    const batches = await this.repo.getBatches(companyId, batchIds);
    if (root.type === 'PRODUCTION_BATCH' && batches.length !== batchIds.length) throw new TraceabilityError('ROOT_NOT_FOUND', 'Unknown production batch');

    // Inputs of each batch (all lots) to compute how much of a batch is made of the suspect lot(s).
    const allConsumptions = await this.repo.consumptionsByBatches(companyId, batchIds);
    const items = await this.repo.shipmentItemsByBatches(batchIds);
    const shipments = await this.repo.getShipments(uniq(items.map((i) => i.shipmentId)));
    const stock = await this.repo.stockByBatches(batchIds);
    const locIds = uniq([...shipments.flatMap((s) => [s.fromLocationId, s.toLocationId]), ...stock.map((s) => s.locationId), ...batches.map((b) => b.factoryLocationId).filter(Boolean) as string[]]);
    const locations = new Map((await this.repo.getLocations(locIds)).map((l) => [l.id, l]));
    const shipById = new Map(shipments.map((s) => [s.id, s]));

    // Graph: suppliers → lots → batches
    for (const l of lots) {
      g.node(lotNode(l)); g.node(supplierNode(l.supplierId, l.supplierName));
      g.edge({ from: `supplier:${l.supplierId}`, to: `lot:${l.id}`, kind: 'SUPPLIES', quantity: l.receivedQty, unit: l.unit });
    }
    for (const b of batches) g.node(batchNode(b));
    const suspect = new Set(lots.map((l) => l.id));
    for (const c of consumptions) g.edge({ from: `lot:${c.lotId}`, to: `batch:${c.batchId}`, kind: 'CONSUMED_IN', quantity: c.quantity, unit: c.unit });

    // Graph + exposure: batches → shipments → locations
    const exposures: LocationExposure[] = [];
    const dispatchedFromRoot = new Map<string, number>(); // per batch
    for (const b of batches) {
      const bItems = items.filter((i) => i.batchId === b.id && shipById.has(i.shipmentId) && isDispatched(shipById.get(i.shipmentId)!)); // planned/draft/cancelled never count
      const dests = new Set(bItems.map((i) => shipById.get(i.shipmentId)!.toLocationId));
      let dispatched = 0;
      for (const it of bItems) {
        const sh = shipById.get(it.shipmentId)!;
        g.node(shipmentNode(sh));
        g.edge({ from: `batch:${b.id}`, to: `ship:${sh.id}`, kind: 'SHIPPED_IN', quantity: it.quantity, unit: it.unit });
        const from = locations.get(sh.fromLocationId); const to = locations.get(sh.toLocationId);
        if (from) { g.node(locationNode(from)); g.edge({ from: `loc:${from.id}`, to: `ship:${sh.id}`, kind: 'SHIPPED_FROM' }); }
        if (to) { g.node(locationNode(to)); g.edge({ from: `ship:${sh.id}`, to: `loc:${to.id}`, kind: 'DELIVERED_TO', quantity: it.receivedQty ?? it.quantity, unit: it.unit }); }
        if (!dests.has(sh.fromLocationId) && isDispatched(sh)) dispatched += it.quantity; // root-level dispatch (not re-transfers)
      }
      dispatchedFromRoot.set(b.id, round4(dispatched));

      // Per-location exposure for this batch
      const locsForBatch = uniq([...dests, ...stock.filter((s) => s.batchId === b.id).map((s) => s.locationId)]);
      for (const locId of locsForBatch) {
        if (!dests.has(locId)) continue; // factory stock is not "exposure downstream"
        const loc = locations.get(locId); if (!loc) continue;
        const received = bItems.filter((i) => shipById.get(i.shipmentId)!.toLocationId === locId && ['DELIVERED', 'RECEIVED', 'PARTIALLY_RECEIVED'].includes(shipById.get(i.shipmentId)!.status)).reduce((a, i) => a + (i.receivedQty ?? i.quantity), 0);
        const inTransit = bItems.filter((i) => shipById.get(i.shipmentId)!.toLocationId === locId && shipById.get(i.shipmentId)!.status === 'IN_TRANSIT').reduce((a, i) => a + i.quantity, 0);
        const forwarded = bItems.filter((i) => shipById.get(i.shipmentId)!.fromLocationId === locId && isDispatched(shipById.get(i.shipmentId)!)).reduce((a, i) => a + i.quantity, 0);
        const onHand = stock.filter((s) => s.batchId === b.id && s.locationId === locId).reduce((a, s) => a + s.quantity, 0);
        exposures.push({ locationId: locId, locationName: loc.name, locationType: loc.type, batchId: b.id, batchNumber: b.batchNumber,
          receivedQty: round4(received + inTransit), forwardedQty: round4(forwarded), onHandQty: round4(onHand),
          unaccountedQty: round4(Math.max(0, received + inTransit - forwarded - onHand)), unit: b.unit });
      }
    }
    if (exposures.some((e) => e.unaccountedQty > 0)) notes.push('UNACCOUNTED_QTY: part of the delivered quantity is neither on hand nor forwarded (sold, consumed or lost) — consumer-side recall may be needed.');
    if (shipments.some((s) => s.status === 'PLANNED')) notes.push('PLANNED_SHIPMENTS_EXCLUDED: planned (not yet dispatched) shipments hold the batch back and are listed but not counted as exposure.');

    const batchOut = batches.map((b) => {
      const used = consumptions.filter((c) => c.batchId === b.id && suspect.has(c.lotId));
      const lotQty = used.reduce((a, c) => a + safeConvert(c.quantity, c.unit, used[0].unit), 0);
      const inputs = allConsumptions.filter((c) => c.batchId === b.id);
      let share: number | null = null;
      if (used.length && inputs.length && inputs.every((c) => canConvert(c.unit, used[0].unit))) {
        const total = inputs.reduce((a, c) => a + convert(c.quantity, c.unit, used[0].unit), 0);
        const usedQ = used.reduce((a, c) => a + convert(c.quantity, c.unit, used[0].unit), 0);
        share = total > 0 ? round4(usedQ / total) : null;
      }
      return { ...b, lotQuantityUsed: round4(lotQty), lotShareOfInputs: share, dispatchedQty: dispatchedFromRoot.get(b.id) ?? 0,
        onHandQty: round4(stock.filter((s) => s.batchId === b.id).reduce((a, s) => a + s.quantity, 0)) };
    });
    const units = uniq(batches.map((b) => b.unit));
    const shipmentsOut = shipments.map((s) => ({ ...s, dispatched: isDispatched(s), items: items.filter((i) => i.shipmentId === s.id && batchIds.includes(i.batchId)) }));
    return {
      root, lots, batches: batchOut, shipments: shipmentsOut, locations: exposures,
      totals: {
        batches: batches.length, shipments: shipments.filter(isDispatched).length,
        locations: uniq(exposures.map((e) => e.locationId)).length,
        producedQty: round4(batches.reduce((a, b) => a + b.producedQty, 0)),
        dispatchedQty: round4([...dispatchedFromRoot.values()].reduce((a, b) => a + b, 0)),
        onHandQty: round4(exposures.reduce((a, e) => a + e.onHandQty, 0)),
        unaccountedQty: round4(exposures.reduce((a, e) => a + e.unaccountedQty, 0)),
        unit: units.length === 1 ? units[0] : 'MIXED',
      },
      graph: g.build(), notes,
    };
  }

  /** BACKWARD: finished batch(es) or a shipment → batches → lots → suppliers (+ reception, quality checks). */
  async backward(companyId: string, root: { type: 'PRODUCTION_BATCH' | 'SHIPMENT'; ids: string[] }): Promise<BackwardResult> {
    const notes: string[] = [];
    const g = new GraphBuilder();
    let batchIds: string[];
    if (root.type === 'SHIPMENT') {
      const its = await this.repo.shipmentItemsByShipments(root.ids);
      batchIds = uniq(its.map((i) => i.batchId));
    } else batchIds = uniq(root.ids);

    const batches = await this.repo.getBatches(companyId, batchIds);
    if (batches.length === 0 || (root.type === 'PRODUCTION_BATCH' && batches.length !== batchIds.length)) throw new TraceabilityError('ROOT_NOT_FOUND', 'Unknown production batch');
    const cons = await this.repo.consumptionsByBatches(companyId, batchIds);
    const lots = await this.repo.getLots(companyId, uniq(cons.map((c) => c.lotId)));
    const checks = await this.repo.qualityChecks(companyId, lots.map((l) => l.id), batchIds);

    for (const b of batches) g.node(batchNode(b));
    for (const l of lots) {
      g.node(lotNode(l)); g.node(supplierNode(l.supplierId, l.supplierName));
      g.edge({ from: `supplier:${l.supplierId}`, to: `lot:${l.id}`, kind: 'SUPPLIES', quantity: l.receivedQty, unit: l.unit });
    }
    for (const c of cons) g.edge({ from: `lot:${c.lotId}`, to: `batch:${c.batchId}`, kind: 'CONSUMED_IN', quantity: c.quantity, unit: c.unit });

    const lotsOut = lots.map((l) => {
      const used = cons.filter((c) => c.lotId === l.id);
      return { ...l, quantityUsed: round4(used.reduce((a, c) => a + safeConvert(c.quantity, c.unit, l.unit), 0)),
        usedInBatches: uniq(used.map((c) => c.batchId)), checks: checks.filter((c) => c.lotId === l.id) };
    });
    const suppliers = uniq(lots.map((l) => l.supplierId)).map((id) => ({ id, name: lots.find((l) => l.supplierId === id)!.supplierName, lots: lots.filter((l) => l.supplierId === id).map((l) => l.internalLotNumber) }));
    if (batches.some((b) => !cons.some((c) => c.batchId === b.id))) notes.push('NO_INPUTS_RECORDED: at least one batch has no raw material lot linked — traceability gap.');
    return { root, batches, lots: lotsOut, suppliers, graph: g.build(), notes };
  }
}

function safeConvert(q: number, from: Unit, to: Unit): number {
  return canConvert(from, to) ? convert(q, from, to) : q;
}

export class TraceabilityError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
