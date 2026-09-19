import { HeaderStat } from "@/components/donaldson/header-stat";
import { COMPARISON_STATUS_ORDER, COMPARISON_STATUS_PLURAL_LABELS } from "@/lib/reports/comparison";
import { formatSignedPercentage } from "@/lib/format/decimal";
import type { ComparisonStatus, PriceListComparisonSummary } from "@/types/api";

const COUNT_KEYS: Record<ComparisonStatus, keyof PriceListComparisonSummary> = {
  INCREASED: "increased",
  DECREASED: "decreased",
  UNCHANGED: "unchanged",
  NEW: "new",
  REMOVED: "removed",
};

function formatCount(value: number): string {
  return new Intl.NumberFormat("es-MX").format(value);
}

/**
 * Every number rendered here comes straight from the backend summary - the
 * frontend never recounts the items array, so the report and the table can
 * never disagree about what the dataset contains.
 */
export function ComparisonSummary({ summary }: { summary: PriceListComparisonSummary }) {
  const averageChange = formatSignedPercentage(summary.average_percentage_change) ?? "—";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      <HeaderStat label="Total productos" value={formatCount(summary.total_products)} />
      {COMPARISON_STATUS_ORDER.map((status) => (
        <HeaderStat
          key={status}
          label={COMPARISON_STATUS_PLURAL_LABELS[status]}
          value={formatCount(summary[COUNT_KEYS[status]] as number)}
        />
      ))}
      <HeaderStat label="Promedio de variación" value={averageChange} />
    </div>
  );
}
