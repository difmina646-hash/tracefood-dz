import { Router } from 'express';
import { z } from 'zod';
import type { Request } from 'express';
import { prisma, h, paging, D, num, genCode } from '../lib/common';
import { notFound, forbidden, conflict, unprocessable } from '../lib/errors';
import { authenticate, requirePerm, companyId } from '../middleware/auth';
import { audit } from '../lib/audit';
import { reserve, releaseReservation, dispatchReserved, credit } from '../lib/stock';

export const shipmentRouter = Router();
shipmentRouter.use(authenticate);

/** A shipment is visible to the sender, the receiving company, and the assigned transporter — nobody else. */
const visibleTo = (cid: string) => ({ OR: [{ companyId: cid }, { toLocation: { companyId: cid } }, { transporter: { linkedCompanyId: cid } }] });
const incl = { items: { include: { batch: { include: { product: true } } } }, fromLocation: true, toLocation: { include: { company: { select: { name: true } } } }, transporter: true, transportCondition: true, events: { orderBy: { createdAt: 'desc' as const } }, temperatureRecords: { orderBy: { recordedAt: 'desc' as const }, take: 100 }, deliveryConfirmations: true };

async function load(req: Request) {
  const s = await prisma.shipment.findFirst({ where: { id: String(req.params.id), ...visibleTo(companyId(req)) }, include: incl });
  if (!s) throw notFound('Shipment');
  return s;
}
const role = (s: Awaited<ReturnType<typeof load>>, cid: string) => ({ sender: s.companyId === cid, receiver: s.toLocation.companyId === cid, transporter: s.transporter?.linkedCompanyId === cid });

