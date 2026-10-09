import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "default" | "info" | "success" | "warning" | "destructive";

const ACCENTS: Record<StatTone, string> = {
  default: "before:bg-border",
  info: "before:bg-info",
  success: "before:bg-success",
  warning: "before:bg-warning",
  destructive: "before:bg-destructive",
};

const ICON_TONES: Record<StatTone, string> = {
  default: "text-muted-foreground",
  info: "text-info-strong",
  success: "text-success-strong",
  warning: "text-warning-strong",
  destructive: "text-destructive-strong",
};

/**
 * Dense KPI tile. Evolves `HeaderStat`: same information density, plus an
 * optional icon, helper line and a 2px accent rail that carries the status
 * without repainting the whole card.
 */
export function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "default",
  className,
  ...props
}: {
  label: ReactNode;
  value: ReactNode;
  helper?: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
} & Omit<ComponentProps<"div">, "children">) {
  return (
    <div
      data-slot="stat-card"
      className={cn(
        "relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-xl bg-card px-3.5 py-3 shadow-card ring-1 ring-border",
        "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:content-['']",
        ACCENTS[tone],
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5">
        {Icon && <Icon aria-hidden className={cn("size-3.5 shrink-0", ICON_TONES[tone])} />}
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <div className="num truncate text-lg leading-6 font-semibold">{value}</div>
      {helper && <div className="truncate text-xs text-muted-foreground">{helper}</div>}
    </div>
  );
}

export function StatCardGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>;
}
