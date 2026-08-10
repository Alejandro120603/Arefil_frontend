import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatSignedCurrency, formatSignedPercentage, parseDecimal } from "@/lib/format/decimal";
import type { DecimalString } from "@/types/api";

interface PriceChangeIndicatorProps {
  absoluteChange: DecimalString | null;
  percentageChange: DecimalString | null;
  currency: string;
}

/**
 * `absoluteChange === null` means "no prior entry to compare against" (first
 * history row) - never rendered as "$0". `percentageChange === null` with a
 * non-null `absoluteChange` means the previous price was exactly 0 (division
 * by zero) - the absolute delta still renders, the percentage is simply omitted,
 * never "0%"/"Infinity%"/"NaN%".
 */
export function PriceChangeIndicator({ absoluteChange, percentageChange, currency }: PriceChangeIndicatorProps) {
  if (absoluteChange === null) {
    return <span className="text-sm text-muted-foreground">Sin comparación</span>;
  }

  const parsedAbsolute = parseDecimal(absoluteChange) ?? 0;
  const trend = parsedAbsolute > 0 ? "up" : parsedAbsolute < 0 ? "down" : "flat";
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const toneClass =
    trend === "up" ? "text-emerald-600" : trend === "down" ? "text-destructive" : "text-muted-foreground";

  const formattedAbsolute = formatSignedCurrency(absoluteChange, currency);
  const formattedPercentage = formatSignedPercentage(percentageChange);

  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-medium", toneClass)}>
      <Icon className="h-3.5 w-3.5" />
      {formattedAbsolute}
      {formattedPercentage && <span className="text-xs text-muted-foreground">({formattedPercentage})</span>}
    </span>
  );
}
