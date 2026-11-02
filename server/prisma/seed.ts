/**
 * Demo seed — LOCAL USE ONLY. Creates roles/permissions, demo companies/users and a complete yogurt traceability chain
 * (the same shape as tests/memoryRepo.ts). All demo accounts share the password SEED_DEMO_PASSWORD.
 * Quality limits below are DEMONSTRATION values (flagged "démo — à valider"), not regulatory thresholds.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Prisma, PrismaClient, Unit, CompanyType } from '@prisma/client';
import { PERMISSIONS, ROLES } from '../src/core/permissions';

const prisma = new PrismaClient();
const D = (n: number | string) => new Prisma.Decimal(n);
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data when NODE_ENV=production');
  if (await prisma.user.findUnique({ where: { email: 'admin@tracefood.dz' } })) { console.log('ℹ️  Database already seeded. Use "npm run db:reset -w server" for a clean start.'); return; }
  const password = await bcrypt.hash(process.env.SEED_DEMO_PASSWORD ?? 'Demo@12345', 10);

  // ── Roles & permissions
  const perms = new Map<string, string>();
  for (const code of PERMISSIONS) perms.set(code, (await prisma.permission.create({ data: { code } })).id);
  const roles = new Map<string, string>();
  for (const [code, r] of Object.entries(ROLES)) {
    const role = await prisma.role.create({ data: { code, name: r.name, isProfessional: r.professional } });
    roles.set(code, role.id);
    await prisma.rolePermission.createMany({ data: r.permissions.map((p) => ({ roleId: role.id, permissionId: perms.get(p)! })) });
  }

  // ── Companies & users
  const mkCompany = (name: string, type: CompanyType, extra: Partial<Prisma.CompanyUncheckedCreateInput> = {}) =>
    prisma.company.create({ data: { name, type, status: 'ACTIVE', email: `contact@${name.toLowerCase().replace(/[^a-z]/g, '')}.demo`, country: 'DZ', ...extra } });
  const mkUser = async (email: string, fullName: string, company: { id: string } | null, roleCode: string, extra: Partial<Prisma.UserUncheckedCreateInput> = {}) => {
    const u = await prisma.user.create({ data: { email, fullName, passwordHash: password, ...extra } });
    if (company) await prisma.companyMembership.create({ data: { companyId: company.id, userId: u.id, roleId: roles.get(roleCode)! } });
    return u;
  };
  const platform = await mkCompany('TraceFood DZ Platform', 'PLATFORM');
  const admin = await mkUser('admin@tracefood.dz', 'Super Administrateur', null, 'SUPER_ADMIN', { isSuperAdmin: true });
  await prisma.userRole.create({ data: { userId: admin.id, roleId: roles.get('SUPER_ADMIN')! } });
  void platform;

  const mfr = await mkCompany('Laiterie Tell (Démo)', 'MANUFACTURER', { city: 'Bouira', wilaya: 'Bouira', publicDescription: 'Laiterie de démonstration — données fictives.', history: 'Entreprise fictive créée pour la démonstration de la plateforme.', website: 'https://example.dz' });
  const mfrAdmin = await mkUser('admin@laiterie.demo', 'Karim Benali', mfr, 'MANUFACTURER_ADMIN');
  const qual = await mkUser('qualite@laiterie.demo', 'Samira Haddad', mfr, 'QUALITY_MANAGER');
  const oper = await mkUser('operateur@laiterie.demo', 'Yacine Messaoud', mfr, 'PRODUCTION_OPERATOR');
  const sup = await mkCompany('Ferme El Baraka (Démo)', 'SUPPLIER', { wilaya: 'Médéa' });
  await mkUser('fournisseur@baraka.demo', 'Rachid Amrani', sup, 'SUPPLIER_ADMIN');
  const trp = await mkCompany('Froid Express (Démo)', 'TRANSPORTER', { wilaya: 'Alger' });
  const trpUser = await mkUser('transport@froid.demo', 'Nadir Saadi', trp, 'TRANSPORTER');
  const dist = await mkCompany('Distribution Alger Centre (Démo)', 'DISTRIBUTOR', { wilaya: 'Alger' });
  await mkUser('distribution@alger.demo', 'Lilia Cherif', dist, 'DISTRIBUTOR_MANAGER');
  const ret = await mkCompany('Supérettes El Amel (Démo)', 'RETAILER', { wilaya: 'Alger' });
  const retUser = await mkUser('magasin@elamel.demo', 'Farid Boudiaf', ret, 'RETAIL_MANAGER');
  const pending = await prisma.company.create({ data: { name: 'Fromagerie Nouvelle (Démo)', type: 'MANUFACTURER', status: 'PENDING', email: 'contact@nouvelle.demo', wilaya: 'Sétif' } });
  await mkUser('attente@nouvelle.demo', 'Amel Rahmani', pending, 'MANUFACTURER_ADMIN');
  await prisma.companyApproval.create({ data: { companyId: pending.id } });
  const consumer = await mkUser('consommateur@demo.dz', 'Consommateur Démo', null, 'CONSUMER', { isConsumer: true });
  await prisma.consumerProfile.create({ data: { userId: consumer.id, displayName: 'Consommateur Démo' } });

  await prisma.certification.create({ data: { companyId: mfr.id, name: 'ISO 22000 (donnée de démonstration)', issuer: 'Organisme fictif', number: 'DEMO-0000', validTo: daysAhead(300), verified: true, verifiedById: admin.id } });

  // ── Master data (manufacturer)
  const locFac = await prisma.location.create({ data: { companyId: mfr.id, name: 'Usine Bouira', type: 'FACTORY', city: 'Bouira', wilaya: 'Bouira' } });
  const supplier = await prisma.supplier.create({ data: { companyId: mfr.id, linkedCompanyId: sup.id, name: 'Ferme El Baraka', wilaya: 'Médéa', phone: '0550000000' } });
  const milk = await prisma.material.create({ data: { companyId: mfr.id, code: 'MAT-LAIT', name: 'Lait cru', category: 'Lait', defaultUnit: 'L', storageRequirements: 'Conserver au froid', shelfLifeDays: 3 } });
  const cult = await prisma.material.create({ data: { companyId: mfr.id, code: 'MAT-FERM', name: 'Ferments lactiques', category: 'Ferments', defaultUnit: 'KG', storageRequirements: 'Congélation' } });
  const product = await prisma.product.create({ data: { companyId: mfr.id, sku: 'YAO-NAT', name: 'Yaourt nature 125 g', category: 'Yaourt', shelfLifeDays: 21, unit: 'POT', publicDescription: 'Yaourt nature brassé.', manufacturingSummary: 'Réception du lait, pasteurisation, ensemencement, fermentation, refroidissement, conditionnement.' } });
  await prisma.productVariant.createMany({ data: [{ productId: product.id, code: 'NAT', name: 'Nature' }, { productId: product.id, code: 'FRA', name: 'Fraise' }] });
  await prisma.recipe.create({ data: { companyId: mfr.id, productId: product.id, name: 'Yaourt nature — recette de base', outputQty: D(500), outputUnit: 'POT', ingredients: { create: [{ materialId: milk.id, quantity: D(300), unit: 'L' }, { materialId: cult.id, quantity: D(1), unit: 'KG' }] } } });
  const pTemp = await prisma.qualityParameter.create({ data: { companyId: mfr.id, code: 'TEMP', name: 'Température à réception (démo — à valider)', unit: '°C', minValue: D(0), maxValue: D(6), scope: 'RAW_MATERIAL', mandatory: true } });
  const pPh = await prisma.qualityParameter.create({ data: { companyId: mfr.id, code: 'PH', name: 'pH (démo — à valider)', unit: 'pH', minValue: D(6.4), maxValue: D(6.9), scope: 'RAW_MATERIAL' } });
  await prisma.qualityParameter.create({ data: { companyId: mfr.id, code: 'ATB', name: 'Dépistage antibiotiques négatif', paramType: 'BOOLEAN', scope: 'RAW_MATERIAL' } });
  const trpRec = await prisma.transporter.create({ data: { companyId: mfr.id, linkedCompanyId: trp.id, name: 'Froid Express', refrigerated: true, phone: '0551111111' } });

  // ── Raw material lots (received 8 days ago, quality-released)
  const mkLot = async (no: string, material: { id: string }, qty: number, unit: Unit) => {
    const lot = await prisma.materialLot.create({ data: { companyId: mfr.id, materialId: material.id, supplierId: supplier.id, internalLotNumber: no, supplierLotNumber: `BAR-${no.slice(-3)}`, origin: 'Médéa', receivedQty: D(qty), remainingQty: D(qty), unit, receivedAt: daysAgo(8), status: 'RELEASED', locationId: locFac.id } });
    await prisma.stockMovement.create({ data: { companyId: mfr.id, type: 'RAW_RECEIPT', materialLotId: lot.id, toLocationId: locFac.id, quantity: D(qty), unit, createdById: oper.id } });
    const chk = await prisma.qualityCheck.create({ data: { companyId: mfr.id, materialLotId: lot.id, checkedAt: daysAgo(8), checkedById: oper.id, decision: 'RELEASED', reviewerId: qual.id, reviewedAt: daysAgo(8) } });
    if (material.id === milk.id) await prisma.qualityResult.createMany({ data: [{ checkId: chk.id, parameterId: pTemp.id, parameterName: pTemp.name, valueNumeric: D(4.2), unit: '°C', compliant: true }, { checkId: chk.id, parameterId: pPh.id, parameterName: pPh.name, valueNumeric: D(6.7), unit: 'pH', compliant: true }] });
    return lot;
  };
  const l1 = await mkLot('MP-DEMO-001', milk, 1000, 'L');
  const l2 = await mkLot('MP-DEMO-002', milk, 500, 'L');
  const l3 = await mkLot('MP-DEMO-003', cult, 5, 'KG');

  // ── Finished batches (many-to-many with lots), released → factory stock + QR
  const mkBatch = async (no: string, qty: number, uses: Array<[{ id: string }, number, Unit]>) => {
    const b = await prisma.productionBatch.create({ data: { companyId: mfr.id, productId: product.id, factoryLocationId: locFac.id, batchNumber: no, producedAt: daysAgo(5), producedQty: D(qty), unit: 'POT', expiryDate: daysAhead(16), status: 'RELEASED', createdById: oper.id, releasedById: qual.id, releasedAt: daysAgo(5) } });
    for (const [lot, q, unit] of uses) {
      await prisma.batchMaterial.create({ data: { batchId: b.id, materialLotId: lot.id, quantity: D(q), unit } });
      await prisma.materialLot.update({ where: { id: lot.id }, data: { remainingQty: { decrement: D(q) } } });
      await prisma.stockMovement.create({ data: { companyId: mfr.id, type: 'PRODUCTION_CONSUME', materialLotId: lot.id, batchId: b.id, quantity: D(q), unit, createdById: oper.id } });
    }
    await prisma.productionStep.createMany({ data: ['Réception du lait', 'Pasteurisation', 'Ensemencement', 'Fermentation', 'Refroidissement', 'Conditionnement'].map((name, i) => ({ batchId: b.id, stepOrder: i + 1, name, operatorId: oper.id })) });
    await prisma.qualityCheck.create({ data: { companyId: mfr.id, productionBatchId: b.id, checkedAt: daysAgo(5), checkedById: oper.id, decision: 'RELEASED', reviewerId: qual.id, reviewedAt: daysAgo(5) } });
    await prisma.inventoryBalance.create({ data: { companyId: mfr.id, locationId: locFac.id, batchId: b.id, quantity: D(qty), unit: 'POT' } });
    await prisma.stockMovement.create({ data: { companyId: mfr.id, type: 'PRODUCTION_OUTPUT', batchId: b.id, toLocationId: locFac.id, quantity: D(qty), unit: 'POT', createdById: qual.id } });
    await prisma.productQrCode.create({ data: { companyId: mfr.id, batchId: b.id, publicId: crypto.randomBytes(9).toString('base64url') } });
    return b;
  };
  const y1 = await mkBatch('YG-DEMO-001', 500, [[l1, 300, 'L'], [l3, 1, 'KG']]);
  const y2 = await mkBatch('YG-DEMO-002', 400, [[l1, 200, 'L'], [l2, 300, 'L']]);
  const y3 = await mkBatch('YG-DEMO-003', 100, [[l2, 100, 'L']]);

  // ── Downstream locations
  const locDist = await prisma.location.create({ data: { companyId: dist.id, name: 'Centre de distribution Alger', type: 'DISTRIBUTION_CENTER', city: 'Alger', wilaya: 'Alger' } });
  const mkStore = async (name: string, city: string) => {
    const l = await prisma.location.create({ data: { companyId: ret.id, name, type: 'STORE', city, wilaya: 'Alger', address: `${city}, Alger` } });
    return { loc: l, store: await prisma.retailStore.create({ data: { companyId: ret.id, locationId: l.id, name, openingHours: '08:00–21:00' } }) };
  };
  const sA = await mkStore('El Amel — Centre', 'Alger Centre');
  const sB = await mkStore('El Amel — Bab Ezzouar', 'Bab Ezzouar');
  const sC = await mkStore('El Amel — Hydra', 'Hydra');

  // ── Shipments: factory→distributor→stores (repeated transfer), already dispatched and received
  let n = 0;
  const ship = async (company: { id: string }, from: { id: string }, to: { id: string }, items: Array<[{ id: string }, number]>, recvCompany: { id: string }, byUser: { id: string }, withTemp = false) => {
    const s = await prisma.shipment.create({ data: { companyId: company.id, shipmentNumber: `EXP-DEMO-${String(++n).padStart(3, '0')}`, fromLocationId: from.id, toLocationId: to.id, transporterId: trpRec.id, status: 'RECEIVED', dispatchedAt: daysAgo(4), deliveredAt: daysAgo(4), createdById: byUser.id } });
    if (withTemp) { await prisma.transportCondition.create({ data: { shipmentId: s.id, minTempC: D(2), maxTempC: D(6) } }); await prisma.temperatureRecord.createMany({ data: [3.8, 4.1, 4.6].map((t, i) => ({ shipmentId: s.id, recordedAt: new Date(Date.now() - 4 * DAY + i * 3_600_000), temperatureC: D(t) })) }); }
    for (const [batch, q] of items) {
      await prisma.shipmentItem.create({ data: { shipmentId: s.id, batchId: batch.id, quantity: D(q), receivedQty: D(q), unit: 'POT' } });
      await prisma.inventoryBalance.update({ where: { locationId_batchId: { locationId: from.id, batchId: batch.id } }, data: { quantity: { decrement: D(q) } } });
      await prisma.inventoryBalance.upsert({ where: { locationId_batchId: { locationId: to.id, batchId: batch.id } }, create: { companyId: recvCompany.id, locationId: to.id, batchId: batch.id, quantity: D(q), unit: 'POT' }, update: { quantity: { increment: D(q) } } });
      await prisma.stockMovement.createMany({ data: [{ companyId: company.id, type: 'SHIPMENT_DISPATCH', batchId: batch.id, shipmentId: s.id, fromLocationId: from.id, toLocationId: to.id, quantity: D(q), unit: 'POT', createdById: byUser.id }, { companyId: recvCompany.id, type: 'SHIPMENT_RECEIPT', batchId: batch.id, shipmentId: s.id, fromLocationId: from.id, toLocationId: to.id, quantity: D(q), unit: 'POT', createdById: byUser.id }] });
    }
    await prisma.shipmentEvent.createMany({ data: [{ shipmentId: s.id, type: 'DISPATCHED' }, { shipmentId: s.id, type: 'RECEIVED' }] });
    return s;
  };
  await ship(mfr, locFac, locDist, [[y1, 400], [y2, 300]], dist, oper, true);
  await ship(dist, locDist, sA.loc, [[y1, 150]], ret, retUser);
  await ship(dist, locDist, sB.loc, [[y1, 100], [y2, 100]], ret, retUser);
  await ship(mfr, locFac, sC.loc, [[y3, 50]], ret, oper);
  // consumer sales recorded at stores
  for (const [loc, batch, q] of [[sA.loc, y1, 50], [sB.loc, y1, 40], [sB.loc, y2, 20]] as const) {
    await prisma.inventoryBalance.update({ where: { locationId_batchId: { locationId: loc.id, batchId: batch.id } }, data: { quantity: { decrement: D(q) } } });
    await prisma.stockMovement.create({ data: { companyId: ret.id, type: 'SALE_EXIT', batchId: batch.id, fromLocationId: loc.id, quantity: D(q), unit: 'POT', createdById: retUser.id } });
  }
  const promo = await prisma.promotion.create({ data: { companyId: ret.id, retailStoreId: sA.store.id, title: '−10 % sur le yaourt nature', description: 'Offre de démonstration', startsAt: daysAgo(1), endsAt: daysAhead(10), discountPercent: D(10) } });
  await prisma.promotionProduct.create({ data: { promotionId: promo.id, productId: product.id } });

  // ── Supplier offers
  await prisma.supplierOffer.createMany({ data: [
    { companyId: sup.id, title: 'Lait cru de vache — collecte quotidienne', category: 'Lait', description: 'Lait réfrigéré, analyses disponibles sur demande.', specifications: 'Température de livraison ≤ valeur à convenir', quantityAvailable: D(5000), unit: 'L', unitPrice: D(60), wilaya: 'Médéa' },
    { companyId: sup.id, title: 'Poudre de lait écrémé', category: 'Lait en poudre', quantityAvailable: D(800), unit: 'KG', unitPrice: D(650), wilaya: 'Médéa' } ] });

  // ── Open non-conformity example (no stock change) + risk assessment starter
  await prisma.nonConformity.create({ data: { companyId: mfr.id, code: 'NC-DEMO-001', title: 'Résultat de laboratoire hors spécification (exemple)', description: 'Exemple de démonstration. Utilisez "Simulation de rappel" sur le lot MP-DEMO-001.', severity: 'HIGH', materialLotId: l1.id, detectedAt: daysAgo(1), reportedById: qual.id } });
  const ra = await prisma.riskAssessment.create({ data: { companyId: mfr.id, productId: product.id, title: 'Analyse des dangers — yaourt (point de départ)', createdById: qual.id } });
  await prisma.riskItem.create({ data: { assessmentId: ra.id, processStep: 'Pasteurisation', hazard: 'Survie de micro-organismes pathogènes', hazardType: 'BIOLOGICAL', cause: 'Barème temps/température non respecté', severity: 5, likelihood: 2, preventiveMeasure: 'Enregistrement et alarme de la pasteurisation', isCcp: true, criticalLimit: 'À définir par l\'équipe HACCP', monitoring: 'Enregistreur continu', correctiveAction: 'Isoler et re-traiter ou détruire le produit' } });
  void mfrAdmin; void trpUser;
  console.log('✅ Seed complete. Demo logins (password = SEED_DEMO_PASSWORD, default Demo@12345):\n' + [
    'admin@tracefood.dz (Super admin)', 'admin@laiterie.demo (Fabricant)', 'qualite@laiterie.demo (Qualité)', 'operateur@laiterie.demo (Production)', 'fournisseur@baraka.demo (Fournisseur)',
    'transport@froid.demo (Transporteur)', 'distribution@alger.demo (Distributeur)', 'magasin@elamel.demo (Point de vente)', 'consommateur@demo.dz (Consommateur)', 'attente@nouvelle.demo (société en attente)'].map((s) => ' • ' + s).join('\n'));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
