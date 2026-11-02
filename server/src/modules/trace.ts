import { Router } from 'express';
import { z } from 'zod';
import { prisma, h, num } from '../lib/common';
import { notFound } from '../lib/errors';
import { authenticate, requirePerm, companyId } from '../middleware/auth';
import { TraceabilityEngine, TraceRepository } from '../core/traceability';
import type { Unit } from '../core/units';

/** Prisma-backed implementation of the repository used by the pure engine. */
export const prismaTraceRepo: TraceRepository = {
  async getLots(companyId, ids) {
    const rows = await prisma.materialLot.findMany({ where: { companyId, id: { in: ids } }, include: { material: true, supplier: true, reception: true } });
    return rows.map((l) => ({ id: l.id, internalLotNumber: l.internalLotNumber, supplierLotNumber: l.supplierLotNumber, materialName: l.material.name, supplierId: l.supplierId, supplierName: l.supplier.name,
      receivedQty: num(l.receivedQty), remainingQty: num(l.remainingQty), unit: l.unit as Unit, status: l.status, receivedAt: l.receivedAt, receptionNumber: l.reception?.receptionNumber, origin: l.origin }));
  },
  async getBatches(companyId, ids) {
    const rows = await prisma.productionBatch.findMany({ where: { companyId, id: { in: ids } }, include: { product: true } });
    return rows.map((b) => ({ id: b.id, batchNumber: b.batchNumber, productName: b.product.name, producedQty: num(b.producedQty), unit: b.unit as Unit, producedAt: b.producedAt, expiryDate: b.expiryDate, status: b.status, factoryLocationId: b.factoryLocationId }));
  },
  async consumptionsByLots(companyId, lotIds) {
    const rows = await prisma.batchMaterial.findMany({ where: { materialLotId: { in: lotIds }, materialLot: { companyId } } });
    return rows.map((r) => ({ batchId: r.batchId, lotId: r.materialLotId, quantity: num(r.quantity), unit: r.unit as Unit }));
  },
  async consumptionsByBatches(companyId, batchIds) {
    const rows = await prisma.batchMaterial.findMany({ where: { batchId: { in: batchIds }, batch: { companyId } } });
    return rows.map((r) => ({ batchId: r.batchId, lotId: r.materialLotId, quantity: num(r.quantity), unit: r.unit as Unit }));
  },
  async shipmentItemsByBatches(batchIds) {
    const rows = await prisma.shipmentItem.findMany({ where: { batchId: { in: batchIds } } });
    return rows.map((r) => ({ shipmentId: r.shipmentId, batchId: r.batchId, quantity: num(r.quantity), receivedQty: r.receivedQty === null ? null : num(r.receivedQty), damagedQty: num(r.damagedQty), unit: r.unit as Unit }));
  },
  async shipmentItemsByShipments(ids) {
    const rows = await prisma.shipmentItem.findMany({ where: { shipmentId: { in: ids } } });
    return rows.map((r) => ({ shipmentId: r.shipmentId, batchId: r.batchId, quantity: num(r.quantity), receivedQty: r.receivedQty === null ? null : num(r.receivedQty), damagedQty: num(r.damagedQty), unit: r.unit as Unit }));
  },
  async getShipments(ids) {
    const rows = await prisma.shipment.findMany({ where: { id: { in: ids } } });
    return rows.map((s) => ({ id: s.id, shipmentNumber: s.shipmentNumber, status: s.status, fromLocationId: s.fromLocationId, toLocationId: s.toLocationId, dispatchedAt: s.dispatchedAt, deliveredAt: s.deliveredAt }));
  },
  async getLocations(ids) {
    const rows = await prisma.location.findMany({ where: { id: { in: ids } }, include: { company: { select: { name: true } } } });
    return rows.map((l) => ({ id: l.id, name: l.name, type: l.type, city: l.city, companyName: l.company.name }));
  },
  async stockByBatches(batchIds) {
    const rows = await prisma.inventoryBalance.findMany({ where: { batchId: { in: batchIds }, quantity: { gt: 0 } } });
    return rows.map((r) => ({ batchId: r.batchId, locationId: r.locationId, quantity: num(r.quantity), unit: r.unit as Unit }));
  },
  async qualityChecks(companyId, lotIds, batchIds) {
    const rows = await prisma.qualityCheck.findMany({ where: { companyId, OR: [{ materialLotId: { in: lotIds } }, { productionBatchId: { in: batchIds } }] }, include: { reviewer: { select: { fullName: true } } } });
    return rows.map((c) => ({ lotId: c.materialLotId ?? undefined, batchId: c.productionBatchId ?? undefined, decision: c.decision, checkedAt: c.checkedAt, reviewer: c.reviewer?.fullName }));
  },
};
export const engine = new TraceabilityEngine(prismaTraceRepo);

