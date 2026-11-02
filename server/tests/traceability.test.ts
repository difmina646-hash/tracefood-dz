import test from 'node:test';
import assert from 'node:assert/strict';
import { TraceabilityEngine, TraceabilityError } from '../src/core/traceability';
import { convert, canConvert, round4 } from '../src/core/units';
import { yogurtFixture, CO } from './memoryRepo';

const engine = () => new TraceabilityEngine(yogurtFixture());
const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id).sort();

test('units: kg/g and L/mL convert, POT/CARTON never mix', () => {
  assert.equal(convert(1500, 'G', 'KG'), 1.5);
  assert.equal(convert(2, 'L', 'ML'), 2000);
  assert.equal(canConvert('POT', 'CARTON'), false);
  assert.throws(() => convert(1, 'KG', 'L'), /INCOMPATIBLE_UNITS/);
  assert.equal(round4(0.1 + 0.2), 0.3);
});

test('forward: contaminated lot MP-001 reaches exactly the batches that consumed it (many-to-many)', async () => {
  const r = await engine().forward(CO, { type: 'MATERIAL_LOT', ids: ['l1'] });
  assert.deepEqual(ids(r.batches), ['y1', 'y2']);            // y3 never used l1
  assert.equal(r.batches.find((b) => b.id === 'y1')!.lotQuantityUsed, 300);
  assert.equal(r.batches.find((b) => b.id === 'y2')!.lotQuantityUsed, 200);
});

test('forward: share of inputs is computed only when units are comparable', async () => {
  const r = await engine().forward(CO, { type: 'MATERIAL_LOT', ids: ['l1'] });
  assert.equal(r.batches.find((b) => b.id === 'y2')!.lotShareOfInputs, 0.4);   // 200 / (200+300) L
  assert.equal(r.batches.find((b) => b.id === 'y1')!.lotShareOfInputs, null);  // litres + kg → not comparable
});

test('forward: shipments — cancelled excluded, planned listed but not counted as dispatched', async () => {
  const r = await engine().forward(CO, { type: 'MATERIAL_LOT', ids: ['l1'] });
  const byNo = Object.fromEntries(r.shipments.map((s) => [s.shipmentNumber, s]));
  assert.equal(byNo['EXP-5'].dispatched, false);
  assert.equal(r.totals.shipments, 3);                                      // EXP-1,2,3 (EXP-5 planned, EXP-6 cancelled)
  assert.ok(r.notes.some((n) => n.startsWith('PLANNED_SHIPMENTS_EXCLUDED')));
  assert.equal(r.locations.some((e) => e.locationId === 'stA' && e.batchId === 'y2'), false); // planned destination must not create a phantom exposure row
});

test('forward: repeated transfers (factory → distributor → stores) are followed and quantities reconcile', async () => {
  const r = await engine().forward(CO, { type: 'MATERIAL_LOT', ids: ['l1'] });
  const loc = (id: string, b: string) => r.locations.find((e) => e.locationId === id && e.batchId === b)!;
  const dY1 = loc('dist', 'y1');
  assert.deepEqual([dY1.receivedQty, dY1.forwardedQty, dY1.onHandQty, dY1.unaccountedQty], [400, 250, 150, 0]);
  const aY1 = loc('stA', 'y1');
  assert.deepEqual([aY1.receivedQty, aY1.onHandQty, aY1.unaccountedQty], [150, 100, 50]);   // 50 sold/consumed
  const bY2 = loc('stB', 'y2');
  assert.deepEqual([bY2.receivedQty, bY2.onHandQty, bY2.unaccountedQty], [100, 80, 20]);
  assert.equal(r.locations.some((e) => e.locationId === 'stC'), false);                     // stC only got y3
  assert.equal(r.locations.some((e) => e.locationId === 'fac'), false);                     // factory is not downstream
  assert.ok(r.notes.some((n) => n.startsWith('UNACCOUNTED_QTY')));
});

test('forward: dispatched total counts only factory-level shipments, not re-transfers', async () => {
  const r = await engine().forward(CO, { type: 'MATERIAL_LOT', ids: ['l1'] });
  assert.equal(r.batches.find((b) => b.id === 'y1')!.dispatchedQty, 400);   // not 400+150+100
  assert.equal(r.totals.dispatchedQty, 700);
  assert.equal(r.totals.unit, 'POT');
});

