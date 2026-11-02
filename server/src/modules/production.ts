import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { Unit } from '@prisma/client';
import { prisma, h, paging, D, genCode, num } from '../lib/common';
import { notFound, unprocessable, conflict } from '../lib/errors';
import { authenticate, requirePerm, companyId } from '../middleware/auth';
import { audit } from '../lib/audit';
import { checkInput, recordCheck } from './quality';
import { convert, canConvert } from '../core/units';
import { env } from '../config/env';

export const productionRouter = Router();
productionRouter.use(authenticate);
const unit = z.nativeEnum(Unit);

productionRouter.post('/production-orders', requirePerm('production:write'), h(async (req, res) => {
  const b = z.object({ productId: z.string(), variantId: z.string().optional(), recipeId: z.string().optional(), plannedQty: z.coerce.number().positive(), unit, plannedDate: z.coerce.date() }).parse(req.body);
  const cid = companyId(req);
  if (!(await prisma.product.count({ where: { id: b.productId, companyId: cid } }))) throw notFound('Product');
  const o = await prisma.productionOrder.create({ data: { ...b, plannedQty: D(b.plannedQty), companyId: cid, orderNumber: genCode('OF'), createdById: req.ctx.userId } });
  await audit(req.ctx, 'CREATE', 'ProductionOrder', o.id, b);
  res.status(201).json(o);
}));
productionRouter.get('/production-orders', requirePerm('production:read'), h(async (req, res) => {
  const p = paging(req.query);
  res.json({ items: await prisma.productionOrder.findMany({ where: { companyId: companyId(req) }, include: { product: true }, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }) });
}));

const batchIn = z.object({
  productId: z.string(), variantId: z.string().optional(), orderId: z.string().optional(), factoryLocationId: z.string(),
  batchNumber: z.string().min(2).max(60).optional(), producedAt: z.coerce.date(), producedQty: z.coerce.number().positive(), unit, expiryDate: z.coerce.date(), notes: z.string().max(2000).optional(),
  materials: z.array(z.object({ lotId: z.string(), quantity: z.coerce.number().positive(), unit })).min(1),
  steps: z.array(z.object({ name: z.string().min(1), startedAt: z.coerce.date().optional(), endedAt: z.coerce.date().optional(), temperatureC: z.coerce.number().optional(), durationMin: z.number().int().optional(), notes: z.string().optional() })).default([]),
});

/**
 * Creates a finished batch and consumes raw-material lots in ONE transaction.
 * Guarantees: only RELEASED, non-expired lots; units converted explicitly; remainingQty can never go negative
 * (guarded atomic UPDATE); one batch ↔ many lots and one lot ↔ many batches (BatchMaterial rows).
 */
productionRouter.post('/batches', requirePerm('production:write'), h(async (req, res) => {
  const b = batchIn.parse(req.body);
  const cid = companyId(req);
  if (b.expiryDate <= b.producedAt) throw unprocessable('BAD_DATES', 'Expiry date must be after production date');
  const created = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: b.productId, companyId: cid } });
    if (!product) throw notFound('Product');
    if (!(await tx.location.count({ where: { id: b.factoryLocationId, companyId: cid } }))) throw notFound('Factory location');
    if (b.orderId && !(await tx.productionOrder.count({ where: { id: b.orderId, companyId: cid } }))) throw notFound('Production order');
    // merge duplicate lot lines
    const wanted = new Map<string, { qty: number; unit: Unit }[]>();
    for (const m of b.materials) wanted.set(m.lotId, [...(wanted.get(m.lotId) ?? []), { qty: m.quantity, unit: m.unit }]);
    const lots = await tx.materialLot.findMany({ where: { companyId: cid, id: { in: [...wanted.keys()] } } });
    if (lots.length !== wanted.size) throw notFound('Material lot');
    const batch = await tx.productionBatch.create({ data: {
      companyId: cid, productId: product.id, variantId: b.variantId, orderId: b.orderId, factoryLocationId: b.factoryLocationId,
      batchNumber: b.batchNumber ?? genCode(product.sku.toUpperCase().slice(0, 4)), producedAt: b.producedAt, producedQty: D(b.producedQty), unit: b.unit, expiryDate: b.expiryDate,
      status: 'PENDING', createdById: req.ctx.userId, notes: b.notes } });
    for (const lot of lots) {
      if (lot.status !== 'RELEASED') throw conflict('LOT_NOT_RELEASED', `Lot ${lot.internalLotNumber} is ${lot.status} and cannot be used in production`, { lot: lot.internalLotNumber, status: lot.status });
      if (lot.expiryDate && lot.expiryDate < b.producedAt) throw conflict('LOT_EXPIRED', `Lot ${lot.internalLotNumber} expired before the production date`);
      let totalInLotUnit = 0;
      for (const line of wanted.get(lot.id)!) {
        if (!canConvert(line.unit, lot.unit)) throw unprocessable('INCOMPATIBLE_UNITS', `Cannot use ${line.unit} against lot ${lot.internalLotNumber} stored in ${lot.unit}`);
        totalInLotUnit += convert(line.qty, line.unit, lot.unit);
      }
      const qty = D(totalInLotUnit.toFixed(4));
      const n = await tx.materialLot.updateMany({ where: { id: lot.id, status: 'RELEASED', remainingQty: { gte: qty } }, data: { remainingQty: { decrement: qty } } });
      if (n.count === 0) throw conflict('INSUFFICIENT_LOT_QUANTITY', `Lot ${lot.internalLotNumber} has not enough remaining quantity (or was just blocked)`, { lot: lot.internalLotNumber, remaining: num(lot.remainingQty), requested: totalInLotUnit });
      await tx.batchMaterial.create({ data: { batchId: batch.id, materialLotId: lot.id, quantity: qty, unit: lot.unit } });
      await tx.stockMovement.create({ data: { companyId: cid, type: 'PRODUCTION_CONSUME', materialLotId: lot.id, batchId: batch.id, quantity: qty, unit: lot.unit, reason: `Batch ${batch.batchNumber}`, createdById: req.ctx.userId } });
    }
    let i = 0;
    for (const s of b.steps) await tx.productionStep.create({ data: { ...s, temperatureC: s.temperatureC === undefined ? undefined : D(s.temperatureC), batchId: batch.id, stepOrder: ++i, operatorId: req.ctx.userId } });
    if (b.orderId) await tx.productionOrder.update({ where: { id: b.orderId }, data: { status: 'IN_PROGRESS' } });
    await audit(req.ctx, 'CREATE', 'ProductionBatch', batch.id, { batchNumber: batch.batchNumber, lots: lots.map((l) => l.internalLotNumber) }, undefined, tx);
    return batch;
  });
  res.status(201).json(created);
}));

