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

/** Signed currency delta (e.g. "+$12.50", "-$3.00"). Returns null when there's nothing to compare against - callers must not substitute "$0". */
export function formatSignedCurrency(value: string | null | undefined, currency = "MXN"): string | null {
  const parsed = parseDecimal(value);
  if (parsed == null) return null;
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, signDisplay: "always" }).format(parsed);
}

/**
 * Signed percentage delta. The backend already returns this as a percentage
 * number (e.g. "5.23" means 5.23%, not a 0-1 fraction) - do not multiply by 100.
 * Returns null when there's nothing to compare against (first entry, or a
 * division-by-zero case the backend already resolved to null) - callers must
 * not substitute "0%".
 */
export function formatSignedPercentage(value: string | null | undefined): string | null {
  const parsed = parseDecimal(value);
  if (parsed == null) return null;
  const formatted = new Intl.NumberFormat("es-MX", {
    signDisplay: "always",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
  return `${formatted}%`;
}
