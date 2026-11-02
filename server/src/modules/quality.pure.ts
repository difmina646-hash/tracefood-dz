/** Pure compliance evaluation against the company's CONFIGURED limits (no hard-coded regulatory values). */
type Dec = { toString(): string } | null;
const n = (v: Dec) => Number(v!.toString());
export function evaluate(param: { paramType: string; minValue: Dec; maxValue: Dec }, r: { valueNumeric?: number; valueText?: string; compliant?: boolean }): boolean | null {
  if (param.paramType === 'NUMERIC') {
    if (r.valueNumeric === undefined) return r.compliant ?? null;
    if (param.minValue !== null && r.valueNumeric < n(param.minValue)) return false;
    if (param.maxValue !== null && r.valueNumeric > n(param.maxValue)) return false;
    return true;
  }
  if (param.paramType === 'BOOLEAN') return r.valueText === undefined ? (r.compliant ?? null) : r.valueText.toLowerCase() === 'true';
  return r.compliant ?? null;
}
