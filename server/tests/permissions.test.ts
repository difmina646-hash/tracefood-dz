import test from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS, ROLES, ADMIN_ROLE_FOR_COMPANY_TYPE } from '../src/core/permissions';
import { evaluate } from '../src/modules/quality.pure';

const has = (role: string, p: string) => (ROLES[role].permissions as string[]).includes(p);

test('every permission used by a role exists in the catalogue', () => {
  const all = new Set<string>(PERMISSIONS);
  for (const [code, r] of Object.entries(ROLES)) for (const p of r.permissions) assert.ok(all.has(p), `${code} → ${p}`);
});
test('only quality roles can release/block (production operators cannot)', () => {
  const holders = Object.keys(ROLES).filter((r) => has(r, 'quality:release')).sort();
  assert.deepEqual(holders, ['MANUFACTURER_ADMIN', 'QUALITY_MANAGER']);
  for (const p of ['incident:write', 'recall:simulate', 'recall:hold']) assert.equal(has('PRODUCTION_OPERATOR', p), false, p);
});
test('super admin has platform powers but NO business/consumer data access', () => {
  for (const p of ['trace:read', 'production:read', 'quality:read', 'quality:release', 'complaint:read', 'inventory:read', 'shipment:read']) assert.equal(has('SUPER_ADMIN', p), false, p);
  assert.ok(has('SUPER_ADMIN', 'admin:companies') && has('SUPER_ADMIN', 'admin:audit'));
});
test('suppliers, transporters and retailers cannot read manufacturer production or raw-material data', () => {
  for (const r of ['SUPPLIER_ADMIN', 'TRANSPORTER', 'RETAIL_MANAGER', 'DISTRIBUTOR_MANAGER']) for (const p of ['reception:read', 'production:read', 'quality:read', 'master:read']) assert.equal(has(r, p), false, `${r} ${p}`);
});
test('only retail/distribution can receive shipments; only transporter updates transport', () => {
  assert.deepEqual(Object.keys(ROLES).filter((r) => has(r, 'shipment:receive')).sort(), ['DISTRIBUTOR_MANAGER', 'RETAIL_MANAGER']);
  assert.deepEqual(Object.keys(ROLES).filter((r) => has(r, 'shipment:update')), ['TRANSPORTER']);
});
test('consumers have no professional permissions; every company type maps to an existing admin role', () => {
  assert.equal(ROLES.CONSUMER.permissions.length, 0);
  for (const r of Object.values(ADMIN_ROLE_FOR_COMPANY_TYPE)) assert.ok(ROLES[r]);
});
test('quality evaluation uses the configured limits, inclusive at the bounds', () => {
  const p = { paramType: 'NUMERIC', minValue: 0 as never, maxValue: 6 as never };
  assert.equal(evaluate(p, { valueNumeric: 6 }), true);
  assert.equal(evaluate(p, { valueNumeric: 6.01 }), false);
  assert.equal(evaluate(p, { valueNumeric: -0.1 }), false);
  assert.equal(evaluate({ paramType: 'BOOLEAN', minValue: null, maxValue: null }, { valueText: 'true' }), true);
  assert.equal(evaluate({ paramType: 'BOOLEAN', minValue: null, maxValue: null }, { valueText: 'false' }), false);
  assert.equal(evaluate({ paramType: 'NUMERIC', minValue: null, maxValue: null }, { valueNumeric: 999 }), true); // no limit configured → nothing invented
});
