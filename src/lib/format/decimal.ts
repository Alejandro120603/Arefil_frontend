/**
 * Backend Decimal fields arrive as JSON strings (see `src/types/api.ts`).
 * Parse only at the point of display — never widen the API contract itself.
 */
export function parseDecimal(value: string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatCurrency(value: string | null | undefined, currency = "MXN"): string {
  const parsed = parseDecimal(value);
  if (parsed == null) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(parsed);
}

export function formatNumber(value: string | null | undefined): string {
  const parsed = parseDecimal(value);
  if (parsed == null) return "—";
  return new Intl.NumberFormat("es-MX").format(parsed);
}
