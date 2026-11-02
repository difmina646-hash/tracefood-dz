import { Prisma } from '@prisma/client';
import { Tx, D } from './common';
import { conflict } from './errors';

/**
 * Race-safe stock operations. Each statement is a single atomic UPDATE with the guard in the WHERE clause,
 * so two concurrent requests can never drive a balance negative or consume the same stock twice.
 */
const dec = (q: Prisma.Decimal) => q.toFixed(4);

/** Removes AVAILABLE stock (quantity - reserved). Throws INSUFFICIENT_STOCK if not enough. */
export async function debitAvailable(tx: Tx, locationId: string, batchId: string, qty: Prisma.Decimal) {
  const n = await tx.$executeRaw`UPDATE inventory_balances SET quantity = quantity - CAST(${dec(qty)} AS DECIMAL(18,4)), updatedAt = NOW(3)
    WHERE locationId = ${locationId} AND batchId = ${batchId} AND quantity - reservedQty >= CAST(${dec(qty)} AS DECIMAL(18,4))`;
  if (n === 0) throw conflict('INSUFFICIENT_STOCK', 'Not enough available stock at this location for this batch');
}
/** Reserves available stock for a planned shipment. */
export async function reserve(tx: Tx, locationId: string, batchId: string, qty: Prisma.Decimal) {
  const n = await tx.$executeRaw`UPDATE inventory_balances SET reservedQty = reservedQty + CAST(${dec(qty)} AS DECIMAL(18,4)), updatedAt = NOW(3)
    WHERE locationId = ${locationId} AND batchId = ${batchId} AND quantity - reservedQty >= CAST(${dec(qty)} AS DECIMAL(18,4))`;
  if (n === 0) throw conflict('INSUFFICIENT_STOCK', 'Not enough available stock to reserve');
}
export async function releaseReservation(tx: Tx, locationId: string, batchId: string, qty: Prisma.Decimal) {
  await tx.$executeRaw`UPDATE inventory_balances SET reservedQty = GREATEST(reservedQty - CAST(${dec(qty)} AS DECIMAL(18,4)), 0), updatedAt = NOW(3) WHERE locationId = ${locationId} AND batchId = ${batchId}`;
}
/** Consumes previously reserved stock when the shipment physically leaves. */
export async function dispatchReserved(tx: Tx, locationId: string, batchId: string, qty: Prisma.Decimal) {
  const n = await tx.$executeRaw`UPDATE inventory_balances SET quantity = quantity - CAST(${dec(qty)} AS DECIMAL(18,4)), reservedQty = GREATEST(reservedQty - CAST(${dec(qty)} AS DECIMAL(18,4)), 0), updatedAt = NOW(3)
    WHERE locationId = ${locationId} AND batchId = ${batchId} AND quantity >= CAST(${dec(qty)} AS DECIMAL(18,4))`;
  if (n === 0) throw conflict('INSUFFICIENT_STOCK', 'Stock changed since the shipment was planned');
}
export async function credit(tx: Tx, companyId: string, locationId: string, batchId: string, qty: Prisma.Decimal, unit: never | string) {
  await tx.inventoryBalance.upsert({
    where: { locationId_batchId: { locationId, batchId } },
    create: { companyId, locationId, batchId, quantity: qty, unit: unit as never },
    update: { quantity: { increment: qty } },
  });
}
export const dq = (v: Prisma.Decimal.Value) => D(v);
