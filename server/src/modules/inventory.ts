import { Router } from 'express';
import { z } from 'zod';
import { prisma, h, paging, D, num } from '../lib/common';
import { notFound, unprocessable, conflict } from '../lib/errors';
import { authenticate, requirePerm, companyId } from '../middleware/auth';
import { audit } from '../lib/audit';
import { debitAvailable, credit } from '../lib/stock';

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);
const qty = z.coerce.number().positive();
const DAY = 86_400_000;

const view = (b: { id: string; quantity: unknown; reservedQty: unknown; unit: string; batchId: string; locationId: string; batch: { batchNumber: string; expiryDate: Date; status: string; productId: string; product: { name: string } }; location: { name: string } }) => {
  const days = Math.ceil((b.batch.expiryDate.getTime() - Date.now()) / DAY);
  return { id: b.id, batchId: b.batchId, locationId: b.locationId, productId: b.batch.productId, batchNumber: b.batch.batchNumber, product: b.batch.product.name, location: b.location.name, quantity: num(b.quantity as never), reserved: num(b.reservedQty as never),
    available: num(b.quantity as never) - num(b.reservedQty as never), unit: b.unit, expiryDate: b.batch.expiryDate, daysToExpiry: days, batchStatus: b.batch.status,
    alert: b.batch.status !== 'RELEASED' ? 'BLOCKED' : days < 0 ? 'EXPIRED' : days <= 3 ? 'EXPIRING_SOON' : null };
};
const include = { batch: { include: { product: true } }, location: true };

inventoryRouter.get('/inventory', requirePerm('inventory:read'), h(async (req, res) => {
  const { locationId, q } = z.object({ locationId: z.string().optional(), q: z.string().optional() }).parse(req.query);
  const p = paging(req.query);
  const where = { companyId: companyId(req), quantity: { gt: 0 }, ...(locationId ? { locationId } : {}), ...(q ? { batch: { OR: [{ batchNumber: { contains: q } }, { product: { name: { contains: q } } }] } } : {}) };
  const rows = await prisma.inventoryBalance.findMany({ where, include, orderBy: { batch: { expiryDate: 'asc' } }, skip: p.skip, take: p.take });
  res.json({ items: rows.map(view), total: await prisma.inventoryBalance.count({ where }) });
}));

/** FEFO: earliest expiry first; blocked, expired and fully reserved batches are excluded from the pick list. */
inventoryRouter.get('/inventory/fefo', requirePerm('inventory:read'), h(async (req, res) => {
  const { productId, locationId } = z.object({ productId: z.string().optional(), locationId: z.string().optional() }).parse(req.query);
  const rows = await prisma.inventoryBalance.findMany({ where: { companyId: companyId(req), quantity: { gt: 0 }, ...(locationId ? { locationId } : {}), batch: { status: 'RELEASED', expiryDate: { gte: new Date() }, ...(productId ? { productId } : {}) } }, include, orderBy: { batch: { expiryDate: 'asc' } } });
  res.json({ items: rows.map(view).filter((r) => r.available > 0) });
}));

inventoryRouter.get('/stock-movements', requirePerm('inventory:read'), h(async (req, res) => {
  const { batchId } = z.object({ batchId: z.string().optional() }).parse(req.query);
  const p = paging(req.query);
  res.json({ items: await prisma.stockMovement.findMany({ where: { companyId: companyId(req), ...(batchId ? { batchId } : {}) }, include: { batch: { select: { batchNumber: true } }, fromLocation: { select: { name: true } }, toLocation: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }) });
}));

/** Loads a batch balance row in the caller's company or fails. */
async function balanceOf(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], cid: string, locationId: string, batchId: string) {
  const b = await tx.inventoryBalance.findFirst({ where: { companyId: cid, locationId, batchId }, include: { batch: true } });
  if (!b) throw notFound('Stock for this batch at this location');
  return b;
}

inventoryRouter.post('/inventory/transfer', requirePerm('inventory:write'), h(async (req, res) => {
  const b = z.object({ fromLocationId: z.string(), toLocationId: z.string(), batchId: z.string(), quantity: qty }).parse(req.body);
  if (b.fromLocationId === b.toLocationId) throw unprocessable('SAME_LOCATION', 'Source and destination must differ');
  const cid = companyId(req);
  await prisma.$transaction(async (tx) => {
    if ((await tx.location.count({ where: { companyId: cid, id: { in: [b.fromLocationId, b.toLocationId] } } })) !== 2) throw notFound('Location');
    const src = await balanceOf(tx, cid, b.fromLocationId, b.batchId);
    if (src.batch.status !== 'RELEASED') throw conflict('BATCH_NOT_RELEASED', 'Only released batches can be moved');
    const q = D(b.quantity);
    await debitAvailable(tx, b.fromLocationId, b.batchId, q);
    await credit(tx, cid, b.toLocationId, b.batchId, q, src.unit);
    await tx.stockMovement.create({ data: { companyId: cid, type: 'TRANSFER_OUT', batchId: b.batchId, fromLocationId: b.fromLocationId, toLocationId: b.toLocationId, quantity: q, unit: src.unit, createdById: req.ctx.userId } });
    await tx.stockMovement.create({ data: { companyId: cid, type: 'TRANSFER_IN', batchId: b.batchId, fromLocationId: b.fromLocationId, toLocationId: b.toLocationId, quantity: q, unit: src.unit, createdById: req.ctx.userId } });
    await audit(req.ctx, 'STOCK_TRANSFER', 'InventoryBalance', src.id, b, undefined, tx);
  });
  res.status(201).json({ ok: true });
}));

