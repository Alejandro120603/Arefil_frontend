import { formatCurrency, parseDecimal } from "@/lib/format/decimal";
import { formatDate } from "@/lib/format/date";
import type { PriceHistoryEntry } from "@/types/api";

interface PriceHistoryChartProps {
  entries: PriceHistoryEntry[];
}

const WIDTH = 640;
const HEIGHT = 160;
const PADDING_X = 12;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 24;

interface Point {
  entry: PriceHistoryEntry;
  price: number;
}

/**
 * Minimal dependency-free line chart (inline SVG) - the project has no
 * charting library and this is a single small trend line, so pulling one in
 * isn't warranted. Derived exclusively from the `price-history` entries
 * already fetched for the table below it; points are spaced evenly by index
 * rather than scaled to actual elapsed time, which keeps this genuinely
 * simple at the cost of not representing gaps between imports.
 */
export function PriceHistoryChart({ entries }: PriceHistoryChartProps) {
  const points: Point[] = entries
    .map((entry) => ({ entry, price: parseDecimal(entry.price) }))
    .filter((point): point is Point => point.price !== null);

  if (points.length < 2) return null;

  const prices = points.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  const plotWidth = WIDTH - PADDING_X * 2;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const coords = points.map((point, index) => ({
    ...point,
    x: PADDING_X + (index / (points.length - 1)) * plotWidth,
    y: PADDING_TOP + plotHeight - ((point.price - minPrice) / priceRange) * plotHeight,
  }));

  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const first = coords[0];
  const last = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-40 w-full"
      role="img"
      aria-label={`Evolución del precio de ${formatDate(first.entry.effective_date)} a ${formatDate(last.entry.effective_date)}`}
    >
      <line
        x1={PADDING_X}
        y1={HEIGHT - PADDING_BOTTOM}
        x2={WIDTH - PADDING_X}
        y2={HEIGHT - PADDING_BOTTOM}
        stroke="var(--color-border)"
        strokeWidth={1}
      />
      <path
        d={pathD}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coords.slice(0, -1).map((c) => (
        <circle key={c.entry.price_list_id} cx={c.x} cy={c.y} r={3} fill="var(--color-primary)">
          <title>{`${formatDate(c.entry.effective_date)}: ${formatCurrency(c.entry.price, c.entry.currency)}`}</title>
        </circle>
      ))}
      <circle cx={last.x} cy={last.y} r={5} fill="var(--color-primary)" stroke="var(--color-card)" strokeWidth={2}>
        <title>{`${formatDate(last.entry.effective_date)}: ${formatCurrency(last.entry.price, last.entry.currency)}`}</title>
      </circle>
      <text x={first.x} y={PADDING_TOP - 8} fontSize={10} fill="var(--color-muted-foreground)">
        {formatDate(first.entry.effective_date)}
      </text>
      <text x={last.x} y={PADDING_TOP - 8} textAnchor="end" fontSize={10} fill="var(--color-muted-foreground)">
        {formatDate(last.entry.effective_date)}
      </text>
      <text x={last.x} y={Math.max(last.y - 10, 12)} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--color-foreground)">
        {formatCurrency(last.entry.price, last.entry.currency)}
      </text>
    </svg>
  );
}