export const traceRouter = Router();
traceRouter.use(authenticate);

/** Lot / batch number search (internal lot, supplier lot, finished batch). */
traceRouter.get('/trace/search', requirePerm('trace:read'), h(async (req, res) => {
  const { q } = z.object({ q: z.string().min(2).max(60) }).parse(req.query);
  const cid = companyId(req);
  const [lots, batches] = await Promise.all([
    prisma.materialLot.findMany({ where: { companyId: cid, OR: [{ internalLotNumber: { contains: q } }, { supplierLotNumber: { contains: q } }] }, include: { material: true, supplier: true }, take: 20 }),
    prisma.productionBatch.findMany({ where: { companyId: cid, batchNumber: { contains: q } }, include: { product: true }, take: 20 }),
  ]);
  res.json({ results: [
    ...lots.map((l) => ({ type: 'MATERIAL_LOT', id: l.id, number: l.internalLotNumber, supplierLot: l.supplierLotNumber, label: `${l.material.name} — ${l.supplier.name}`, status: l.status })),
    ...batches.map((b) => ({ type: 'PRODUCTION_BATCH', id: b.id, number: b.batchNumber, label: b.product.name, status: b.status })),
  ] });
}));

traceRouter.get('/trace/lots/:id/forward', requirePerm('trace:read'), h(async (req, res) => res.json(await engine.forward(companyId(req), { type: 'MATERIAL_LOT', ids: [String(req.params.id)] }))));
traceRouter.get('/trace/batches/:id/forward', requirePerm('trace:read'), h(async (req, res) => res.json(await engine.forward(companyId(req), { type: 'PRODUCTION_BATCH', ids: [String(req.params.id)] }))));
traceRouter.get('/trace/batches/:id/backward', requirePerm('trace:read'), h(async (req, res) => res.json(await engine.backward(companyId(req), { type: 'PRODUCTION_BATCH', ids: [String(req.params.id)] }))));
traceRouter.get('/trace/shipments/:id/backward', requirePerm('trace:read'), h(async (req, res) => res.json(await engine.backward(companyId(req), { type: 'SHIPMENT', ids: [String(req.params.id)] }))));

/**
 * Downstream actors (distributors, stores) do NOT get the manufacturer's supplier/raw-material data.
 * They can look up a batch they have received: product, dates, status, and which shipments brought it to them.
 */
traceRouter.get('/trace/received/:batchNumber', requirePerm('trace:read'), h(async (req, res) => {
  const cid = companyId(req);
  const items = await prisma.shipmentItem.findMany({ where: { batch: { batchNumber: String(req.params.batchNumber) }, shipment: { OR: [{ toLocation: { companyId: cid } }, { companyId: cid }] } },
    include: { batch: { include: { product: true, company: { select: { name: true } } } }, shipment: { include: { fromLocation: { select: { name: true } }, toLocation: { select: { name: true } } } } } });
  if (!items.length) throw notFound('Batch (not received by your company)');
  const b = items[0].batch;
  res.json({ batchNumber: b.batchNumber, product: b.product.name, manufacturer: b.company.name, producedAt: b.producedAt, expiryDate: b.expiryDate, status: b.status, blockedNotice: b.status === 'BLOCKED' || b.status === 'REJECTED' ? 'Lot bloqué par le fabricant — ne pas vendre / ne pas distribuer' : null,
    shipments: items.map((i) => ({ shipmentNumber: i.shipment.shipmentNumber, status: i.shipment.status, from: i.shipment.fromLocation.name, to: i.shipment.toLocation.name, quantity: num(i.quantity), receivedQty: i.receivedQty === null ? null : num(i.receivedQty), unit: i.unit })) });
}));
