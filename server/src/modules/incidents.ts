import { Router } from 'express';
import { z } from 'zod';
import { prisma, h, paging, genCode } from '../lib/common';
import { notFound, conflict, unprocessable } from '../lib/errors';
import { authenticate, requirePerm, companyId } from '../middleware/auth';
import { audit } from '../lib/audit';
import { engine } from './trace';
import type { ForwardResult } from '../core/traceability';

export const incidentRouter = Router();
incidentRouter.use(authenticate);

const ncIn = z.object({ title: z.string().min(3).max(200), description: z.string().min(5).max(4000), severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  materialLotId: z.string().optional(), productionBatchId: z.string().optional(), detectedAt: z.coerce.date().optional() })
  .refine((v) => !!v.materialLotId !== !!v.productionBatchId, 'Provide exactly one of materialLotId or productionBatchId');

incidentRouter.post('/incidents', requirePerm('incident:write'), h(async (req, res) => {
  const b = ncIn.parse(req.body);
  const cid = companyId(req);
  const nc = await prisma.$transaction(async (tx) => {
    if (b.materialLotId && !(await tx.materialLot.count({ where: { id: b.materialLotId, companyId: cid } }))) throw notFound('Material lot');
    if (b.productionBatchId && !(await tx.productionBatch.count({ where: { id: b.productionBatchId, companyId: cid } }))) throw notFound('Production batch');
    const n = await tx.nonConformity.create({ data: { ...b, companyId: cid, code: genCode('NC'), detectedAt: b.detectedAt ?? new Date(), reportedById: req.ctx.userId } });
    await tx.notification.create({ data: { companyId: cid, type: 'NON_CONFORMITY', severity: b.severity, title: `Non-conformité ${n.code}`, message: b.title, entity: 'NonConformity', entityId: n.id } });
    await audit(req.ctx, 'NC_CREATE', 'NonConformity', n.id, b, undefined, tx);
    return n;
  });
  res.status(201).json(nc);
}));

incidentRouter.get('/incidents', requirePerm('incident:read'), h(async (req, res) => {
  const { status } = z.object({ status: z.string().optional() }).parse(req.query);
  const p = paging(req.query);
  const where = { companyId: companyId(req), ...(status ? { status: status as never } : {}) };
  const [items, total] = await Promise.all([prisma.nonConformity.findMany({ where, include: { materialLot: { select: { internalLotNumber: true } }, productionBatch: { select: { batchNumber: true } } }, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }), prisma.nonConformity.count({ where })]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
}));

async function loadNc(id: string, cid: string) {
  const nc = await prisma.nonConformity.findFirst({ where: { id, companyId: cid }, include: { materialLot: { include: { material: true, supplier: true } }, productionBatch: { include: { product: true } }, correctiveActions: { include: { responsible: { select: { fullName: true } } } }, preventiveActions: { include: { responsible: { select: { fullName: true } } } }, reportedBy: { select: { fullName: true } } } });
  if (!nc) throw notFound('Non-conformity');
  return nc;
}
incidentRouter.get('/incidents/:id', requirePerm('incident:read'), h(async (req, res) => res.json(await loadNc(String(req.params.id), companyId(req)))));

incidentRouter.patch('/incidents/:id/status', requirePerm('incident:write'), h(async (req, res) => {
  const b = z.object({ status: z.enum(['OPEN', 'INVESTIGATING', 'ACTION_PLANNED', 'CLOSED']), closureNotes: z.string().max(2000).optional() }).parse(req.body);
  const nc = await loadNc(String(req.params.id), companyId(req));
  if (b.status === 'CLOSED') {
    const open = [...nc.correctiveActions, ...nc.preventiveActions].filter((a) => a.status === 'PLANNED' || a.status === 'IN_PROGRESS');
    if (open.length) throw conflict('OPEN_ACTIONS', 'Close or cancel all corrective/preventive actions first', { open: open.length });
    if (!b.closureNotes) throw unprocessable('CLOSURE_NOTES_REQUIRED', 'Closure notes are required');
  }
  const u = await prisma.nonConformity.update({ where: { id: nc.id }, data: { status: b.status, closureNotes: b.closureNotes, closedAt: b.status === 'CLOSED' ? new Date() : null } });
  await audit(req.ctx, 'NC_STATUS', 'NonConformity', nc.id, b, { status: nc.status });
  res.json(u);
}));

const actionIn = z.object({ description: z.string().min(3).max(2000), responsibleId: z.string().optional(), dueDate: z.coerce.date().optional() });
for (const [path, model] of [['corrective-actions', 'correctiveAction'], ['preventive-actions', 'preventiveAction']] as const) {
  incidentRouter.post(`/incidents/:id/${path}`, requirePerm('incident:write'), h(async (req, res) => {
    const b = actionIn.parse(req.body);
    const nc = await loadNc(String(req.params.id), companyId(req));
    if (b.responsibleId && !(await prisma.companyMembership.count({ where: { userId: b.responsibleId, companyId: nc.companyId, active: true } }))) throw notFound('Responsible user (must belong to your company)');
    const a = await (prisma as unknown as Record<string, any>)[model].create({ data: { ...b, nonConformityId: nc.id } });
    if (nc.status === 'OPEN' || nc.status === 'INVESTIGATING') await prisma.nonConformity.update({ where: { id: nc.id }, data: { status: 'ACTION_PLANNED' } });
    await audit(req.ctx, 'ACTION_CREATE', model, a.id, b);
    res.status(201).json(a);
  }));
  incidentRouter.patch(`/incidents/:id/${path}/:actionId`, requirePerm('incident:write'), h(async (req, res) => {
    const b = z.object({ status: z.enum(['PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED']) }).parse(req.body);
    const nc = await loadNc(String(req.params.id), companyId(req));
    const r = await (prisma as unknown as Record<string, any>)[model].updateMany({ where: { id: String(req.params.actionId), nonConformityId: nc.id }, data: { status: b.status, completedAt: b.status === 'DONE' ? new Date() : null } });
    if (!r.count) throw notFound('Action');
    await audit(req.ctx, 'ACTION_STATUS', model, String(req.params.actionId), b);
    res.json({ ok: true });
  }));
}

const rootOf = (nc: { materialLotId: string | null; productionBatchId: string | null }) =>
  nc.materialLotId ? { type: 'MATERIAL_LOT' as const, ids: [nc.materialLotId] } : { type: 'PRODUCTION_BATCH' as const, ids: [nc.productionBatchId!] };

/** Recall / withdrawal SIMULATION: computes and stores the impact. It changes NO stock and NO status. */
incidentRouter.post('/incidents/:id/recall-simulation', requirePerm('recall:simulate'), h(async (req, res) => {
  const cid = companyId(req);
  const nc = await loadNc(String(req.params.id), cid);
  const result = await engine.forward(cid, rootOf(nc));
  const sim = await prisma.recallSimulation.create({ data: { companyId: cid, nonConformityId: nc.id, rootType: result.root.type, rootId: result.root.ids[0], createdById: req.ctx.userId, result: JSON.parse(JSON.stringify(result)),
    affectedBatches: result.totals.batches, affectedShipments: result.totals.shipments, affectedLocations: result.totals.locations } });
  await audit(req.ctx, 'RECALL_SIMULATION', 'NonConformity', nc.id, { simulationId: sim.id, totals: result.totals });
  res.status(201).json({ simulationId: sim.id, createdAt: sim.createdAt, disclaimer: 'Simulation d\'aide à la décision. La décision de retrait/rappel appartient au responsable qualité et aux autorités compétentes.', ...result });
}));
incidentRouter.get('/incidents/:id/simulations', requirePerm('recall:simulate'), h(async (req, res) => {
  const nc = await loadNc(String(req.params.id), companyId(req));
  res.json({ items: await prisma.recallSimulation.findMany({ where: { nonConformityId: nc.id }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, affectedBatches: true, affectedShipments: true, affectedLocations: true, createdBy: { select: { fullName: true } } } }) });
}));