function exitRoute(path: string, type: 'DAMAGE' | 'SALE_EXIT', reasonRequired: boolean) {
  inventoryRouter.post(path, requirePerm('inventory:write'), h(async (req, res) => {
    const b = z.object({ locationId: z.string(), batchId: z.string(), quantity: qty, reason: reasonRequired ? z.string().min(3).max(300) : z.string().max(300).optional() }).parse(req.body);
    const cid = companyId(req);
    await prisma.$transaction(async (tx) => {
      const src = await balanceOf(tx, cid, b.locationId, b.batchId);
      const q = D(b.quantity);
      await debitAvailable(tx, b.locationId, b.batchId, q);
      await tx.stockMovement.create({ data: { companyId: cid, type, batchId: b.batchId, fromLocationId: b.locationId, quantity: q, unit: src.unit, reason: b.reason, createdById: req.ctx.userId } });
      await audit(req.ctx, type, 'InventoryBalance', src.id, b, undefined, tx);
    });
    res.status(201).json({ ok: true });
  }));
}
exitRoute('/inventory/damage', 'DAMAGE', true);
exitRoute('/inventory/sale-exit', 'SALE_EXIT', false);

/** Stock count: sets quantities to the counted values and records one RECONCILIATION movement per difference. */
inventoryRouter.post('/inventory/reconcile', requirePerm('inventory:write'), h(async (req, res) => {
  const b = z.object({ locationId: z.string(), note: z.string().max(300).optional(), counts: z.array(z.object({ batchId: z.string(), countedQuantity: z.coerce.number().min(0) })).min(1) }).parse(req.body);
  const cid = companyId(req);
  const diffs = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const c of b.counts) {
      const row = await balanceOf(tx, cid, b.locationId, c.batchId);
      const counted = D(c.countedQuantity);
      if (counted.lt(row.reservedQty)) throw conflict('BELOW_RESERVED', 'Counted quantity is below reserved quantity; release the reservation first');
      const diff = counted.minus(row.quantity);
      if (diff.isZero()) continue;
      await tx.inventoryBalance.update({ where: { id: row.id }, data: { quantity: counted } });
      await tx.stockMovement.create({ data: { companyId: cid, type: 'RECONCILIATION', batchId: c.batchId, [diff.gt(0) ? 'toLocationId' : 'fromLocationId']: b.locationId, quantity: diff.abs(), unit: row.unit, reason: `Count: ${row.quantity} → ${counted}. ${b.note ?? ''}`.trim(), createdById: req.ctx.userId } });
      out.push({ batchId: c.batchId, before: num(row.quantity), after: c.countedQuantity, difference: num(diff) });
    }
    await audit(req.ctx, 'STOCK_RECONCILE', 'Location', b.locationId, { diffs: out, note: b.note }, undefined, tx);
    return out;
  });
  res.json({ differences: diffs });
}));

inventoryRouter.post('/inventory/adjust', requirePerm('inventory:write', 'quality:release'), h(async (req, res) => {
  // Manual adjustments are sensitive: require a justification and the release/validation permission.
  const b = z.object({ locationId: z.string(), batchId: z.string(), newQuantity: z.coerce.number().min(0), reason: z.string().min(5).max(300) }).parse(req.body);
  const cid = companyId(req);
  await prisma.$transaction(async (tx) => {
    const row = await balanceOf(tx, cid, b.locationId, b.batchId);
    const next = D(b.newQuantity);
    if (next.lt(row.reservedQty)) throw conflict('BELOW_RESERVED', 'New quantity is below reserved quantity');
    const diff = next.minus(row.quantity);
    await tx.inventoryBalance.update({ where: { id: row.id }, data: { quantity: next } });
    await tx.stockMovement.create({ data: { companyId: cid, type: 'ADJUSTMENT', batchId: b.batchId, [diff.gt(0) ? 'toLocationId' : 'fromLocationId']: b.locationId, quantity: diff.abs(), unit: row.unit, reason: b.reason, createdById: req.ctx.userId } });
    await audit(req.ctx, 'STOCK_ADJUST', 'InventoryBalance', row.id, b, { quantity: row.quantity }, tx);
  });
  res.json({ ok: true });
}));
