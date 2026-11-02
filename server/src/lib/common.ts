import { Prisma, PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const prisma = new PrismaClient();
export type Tx = Prisma.TransactionClient;
export const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export const num = (v: Prisma.Decimal | number | string | null | undefined): number => (v == null ? 0 : Number(v.toString()));
/** Human-readable unique-ish code, e.g. MP-20261017-3FA9 (DB unique constraint is the real guard). */
export const genCode = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
export const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
export const h = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => { fn(req, res, next).catch(next); };

/** Pagination helper: ?page=1&pageSize=20 */
export function paging(q: Record<string, unknown>) {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 20));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}
