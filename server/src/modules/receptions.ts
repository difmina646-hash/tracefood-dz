import { Router } from 'express';
import { z } from 'zod';
import { Unit } from '@prisma/client';
import { prisma, h, paging, D, genCode } from '../lib/common';
import { notFound, unprocessable } from '../lib/errors';
import { authenticate, requirePerm, companyId } from '../middleware/auth';
import { audit } from '../lib/audit';
import { checkInput, recordCheck } from './quality';

export const receptionRouter = Router();
receptionRouter.use(authenticate);

const lotIn = z.object({
  materialId: z.string(), internalLotNumber: z.string().min(2).max(60).optional(), supplierLotNumber: z.string().max(60).optional(),
  origin: z.string().max(120).optional(), quantity: z.coerce.number().positive(), unit: z.nativeEnum(Unit),
  productionDate: z.coerce.date().optional(), expiryDate: z.coerce.date().optional(), storageRequirements: z.string().max(300).optional(), locationId: z.string().optional(),
});
const receptionIn = z.object({
  supplierId: z.string(), deliveryNoteNumber: z.string().max(60).optional(), vehiclePlate: z.string().max(30).optional(),
  receivedAt: z.coerce.date().optional(), notes: z.string().max(1000).optional(), lots: z.array(lotIn).min(1).max(50),
});

/** Registers a delivery and creates one lot per line. Lots start as PENDING: they CANNOT be used in production until released. */
receptionRouter.post('/receptions', requirePerm('reception:write'), h(async (req, res) => {
  const b = receptionIn.parse(req.body);
  const cid = companyId(req);
  const out = await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({ where: { id: b.supplierId, companyId: cid } });
    if (!supplier) throw notFound('Supplier');
    if (!supplier.approved) throw unprocessable('SUPPLIER_NOT_APPROVED', 'This supplier is not approved');
    const mats = await tx.material.findMany({ where: { companyId: cid, id: { in: b.lots.map((l) => l.materialId) } } });
    const matById = new Map(mats.map((m) => [m.id, m]));
    const locIds = [...new Set(b.lots.map((l) => l.locationId).filter(Boolean) as string[])];
    if (locIds.length && (await tx.location.count({ where: { companyId: cid, id: { in: locIds } } })) !== locIds.length) throw notFound('Location');
    const receivedAt = b.receivedAt ?? new Date();
    const reception = await tx.materialReception.create({ data: { companyId: cid, supplierId: supplier.id, receptionNumber: genCode('REC'), receivedAt, receivedById: req.ctx.userId, deliveryNoteNumber: b.deliveryNoteNumber, vehiclePlate: b.vehiclePlate, notes: b.notes } });
    const lots = [];
    for (const l of b.lots) {
      const m = matById.get(l.materialId);
      if (!m) throw notFound('Material');
      if (l.expiryDate && l.expiryDate < receivedAt) throw unprocessable('LOT_ALREADY_EXPIRED', `Lot for ${m.name} is already expired at reception`);
      const lot = await tx.materialLot.create({ data: {
        companyId: cid, materialId: m.id, supplierId: supplier.id, receptionId: reception.id, locationId: l.locationId,
        internalLotNumber: l.internalLotNumber ?? genCode('MP'), supplierLotNumber: l.supplierLotNumber, origin: l.origin,
        receivedQty: D(l.quantity), remainingQty: D(l.quantity), unit: l.unit, receivedAt, productionDate: l.productionDate, expiryDate: l.expiryDate,
        storageRequirements: l.storageRequirements ?? m.storageRequirements, status: 'PENDING' } });
      await tx.stockMovement.create({ data: { companyId: cid, type: 'RAW_RECEIPT', materialLotId: lot.id, toLocationId: l.locationId, quantity: lot.receivedQty, unit: lot.unit, reason: `Reception ${reception.receptionNumber}`, createdById: req.ctx.userId } });
      lots.push(lot);
    }
    await audit(req.ctx, 'RECEPTION', 'MaterialReception', reception.id, { lots: lots.map((x) => x.internalLotNumber) }, undefined, tx);
    return { reception, lots };
  });
  res.status(201).json(out);
}));

receptionRouter.get('/receptions', requirePerm('reception:read'), h(async (req, res) => {
  const p = paging(req.query);
  const where = { companyId: companyId(req) };
  const [items, total] = await Promise.all([prisma.materialReception.findMany({ where, include: { supplier: true, receivedBy: { select: { fullName: true } } }, orderBy: { receivedAt: 'desc' }, skip: p.skip, take: p.take }), prisma.materialReception.count({ where })]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
}));

receptionRouter.get('/lots', requirePerm('reception:read'), h(async (req, res) => {
  const { q, status, materialId, supplierId } = z.object({ q: z.string().optional(), status: z.string().optional(), materialId: z.string().optional(), supplierId: z.string().optional() }).parse(req.query);
  const p = paging(req.query);
  const where = { companyId: companyId(req), ...(status ? { status: status as never } : {}), ...(materialId ? { materialId } : {}), ...(supplierId ? { supplierId } : {}),
    ...(q ? { OR: [{ internalLotNumber: { contains: q } }, { supplierLotNumber: { contains: q } }] } : {}) };
  const [items, total] = await Promise.all([prisma.materialLot.findMany({ where, include: { material: true, supplier: true }, orderBy: { receivedAt: 'desc' }, skip: p.skip, take: p.take }), prisma.materialLot.count({ where })]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
}));

receptionRouter.get('/lots/:id', requirePerm('reception:read'), h(async (req, res) => {
  const cid = companyId(req);
  const lot = await prisma.materialLot.findFirst({ where: { id: String(req.params.id), companyId: cid }, include: {
    material: true, supplier: true, reception: true,
    qualityChecks: { include: { checkedBy: { select: { fullName: true } }, reviewer: { select: { fullName: true } } }, orderBy: { checkedAt: 'desc' } },
    batchMaterials: { include: { batch: { include: { product: true } } } },
    uploadedDocuments: { select: { id: true, originalName: true, kind: true, createdAt: true } },
  } });
  if (!lot) throw notFound('Lot');
  const checkIds = lot.qualityChecks.map((c) => c.id);
  const results = checkIds.length ? await prisma.qualityResult.findMany({ where: { checkId: { in: checkIds } } }) : [];
  res.json({ ...lot, qualityResults: results });
}));

receptionRouter.post('/lots/:id/quality-checks', requirePerm('quality:write'), h(async (req, res) => {
  const input = checkInput.parse(req.body);
  res.status(201).json(await prisma.$transaction((tx) => recordCheck(tx, req.ctx, { kind: 'LOT', id: String(req.params.id) }, input)));
}));
receptionRouter.post('/lots/:id/block', requirePerm('quality:release'), h(async (req, res) => {
  const { reason } = z.object({ reason: z.string().min(3).max(1000) }).parse(req.body);
  res.status(201).json(await prisma.$transaction((tx) => recordCheck(tx, req.ctx, { kind: 'LOT', id: String(req.params.id) }, { decision: 'BLOCKED', notes: reason, results: [], documentIds: [] })));
}));
