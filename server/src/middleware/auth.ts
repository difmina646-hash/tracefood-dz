import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError, forbidden } from '../lib/errors';
import { prisma } from '../lib/common';
import type { PermissionCode } from '../core/permissions';

export interface Ctx {
  userId: string; isSuperAdmin: boolean; isConsumer: boolean;
  companyId: string | null; companyType: string | null; companyStatus: string | null;
  roleCode: string | null; perms: Set<string>; ip?: string; sessionId?: string;
}
declare module 'express-serve-static-core' { interface Request { ctx: Ctx } }

// Role→permission cache (60 s) to avoid a query per request; invalidated by TTL.
const permCache = new Map<string, { at: number; perms: string[] }>();
async function permsForRole(roleId: string): Promise<string[]> {
  const hit = permCache.get(roleId);
  if (hit && Date.now() - hit.at < 60_000) return hit.perms;
  const rows = await prisma.rolePermission.findMany({ where: { roleId }, include: { permission: true } });
  const perms = rows.map((r) => r.permission.code);
  permCache.set(roleId, { at: Date.now(), perms });
  return perms;
}

export function signToken(userId: string, sessionId: string) {
  return jwt.sign({ sid: sessionId }, env.JWT_SECRET, { subject: userId, expiresIn: '8h' });
}

/** Authenticates the request and resolves the acting company. Authorization is ALWAYS decided here on the server. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHENTICATED', 'Missing token');
    let payload: jwt.JwtPayload;
    try { payload = jwt.verify(header.slice(7), env.JWT_SECRET) as jwt.JwtPayload; } catch { throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired token'); }
    const session = await prisma.session.findUnique({ where: { id: String(payload.sid) } });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== payload.sub) throw new AppError(401, 'SESSION_ENDED', 'Session ended');
    const user = await prisma.user.findUnique({ where: { id: session.userId }, include: { memberships: { where: { active: true }, include: { company: true, role: true } } } });
    if (!user || user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_DISABLED', 'Account suspended or disabled');

    const ctx: Ctx = { userId: user.id, isSuperAdmin: user.isSuperAdmin, isConsumer: user.isConsumer, companyId: null, companyType: null, companyStatus: null, roleCode: null, perms: new Set(), ip: req.ip, sessionId: session.id };
    if (user.isSuperAdmin) {
      const role = await prisma.role.findUnique({ where: { code: 'SUPER_ADMIN' } });
      ctx.roleCode = 'SUPER_ADMIN';
      if (role) (await permsForRole(role.id)).forEach((p) => ctx.perms.add(p));
    } else if (!user.isConsumer) {
      const wanted = req.header('x-company-id');
      const m = wanted ? user.memberships.find((x) => x.companyId === wanted) : user.memberships[0];
      if (wanted && !m) throw forbidden('Not a member of this company');
      if (m) {
        ctx.companyId = m.companyId; ctx.companyType = m.company.type; ctx.companyStatus = m.company.status; ctx.roleCode = m.role.code;
        // A company that is not ACTIVE (pending, rejected, suspended) has NO business permissions.
        if (m.company.status === 'ACTIVE') (await permsForRole(m.roleId)).forEach((p) => ctx.perms.add(p));
      }
    }
    req.ctx = ctx;
    next();
  } catch (e) { next(e); }
}

/** Requires ALL listed permissions. Business endpoints also need an acting company (see companyId()). */
export const requirePerm = (...codes: PermissionCode[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.ctx) return next(new AppError(401, 'UNAUTHENTICATED'));
  if (req.ctx.companyStatus && req.ctx.companyStatus !== 'ACTIVE' && !req.ctx.isSuperAdmin) return next(new AppError(403, 'COMPANY_NOT_ACTIVE', `Company status: ${req.ctx.companyStatus}`));
  const missing = codes.filter((c) => !req.ctx.perms.has(c));
  if (missing.length) return next(forbidden(`Missing permission: ${missing.join(', ')}`));
  next();
};

/** The acting company id; every business query MUST be filtered with it (company-level data isolation). */
export function companyId(req: Request): string {
  if (!req.ctx.companyId) throw forbidden('This action requires a company account');
  return req.ctx.companyId;
}
export const requireConsumer = (req: Request, _res: Response, next: NextFunction) => (req.ctx?.isConsumer ? next() : next(forbidden('Consumer account required')));

/** Passes if the user holds AT LEAST ONE of the listed permissions. */
export const requireAny = (...codes: PermissionCode[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.ctx) return next(new AppError(401, 'UNAUTHENTICATED'));
  if (req.ctx.companyStatus && req.ctx.companyStatus !== 'ACTIVE' && !req.ctx.isSuperAdmin) return next(new AppError(403, 'COMPANY_NOT_ACTIVE'));
  return codes.some((c) => req.ctx.perms.has(c)) ? next() : next(forbidden(`Requires one of: ${codes.join(', ')}`));
};
