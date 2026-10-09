import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Visual shell only - no table engine. Filtering, sorting and pagination stay
 * server-driven through query params; this just stops every listing from
 * needing three separate cards for toolbar, table and pagination.
 *
 *   DataTableShell
 *   |- DataTableHeader   (optional: dataset title + result count)
 *   |- FilterToolbar     (optional)
 *   |- DataTableViewport (the existing `Table` primitive, or an EmptyState)
 *   +- DataTableFooter   (pagination)
 */
export function DataTableShell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      data-slot="data-table-shell"
      className={cn("flex flex-col overflow-hidden rounded-xl bg-card shadow-card ring-1 ring-border", className)}
    >
      {children}
    </section>
  );
}

export function DataTableHeader({
  title,
  count,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  count?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <h2 className="font-heading text-sm font-medium">{title}</h2>
          {count != null && <span className="num text-xs text-muted-foreground">{count}</span>}
        </div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function DataTableViewport({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "min-w-0",
        "[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DataTableFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("border-t border-border bg-muted/20 px-4 py-2.5", className)}>{children}</div>
  );
}
