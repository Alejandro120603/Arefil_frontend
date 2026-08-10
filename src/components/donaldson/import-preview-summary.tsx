import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format/date";
import type { ImportPreviewResponse, ImportSummary } from "@/types/api";

interface ImportPreviewSummaryProps {
  preview: ImportPreviewResponse;
}

const STAT_LABELS: { key: keyof ImportSummary; label: string }[] = [
  { key: "products", label: "Productos" },
  { key: "cancelled", label: "Cancelados" },
  { key: "non_catalog", label: "Fuera de catálogo" },
  { key: "replacements", label: "Reemplazos" },
  { key: "warnings", label: "Advertencias" },
  { key: "errors", label: "Errores" },
];

export function ImportPreviewSummary({ preview }: ImportPreviewSummaryProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Archivo</p>
            <p className="truncate text-sm font-medium">{preview.filename}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Proveedor</p>
            <p className="text-sm font-medium">{preview.supplier}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fecha de vigencia</p>
            <p className="text-sm font-medium">
              {preview.effective_date ? formatDate(preview.effective_date) : "No detectada"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Moneda</p>
            <p className="text-sm font-medium">{preview.currency ?? "No detectada"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STAT_LABELS.map(({ key, label }) => (
          <Card key={key} size="sm">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  "text-xl font-semibold",
                  key === "errors" && preview.summary.errors > 0 && "text-destructive",
                )}
              >
                {preview.summary[key].toLocaleString("es-MX")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
