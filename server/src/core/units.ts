/** Unit handling. Quantities are plain numbers rounded to 4 decimals (matches DB Decimal(18,4)). */
export type Unit = 'KG' | 'G' | 'L' | 'ML' | 'UNIT' | 'POT' | 'CARTON' | 'PALLET';

const FAMILY: Record<Unit, { family: 'mass' | 'volume' | Unit; factor: number }> = {
  KG: { family: 'mass', factor: 1 },
  G: { family: 'mass', factor: 0.001 },
  L: { family: 'volume', factor: 1 },
  ML: { family: 'volume', factor: 0.001 },
  // Countable units never convert into each other (a POT is not a CARTON without a packaging rule).
  UNIT: { family: 'UNIT', factor: 1 },
  POT: { family: 'POT', factor: 1 },
  CARTON: { family: 'CARTON', factor: 1 },
  PALLET: { family: 'PALLET', factor: 1 },
};

export const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 10000) / 10000;

export function canConvert(from: Unit, to: Unit): boolean {
  return FAMILY[from].family === FAMILY[to].family;
}

/** Converts a quantity; throws if units are incompatible (never silently mixes kg and litres). */
export function convert(qty: number, from: Unit, to: Unit): number {
  if (from === to) return round4(qty);
  if (!canConvert(from, to)) throw new Error(`INCOMPATIBLE_UNITS:${from}->${to}`);
  return round4((qty * FAMILY[from].factor) / FAMILY[to].factor);
}
