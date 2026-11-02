import { Router } from 'express';
import { z } from 'zod';
import { Unit } from '@prisma/client';
import { prisma, h, paging } from '../lib/common';
import { notFound, forbidden } from '../lib/errors';
import { authenticate, requirePerm, requireAny, companyId } from '../middleware/auth';
import { audit } from '../lib/audit';

export const masterRouter = Router();
masterRouter.use(authenticate);

const unit = z.nativeEnum(Unit);
const dec = z.coerce.number();

/** Small CRUD factory: every query is scoped by the acting company; no hard deletes (traceability), use active=false. */
function crud(path: string, model: string, createSchema: z.ZodObject<z.ZodRawShape>, opts: { search?: string[]; include?: object; orderBy?: object; readPerm?: 'master:read'; writePerm?: 'master:write' } = {}) {
  const d = () => (prisma as unknown as Record<string, any>)[model];
  masterRouter.get(path, requirePerm('master:read'), h(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const p = paging(req.query);
    const where = { companyId: companyId(req), ...(q && opts.search ? { OR: opts.search.map((f) => ({ [f]: { contains: q } })) } : {}) };
    const [items, total] = await Promise.all([d().findMany({ where, include: opts.include, orderBy: opts.orderBy ?? { createdAt: 'desc' }, skip: p.skip, take: p.take }), d().count({ where })]);
    res.json({ items, total, page: p.page, pageSize: p.pageSize });
  }));
  masterRouter.get(`${path}/:id`, requirePerm('master:read'), h(async (req, res) => {
    const item = await d().findFirst({ where: { id: String(req.params.id), companyId: companyId(req) }, include: opts.include });
    if (!item) throw notFound(model);
    res.json(item);
  }));
  masterRouter.post(path, requirePerm('master:write'), h(async (req, res) => {
    const data = createSchema.parse(req.body);
    const item = await d().create({ data: { ...data, companyId: companyId(req) } });
    await audit(req.ctx, 'CREATE', model, item.id, data);
    res.status(201).json(item);
  }));
  masterRouter.put(`${path}/:id`, requirePerm('master:write'), h(async (req, res) => {
    const data = createSchema.partial().extend({ active: z.boolean().optional() }).parse(req.body);
    const cid = companyId(req);
    const before = await d().findFirst({ where: { id: String(req.params.id), companyId: cid } });
    if (!before) throw notFound(model);
    const item = await d().update({ where: { id: before.id }, data });
    await audit(req.ctx, 'UPDATE', model, item.id, data, before);
    res.json(item);
  }));
}

crud('/suppliers', 'supplier', z.object({ name: z.string().min(2), contactName: z.string().optional(), email: z.string().email().optional(), phone: z.string().optional(), address: z.string().optional(), wilaya: z.string().optional(), approved: z.boolean().optional(), notes: z.string().optional(), linkedCompanyId: z.string().optional() }), { search: ['name', 'wilaya'] });
crud('/materials', 'material', z.object({ code: z.string().min(1), name: z.string().min(2), category: z.string().optional(), defaultUnit: unit, storageRequirements: z.string().optional(), shelfLifeDays: z.number().int().positive().optional() }), { search: ['name', 'code'], include: { specifications: true } });
crud('/products', 'product', z.object({ sku: z.string().min(1), name: z.string().min(2), category: z.string().optional(), description: z.string().optional(), publicDescription: z.string().optional(), manufacturingSummary: z.string().optional(), shelfLifeDays: z.number().int().positive(), unit: unit.optional() }), { search: ['name', 'sku'], include: { variants: true } });
crud('/quality-parameters', 'qualityParameter', z.object({ code: z.string().min(1), name: z.string().min(2), paramType: z.enum(['NUMERIC', 'BOOLEAN', 'TEXT']).optional(), unit: z.string().optional(), minValue: dec.optional(), maxValue: dec.optional(), scope: z.enum(['RAW_MATERIAL', 'FINISHED_PRODUCT', 'BOTH']).optional(), mandatory: z.boolean().optional() }), { search: ['name', 'code'] });
crud('/transporters', 'transporter', z.object({ name: z.string().min(2), phone: z.string().optional(), vehicleInfo: z.string().optional(), refrigerated: z.boolean().optional(), linkedCompanyId: z.string().optional() }), { search: ['name'] });

// A parameter's limits must be validated by a qualified person before they are trusted (no invented regulatory thresholds).
masterRouter.post('/quality-parameters/:id/validate', requirePerm('quality:release'), h(async (req, res) => {
  const cid = companyId(req);
  const p = await prisma.qualityParameter.findFirst({ where: { id: String(req.params.id), companyId: cid } });
  if (!p) throw notFound('Parameter');
  const u = await prisma.qualityParameter.update({ where: { id: p.id }, data: { validatedById: req.ctx.userId, validatedAt: new Date() } });
  await audit(req.ctx, 'VALIDATE_PARAMETER', 'QualityParameter', p.id, { min: p.minValue, max: p.maxValue });
  res.json(u);
}));

