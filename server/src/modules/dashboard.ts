import { Router } from 'express';
import { prisma, h, num } from '../lib/common';
import { authenticate, requireAny, companyId } from '../middleware/auth';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);
const DAY = 86_400_000;

/** All figures are live COUNT/SUM queries scoped to the acting company. */
dashboardRouter.get('/dashboard', requireAny('report:read', 'production:read', 'inventory:read', 'shipment:read', 'offer:write'), h(async (req, res) => {
  const cid = companyId(req);
  const type = req.ctx.companyType;
  const soon = new Date(Date.now() + 3 * DAY);
  const base = { companyType: type, generatedAt: new Date() };

  if (type === 'MANUFACTURER') {
    const [lots, pendingLots, activeBatches, pendingChecks, blockedBatches, expiring, activeShipments, openNc, stock, recent, byStatus] = await Promise.all([
      prisma.materialLot.count({ where: { companyId: cid } }),
      prisma.materialLot.count({ where: { companyId: cid, status: 'PENDING' } }),
      prisma.productionBatch.count({ where: { companyId: cid, status: { in: ['PENDING', 'RELEASED'] }, expiryDate: { gte: new Date() } } }),
      prisma.productionBatch.count({ where: { companyId: cid, status: 'PENDING' } }),
      prisma.productionBatch.count({ where: { companyId: cid, status: 'BLOCKED' } }),
      prisma.inventoryBalance.count({ where: { companyId: cid, quantity: { gt: 0 }, batch: { status: 'RELEASED', expiryDate: { lte: soon, gte: new Date() } } } }),
      prisma.shipment.count({ where: { companyId: cid, status: { in: ['PLANNED', 'IN_TRANSIT', 'INCIDENT'] } } }),
      prisma.nonConformity.count({ where: { companyId: cid, status: { not: 'CLOSED' } } }),
      prisma.inventoryBalance.aggregate({ where: { companyId: cid }, _sum: { quantity: true } }),
      prisma.auditLog.findMany({ where: { companyId: cid }, orderBy: { createdAt: 'desc' }, take: 10, include: { user: { select: { fullName: true } } } }),
      prisma.productionBatch.groupBy({ by: ['status'], where: { companyId: cid }, _count: true }),
    ]);
    const alerts = await prisma.notification.findMany({ where: { companyId: cid, readAt: null }, orderBy: { createdAt: 'desc' }, take: 10 });
    return res.json({ ...base, kpis: { rawMaterialLots: lots, lotsPendingQuality: pendingLots, activeBatches, batchesPendingQuality: pendingChecks, blockedBatches, expiringBatches: expiring, activeShipments, openNonConformities: openNc, availableInventory: num(stock._sum.quantity) }, batchesByStatus: byStatus, alerts, recentActivity: recent.map((a) => ({ at: a.createdAt, by: a.user?.fullName, action: a.action, entity: a.entity })) });
  }
  if (type === 'RETAILER' || type === 'DISTRIBUTOR') {
    const [incoming, balances, expiring, promos] = await Promise.all([
      prisma.shipment.count({ where: { toLocation: { companyId: cid }, status: { in: ['IN_TRANSIT', 'DELIVERED', 'INCIDENT'] } } }),
      prisma.inventoryBalance.aggregate({ where: { companyId: cid }, _sum: { quantity: true }, _count: true }),
      prisma.inventoryBalance.count({ where: { companyId: cid, quantity: { gt: 0 }, batch: { expiryDate: { lte: soon } } } }),
      prisma.promotion.count({ where: { companyId: cid, active: true, endsAt: { gte: new Date() } } }),
    ]);
    const blocked = await prisma.inventoryBalance.count({ where: { companyId: cid, quantity: { gt: 0 }, batch: { status: { in: ['BLOCKED', 'REJECTED'] } } } });
    return res.json({ ...base, kpis: { incomingDeliveries: incoming, stockLines: balances._count, totalUnits: num(balances._sum.quantity), expiringOrExpired: expiring, blockedBatchesInStock: blocked, activePromotions: promos }, alerts: await prisma.notification.findMany({ where: { companyId: cid, readAt: null }, orderBy: { createdAt: 'desc' }, take: 10 }) });
  }
  if (type === 'TRANSPORTER') {
    const where = { transporter: { linkedCompanyId: cid } };
    const [assigned, incidents, delivered, excursions] = await Promise.all([
      prisma.shipment.count({ where: { ...where, status: { in: ['PLANNED', 'IN_TRANSIT', 'INCIDENT'] } } }), prisma.shipment.count({ where: { ...where, status: 'INCIDENT' } }),
      prisma.shipment.count({ where: { ...where, status: { in: ['DELIVERED', 'RECEIVED', 'PARTIALLY_RECEIVED'] } } }), prisma.temperatureRecord.count({ where: { outOfRange: true, shipment: where } }),
    ]);
    return res.json({ ...base, kpis: { assignedShipments: assigned, incidents, deliveredShipments: delivered, temperatureExcursions: excursions } });
  }
  if (type === 'SUPPLIER') {
    const [offers, open, answered] = await Promise.all([
      prisma.supplierOffer.count({ where: { companyId: cid, status: 'ACTIVE' } }),
      prisma.supplierRequest.count({ where: { offer: { companyId: cid }, status: 'OPEN' } }), prisma.supplierRequest.count({ where: { offer: { companyId: cid }, status: { not: 'OPEN' } } }),
    ]);
    return res.json({ ...base, kpis: { activeOffers: offers, openRequests: open, answeredRequests: answered } });
  }
  res.json({ ...base, kpis: {} });
}));

