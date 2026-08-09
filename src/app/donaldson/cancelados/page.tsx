import { XCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function CanceladosPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cancelados</h1>
        <p className="text-sm text-muted-foreground">Productos cancelados o dados de baja del catálogo.</p>
      </div>
      <EmptyState
        icon={XCircle}
        title="Listado aún no disponible"
        description="Esta sección se conectará a GET /api/price-lists/{id}/status-changes en una siguiente iteración."
      />
    </div>
  );
}
