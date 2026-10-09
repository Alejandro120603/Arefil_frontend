import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * One titled block of a long form. Keeps every section on the same surface
 * level so nothing turns into a card inside a card.
 */
export function FormSection({
  title,
  description,
  icon,
  actions,
  className,
  contentClassName,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader className="border-b pb-4">
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {actions}
      </CardHeader>
      <CardContent className={cn("flex flex-col gap-4", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
