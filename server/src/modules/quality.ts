import { z } from 'zod';
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Tx, D, num } from '../lib/common';
import { forbidden, notFound, unprocessable, conflict } from '../lib/errors';
import type { Ctx } from '../middleware/auth';
import { audit } from '../lib/audit';
import { evaluate } from './quality.pure';
import { credit } from '../lib/stock';

export const checkInput = z.object({
  decision: z.enum(['PENDING', 'RELEASED', 'BLOCKED', 'REJECTED']),
  checkedAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
  results: z.array(z.object({
    parameterId: z.string().optional(), parameterName: z.string().max(120).optional(),
    valueNumeric: z.coerce.number().optional(), valueText: z.string().max(500).optional(),
    unit: z.string().max(20).optional(), compliant: z.boolean().optional(),
  }).refine((r) => r.parameterId || (r.parameterName && r.compliant !== undefined), 'Free-form results need parameterName and an explicit compliant flag')).default([]),
  documentIds: z.array(z.string()).default([]),
});
export type CheckInput = z.infer<typeof checkInput>;
export type Target = { kind: 'LOT' | 'BATCH'; id: string };

/**
 * Records a quality check and, when the decision is final, moves the lot/batch status.
 * Rules enforced here (server side):
 *  - final decisions (RELEASED/BLOCKED/REJECTED) need permission quality:release;
 *  - RELEASED is refused if any result is non-compliant or a mandatory parameter is missing;
 *  - a REJECTED target is terminal.
 */
export async function recordCheck(tx: Tx, ctx: Ctx, target: Target, input: CheckInput) {
  const companyId = ctx.companyId!;
  const entity = target.kind === 'LOT'
    ? await tx.materialLot.findFirst({ where: { id: target.id, companyId } })
    : await tx.productionBatch.findFirst({ where: { id: target.id, companyId } });
  if (!entity) throw notFound(target.kind === 'LOT' ? 'Material lot' : 'Production batch');
  if (input.decision !== 'PENDING' && !ctx.perms.has('quality:release')) throw forbidden('Only qualified quality roles can release, block or reject');
  if (entity.status === 'REJECTED' && input.decision === 'RELEASED') throw conflict('TERMINAL_STATUS', 'A rejected item cannot be released');

  const scopes = target.kind === 'LOT' ? ['RAW_MATERIAL', 'BOTH'] : ['FINISHED_PRODUCT', 'BOTH'];
  const params = await tx.qualityParameter.findMany({ where: { companyId, active: true, scope: { in: scopes as never } } });
  const byId = new Map(params.map((p) => [p.id, p]));
  const rows = input.results.map((r) => {
    if (!r.parameterId) return { parameterId: null, parameterName: r.parameterName!, valueNumeric: r.valueNumeric, valueText: r.valueText, unit: r.unit, compliant: r.compliant ?? null };
    const p = byId.get(r.parameterId);
    if (!p) throw unprocessable('UNKNOWN_PARAMETER', `Parameter ${r.parameterId} not found or not applicable`);
    return { parameterId: p.id, parameterName: p.name, valueNumeric: r.valueNumeric, valueText: r.valueText, unit: r.unit ?? p.unit ?? undefined, compliant: evaluate(p, r) };
  });
  if (input.decision === 'RELEASED') {
    const bad = rows.filter((r) => r.compliant === false).map((r) => r.parameterName);
    if (bad.length) throw unprocessable('NON_COMPLIANT_CANNOT_RELEASE', 'Non-compliant results prevent release', { parameters: bad });
    const given = new Set(rows.map((r) => r.parameterId).filter(Boolean));
    const missing = params.filter((p) => p.mandatory && !given.has(p.id)).map((p) => p.name);
    if (missing.length) throw unprocessable('MANDATORY_PARAMETERS_MISSING', 'Mandatory quality parameters are missing', { parameters: missing });
  }
  if (input.documentIds.length) {
    const n = await tx.uploadedDocument.count({ where: { id: { in: input.documentIds }, companyId } });
    if (n !== new Set(input.documentIds).size) throw unprocessable('UNKNOWN_DOCUMENT', 'A referenced document does not exist');
  }
  const final = input.decision !== 'PENDING';
  const check = await tx.qualityCheck.create({ data: {
    companyId, materialLotId: target.kind === 'LOT' ? target.id : undefined, productionBatchId: target.kind === 'BATCH' ? target.id : undefined,
    checkedAt: input.checkedAt ?? new Date(), checkedById: ctx.userId, decision: input.decision, notes: input.notes,
    reviewerId: final ? ctx.userId : undefined, reviewedAt: final ? new Date() : undefined,
  } });
  for (const r of rows) await tx.qualityResult.create({ data: { checkId: check.id, parameterId: r.parameterId ?? undefined, parameterName: r.parameterName, valueNumeric: r.valueNumeric, valueText: r.valueText, unit: r.unit, compliant: r.compliant } });
  for (const documentId of new Set(input.documentIds)) await tx.qualityDocument.create({ data: { checkId: check.id, documentId } });

  if (final) {
    const data = { status: input.decision, blockedReason: input.decision === 'RELEASED' ? null : (input.notes ?? 'No reason given') };
    if (target.kind === 'LOT') await tx.materialLot.update({ where: { id: target.id }, data });
    else {
      await tx.productionBatch.update({ where: { id: target.id }, data: { ...data, ...(input.decision === 'RELEASED' ? { releasedById: ctx.userId, releasedAt: new Date() } : {}) } });
      if (input.decision === 'RELEASED') await onBatchReleased(tx, ctx, target.id);
    }
    if (input.decision !== 'RELEASED') {
      await tx.notification.create({ data: { companyId, type: `${target.kind}_${input.decision}`, severity: 'HIGH', title: `${target.kind === 'LOT' ? 'Lot' : 'Lot fini'} ${input.decision === 'BLOCKED' ? 'bloqué' : 'rejeté'}`, message: input.notes, entity: target.kind, entityId: target.id } });
    }
  }
  await audit(ctx, `QUALITY_${input.decision}`, target.kind === 'LOT' ? 'MaterialLot' : 'ProductionBatch', target.id, { checkId: check.id, results: rows.length, notes: input.notes }, { status: entity.status }, tx);
  return { checkId: check.id, previousStatus: entity.status, newStatus: final ? input.decision : entity.status, results: rows };
}

/** First release of a finished batch: create factory stock (once) and its public QR identifier. */
async function onBatchReleased(tx: Tx, ctx: Ctx, batchId: string) {
  const b = await tx.productionBatch.findUniqueOrThrow({ where: { id: batchId } });
  const already = await tx.stockMovement.count({ where: { batchId, type: 'PRODUCTION_OUTPUT' } });
  if (!already) {
    if (!b.factoryLocationId) throw unprocessable('FACTORY_LOCATION_REQUIRED', 'Batch has no factory location; cannot create stock');
    await credit(tx, b.companyId, b.factoryLocationId, b.id, b.producedQty, b.unit);
    await tx.stockMovement.create({ data: { companyId: b.companyId, type: 'PRODUCTION_OUTPUT', batchId, toLocationId: b.factoryLocationId, quantity: b.producedQty, unit: b.unit, reason: 'Batch released', createdById: ctx.userId } });
  }
  const qr = await tx.productQrCode.findFirst({ where: { batchId } });
  if (!qr) await tx.productQrCode.create({ data: { companyId: b.companyId, batchId, publicId: crypto.randomBytes(9).toString('base64url') } });
}
export { D };
