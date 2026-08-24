const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // Date-only strings (e.g. `effective_date`) have no timezone - `new Date(str)`
  // parses them as UTC midnight, which then shifts a day back once formatted in
  // a negative-offset zone (e.g. America/Mexico_City). Build the Date from its
  // local calendar components instead so no shift happens. Full timestamps
  // (e.g. `created_at`) are real instants and should keep converting to local time.
  const dateOnlyMatch = DATE_ONLY_PATTERN.exec(value);
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(date);
}

/**
 * Date + time for report headers (e.g. `report.generated_at`, a real instant).
 * `formatDate` deliberately drops the time, and a generated-at stamp without
 * one is ambiguous when two comparisons are run on the same day.
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
