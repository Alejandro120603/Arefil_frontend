import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format/date";
import type { ImportConfirmResult } from "@/types/api";

const RESULT_STATS: { key: keyof ImportConfirmResult; label: string }[] = [
  { key: "created_products", label: "Productos creados" },
  { key: "updated_products", label: "Productos actualizados" },
  { key: "price_items", label: "Items de precio" },
  { key: "cancelled", label: "Cancelados" },
  { key: "non_catalog", label: "Fuera de catálogo" },
  { key: "replacements", label: "Reemplazos" },
  { key: "warnings", label: "Advertencias" },
];

interface ImportResultProps {
  result: ImportConfirmResult;
  onImportAnother: () => void;
}

export function ImportResult({ result, onImportAnother }: ImportResultProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-emerald-600">
          <CheckCircle2 className="h-5 w-5" />
          Importación completada
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Lista de precios #{result.price_list_id}</p>
          <p className="text-sm font-medium">Vigente desde {formatDate(result.effective_date)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RESULT_STATS.map(({ key, label }) => (
            <div key={key}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold">{Number(result[key]).toLocaleString("es-MX")}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button render={<Link href={`/donaldson/price-lists/${result.price_list_id}`} />}>
            Ver lista importada
          </Button>
          <Button type="button" variant="outline" onClick={onImportAnother}>
            Importar otra lista
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
