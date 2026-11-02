import { Router } from 'express';
import { z } from 'zod';
import { prisma, h } from '../lib/common';
import { notFound, forbidden } from '../lib/errors';
import { authenticate, requireConsumer, companyId } from '../middleware/auth';
import { audit } from '../lib/audit';

export const companyRouter = Router();
companyRouter.use(authenticate);

// Company-administration is decided by role code (no new DB permission is needed, so existing databases keep working).
const COMPANY_ADMIN_ROLES = new Set(['MANUFACTURER_ADMIN', 'SUPPLIER_ADMIN', 'RETAIL_MANAGER', 'DISTRIBUTOR_MANAGER', 'TRANSPORTER']);
const mustAdmin = (roleCode: string | null) => { if (!roleCode || !COMPANY_ADMIN_ROLES.has(roleCode)) throw forbidden('Company administrator role required'); };

companyRouter.get('/company/profile', h(async (req, res) => {
  const c = await prisma.company.findUnique({ where: { id: companyId(req) }, include: { certifications: { orderBy: { createdAt: 'desc' } } } });
  if (!c) throw notFound('Company');
  res.json(c);
}));
companyRouter.put('/company/profile', h(async (req, res) => {
  mustAdmin(req.ctx.roleCode);
  const b = z.object({ phone: z.string().max(40).optional(), address: z.string().max(200).optional(), city: z.string().max(80).optional(), wilaya: z.string().max(80).optional(), website: z.string().max(200).optional(), description: z.string().max(3000).optional(), publicDescription: z.string().max(3000).optional(), history: z.string().max(5000).optional() }).parse(req.body);
  const before = await prisma.company.findUniqueOrThrow({ where: { id: companyId(req) } });
  const u = await prisma.company.update({ where: { id: before.id }, data: b });
  await audit(req.ctx, 'COMPANY_PROFILE', 'Company', u.id, b, before);
  res.json(u);
}));
companyRouter.get('/company/members', h(async (req, res) => {
  const m = await prisma.companyMembership.findMany({ where: { companyId: companyId(req), active: true }, include: { user: { select: { id: true, fullName: true, email: true, status: true } }, role: { select: { code: true, name: true } } } });
  res.json({ items: m.map((x) => ({ id: x.user.id, fullName: x.user.fullName, email: x.user.email, status: x.user.status, role: x.role.code, roleName: x.role.name })) });
}));
// Certifications are DECLARED by the company and become visible to consumers only after a platform administrator verifies them.
companyRouter.post('/company/certifications', h(async (req, res) => {
  mustAdmin(req.ctx.roleCode);
  const b = z.object({ name: z.string().min(2).max(120), issuer: z.string().max(120).optional(), number: z.string().max(60).optional(), validFrom: z.coerce.date().optional(), validTo: z.coerce.date().optional() }).parse(req.body);
  const c = await prisma.certification.create({ data: { ...b, companyId: companyId(req) } });
  await audit(req.ctx, 'CERT_DECLARE', 'Certification', c.id, b);
  res.status(201).json(c);
}));
companyRouter.delete('/company/certifications/:id', h(async (req, res) => {
  mustAdmin(req.ctx.roleCode);
  const r = await prisma.certification.deleteMany({ where: { id: String(req.params.id), companyId: companyId(req) } });
  if (!r.count) throw notFound('Certification');
  await audit(req.ctx, 'CERT_DELETE', 'Certification', String(req.params.id));
  res.status(204).end();
}));

// ───── Super admin: certification verification & supplier-space supervision ─────
companyRouter.get('/admin/certifications', h(async (req, res) => {
  if (!req.ctx.perms.has('admin:companies')) throw forbidden();
  const verified = req.query.verified === 'true' ? true : req.query.verified === 'false' ? false : undefined;
  res.json({ items: await prisma.certification.findMany({ where: verified === undefined ? {} : { verified }, include: { company: { select: { name: true, type: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }) });
}));
companyRouter.post('/admin/certifications/:id/verify', h(async (req, res) => {
  if (!req.ctx.perms.has('admin:companies')) throw forbidden();
  const { verified } = z.object({ verified: z.boolean() }).parse(req.body);
  const c = await prisma.certification.findUnique({ where: { id: String(req.params.id) } });
  if (!c) throw notFound('Certification');
  await prisma.certification.update({ where: { id: c.id }, data: { verified, verifiedById: verified ? req.ctx.userId : null } });
  await audit(req.ctx, verified ? 'CERT_VERIFY' : 'CERT_UNVERIFY', 'Certification', c.id, { name: c.name, company: c.companyId });
  res.json({ ok: true });
}));
companyRouter.get('/admin/offers', h(async (req, res) => {
  if (!req.ctx.perms.has('admin:companies')) throw forbidden();
  res.json({ items: await prisma.supplierOffer.findMany({ include: { company: { select: { name: true, status: true } }, _count: { select: { supplierRequests: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }) });
}));
companyRouter.post('/admin/offers/:id/status', h(async (req, res) => {
  if (!req.ctx.perms.has('admin:companies')) throw forbidden();
  const { status } = z.object({ status: z.enum(['ACTIVE', 'PAUSED']) }).parse(req.body);
  const r = await prisma.supplierOffer.updateMany({ where: { id: String(req.params.id) }, data: { status } });
  if (!r.count) throw notFound('Offer');
  await audit(req.ctx, 'OFFER_MODERATE', 'SupplierOffer', String(req.params.id), { status });
  res.json({ ok: true });
}));

// ───── Consumer self-service (consumer accounts only) ─────
companyRouter.get('/consumer/profile', requireConsumer, h(async (req, res) => {
  const p = await prisma.consumerProfile.findUnique({ where: { userId: req.ctx.userId } });
  res.json(p ?? { displayName: '' });
}));
companyRouter.put('/consumer/profile', requireConsumer, h(async (req, res) => {
  const b = z.object({ displayName: z.string().min(2).max(60), age: z.number().int().min(5).max(120).nullable().optional(), showNamePublicly: z.boolean().optional() }).parse(req.body);
  const p = await prisma.consumerProfile.upsert({ where: { userId: req.ctx.userId }, create: { userId: req.ctx.userId, displayName: b.displayName, age: b.age ?? undefined, showNamePublicly: b.showNamePublicly }, update: { displayName: b.displayName, age: b.age, showNamePublicly: b.showNamePublicly } });
  res.json(p);
}));
companyRouter.get('/consumer/feedback', requireConsumer, h(async (req, res) => {
  const [complaints, reviews] = await Promise.all([
    prisma.consumerComplaint.findMany({ where: { consumerId: req.ctx.userId }, select: { id: true, type: true, message: true, status: true, createdAt: true, batch: { select: { batchNumber: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.consumerReview.findMany({ where: { consumerId: req.ctx.userId }, select: { id: true, rating: true, comment: true, createdAt: true, product: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
  ]);
  res.json({ complaints, reviews });
}));

/** Public-ish directory of ACTIVE companies (name/type/wilaya only) — used to link a transporter and to address messages. */
companyRouter.get('/directory/companies', h(async (req, res) => {
  if (!req.ctx.companyId) throw forbidden();
  const { type, q } = z.object({ type: z.string().optional(), q: z.string().optional() }).parse(req.query);
  const items = await prisma.company.findMany({ where: { status: 'ACTIVE', type: type ? (type as never) : { not: 'PLATFORM' }, id: { not: req.ctx.companyId }, ...(q ? { name: { contains: q } } : {}) }, select: { id: true, name: true, type: true, wilaya: true }, orderBy: { name: 'asc' }, take: 100 });
  res.json({ items });
}));
