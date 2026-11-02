/**
 * END-TO-END scenario from the specification (REQUIRES a running MySQL with the demo seed applied):
 * raw milk reception → quality control → yogurt production → storage → shipment → retail reception →
 * consumer QR scan → non-conformity → traceability investigation → withdrawal simulation → precautionary hold.
 * Run:  npm run db:reset -w server && npm run db:seed -w server && npm run test:e2e -w server
 * STATUS: written but NOT executed in the authoring environment (no MySQL/npm network available there).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();
const PW = process.env.SEED_DEMO_PASSWORD ?? 'Demo@12345';
const api = request(app);
const tokens: Record<string, string> = {};
const login = async (email: string) => { const r = await api.post('/api/auth/login').send({ email, password: PW }); assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.body)}`); tokens[email] = r.body.token; return r.body.token as string; };
const as = (email: string) => ({ Authorization: `Bearer ${tokens[email]}` });
const S = { op: 'operateur@laiterie.demo', qual: 'qualite@laiterie.demo', shop: 'magasin@elamel.demo', sup: 'fournisseur@baraka.demo', admin: 'admin@tracefood.dz', trp: 'transport@froid.demo' };
const ctx: Record<string, any> = {};

test('setup: log everybody in', async () => { for (const e of Object.values(S)) await login(e); });

test('authentication & isolation: wrong password, no token, cross-role access', async () => {
  assert.equal((await api.post('/api/auth/login').send({ email: S.op, password: 'wrong-password-1' })).status, 401);
  assert.equal((await api.get('/api/lots')).status, 401);
  assert.equal((await api.get('/api/lots').set(as(S.shop))).status, 403);       // retailer cannot read manufacturer lots
  assert.equal((await api.get('/api/trace/search?q=MP').set(as(S.sup))).status, 403);
  assert.equal((await api.get('/api/admin/companies').set(as(S.op))).status, 403);
  assert.equal((await api.get('/api/admin/companies').set(as(S.admin))).status, 200);
});

test('1. raw milk reception creates a PENDING lot', async () => {
  const sup = (await api.get('/api/suppliers').set(as(S.op))).body.items[0];
  const milk = (await api.get('/api/materials?q=Lait').set(as(S.op))).body.items.find((m: any) => m.code === 'MAT-LAIT');
  const r = await api.post('/api/receptions').set(as(S.op)).send({ supplierId: sup.id, lots: [{ materialId: milk.id, quantity: 200, unit: 'L', supplierLotNumber: 'E2E-SUP-1', origin: 'Médéa' }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  ctx.lot = r.body.lots[0]; assert.equal(ctx.lot.status, 'PENDING');
});

test('2. a PENDING lot cannot be used in production', async () => {
  const prod = (await api.get('/api/products').set(as(S.op))).body.items[0];
  const fac = (await api.get('/api/locations').set(as(S.op))).body.items.find((l: any) => l.type === 'FACTORY');
  ctx.prod = prod; ctx.fac = fac;
  const r = await api.post('/api/batches').set(as(S.op)).send({ productId: prod.id, factoryLocationId: fac.id, producedAt: new Date(), producedQty: 100, unit: 'POT', expiryDate: new Date(Date.now() + 15 * 864e5), materials: [{ lotId: ctx.lot.id, quantity: 50, unit: 'L' }] });
  assert.equal(r.status, 409); assert.equal(r.body.error.code, 'LOT_NOT_RELEASED');
});

test('3. quality: operator cannot release; out-of-range temperature cannot be released; in-range can', async () => {
  const params = (await api.get('/api/quality-parameters').set(as(S.qual))).body.items;
  const temp = params.find((p: any) => p.code === 'TEMP');
  assert.equal((await api.post(`/api/lots/${ctx.lot.id}/quality-checks`).set(as(S.op)).send({ decision: 'RELEASED', results: [] })).status, 403);
  const bad = await api.post(`/api/lots/${ctx.lot.id}/quality-checks`).set(as(S.qual)).send({ decision: 'RELEASED', results: [{ parameterId: temp.id, valueNumeric: 11 }] });
  assert.equal(bad.status, 422); assert.equal(bad.body.error.code, 'NON_COMPLIANT_CANNOT_RELEASE');
  const missing = await api.post(`/api/lots/${ctx.lot.id}/quality-checks`).set(as(S.qual)).send({ decision: 'RELEASED', results: [] });
  assert.equal(missing.status, 422); assert.equal(missing.body.error.code, 'MANDATORY_PARAMETERS_MISSING');
  const ok = await api.post(`/api/lots/${ctx.lot.id}/quality-checks`).set(as(S.qual)).send({ decision: 'RELEASED', results: [{ parameterId: temp.id, valueNumeric: 4.5 }] });
  assert.equal(ok.status, 201, JSON.stringify(ok.body)); assert.equal(ok.body.newStatus, 'RELEASED');
});

test('4. production consumes the lot; over-consumption is refused; stock never negative', async () => {
  const ok = await api.post('/api/batches').set(as(S.op)).send({ productId: ctx.prod.id, factoryLocationId: ctx.fac.id, producedAt: new Date(), producedQty: 100, unit: 'POT', expiryDate: new Date(Date.now() + 15 * 864e5), materials: [{ lotId: ctx.lot.id, quantity: 150, unit: 'L' }] });
  assert.equal(ok.status, 201, JSON.stringify(ok.body)); ctx.batch = ok.body;
  const over = await api.post('/api/batches').set(as(S.op)).send({ productId: ctx.prod.id, factoryLocationId: ctx.fac.id, producedAt: new Date(), producedQty: 10, unit: 'POT', expiryDate: new Date(Date.now() + 15 * 864e5), materials: [{ lotId: ctx.lot.id, quantity: 51, unit: 'L' }] }); // only 50 left
  assert.equal(over.status, 409); assert.equal(over.body.error.code, 'INSUFFICIENT_LOT_QUANTITY');
  const lot = (await api.get(`/api/lots/${ctx.lot.id}`).set(as(S.op))).body;
  assert.equal(Number(lot.remainingQty), 50);
});

test('5. batch release creates factory stock + QR; shipment → dispatch → retail receipt', async () => {
  assert.equal((await api.post(`/api/batches/${ctx.batch.id}/quality-checks`).set(as(S.qual)).send({ decision: 'RELEASED', results: [] })).status, 201);
  const d = (await api.get(`/api/batches/${ctx.batch.id}`).set(as(S.qual))).body;
  assert.equal(d.status, 'RELEASED'); assert.equal(d.productQrCodes.length, 1); ctx.publicId = d.productQrCodes[0].publicId;
  const dest = (await api.get('/api/directory/locations?q=Hydra').set(as(S.op))).body.items.find((l: any) => l.type === 'STORE');
  const sh = await api.post('/api/shipments').set(as(S.op)).send({ fromLocationId: ctx.fac.id, toLocationId: dest.id, items: [{ batchId: ctx.batch.id, quantity: 60 }] });
  assert.equal(sh.status, 201, JSON.stringify(sh.body)); ctx.ship = sh.body;
  assert.equal((await api.post('/api/shipments').set(as(S.op)).send({ fromLocationId: ctx.fac.id, toLocationId: dest.id, items: [{ batchId: ctx.batch.id, quantity: 60 }] })).status, 409); // only 40 left unreserved
  assert.equal((await api.post(`/api/shipments/${ctx.ship.id}/dispatch`).set(as(S.op))).status, 200);
  assert.equal((await api.post(`/api/shipments/${ctx.ship.id}/dispatch`).set(as(S.op))).status, 409); // no double dispatch
  assert.equal((await api.post(`/api/shipments/${ctx.ship.id}/deliver`).set(as(S.trp)).send({})).status, 200);
  const rec = await api.post(`/api/shipments/${ctx.ship.id}/receive`).set(as(S.shop)).send({ items: [{ batchId: ctx.batch.id, receivedQty: 58, damagedQty: 2 }] });
  assert.equal(rec.status, 200, JSON.stringify(rec.body)); assert.equal(rec.body.status, 'RECEIVED');
  assert.equal((await api.post(`/api/shipments/${ctx.ship.id}/receive`).set(as(S.shop)).send({ items: [{ batchId: ctx.batch.id, receivedQty: 58, damagedQty: 2 }] })).status, 409); // no double receipt
});

test('6. consumer QR page: real data, no confidential fields, unknown id handled', async () => {
  const r = await api.get(`/api/public/qr/${ctx.publicId}`);
  assert.equal(r.status, 200); assert.equal(r.body.batch.status, 'OK');
  const txt = JSON.stringify(r.body).toLowerCase();
  for (const secret of ['baraka', 'supplier', 'mp-', 'lotnumber', 'internal']) assert.equal(txt.includes(secret), false, `public page leaks "${secret}"`);
  assert.ok(r.body.availability.stores.length >= 1);
  assert.equal((await api.get('/api/public/qr/doesNotExist12')).status, 404);
  assert.equal((await api.get('/api/public/qr/%24%24bad')).status, 404);
});

test('7. non-conformity → forward trace → recall simulation (no side effects) → hold', async () => {
  const nc = await api.post('/api/incidents').set(as(S.qual)).send({ title: 'Résultat labo non conforme (e2e)', description: 'Test e2e', severity: 'HIGH', materialLotId: ctx.lot.id });
  assert.equal(nc.status, 201); ctx.nc = nc.body;
  assert.equal((await api.post(`/api/incidents/${ctx.nc.id}/recall-simulation`).set(as(S.op)).send({})).status, 403); // operator cannot
  const sim = await api.post(`/api/incidents/${ctx.nc.id}/recall-simulation`).set(as(S.qual)).send({});
  assert.equal(sim.status, 201, JSON.stringify(sim.body));
  assert.ok(sim.body.batches.some((b: any) => b.id === ctx.batch.id));
  assert.ok(sim.body.locations.some((l: any) => l.locationName.includes('Hydra') && l.receivedQty === 58));
  assert.equal((await api.get(`/api/batches/${ctx.batch.id}`).set(as(S.qual))).body.status, 'RELEASED'); // simulation changed nothing
  assert.equal((await api.post(`/api/incidents/${ctx.nc.id}/hold`).set(as(S.qual)).send({ reason: 'précaution' })).status, 400); // confirm:true required
  const hold = await api.post(`/api/incidents/${ctx.nc.id}/hold`).set(as(S.qual)).send({ confirm: true, reason: 'Blocage préventif e2e' });
  assert.equal(hold.status, 200, JSON.stringify(hold.body)); assert.ok(hold.body.batchesBlocked >= 1);
  assert.equal((await api.get(`/api/public/qr/${ctx.publicId}`)).body.batch.status, 'UNDER_REVIEW');
  const back = await api.get(`/api/trace/batches/${ctx.batch.id}/backward`).set(as(S.qual));
  assert.equal(back.status, 200); assert.ok(back.body.lots.some((l: any) => l.id === ctx.lot.id));
});

test('8. audit trail recorded for the scenario', async () => {
  const a = await api.get('/api/admin/audit?entity=NonConformity').set(as(S.admin));
  assert.equal(a.status, 200); assert.ok(a.body.items.length >= 1);
});
