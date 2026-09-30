import type { ReactNode } from "react";
import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";
import { cn } from "@/lib/utils";

/**
 * The single page grammar: breadcrumb, title + description on the left,
 * primary action and overflow on the right. Stacks on mobile so the action
 * never gets squeezed next to a wrapping title.
 */
export function PageHeader({
  breadcrumbs,
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: {
  breadcrumbs?: BreadcrumbItem[];
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow && (
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
              {eyebrow}
            </div>
          )}
          <h1 className="font-heading text-2xl leading-8 font-semibold tracking-tight text-balance">{title}</h1>
          {description && <p className="max-w-[68ch] text-sm text-muted-foreground">{description}</p>}
          {meta && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">{meta}</div>}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">{actions}</div>
        )}
      </div>
    </div>
  );
}
