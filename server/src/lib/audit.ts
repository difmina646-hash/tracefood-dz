import { prisma, Tx } from './common';
import type { Ctx } from '../middleware/auth';

/** Append-only audit trail. Pass the transaction client so the audit row commits/rolls back with the change. */
export async function audit(ctx: Pick<Ctx, 'userId' | 'companyId' | 'ip'>, action: string, entity: string, entityId?: string | null, after?: unknown, before?: unknown, tx?: Tx) {
  const db = tx ?? prisma;
  await db.auditLog.create({ data: {
    companyId: ctx.companyId ?? undefined, userId: ctx.userId, action, entity, entityId: entityId ?? undefined,
    before: before === undefined ? undefined : JSON.parse(JSON.stringify(before)),
    after: after === undefined ? undefined : JSON.parse(JSON.stringify(after)), ip: ctx.ip,
  } });
}
