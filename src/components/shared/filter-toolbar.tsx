import type { ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The toolbar attached to a dataset. Lives inside `DataTableShell`, so filters
 * never need a card of their own. Content stays a plain GET `<form>` where the
 * page is server-rendered.
 */
export function FilterToolbar({
  className,
  children,
  actions,
}: {
  className?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      data-slot="filter-toolbar"
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-border bg-muted/25 px-4 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-x-3 gap-y-3">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function FilterField({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export interface ActiveFilter {
  label: string;
  value: string;
  /** Href that removes just this filter, when it can be expressed as a URL. */
  clearHref?: string;
}

export function ActiveFilters({
  filters,
  clearAllHref,
  className,
}: {
  filters: ActiveFilter[];
  clearAllHref?: string;
  className?: string;
}) {
  if (filters.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b border-border px-4 py-2", className)}>
      <span className="text-xs text-muted-foreground">Filtros activos:</span>
      {filters.map((filter) => {
        const body = (
          <>
            <span className="text-muted-foreground">{filter.label}:</span>
            <span className="max-w-40 truncate font-medium">{filter.value}</span>
            {filter.clearHref && <X aria-hidden className="size-3 text-muted-foreground" />}
          </>
        );
        const base =
          "inline-flex h-6 items-center gap-1 rounded-4xl bg-muted px-2 text-xs transition-colors duration-(--duration-ui)";
        return filter.clearHref ? (
          <Link
            key={`${filter.label}-${filter.value}`}
            href={filter.clearHref}
            aria-label={`Quitar filtro ${filter.label}`}
            className={cn(base, "hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none")}
          >
            {body}
          </Link>
        ) : (
          <span key={`${filter.label}-${filter.value}`} className={base}>
            {body}
          </span>
        );
      })}
      {clearAllHref && (
        <Link
          href={clearAllHref}
          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Limpiar todo
        </Link>
      )}
    </div>
  );
}
