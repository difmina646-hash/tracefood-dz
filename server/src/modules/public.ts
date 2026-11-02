import { Router } from 'express';
import { z } from 'zod';
import { prisma, h } from '../lib/common';
import { AppError } from '../lib/errors';
import { publicLimiter, complaintLimiter } from '../middleware/limits';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { Request } from 'express';

/** Optional: if the sender is logged in as a consumer, the feedback is linked to the account (so they can follow it). */
async function optionalConsumerId(req: Request): Promise<string | undefined> {
  try {
    const t = req.header('authorization'); if (!t?.startsWith('Bearer ')) return undefined;
    const p = jwt.verify(t.slice(7), env.JWT_SECRET) as jwt.JwtPayload;
    const s = await prisma.session.findUnique({ where: { id: String(p.sid) }, include: { user: true } });
    return s && !s.revokedAt && s.expiresAt > new Date() && s.user.isConsumer && s.user.status === 'ACTIVE' ? s.userId : undefined;
  } catch { return undefined; }
}

export const publicRouter = Router();
publicRouter.use(publicLimiter);
const ID = /^[A-Za-z0-9_-]{8,32}$/;
const DISCLAIMER = 'Ce code QR donne accès aux informations déclarées par le fabricant. Il ne constitue pas, à lui seul, une garantie d\'authenticité ou de sécurité du produit.';

async function findQr(publicId: string) {
  if (!ID.test(publicId)) throw new AppError(404, 'QR_UNKNOWN', 'Unknown QR code');
  const qr = await prisma.productQrCode.findUnique({ where: { publicId }, include: { batch: { include: { product: { include: { variants: true } }, productionSteps: { orderBy: { stepOrder: 'asc' } }, company: { include: { certifications: true } } } } } });
  if (!qr) throw new AppError(404, 'QR_UNKNOWN', 'Unknown QR code');
  if (!qr.active) throw new AppError(410, 'QR_INACTIVE', 'This QR code is no longer active');
  return qr;
}

/**
 * PUBLIC consumer view. Whitelist-only: product, batch dates, manufacturer profile, verified certifications,
 * high-level process step NAMES, shops that currently hold the batch, and active promotions.
 * Never returned: suppliers, raw-material lots, quantities, lab results, internal notes, prices of inputs.
 */
publicRouter.get('/qr/:publicId', h(async (req, res) => {
  const qr = await findQr(String(req.params.publicId));
  const b = qr.batch;
  const now = new Date();
  const [balances] = await Promise.all([prisma.inventoryBalance.findMany({ where: { batchId: b.id, quantity: { gt: 0 }, location: { retailStore: { publicListing: true }, company: { status: 'ACTIVE' } } }, include: { location: { include: { retailStore: true } } } })]);
  const stores = balances.filter((x) => x.location.retailStore).map((x) => ({ id: x.location.retailStore!.id, name: x.location.retailStore!.name, city: x.location.city, wilaya: x.location.wilaya, address: x.location.address, openingHours: x.location.retailStore!.openingHours, phone: x.location.retailStore!.phone }));
  const promos = stores.length ? await prisma.promotion.findMany({ where: { active: true, startsAt: { lte: now }, endsAt: { gte: now }, retailStoreId: { in: stores.map((s) => s.id) }, promotionProducts: { some: { productId: b.productId } } }, select: { title: true, description: true, conditions: true, discountPercent: true, startsAt: true, endsAt: true, retailStore: { select: { name: true } } } }) : [];
  const expired = b.expiryDate < now;
  await prisma.productQrCode.update({ where: { id: qr.id }, data: { scanCount: { increment: 1 }, lastScannedAt: now } });
  res.json({
    product: { name: b.product.name, description: b.product.publicDescription, category: b.product.category, varieties: b.product.variants.map((v) => v.name), manufacturingSummary: b.product.manufacturingSummary },
    batch: { number: b.batchNumber, producedAt: b.producedAt, expiryDate: b.expiryDate,
      // Consumer-safe status. Details of any quality issue are handled by the manufacturer, never published here.
      status: b.status === 'BLOCKED' || b.status === 'REJECTED' ? 'UNDER_REVIEW' : expired ? 'EXPIRED' : b.status === 'RELEASED' ? 'OK' : 'UNKNOWN',
      notice: b.status === 'BLOCKED' || b.status === 'REJECTED' ? 'Ce lot fait l\'objet d\'une vérification par le fabricant. Par précaution, ne le consommez pas et contactez le fabricant.' : expired ? 'Cette date de péremption est dépassée. Ne pas consommer.' : null },
    manufacturer: { name: b.company.name, description: b.company.publicDescription, history: b.company.history, city: b.company.city, wilaya: b.company.wilaya, website: b.company.website,
      certifications: b.company.certifications.filter((c) => c.verified && (!c.validTo || c.validTo >= now)).map((c) => ({ name: c.name, issuer: c.issuer, validTo: c.validTo })) },
    processSteps: b.productionSteps.map((s) => s.name),
    availability: { stores }, promotions: promos, disclaimer: DISCLAIMER,
  });
}));

const feedback = z.object({ type: z.enum(['COMPLAINT', 'SAFETY_SIGNAL', 'QUESTION', 'REVIEW']), message: z.string().min(3).max(2000), rating: z.number().int().min(1).max(5).optional(), contactEmail: z.string().email().optional() })
  .refine((v) => v.type !== 'REVIEW' || v.rating !== undefined, 'A review needs a rating');
publicRouter.post('/qr/:publicId/feedback', complaintLimiter, h(async (req, res) => {
  const qr = await findQr(String(req.params.publicId));
  const b = feedback.parse(req.body);
  const consumerId = await optionalConsumerId(req);
  if (b.type === 'REVIEW') await prisma.consumerReview.create({ data: { productId: qr.batch.productId, batchId: qr.batchId, consumerId, rating: b.rating!, comment: b.message } });
  else {
    const c = await prisma.consumerComplaint.create({ data: { companyId: qr.companyId, batchId: qr.batchId, qrCodeId: qr.id, consumerId, type: b.type, message: b.message, contactEmail: b.contactEmail } });
    if (b.type === 'SAFETY_SIGNAL') await prisma.notification.create({ data: { companyId: qr.companyId, type: 'CONSUMER_SAFETY_SIGNAL', severity: 'HIGH', title: `Signalement consommateur — lot ${qr.batch.batchNumber}`, entity: 'ConsumerComplaint', entityId: c.id } });
  }
  res.status(201).json({ message: 'Merci. Votre message a été transmis au fabricant.' });
}));