masterRouter.post('/materials/:id/specifications', requirePerm('master:write'), h(async (req, res) => {
  const b = z.object({ parameter: z.string().min(1), minValue: dec.optional(), maxValue: dec.optional(), unit: z.string().optional(), notes: z.string().optional() }).parse(req.body);
  const m = await prisma.material.findFirst({ where: { id: String(req.params.id), companyId: companyId(req) } });
  if (!m) throw notFound('Material');
  res.status(201).json(await prisma.materialSpecification.create({ data: { ...b, materialId: m.id } }));
}));
masterRouter.post('/products/:id/variants', requirePerm('master:write'), h(async (req, res) => {
  const b = z.object({ code: z.string().min(1), name: z.string().min(1) }).parse(req.body);
  const p = await prisma.product.findFirst({ where: { id: String(req.params.id), companyId: companyId(req) } });
  if (!p) throw notFound('Product');
  res.status(201).json(await prisma.productVariant.create({ data: { ...b, productId: p.id } }));
}));

// Recipes with ingredients
masterRouter.get('/recipes', requirePerm('master:read'), h(async (req, res) => res.json({ items: await prisma.recipe.findMany({ where: { companyId: companyId(req) }, include: { product: true, ingredients: { include: { material: true } } }, orderBy: { createdAt: 'desc' } }) })));
masterRouter.post('/recipes', requirePerm('master:write'), h(async (req, res) => {
  const b = z.object({ productId: z.string(), name: z.string().min(2), outputQty: dec.positive(), outputUnit: unit, ingredients: z.array(z.object({ materialId: z.string(), quantity: dec.positive(), unit })).min(1) }).parse(req.body);
  const cid = companyId(req);
  const product = await prisma.product.findFirst({ where: { id: b.productId, companyId: cid } });
  if (!product) throw notFound('Product');
  const mats = await prisma.material.count({ where: { companyId: cid, id: { in: b.ingredients.map((i) => i.materialId) } } });
  if (mats !== new Set(b.ingredients.map((i) => i.materialId)).size) throw notFound('Material');
  const last = await prisma.recipe.findFirst({ where: { productId: product.id }, orderBy: { version: 'desc' } });
  const r = await prisma.recipe.create({ data: { companyId: cid, productId: product.id, name: b.name, outputQty: b.outputQty, outputUnit: b.outputUnit, version: (last?.version ?? 0) + 1, ingredients: { create: b.ingredients } }, include: { ingredients: true } });
  await audit(req.ctx, 'CREATE', 'Recipe', r.id, b);
  res.status(201).json(r);
}));

// Locations (factory, warehouse, distribution center, store). Allowed types depend on the company type.
const ALLOWED: Record<string, string[]> = { MANUFACTURER: ['FACTORY', 'WAREHOUSE'], DISTRIBUTOR: ['DISTRIBUTION_CENTER', 'WAREHOUSE'], RETAILER: ['STORE', 'WAREHOUSE'], SUPPLIER: ['SUPPLIER_SITE', 'WAREHOUSE'], TRANSPORTER: ['WAREHOUSE'] };
masterRouter.get('/locations', requireAny('master:read', 'inventory:read', 'shipment:read'), h(async (req, res) => res.json({ items: await prisma.location.findMany({ where: { companyId: companyId(req) }, include: { retailStore: true }, orderBy: { name: 'asc' } }) })));
masterRouter.post('/locations', requireAny('master:write', 'inventory:write'), h(async (req, res) => {
  const b = z.object({ name: z.string().min(2), type: z.enum(['FACTORY', 'WAREHOUSE', 'DISTRIBUTION_CENTER', 'STORE', 'SUPPLIER_SITE']), address: z.string().optional(), city: z.string().optional(), wilaya: z.string().optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), openingHours: z.string().optional(), phone: z.string().optional(), publicListing: z.boolean().optional() }).parse(req.body);
  if (!(ALLOWED[req.ctx.companyType ?? ''] ?? []).includes(b.type)) throw forbidden(`A ${req.ctx.companyType} company cannot create a ${b.type} location`);
  const { openingHours, phone, publicListing, ...loc } = b;
  const created = await prisma.$transaction(async (tx) => {
    const l = await tx.location.create({ data: { ...loc, companyId: companyId(req) } });
    if (b.type === 'STORE') await tx.retailStore.create({ data: { companyId: l.companyId, locationId: l.id, name: b.name, openingHours, phone, publicListing: publicListing ?? true } });
    await audit(req.ctx, 'CREATE', 'Location', l.id, b, undefined, tx);
    return l;
  });
  res.status(201).json(created);
}));

// Directory of possible shipment destinations across companies (limited public fields only).
masterRouter.get('/directory/locations', requireAny('shipment:create'), h(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const items = await prisma.location.findMany({ where: { active: true, type: { in: ['STORE', 'DISTRIBUTION_CENTER', 'WAREHOUSE'] }, company: { status: 'ACTIVE' }, ...(q ? { name: { contains: q } } : {}) }, select: { id: true, name: true, type: true, city: true, wilaya: true, company: { select: { id: true, name: true, type: true } } }, take: 100, orderBy: { name: 'asc' } });
  res.json({ items });
}));