dashboardRouter.get('/notifications', h(async (req, res) => {
  const where = req.ctx.companyId ? { OR: [{ companyId: req.ctx.companyId }, { userId: req.ctx.userId }] } : { userId: req.ctx.userId };
  res.json({ items: await prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }) });
}));
dashboardRouter.post('/notifications/:id/read', h(async (req, res) => {
  const where = { id: String(req.params.id), ...(req.ctx.companyId ? { OR: [{ companyId: req.ctx.companyId }, { userId: req.ctx.userId }] } : { userId: req.ctx.userId }) };
  await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
  res.status(204).end();
}));

/** Manufacturer statistics for charts: produced quantity per day (last N days), stock per product, shipments per status. */
dashboardRouter.get('/reports/production', requireAny('report:read', 'production:read'), h(async (req, res) => {
  const cid = companyId(req);
  const days = Math.min(180, Math.max(7, Number(req.query.days) || 30));
  const since = new Date(Date.now() - days * DAY);
  const [batches, balances, ships] = await Promise.all([
    prisma.productionBatch.findMany({ where: { companyId: cid, producedAt: { gte: since } }, select: { producedAt: true, producedQty: true, status: true, product: { select: { name: true } } } }),
    prisma.inventoryBalance.findMany({ where: { companyId: cid, quantity: { gt: 0 } }, select: { quantity: true, batch: { select: { product: { select: { name: true } } } } } }),
    prisma.shipment.groupBy({ by: ['status'], where: { companyId: cid }, _count: true }),
  ]);
  const perDay = new Map<string, number>();
  for (const b of batches) { const k = b.producedAt.toISOString().slice(0, 10); perDay.set(k, (perDay.get(k) ?? 0) + num(b.producedQty)); }
  const stock = new Map<string, number>();
  for (const b of balances) stock.set(b.batch.product.name, (stock.get(b.batch.product.name) ?? 0) + num(b.quantity));
  res.json({ days, producedPerDay: [...perDay.entries()].sort().map(([date, quantity]) => ({ date, quantity })),
    stockByProduct: [...stock.entries()].map(([product, quantity]) => ({ product, quantity })), shipmentsByStatus: ships.map((s) => ({ status: s.status, count: s._count })) });
}));
