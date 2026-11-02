import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { AppError } from '../lib/errors';
import { TraceabilityError } from '../core/traceability';
import { isProd } from '../config/env';

/** Central error handler: never leaks stack traces or SQL details to clients. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
  if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  if (err instanceof TraceabilityError) return res.status(err.code === 'ROOT_NOT_FOUND' ? 404 : 422).json({ error: { code: err.code, message: err.message } });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: err.message } });
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: { code: 'DUPLICATE', message: 'A record with the same unique value already exists', details: err.meta } });
    if (err.code === 'P2025') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
    if (err.code === 'P2003') return res.status(409).json({ error: { code: 'IN_USE', message: 'Record is referenced by other data' } });
  }
  if (err instanceof Error && err.message.startsWith('INCOMPATIBLE_UNITS')) return res.status(422).json({ error: { code: 'INCOMPATIBLE_UNITS', message: err.message } });
  console.error('[unhandled]', req.method, req.path, isProd ? (err as Error).message : err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}