test('forward graph: contains supplier→lot→batch→shipment→location and a clickable status on every node', async () => {
  const r = await engine().forward(CO, { type: 'MATERIAL_LOT', ids: ['l1'] });
  const kinds = new Set(r.graph.edges.map((e) => e.kind));
  for (const k of ['SUPPLIES', 'CONSUMED_IN', 'SHIPPED_IN', 'SHIPPED_FROM', 'DELIVERED_TO']) assert.ok(kinds.has(k as never), k);
  const nodeIds = new Set(r.graph.nodes.map((n) => n.id));
  for (const e of r.graph.edges) { assert.ok(nodeIds.has(e.from), e.from); assert.ok(nodeIds.has(e.to), e.to); }  // no dangling edges
  assert.equal(r.graph.nodes.find((n) => n.id === 'lot:l1')!.label, 'MP-001');
});

test('forward from a batch (no lot root) works', async () => {
  const r = await engine().forward(CO, { type: 'PRODUCTION_BATCH', ids: ['y3'] });
  assert.deepEqual(r.locations.map((l) => l.locationId), ['stC']);
});

test('backward: batch YG-002 → both lots (MP-001, MP-002), supplier and quality checks', async () => {
  const r = await engine().backward(CO, { type: 'PRODUCTION_BATCH', ids: ['y2'] });
  assert.deepEqual(ids(r.lots), ['l1', 'l2']);
  assert.equal(r.suppliers.length, 1);
  assert.equal(r.suppliers[0].name, 'Laiterie Atlas');
  assert.equal(r.lots.find((l) => l.id === 'l1')!.checks.length, 1);
});

test('backward: batch YG-003 does NOT involve contaminated MP-001', async () => {
  const r = await engine().backward(CO, { type: 'PRODUCTION_BATCH', ids: ['y3'] });
  assert.deepEqual(ids(r.lots), ['l2']);
});

test('backward from a shipment finds every batch inside and all their lots', async () => {
  const r = await engine().backward(CO, { type: 'SHIPMENT', ids: ['s3'] });  // y1 + y2
  assert.deepEqual(ids(r.batches), ['y1', 'y2']);
  assert.deepEqual(ids(r.lots), ['l1', 'l2', 'l3']);
});

test('a lot used by several batches lists all of them (backward view of one lot)', async () => {
  const r = await engine().backward(CO, { type: 'PRODUCTION_BATCH', ids: ['y1', 'y2'] });
  assert.deepEqual(r.lots.find((l) => l.id === 'l1')!.usedInBatches.sort(), ['y1', 'y2']);
  assert.equal(r.lots.find((l) => l.id === 'l1')!.quantityUsed, 500);
});

test('company isolation: another company cannot trace our lots/batches', async () => {
  const e = engine();
  await assert.rejects(e.forward('company-B', { type: 'MATERIAL_LOT', ids: ['l1'] }), (x: unknown) => x instanceof TraceabilityError && x.code === 'ROOT_NOT_FOUND');
  await assert.rejects(e.backward('company-B', { type: 'PRODUCTION_BATCH', ids: ['y1'] }), (x: unknown) => x instanceof TraceabilityError);
});

test('unknown ids are reported, never silently ignored', async () => {
  await assert.rejects(engine().forward(CO, { type: 'MATERIAL_LOT', ids: ['nope'] }), /Unknown material lot/);
  await assert.rejects(engine().forward(CO, { type: 'MATERIAL_LOT', ids: ['l1', 'nope'] }), /Unknown material lot/);
});

test('traceability gap: batch with no recorded inputs is flagged', async () => {
  const repo = yogurtFixture();
  repo.consumptions = repo.consumptions.filter((c) => c.batchId !== 'y3');
  const r = await new TraceabilityEngine(repo).backward(CO, { type: 'PRODUCTION_BATCH', ids: ['y3'] });
  assert.ok(r.notes.some((n) => n.startsWith('NO_INPUTS_RECORDED')));
});
