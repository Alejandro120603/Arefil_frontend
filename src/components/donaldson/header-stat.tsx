import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function HeaderStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="truncate text-sm font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
