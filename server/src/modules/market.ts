import { Router } from 'express';
import { z } from 'zod';
import { Unit } from '@prisma/client';
import { prisma, h, paging, D } from '../lib/common';
import { notFound, forbidden, conflict } from '../lib/errors';
import { authenticate, requirePerm, companyId } from '../middleware/auth';
import { audit } from '../lib/audit';

export const marketRouter = Router();
marketRouter.use(authenticate);
const unit = z.nativeEnum(Unit);

// ───── Supplier offers (published by supplier companies) ─────
const offerIn = z.object({ title: z.string().min(3).max(150), category: z.string().min(2).max(60), description: z.string().max(3000).optional(), specifications: z.string().max(3000).optional(), quantityAvailable: z.coerce.number().min(0), unit, unitPrice: z.coerce.number().min(0).optional(), wilaya: z.string().max(60).optional(), status: z.enum(['ACTIVE', 'PAUSED', 'SOLD_OUT']).optional() });
marketRouter.post('/offers', requirePerm('offer:write'), h(async (req, res) => {
  const b = offerIn.parse(req.body);
  const o = await prisma.supplierOffer.create({ data: { ...b, companyId: companyId(req) } });
  await audit(req.ctx, 'CREATE', 'SupplierOffer', o.id, b);
  res.status(201).json(o);
}));
marketRouter.get('/offers/mine', requirePerm('offer:write'), h(async (req, res) => res.json({ items: await prisma.supplierOffer.findMany({ where: { companyId: companyId(req) }, include: { _count: { select: { supplierRequests: true } } }, orderBy: { createdAt: 'desc' } }) })));
marketRouter.put('/offers/:id', requirePerm('offer:write'), h(async (req, res) => {
  const r = await prisma.supplierOffer.updateMany({ where: { id: String(req.params.id), companyId: companyId(req) }, data: offerIn.partial().parse(req.body) });
  if (!r.count) throw notFound('Offer');
  res.json({ ok: true });
}));
/** Search by type, specification text, minimum quantity and location (manufacturers). Supplier price is shown as published. */
marketRouter.get('/offers', requirePerm('request:write'), h(async (req, res) => {
  const { q, category, wilaya, minQty } = z.object({ q: z.string().optional(), category: z.string().optional(), wilaya: z.string().optional(), minQty: z.coerce.number().optional() }).parse(req.query);
  const p = paging(req.query);
  const where = { status: 'ACTIVE' as const, company: { status: 'ACTIVE' as const }, ...(category ? { category } : {}), ...(wilaya ? { wilaya } : {}), ...(minQty ? { quantityAvailable: { gte: minQty } } : {}), ...(q ? { OR: [{ title: { contains: q } }, { specifications: { contains: q } }, { description: { contains: q } }] } : {}) };
  const [items, total] = await Promise.all([prisma.supplierOffer.findMany({ where, include: { company: { select: { id: true, name: true, wilaya: true, phone: true, email: true } }, uploadedDocuments: { select: { id: true, originalName: true, kind: true } } }, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }), prisma.supplierOffer.count({ where })]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
}));

// ───── Requests (price quotes / questions) ─────
marketRouter.post('/offers/:id/requests', requirePerm('request:write'), h(async (req, res) => {
  const b = z.object({ message: z.string().min(3).max(2000), quantity: z.coerce.number().positive().optional(), unit: unit.optional() }).parse(req.body);
  const offer = await prisma.supplierOffer.findFirst({ where: { id: String(req.params.id), status: 'ACTIVE', company: { status: 'ACTIVE' } } });
  if (!offer) throw notFound('Offer');
  if (offer.companyId === companyId(req)) throw forbidden('You cannot request your own offer');
  const r = await prisma.$transaction(async (tx) => {
    const created = await tx.supplierRequest.create({ data: { offerId: offer.id, requesterCompanyId: companyId(req), requestedById: req.ctx.userId, message: b.message, quantity: b.quantity === undefined ? undefined : D(b.quantity), unit: b.unit } });
    await tx.notification.create({ data: { companyId: offer.companyId, type: 'SUPPLIER_REQUEST', severity: 'LOW', title: `Nouvelle demande: ${offer.title}`, entity: 'SupplierRequest', entityId: created.id } });
    return created;
  });
  res.status(201).json(r);
}));
marketRouter.get('/requests', requirePerm('request:read', 'offer:write'), h(async (req, res) => { // supplier inbox
  res.json({ items: await prisma.supplierRequest.findMany({ where: { offer: { companyId: companyId(req) } }, include: { offer: { select: { title: true } }, requesterCompany: { select: { id: true, name: true, email: true, phone: true } }, requestedBy: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } }) });
}));
marketRouter.get('/requests/sent', requirePerm('request:write'), h(async (req, res) => res.json({ items: await prisma.supplierRequest.findMany({ where: { requesterCompanyId: companyId(req) }, include: { offer: { select: { title: true, company: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' } }) })));
marketRouter.post('/requests/:id/respond', requirePerm('offer:write'), h(async (req, res) => {
  const b = z.object({ response: z.string().min(2).max(2000), status: z.enum(['ANSWERED', 'ACCEPTED', 'DECLINED', 'CLOSED']).default('ANSWERED') }).parse(req.body);
  const r = await prisma.supplierRequest.updateMany({ where: { id: String(req.params.id), offer: { companyId: companyId(req) } }, data: b });
  if (!r.count) throw notFound('Request');
  res.json({ ok: true });
}));

// ───── Messages between companies (supplier↔manufacturer, retailer↔transporter) ─────
marketRouter.post('/messages', requirePerm('message:write'), h(async (req, res) => {
  const b = z.object({ recipientCompanyId: z.string(), body: z.string().min(1).max(2000), shipmentId: z.string().optional(), requestId: z.string().optional() }).parse(req.body);
  const cid = companyId(req);
  const to = await prisma.company.findFirst({ where: { id: b.recipientCompanyId, status: 'ACTIVE', type: { not: 'PLATFORM' } } });
  if (!to) throw notFound('Recipient company');
  if (b.shipmentId && !(await prisma.shipment.count({ where: { id: b.shipmentId, OR: [{ companyId: cid }, { toLocation: { companyId: cid } }, { transporter: { linkedCompanyId: cid } }] } }))) throw forbidden('Shipment not accessible');
  const m = await prisma.message.create({ data: { senderCompanyId: cid, recipientCompanyId: to.id, senderId: req.ctx.userId, body: b.body, shipmentId: b.shipmentId, requestId: b.requestId } });
  await prisma.notification.create({ data: { companyId: to.id, type: 'MESSAGE', severity: 'LOW', title: 'Nouveau message', entity: 'Message', entityId: m.id } });
  res.status(201).json(m);
}));
marketRouter.get('/messages', requirePerm('message:write'), h(async (req, res) => {
  const cid = companyId(req);
  res.json({ items: await prisma.message.findMany({ where: { OR: [{ senderCompanyId: cid }, { recipientCompanyId: cid }] }, include: { senderCompany: { select: { name: true } }, recipientCompany: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }) });
}));

// ───── Retail promotions (shown on the consumer page for stores holding the product) ─────
marketRouter.post('/promotions', requirePerm('promotion:write'), h(async (req, res) => {
  const b = z.object({ retailStoreId: z.string(), title: z.string().min(3).max(150), description: z.string().max(1000).optional(), conditions: z.string().max(1000).optional(), discountPercent: z.coerce.number().min(0).max(100).optional(), startsAt: z.coerce.date(), endsAt: z.coerce.date(), productIds: z.array(z.string()).min(1) })
    .refine((v) => v.endsAt > v.startsAt, 'endsAt must be after startsAt').parse(req.body);
  const cid = companyId(req);
  if (!(await prisma.retailStore.count({ where: { id: b.retailStoreId, companyId: cid } }))) throw notFound('Store');
  // products are manufacturers' records: a retailer may only promote products it has actually received
  const known = await prisma.inventoryBalance.findMany({ where: { companyId: cid, batch: { productId: { in: b.productIds } } }, select: { batch: { select: { productId: true } } } });
  const ok = new Set(known.map((k) => k.batch.productId));
  if (b.productIds.some((id) => !ok.has(id))) throw conflict('PRODUCT_NOT_IN_STOCK_HISTORY', 'You can only promote products your store has received');
  const { productIds, ...data } = b;
  const p = await prisma.promotion.create({ data: { ...data, companyId: cid, promotionProducts: { create: productIds.map((productId) => ({ productId })) } } });
  await audit(req.ctx, 'CREATE', 'Promotion', p.id, b);
  res.status(201).json(p);
}));
marketRouter.get('/promotions', requirePerm('promotion:write'), h(async (req, res) => res.json({ items: await prisma.promotion.findMany({ where: { companyId: companyId(req) }, include: { retailStore: { select: { name: true } }, promotionProducts: { include: { product: { select: { name: true } } } } }, orderBy: { startsAt: 'desc' } }) })));
marketRouter.post('/promotions/:id/deactivate', requirePerm('promotion:write'), h(async (req, res) => {
  const r = await prisma.promotion.updateMany({ where: { id: String(req.params.id), companyId: companyId(req) }, data: { active: false } });
  if (!r.count) throw notFound('Promotion');
  res.json({ ok: true });
}));
