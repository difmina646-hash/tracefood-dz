import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { prisma, h } from '../lib/common';
import { AppError, notFound } from '../lib/errors';
import { authenticate, requirePerm, companyId } from '../middleware/auth';
import { env } from '../config/env';
import { audit } from '../lib/audit';

export const documentRouter = Router();
documentRouter.use(authenticate);

const dir = path.resolve(env.UPLOAD_DIR);
fs.mkdirSync(dir, { recursive: true });
const MAX = 10 * 1024 * 1024;
const upload = multer({ storage: multer.diskStorage({ destination: dir, filename: (_r, _f, cb) => cb(null, crypto.randomBytes(24).toString('hex')) }), limits: { fileSize: MAX, files: 1 } });

/** Content sniffing by magic bytes: the client-supplied MIME type / extension are never trusted. */
function sniff(file: string): { mime: string; ext: string } | null {
  const b = Buffer.alloc(8); const fd = fs.openSync(file, 'r'); fs.readSync(fd, b, 0, 8, 0); fs.closeSync(fd);
  if (b.subarray(0, 4).toString() === '%PDF') return { mime: 'application/pdf', ext: '.pdf' };
  if (b[0] === 0x89 && b.subarray(1, 4).toString() === 'PNG') return { mime: 'image/png', ext: '.png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg' };
  return null;
}

documentRouter.post('/documents', requirePerm('document:write'), upload.single('file'), h(async (req, res) => {
  const f = req.file;
  if (!f) throw new AppError(400, 'NO_FILE', 'Attach a file in the "file" field');
  const fail = (e: AppError) => { fs.rmSync(f.path, { force: true }); return e; };
  const kind = z.enum(['CERTIFICATE', 'LAB_REPORT', 'TECHNICAL_SHEET', 'DELIVERY_NOTE', 'PHOTO', 'OTHER']).safeParse(req.body.kind ?? 'OTHER');
  if (!kind.success) throw fail(new AppError(400, 'BAD_KIND', 'Invalid document kind'));
  const type = sniff(f.path);
  if (!type) throw fail(new AppError(415, 'UNSUPPORTED_TYPE', 'Only PDF, PNG and JPEG files are accepted'));
  const cid = companyId(req);
  // optional attachment target — must belong to the same company
  const link: Record<string, string> = {};
  for (const [field, model] of [['materialLotId', 'materialLot'], ['productionBatchId', 'productionBatch'], ['nonConformityId', 'nonConformity'], ['offerId', 'supplierOffer']] as const) {
    const id = req.body[field]; if (!id) continue;
    if (!(await (prisma as unknown as Record<string, any>)[model].count({ where: { id: String(id), companyId: cid } }))) throw fail(new AppError(404, 'NOT_FOUND', `${field} not found`));
    link[field] = String(id);
  }
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex');
  const stored = `${f.filename}${type.ext}`;
  fs.renameSync(f.path, path.join(dir, stored));
  const safeName = path.basename(f.originalname).replace(/[^\w.\- ()]/g, '_').slice(0, 150);
  const doc = await prisma.uploadedDocument.create({ data: { companyId: cid, uploadedById: req.ctx.userId, originalName: safeName, storedName: stored, mimeType: type.mime, sizeBytes: f.size, sha256, kind: kind.data, ...link } });
  await audit(req.ctx, 'UPLOAD', 'UploadedDocument', doc.id, { name: safeName, sha256, ...link });
  res.status(201).json({ id: doc.id, originalName: doc.originalName, kind: doc.kind, sizeBytes: doc.sizeBytes, sha256 });
}));

/** Download: owner company, or any professional for documents attached to an ACTIVE public supplier offer. */
documentRouter.get('/documents/:id/download', h(async (req, res) => {
  const d = await prisma.uploadedDocument.findUnique({ where: { id: String(req.params.id) }, include: { offer: true } });
  const own = d && req.ctx.companyId === d.companyId;
  const publicOffer = d?.offer?.status === 'ACTIVE' && !!req.ctx.companyId;
  if (!d || !(own || publicOffer)) throw notFound('Document');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(d.mimeType).setHeader('Content-Disposition', `attachment; filename="${d.originalName.replace(/"/g, '')}"`);
  res.sendFile(path.join(dir, d.storedName));
}));