/**
 * REAL precautionary hold (not a simulation): blocks the root lot/batch and every affected batch, notifies the companies
 * that received them. Requires explicit confirmation + quality:release/recall:hold. Fully audited.
 */
incidentRouter.post('/incidents/:id/hold', requirePerm('recall:hold', 'quality:release'), h(async (req, res) => {
  const { confirm, reason } = z.object({ confirm: z.literal(true), reason: z.string().min(5).max(500) }).parse(req.body);
  const cid = companyId(req);
  const nc = await loadNc(String(req.params.id), cid);
  const fwd: ForwardResult = await engine.forward(cid, rootOf(nc));
  const batchIds = fwd.batches.map((b) => b.id);
  const destCompanies = await prisma.location.findMany({ where: { id: { in: fwd.locations.map((l) => l.locationId) } }, select: { companyId: true, name: true } });
  const out = await prisma.$transaction(async (tx) => {
    const msg = `Blocage préventif — ${nc.code}: ${reason}`;
    const lots = await tx.materialLot.updateMany({ where: { companyId: cid, id: { in: fwd.lots.map((l) => l.id) }, status: { in: ['PENDING', 'RELEASED'] } }, data: { status: 'BLOCKED', blockedReason: msg } });
    const batches = await tx.productionBatch.updateMany({ where: { companyId: cid, id: { in: batchIds }, status: { in: ['PENDING', 'RELEASED'] } }, data: { status: 'BLOCKED', blockedReason: msg } });
    await tx.notification.createMany({ data: [...new Set(destCompanies.map((d) => d.companyId))].filter((c) => c !== cid).map((companyId) => ({ companyId, type: 'RECALL_HOLD', severity: 'CRITICAL' as const, title: 'Lot bloqué par le fabricant', message: `Lots concernés: ${fwd.batches.map((b) => b.batchNumber).join(', ')}. Ne pas vendre ni distribuer.`, entity: 'NonConformity', entityId: nc.id })) });
    await tx.nonConformity.update({ where: { id: nc.id }, data: { status: nc.status === 'OPEN' ? 'INVESTIGATING' : nc.status } });
    await audit(req.ctx, 'RECALL_HOLD', 'NonConformity', nc.id, { lotsBlocked: lots.count, batchesBlocked: batches.count, reason, batches: fwd.batches.map((b) => b.batchNumber) }, undefined, tx);
    return { lotsBlocked: lots.count, batchesBlocked: batches.count, plannedShipmentsToReview: fwd.shipments.filter((s) => !s.dispatched).map((s) => s.shipmentNumber) };
  });
  res.json(out);
}));

