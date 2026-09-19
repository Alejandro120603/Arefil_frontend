import { CircleMinus, Minus, Plus, TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { COMPARISON_STATUS_LABELS } from "@/lib/reports/comparison";
import { cn } from "@/lib/utils";
import type { ComparisonStatus } from "@/types/api";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

interface StatusPresentation {
  icon: LucideIcon;
  variant: BadgeVariant;
  className?: string;
}

/**
 * Trend colours follow `PriceChangeIndicator` (up = emerald, down =
 * destructive) so a single comparison never contradicts the price history
 * views. Colour is decoration only: every badge also carries its icon and its
 * Spanish label, so the status survives greyscale and screen readers.
 */
const PRESENTATION: Record<ComparisonStatus, StatusPresentation> = {
  INCREASED: { icon: TrendingUp, variant: "outline", className: "border-emerald-600/40 text-emerald-700 dark:text-emerald-400" },
  DECREASED: { icon: TrendingDown, variant: "destructive" },
  UNCHANGED: { icon: Minus, variant: "secondary" },
  NEW: { icon: Plus, variant: "default" },
  REMOVED: { icon: CircleMinus, variant: "outline", className: "border-border text-muted-foreground" },
};

export function ComparisonStatusBadge({ status, className }: { status: ComparisonStatus; className?: string }) {
  const { icon: Icon, variant, className: toneClass } = PRESENTATION[status];
  return (
    <Badge variant={variant} className={cn(toneClass, className)}>
      <Icon aria-hidden="true" />
      {COMPARISON_STATUS_LABELS[status]}
    </Badge>
  );
}
