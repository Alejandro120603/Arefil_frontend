import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Width discipline per kind of screen. There is deliberately no global
 * `max-w-*`: tables and the report builder need every available pixel, while a
 * form that stretches to 1920px is unreadable.
 */
export type PageWidth = "fluid" | "wide" | "form";

const WIDTHS: Record<PageWidth, string> = {
  fluid: "max-w-none",
  wide: "max-w-[1480px]",
  form: "max-w-3xl",
};

export function PageContainer({
  width = "wide",
  className,
  children,
}: {
  width?: PageWidth;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto flex w-full flex-col gap-6", WIDTHS[width], className)}>{children}</div>
  );
}