productionRouter.get('/batches', requirePerm('production:read'), h(async (req, res) => {
  const { q, status, productId } = z.object({ q: z.string().optional(), status: z.string().optional(), productId: z.string().optional() }).parse(req.query);
  const p = paging(req.query);
  const where = { companyId: companyId(req), ...(status ? { status: status as never } : {}), ...(productId ? { productId } : {}), ...(q ? { batchNumber: { contains: q } } : {}) };
  const [items, total] = await Promise.all([prisma.productionBatch.findMany({ where, include: { product: true, variant: true }, orderBy: { producedAt: 'desc' }, skip: p.skip, take: p.take }), prisma.productionBatch.count({ where })]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
}));

productionRouter.get('/batches/:id', requirePerm('production:read'), h(async (req, res) => {
  const batch = await prisma.productionBatch.findFirst({ where: { id: String(req.params.id), companyId: companyId(req) }, include: {
    product: true, variant: true, factoryLocation: true,
    batchMaterials: { include: { materialLot: { include: { material: true, supplier: true } } } },
    productionSteps: { orderBy: { stepOrder: 'asc' } }, qualityChecks: { orderBy: { checkedAt: 'desc' } },
    productQrCodes: { select: { publicId: true, active: true, scanCount: true } },
    inventoryBalances: { include: { location: { select: { name: true, type: true } } } },
  } });
  if (!batch) throw notFound('Batch');
  const checkIds = batch.qualityChecks.map((c) => c.id);
  const qualityResults = checkIds.length ? await prisma.qualityResult.findMany({ where: { checkId: { in: checkIds } } }) : [];
  res.json({ ...batch, qualityResults });
}));

productionRouter.post('/batches/:id/quality-checks', requirePerm('quality:write'), h(async (req, res) => {
  const input = checkInput.parse(req.body);
  res.status(201).json(await prisma.$transaction((tx) => recordCheck(tx, req.ctx, { kind: 'BATCH', id: String(req.params.id) }, input)));
}));
productionRouter.post('/batches/:id/block', requirePerm('quality:release'), h(async (req, res) => {
  const { reason } = z.object({ reason: z.string().min(3).max(1000) }).parse(req.body);
  res.status(201).json(await prisma.$transaction((tx) => recordCheck(tx, req.ctx, { kind: 'BATCH', id: String(req.params.id) }, { decision: 'BLOCKED', notes: reason, results: [], documentIds: [] })));
}));

// QR code image for printing/downloading. Encodes ONLY the public URL; no business data is inside the code.
productionRouter.get('/batches/:id/qr', requirePerm('production:read'), h(async (req, res) => {
  const qr = await prisma.productQrCode.findFirst({ where: { batchId: String(req.params.id), companyId: companyId(req) } });
  if (!qr) throw notFound('QR code (the batch must be released first)');
  const url = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/q/${qr.publicId}`;
  const format = req.query.format === 'svg' ? 'svg' : 'png';
  if (format === 'svg') { res.type('image/svg+xml').send(await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' })); return; }
  res.type('image/png').set('Content-Disposition', `inline; filename="qr-${qr.publicId}.png"`).send(await QRCode.toBuffer(url, { margin: 2, width: 600, errorCorrectionLevel: 'M' }));
}));
productionRouter.post('/batches/:id/qr/deactivate', requirePerm('quality:release'), h(async (req, res) => {
  const r = await prisma.productQrCode.updateMany({ where: { batchId: String(req.params.id), companyId: companyId(req) }, data: { active: false } });
  if (!r.count) throw notFound('QR code');
  await audit(req.ctx, 'QR_DEACTIVATE', 'ProductionBatch', String(req.params.id));
  res.json({ deactivated: r.count });
}));
