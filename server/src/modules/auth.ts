import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma, h, hash } from '../lib/common';
import { AppError } from '../lib/errors';
import { authenticate, signToken } from '../middleware/auth';
import { authLimiter } from '../middleware/limits';
import { ADMIN_ROLE_FOR_COMPANY_TYPE } from '../core/permissions';
import { audit } from '../lib/audit';
import { isProd } from '../config/env';

export const authRouter = Router();
const password = z.string().min(10, 'Minimum 10 characters').max(128).regex(/[A-Za-z]/, 'Needs a letter').regex(/[0-9]/, 'Needs a digit');
const MAX_FAILS = 5, LOCK_MIN = 15;

const profile = (u: { id: string; email: string; fullName: string; language: string; isSuperAdmin: boolean; isConsumer: boolean }, memberships: Array<{ company: { id: string; name: string; type: string; status: string }; role: { code: string } }>) => ({
  id: u.id, email: u.email, fullName: u.fullName, language: u.language, isSuperAdmin: u.isSuperAdmin, isConsumer: u.isConsumer,
  companies: memberships.map((m) => ({ id: m.company.id, name: m.company.name, type: m.company.type, status: m.company.status, role: m.role.code })),
});

authRouter.post('/register-company', authLimiter, h(async (req, res) => {
  const b = z.object({
    company: z.object({ name: z.string().min(2), type: z.enum(['MANUFACTURER', 'SUPPLIER', 'TRANSPORTER', 'RETAILER', 'DISTRIBUTOR']), email: z.string().email(), phone: z.string().optional(), address: z.string().optional(), wilaya: z.string().optional(), registrationNumber: z.string().optional() }),
    user: z.object({ fullName: z.string().min(2), email: z.string().email(), password, phone: z.string().optional() }),
  }).parse(req.body);
  const role = await prisma.role.findUnique({ where: { code: ADMIN_ROLE_FOR_COMPANY_TYPE[b.company.type] } });
  if (!role) throw new AppError(500, 'ROLE_MISSING', 'Roles not seeded — run npm run setup');
  const passwordHash = await bcrypt.hash(b.user.password, 12);
  const created = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { ...b.company, status: 'PENDING' } });
    const user = await tx.user.create({ data: { email: b.user.email.toLowerCase(), fullName: b.user.fullName, phone: b.user.phone, passwordHash } });
    await tx.companyMembership.create({ data: { companyId: company.id, userId: user.id, roleId: role.id } });
    await tx.companyApproval.create({ data: { companyId: company.id } });
    return { company, user };
  });
  res.status(201).json({ message: 'Registration received. A platform administrator must approve the company before it can be used.', companyId: created.company.id, status: 'PENDING' });
}));

authRouter.post('/register-consumer', authLimiter, h(async (req, res) => {
  const b = z.object({ email: z.string().email(), password, displayName: z.string().min(2).max(60), age: z.number().int().min(5).max(120).optional(), language: z.enum(['fr', 'ar']).default('fr') }).parse(req.body);
  const role = await prisma.role.findUnique({ where: { code: 'CONSUMER' } });
  const user = await prisma.user.create({ data: { email: b.email.toLowerCase(), fullName: b.displayName, passwordHash: await bcrypt.hash(b.password, 12), isConsumer: true, language: b.language,
    roles: role ? { create: { roleId: role.id } } : undefined, consumerProfile: { create: { displayName: b.displayName, age: b.age } } } });
  res.status(201).json({ id: user.id });
}));

authRouter.post('/login', authLimiter, h(async (req, res) => {
  const b = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: b.email.toLowerCase() }, include: { memberships: { where: { active: true }, include: { company: true, role: true } } } });
  const generic = new AppError(401, 'BAD_CREDENTIALS', 'Invalid email or password');
  if (!user) { await bcrypt.compare(b.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali'); throw generic; }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
  if (!(await bcrypt.compare(b.password, user.passwordHash))) {
    const fails = user.failedLogins + 1;
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60_000) : null } });
    throw generic;
  }
  if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_DISABLED', 'Account suspended or disabled');
  const raw = crypto.randomBytes(32).toString('hex');
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: hash(raw), expiresAt: new Date(Date.now() + 8 * 3600_000), userAgent: req.header('user-agent')?.slice(0, 250), ip: req.ip } });
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await audit({ userId: user.id, companyId: user.memberships[0]?.companyId ?? null, ip: req.ip }, 'LOGIN', 'User', user.id);
  res.json({ token: signToken(user.id, session.id), user: profile(user, user.memberships) });
}));

authRouter.get('/me', authenticate, h(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.ctx.userId }, include: { memberships: { where: { active: true }, include: { company: true, role: true } } } });
  res.json({ ...profile(user, user.memberships), activeCompanyId: req.ctx.companyId, permissions: [...req.ctx.perms] });
}));

authRouter.post('/logout', authenticate, h(async (req, res) => {
  await prisma.session.updateMany({ where: { id: req.ctx.sessionId, userId: req.ctx.userId }, data: { revokedAt: new Date() } });
  res.status(204).end();
}));

authRouter.post('/change-password', authenticate, h(async (req, res) => {
  const b = z.object({ currentPassword: z.string(), newPassword: password }).parse(req.body);
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.ctx.userId } });
  if (!(await bcrypt.compare(b.currentPassword, u.passwordHash))) throw new AppError(400, 'BAD_PASSWORD', 'Current password is incorrect');
  await prisma.$transaction([
    prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(b.newPassword, 12) } }),
    prisma.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  res.json({ message: 'Password changed. Please log in again.' });
}));

// Password reset. No e-mail provider is configured in local mode: in development the one-time link is printed in the server console.
authRouter.post('/forgot-password', authLimiter, h(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (user) {
    const raw = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hash(raw), expiresAt: new Date(Date.now() + 3600_000) } });
    if (!isProd) console.log(`[DEV] Password reset token for ${email}: ${raw}`);
    // TODO(production): send the link by e-mail through your SMTP provider.
  }
  res.json({ message: 'If this address exists, a reset link has been sent.' }); // same answer either way (no account enumeration)
}));

authRouter.post('/reset-password', authLimiter, h(async (req, res) => {
  const b = z.object({ token: z.string().min(20), newPassword: password }).parse(req.body);
  const t = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hash(b.token) } });
  if (!t || t.usedAt || t.expiresAt < new Date()) throw new AppError(400, 'INVALID_TOKEN', 'Invalid or expired reset token');
  await prisma.$transaction([
    prisma.user.update({ where: { id: t.userId }, data: { passwordHash: await bcrypt.hash(b.newPassword, 12), failedLogins: 0, lockedUntil: null } }),
    prisma.passwordResetToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
    prisma.session.updateMany({ where: { userId: t.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  res.json({ message: 'Password updated.' });
}));