incidentRouter.get('/incidents/:id/report', requirePerm('incident:read'), h(async (req, res) => {
  const cid = companyId(req);
  const nc = await loadNc(String(req.params.id), cid);
  const [lastSim, trail] = await Promise.all([
    prisma.recallSimulation.findFirst({ where: { nonConformityId: nc.id }, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.findMany({ where: { companyId: cid, entityId: nc.id }, orderBy: { createdAt: 'asc' }, include: { user: { select: { fullName: true } } } }),
  ]);
  res.json({ generatedAt: new Date(), nonConformity: nc, latestSimulation: lastSim, auditTrail: trail.map((a) => ({ at: a.createdAt, by: a.user?.fullName, action: a.action })) });
}));

// ───── Complaints from consumers (read by the manufacturer concerned) ─────
incidentRouter.get('/complaints', requirePerm('complaint:read'), h(async (req, res) => {
  const p = paging(req.query);
  res.json({ items: await prisma.consumerComplaint.findMany({ where: { companyId: companyId(req) }, select: { id: true, type: true, message: true, status: true, createdAt: true, internalNotes: true, batch: { select: { batchNumber: true } } }, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }) });
}));
incidentRouter.patch('/complaints/:id', requirePerm('complaint:read', 'incident:write'), h(async (req, res) => {
  const b = z.object({ status: z.enum(['NEW', 'IN_REVIEW', 'RESOLVED', 'REJECTED']), internalNotes: z.string().max(2000).optional() }).parse(req.body);
  const r = await prisma.consumerComplaint.updateMany({ where: { id: String(req.params.id), companyId: companyId(req) }, data: b });
  if (!r.count) throw notFound('Complaint');
  res.json({ ok: true });
}));

// ───── HACCP-support risk analysis (aid only — does not replace a full HACCP study) ─────
const riskItem = z.object({ processStep: z.string().min(2), hazard: z.string().min(2), hazardType: z.enum(['BIOLOGICAL', 'CHEMICAL', 'PHYSICAL', 'ALLERGEN']), cause: z.string().optional(), severity: z.number().int().min(1).max(5), likelihood: z.number().int().min(1).max(5), preventiveMeasure: z.string().optional(), isCcp: z.boolean().default(false), criticalLimit: z.string().optional(), monitoring: z.string().optional(), correctiveAction: z.string().optional() });
const score = (s: number, l: number) => ({ score: s * l, level: s * l >= 15 ? 'HIGH' : s * l >= 8 ? 'MEDIUM' : 'LOW' });
incidentRouter.post('/risk-assessments', requirePerm('risk:write'), h(async (req, res) => {
  const b = z.object({ title: z.string().min(3), scope: z.string().optional(), productId: z.string().optional(), items: z.array(riskItem).default([]) }).parse(req.body);
  const cid = companyId(req);
  if (b.productId && !(await prisma.product.count({ where: { id: b.productId, companyId: cid } }))) throw notFound('Product');
  const r = await prisma.riskAssessment.create({ data: { companyId: cid, title: b.title, scope: b.scope, productId: b.productId, createdById: req.ctx.userId, items: { create: b.items } }, include: { items: true } });
  await audit(req.ctx, 'CREATE', 'RiskAssessment', r.id, { title: b.title });
  res.status(201).json(r);
}));
incidentRouter.post('/risk-assessments/:id/items', requirePerm('risk:write'), h(async (req, res) => {
  const a = await prisma.riskAssessment.findFirst({ where: { id: String(req.params.id), companyId: companyId(req) } });
  if (!a) throw notFound('Risk assessment');
  res.status(201).json(await prisma.riskItem.create({ data: { ...riskItem.parse(req.body), assessmentId: a.id } }));
}));
incidentRouter.get('/risk-assessments', requirePerm('incident:read'), h(async (req, res) => res.json({ items: await prisma.riskAssessment.findMany({ where: { companyId: companyId(req) }, include: { _count: { select: { items: true } } }, orderBy: { createdAt: 'desc' } }) })));
incidentRouter.get('/risk-assessments/:id', requirePerm('incident:read'), h(async (req, res) => {
  const a = await prisma.riskAssessment.findFirst({ where: { id: String(req.params.id), companyId: companyId(req) }, include: { items: true, product: { select: { name: true } } } });
  if (!a) throw notFound('Risk assessment');
  res.json({ ...a, items: a.items.map((i) => ({ ...i, ...score(i.severity, i.likelihood) })), disclaimer: 'Outil d\'aide à l\'analyse des dangers. Ne remplace pas une étude HACCP complète ni la validation par des professionnels compétents.' });
}));
