import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComparisonStatusBadge } from "@/components/donaldson/comparison-status-badge";
import { EMPTY_VALUE, formatComparisonRow, getChangeTone, type ChangeTone } from "@/lib/reports/comparison";
import { cn } from "@/lib/utils";
import type { PriceListComparisonItem } from "@/types/api";

const TONE_CLASS: Record<ChangeTone, string> = {
  up: "text-emerald-700 dark:text-emerald-400",
  down: "text-destructive",
  none: "text-muted-foreground",
};

interface ComparisonTableProps {
  items: PriceListComparisonItem[];
  currency: string;
}

/**
 * Null handling lives in `formatComparisonRow` so it is covered by tests
 * without a DOM: `NEW`/`REMOVED` rows and null percentages render "—" here.
 */
export function ComparisonTable({ items, currency }: ComparisonTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Número de parte</TableHead>
          <TableHead>Número de artículo</TableHead>
          <TableHead>Descripción</TableHead>
          <TableHead>Clasificación</TableHead>
          <TableHead className="text-right">Precio A</TableHead>
          <TableHead className="text-right">Precio B</TableHead>
          <TableHead className="text-right">Diferencia</TableHead>
          <TableHead className="text-right">%</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const values = formatComparisonRow(item, currency);
          const toneClass = TONE_CLASS[getChangeTone(item.absolute_change)];
          return (
            <TableRow key={item.product_id}>
              <TableCell className="font-medium">{item.part_number}</TableCell>
              <TableCell>{item.item_number ?? EMPTY_VALUE}</TableCell>
              <TableCell className="max-w-xs truncate" title={item.description ?? undefined}>
                {item.description ?? EMPTY_VALUE}
              </TableCell>
              <TableCell>{values.classification}</TableCell>
              <TableCell className="text-right tabular-nums">{values.priceA}</TableCell>
              <TableCell className="text-right tabular-nums">{values.priceB}</TableCell>
              <TableCell className={cn("text-right font-medium tabular-nums", toneClass)}>
                {values.absoluteChange}
              </TableCell>
              <TableCell className={cn("text-right tabular-nums", toneClass)}>{values.percentageChange}</TableCell>
              <TableCell>
                <ComparisonStatusBadge status={item.status} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
