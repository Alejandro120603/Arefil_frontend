/**
 * Backend Decimal fields arrive as JSON strings (see `src/types/api.ts`).
 * Parse only at the point of display — never widen the API contract itself.
 */
export function parseDecimal(value: string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Constructing an `Intl.NumberFormat` costs ~20 µs, which rounds to nothing for
 * a paginated HTML table. Formatters are immutable and keyed here by their
 * full option set, so sharing them changes no output.
 */
const FORMATTER_CACHE = new Map<string, Intl.NumberFormat>();

function getFormatter(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let formatter = FORMATTER_CACHE.get(key);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat("es-MX", options);
    FORMATTER_CACHE.set(key, formatter);
  }
  return formatter;
}

export function formatCurrency(value: string | null | undefined, currency = "MXN"): string {
  const parsed = parseDecimal(value);
  if (parsed == null) return "—";
  return getFormatter({ style: "currency", currency }).format(parsed);
}

export function formatNumber(value: string | null | undefined): string {
  const parsed = parseDecimal(value);
  if (parsed == null) return "—";
  return getFormatter({}).format(parsed);
}

/** Signed currency delta (e.g. "+$12.50", "-$3.00"). Returns null when there's nothing to compare against - callers must not substitute "$0". */
export function formatSignedCurrency(value: string | null | undefined, currency = "MXN"): string | null {
  const parsed = parseDecimal(value);
  if (parsed == null) return null;
  return getFormatter({ style: "currency", currency, signDisplay: "always" }).format(parsed);
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
  const formatted = getFormatter({
    signDisplay: "always",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
  return `${formatted}%`;
}