shipmentRouter.get('/shipments', requirePerm('shipment:read'), h(async (req, res) => {
  const { status, q } = z.object({ status: z.string().optional(), q: z.string().optional() }).parse(req.query);
  const p = paging(req.query);
  const where = { AND: [visibleTo(companyId(req)), ...(status ? [{ status: status as never }] : []), ...(q ? [{ shipmentNumber: { contains: q } }] : [])] };
  const [items, total] = await Promise.all([prisma.shipment.findMany({ where, include: { fromLocation: true, toLocation: { include: { company: { select: { name: true } } } }, transporter: true, items: true }, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }), prisma.shipment.count({ where })]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
}));
shipmentRouter.get('/shipments/:id', requirePerm('shipment:read'), h(async (req, res) => res.json(await load(req))));

/** Plans a shipment and RESERVES the stock so it cannot be sold or shipped twice. */
shipmentRouter.post('/shipments', requirePerm('shipment:create'), h(async (req, res) => {
  const b = z.object({
    fromLocationId: z.string(), toLocationId: z.string(), transporterId: z.string().optional(), plannedAt: z.coerce.date().optional(), notes: z.string().max(1000).optional(),
    minTempC: z.coerce.number().optional(), maxTempC: z.coerce.number().optional(),
    items: z.array(z.object({ batchId: z.string(), quantity: z.coerce.number().positive() })).min(1),
  }).parse(req.body);
  if (b.fromLocationId === b.toLocationId) throw unprocessable('SAME_LOCATION', 'Origin and destination must differ');
  const cid = companyId(req);
  const created = await prisma.$transaction(async (tx) => {
    if (!(await tx.location.count({ where: { id: b.fromLocationId, companyId: cid } }))) throw forbidden('Origin must be one of your locations');
    const dest = await tx.location.findFirst({ where: { id: b.toLocationId, active: true, company: { status: 'ACTIVE' } } });
    if (!dest) throw notFound('Destination location');
    if (b.transporterId && !(await tx.transporter.count({ where: { id: b.transporterId, companyId: cid } }))) throw notFound('Transporter');
    if (new Set(b.items.map((i) => i.batchId)).size !== b.items.length) throw unprocessable('DUPLICATE_BATCH', 'Each batch may appear once per shipment');
    const batches = await tx.productionBatch.findMany({ where: { id: { in: b.items.map((i) => i.batchId) } } });
    const s = await tx.shipment.create({ data: { companyId: cid, shipmentNumber: genCode('EXP'), fromLocationId: b.fromLocationId, toLocationId: b.toLocationId, transporterId: b.transporterId, status: 'PLANNED', plannedAt: b.plannedAt, notes: b.notes, createdById: req.ctx.userId } });
    for (const it of b.items) {
      const batch = batches.find((x) => x.id === it.batchId);
      if (!batch) throw notFound('Batch');
      if (batch.status !== 'RELEASED') throw conflict('BATCH_NOT_RELEASED', `Batch ${batch.batchNumber} is ${batch.status} and cannot be shipped`);
      if (batch.expiryDate < new Date()) throw conflict('BATCH_EXPIRED', `Batch ${batch.batchNumber} is expired`);
      const q = D(it.quantity);
      const bal = await tx.inventoryBalance.findFirst({ where: { companyId: cid, locationId: b.fromLocationId, batchId: batch.id } });
      if (!bal) throw conflict('INSUFFICIENT_STOCK', `No stock of ${batch.batchNumber} at the origin location`);
      await reserve(tx, b.fromLocationId, batch.id, q);
      await tx.shipmentItem.create({ data: { shipmentId: s.id, batchId: batch.id, quantity: q, unit: bal.unit } });
      await tx.stockReservation.create({ data: { companyId: cid, balanceId: bal.id, shipmentId: s.id, quantity: q, createdById: req.ctx.userId } });
    }
    if (b.minTempC !== undefined || b.maxTempC !== undefined) await tx.transportCondition.create({ data: { shipmentId: s.id, minTempC: b.minTempC === undefined ? undefined : D(b.minTempC), maxTempC: b.maxTempC === undefined ? undefined : D(b.maxTempC) } });
    await tx.shipmentEvent.create({ data: { shipmentId: s.id, type: 'PLANNED', createdById: req.ctx.userId } });
    await audit(req.ctx, 'SHIPMENT_CREATE', 'Shipment', s.id, b, undefined, tx);
    return s;
  });
  res.status(201).json(created);
}));

/** Stock physically leaves the sender: reserved quantities are consumed atomically. Idempotent-safe (status guard). */
shipmentRouter.post('/shipments/:id/dispatch', requirePerm('shipment:create'), h(async (req, res) => {
  const cid = companyId(req);
  await prisma.$transaction(async (tx) => {
    const s = await tx.shipment.findFirst({ where: { id: String(req.params.id), companyId: cid }, include: { items: { include: { batch: true } } } });
    if (!s) throw notFound('Shipment');
    const flip = await tx.shipment.updateMany({ where: { id: s.id, status: 'PLANNED' }, data: { status: 'IN_TRANSIT', dispatchedAt: new Date() } });
    if (flip.count === 0) throw conflict('INVALID_STATE', `Shipment is ${s.status}; only PLANNED shipments can be dispatched`);
    for (const it of s.items) {
      if (it.batch.status !== 'RELEASED') throw conflict('BATCH_NOT_RELEASED', `Batch ${it.batch.batchNumber} was blocked after planning — dispatch refused`);
      await dispatchReserved(tx, s.fromLocationId, it.batchId, it.quantity);
      await tx.stockMovement.create({ data: { companyId: cid, type: 'SHIPMENT_DISPATCH', batchId: it.batchId, shipmentId: s.id, fromLocationId: s.fromLocationId, toLocationId: s.toLocationId, quantity: it.quantity, unit: it.unit, createdById: req.ctx.userId } });
    }
    await tx.stockReservation.updateMany({ where: { shipmentId: s.id, status: 'ACTIVE' }, data: { status: 'CONSUMED' } });
    await tx.shipmentEvent.create({ data: { shipmentId: s.id, type: 'DISPATCHED', createdById: req.ctx.userId } });
    await audit(req.ctx, 'SHIPMENT_DISPATCH', 'Shipment', s.id, undefined, { status: s.status }, tx);
  });
  res.json({ ok: true, status: 'IN_TRANSIT' });
}));

shipmentRouter.post('/shipments/:id/cancel', requirePerm('shipment:create'), h(async (req, res) => {
  const cid = companyId(req);
  await prisma.$transaction(async (tx) => {
    const s = await tx.shipment.findFirst({ where: { id: String(req.params.id), companyId: cid }, include: { items: true } });
    if (!s) throw notFound('Shipment');
    const flip = await tx.shipment.updateMany({ where: { id: s.id, status: 'PLANNED' }, data: { status: 'CANCELLED' } });
    if (flip.count === 0) throw conflict('INVALID_STATE', 'Only a PLANNED shipment can be cancelled (dispatched stock must be received or returned)');
    for (const it of s.items) await releaseReservation(tx, s.fromLocationId, it.batchId, it.quantity);
    await tx.stockReservation.updateMany({ where: { shipmentId: s.id, status: 'ACTIVE' }, data: { status: 'RELEASED' } });
    await tx.shipmentEvent.create({ data: { shipmentId: s.id, type: 'CANCELLED', createdById: req.ctx.userId } });
    await audit(req.ctx, 'SHIPMENT_CANCEL', 'Shipment', s.id, undefined, undefined, tx);
  });
  res.json({ ok: true });
}));

// ───── Transporter actions (only the assigned transporter company, only while the shipment is active) ─────
async function asTransporter(req: Request) {
  const s = await load(req);
  if (!role(s, companyId(req)).transporter) throw forbidden('You are not the assigned transporter');
  if (!['IN_TRANSIT', 'INCIDENT'].includes(s.status)) throw conflict('INVALID_STATE', `Shipment is ${s.status}`);
  return s;
}
shipmentRouter.post('/shipments/:id/pickup', requirePerm('shipment:update'), h(async (req, res) => {
  const s = await asTransporter(req);
  const b = z.object({ signatureName: z.string().max(120).optional(), notes: z.string().max(300).optional() }).parse(req.body ?? {});
  await prisma.$transaction([prisma.deliveryConfirmation.create({ data: { shipmentId: s.id, confirmType: 'PICKUP', confirmedById: req.ctx.userId, confirmedAt: new Date(), ...b } }), prisma.shipmentEvent.create({ data: { shipmentId: s.id, type: 'PICKED_UP', createdById: req.ctx.userId } })]);
  res.status(201).json({ ok: true });
}));
shipmentRouter.post('/shipments/:id/deliver', requirePerm('shipment:update'), h(async (req, res) => {
  const s = await asTransporter(req);
  const b = z.object({ signatureName: z.string().max(120).optional(), notes: z.string().max(300).optional() }).parse(req.body ?? {});
  await prisma.$transaction([
    prisma.shipment.update({ where: { id: s.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } }),
    prisma.deliveryConfirmation.create({ data: { shipmentId: s.id, confirmType: 'DELIVERY', confirmedById: req.ctx.userId, confirmedAt: new Date(), ...b } }),
    prisma.shipmentEvent.create({ data: { shipmentId: s.id, type: 'DELIVERED', createdById: req.ctx.userId } }),
  ]);
  res.json({ ok: true, status: 'DELIVERED' });
}));
shipmentRouter.post('/shipments/:id/events', requirePerm('shipment:update'), h(async (req, res) => {
  const s = await asTransporter(req);
  const b = z.object({ type: z.enum(['POSITION', 'DELAY', 'INCIDENT', 'NOTE']), message: z.string().max(500).optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional() }).parse(req.body);
  await prisma.$transaction(async (tx) => {
    await tx.shipmentEvent.create({ data: { shipmentId: s.id, ...b, createdById: req.ctx.userId } });
    if (b.type === 'INCIDENT') {
      await tx.shipment.update({ where: { id: s.id }, data: { status: 'INCIDENT' } });
      await tx.notification.create({ data: { companyId: s.companyId, type: 'SHIPMENT_INCIDENT', severity: 'HIGH', title: `Incident transport ${s.shipmentNumber}`, message: b.message, entity: 'Shipment', entityId: s.id } });
    }
  });
  res.status(201).json({ ok: true });
}));
shipmentRouter.post('/shipments/:id/temperature', requirePerm('shipment:update'), h(async (req, res) => {
  const s = await asTransporter(req);
  const b = z.object({ temperatureC: z.coerce.number().min(-60).max(100), recordedAt: z.coerce.date().optional(), deviceId: z.string().max(60).optional() }).parse(req.body);
  const tc = s.transportCondition;
  const out = (tc?.minTempC != null && b.temperatureC < num(tc.minTempC)) || (tc?.maxTempC != null && b.temperatureC > num(tc.maxTempC));
  await prisma.$transaction(async (tx) => {
    await tx.temperatureRecord.create({ data: { shipmentId: s.id, recordedAt: b.recordedAt ?? new Date(), temperatureC: D(b.temperatureC), deviceId: b.deviceId, outOfRange: out } });
    if (out) await tx.notification.create({ data: { companyId: s.companyId, type: 'TEMPERATURE_EXCURSION', severity: 'HIGH', title: `Écart de température ${s.shipmentNumber}`, message: `${b.temperatureC} °C (limites configurées: ${tc?.minTempC ?? '–'} / ${tc?.maxTempC ?? '–'})`, entity: 'Shipment', entityId: s.id } });
  });
  res.status(201).json({ outOfRange: out });
}));

/**
 * Receiving company confirms what physically arrived. Credits THEIR stock; damaged goods are logged separately.
 * A shipment can be received once (status guard + unique RetailReceipt) — no double processing.
 */
shipmentRouter.post('/shipments/:id/receive', requirePerm('shipment:receive'), h(async (req, res) => {
  const b = z.object({ notes: z.string().max(500).optional(), items: z.array(z.object({ batchId: z.string(), receivedQty: z.coerce.number().min(0), damagedQty: z.coerce.number().min(0).default(0) })).min(1) }).parse(req.body);
  const cid = companyId(req);
  const status = await prisma.$transaction(async (tx) => {
    const s = await tx.shipment.findFirst({ where: { id: String(req.params.id), toLocation: { companyId: cid } }, include: { items: true } });
    if (!s) throw notFound('Shipment');
    const flip = await tx.shipment.updateMany({ where: { id: s.id, status: { in: ['IN_TRANSIT', 'DELIVERED', 'INCIDENT'] } }, data: { status: 'RECEIVED' } });
    if (flip.count === 0) throw conflict('INVALID_STATE', `Shipment is ${s.status} and cannot be received`);
    let complete = true;
    for (const it of s.items) {
      const r = b.items.find((x) => x.batchId === it.batchId);
      if (!r) throw unprocessable('ITEM_MISSING', 'Every shipped batch must be confirmed (use 0 if nothing arrived)');
      const rec = D(r.receivedQty), dmg = D(r.damagedQty);
      if (rec.plus(dmg).gt(it.quantity)) throw unprocessable('OVER_RECEIPT', 'Received + damaged cannot exceed shipped quantity');
      if (!rec.plus(dmg).eq(it.quantity)) complete = false;
      await tx.shipmentItem.update({ where: { id: it.id }, data: { receivedQty: rec, damagedQty: dmg } });
      if (rec.gt(0)) {
        await credit(tx, cid, s.toLocationId, it.batchId, rec, it.unit);
        await tx.stockMovement.create({ data: { companyId: cid, type: 'SHIPMENT_RECEIPT', batchId: it.batchId, shipmentId: s.id, toLocationId: s.toLocationId, fromLocationId: s.fromLocationId, quantity: rec, unit: it.unit, createdById: req.ctx.userId } });
      }
      if (dmg.gt(0)) await tx.stockMovement.create({ data: { companyId: cid, type: 'DAMAGE', batchId: it.batchId, shipmentId: s.id, fromLocationId: s.toLocationId, quantity: dmg, unit: it.unit, reason: 'Damaged on delivery', createdById: req.ctx.userId } });
    }
    const final = complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
    await tx.shipment.update({ where: { id: s.id }, data: { status: final, deliveredAt: s.deliveredAt ?? new Date() } });
    await tx.retailReceipt.create({ data: { companyId: cid, shipmentId: s.id, receivedById: req.ctx.userId, receivedAt: new Date(), notes: b.notes } });
    await tx.shipmentEvent.create({ data: { shipmentId: s.id, type: final, createdById: req.ctx.userId } });
    if (!complete) await tx.notification.create({ data: { companyId: s.companyId, type: 'RECEIPT_DISCREPANCY', severity: 'MEDIUM', title: `Écart de réception ${s.shipmentNumber}`, entity: 'Shipment', entityId: s.id } });
    await audit(req.ctx, 'SHIPMENT_RECEIVE', 'Shipment', s.id, b, { status: s.status }, tx);
    return final;
  });
  res.json({ ok: true, status });
}));
