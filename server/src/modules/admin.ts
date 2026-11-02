import { Router } from 'express';
import { z } from 'zod';
import { prisma, h, paging } from '../lib/common';
import { notFound, conflict } from '../lib/errors';
import { authenticate, requirePerm } from '../middleware/auth';
import { audit } from '../lib/audit';

export const adminRouter = Router();
adminRouter.use(authenticate);

adminRouter.get('/companies', requirePerm('admin:companies'), h(async (req, res) => {
  const { status, type, q } = z.object({ status: z.string().optional(), type: z.string().optional(), q: z.string().optional() }).parse(req.query);
  const p = paging(req.query);
  const where = { type: { not: 'PLATFORM' as const }, ...(status ? { status: status as never } : {}), ...(type ? { type: type as never } : {}), ...(q ? { name: { contains: q } } : {}) };
  const [items, total] = await Promise.all([
    prisma.company.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { _count: { select: { memberships: true } } } }),
    prisma.company.count({ where }),
  ]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
}));

async function decide(req: import('express').Request, to: 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | 'DEACTIVATED', allowedFrom: string[]) {
  const reason = z.object({ reason: z.string().max(500).optional() }).parse(req.body ?? {}).reason;
  const c = await prisma.company.findUnique({ where: { id: String(req.params.id) } });
  if (!c || c.type === 'PLATFORM') throw notFound('Company');
  if (!allowedFrom.includes(c.status)) throw conflict('INVALID_TRANSITION', `Cannot go from ${c.status} to ${to}`);
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.company.update({ where: { id: c.id }, data: { status: to } });
    if (['ACTIVE', 'REJECTED'].includes(to)) await tx.companyApproval.create({ data: { companyId: c.id, decision: to === 'ACTIVE' ? 'APPROVED' : 'REJECTED', decidedById: req.ctx.userId, decidedAt: new Date(), reason } });
    await audit(req.ctx, `COMPANY_${to}`, 'Company', c.id, { reason }, { status: c.status }, tx);
    return u;
  });
  return updated;
}
adminRouter.post('/companies/:id/approve', requirePerm('admin:companies'), h(async (req, res) => res.json(await decide(req, 'ACTIVE', ['PENDING', 'SUSPENDED', 'REJECTED']))));
adminRouter.post('/companies/:id/reject', requirePerm('admin:companies'), h(async (req, res) => res.json(await decide(req, 'REJECTED', ['PENDING']))));
adminRouter.post('/companies/:id/suspend', requirePerm('admin:companies'), h(async (req, res) => res.json(await decide(req, 'SUSPENDED', ['ACTIVE']))));
adminRouter.post('/companies/:id/deactivate', requirePerm('admin:companies'), h(async (req, res) => res.json(await decide(req, 'DEACTIVATED', ['ACTIVE', 'SUSPENDED']))));

// Professional users only: consumer accounts and their personal data are deliberately NOT exposed to the super admin.
adminRouter.get('/users', requirePerm('admin:users'), h(async (req, res) => {
  const p = paging(req.query);
  const where = { isConsumer: false, isSuperAdmin: false };
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, select: { id: true, email: true, fullName: true, status: true, lastLoginAt: true, memberships: { select: { company: { select: { id: true, name: true, type: true } }, role: { select: { code: true } } } } } }),
    prisma.user.count({ where }),
  ]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
}));
adminRouter.patch('/users/:id/status', requirePerm('admin:users'), h(async (req, res) => {
  const { status } = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']) }).parse(req.body);
  const u = await prisma.user.findFirst({ where: { id: String(req.params.id), isConsumer: false, isSuperAdmin: false } });
  if (!u) throw notFound('User');
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: u.id }, data: { status } });
    if (status !== 'ACTIVE') await tx.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(req.ctx, 'USER_STATUS', 'User', u.id, { status }, { status: u.status }, tx);
  });
  res.json({ id: u.id, status });
}));

adminRouter.get('/audit', requirePerm('admin:audit'), h(async (req, res) => {
  const p = paging(req.query);
  const { entity, companyId } = z.object({ entity: z.string().optional(), companyId: z.string().optional() }).parse(req.query);
  const where = { ...(entity ? { entity } : {}), ...(companyId ? { companyId } : {}) };
  const [items, total] = await Promise.all([prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { user: { select: { fullName: true, email: true } }, company: { select: { name: true } } } }), prisma.auditLog.count({ where })]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
}));

adminRouter.get('/stats', requirePerm('admin:companies'), h(async (_req, res) => {
  const [byStatus, byType, users, lots, batches, shipments, openNc] = await Promise.all([
    prisma.company.groupBy({ by: ['status'], where: { type: { not: 'PLATFORM' } }, _count: true }),
    prisma.company.groupBy({ by: ['type'], where: { type: { not: 'PLATFORM' } }, _count: true }),
    prisma.user.count({ where: { isConsumer: false, isSuperAdmin: false } }),
    prisma.materialLot.count(), prisma.productionBatch.count(), prisma.shipment.count(), prisma.nonConformity.count({ where: { status: { not: 'CLOSED' } } }),
  ]);
  res.json({ companiesByStatus: byStatus, companiesByType: byType, professionalUsers: users, totals: { materialLots: lots, productionBatches: batches, shipments, openNonConformities: openNc } });
}));
