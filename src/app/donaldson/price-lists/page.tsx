import { ListTree } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function PriceListsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Listas de precios</h1>
        <p className="text-sm text-muted-foreground">Historial de listas de precios de Donaldson.</p>
      </div>
      <EmptyState
        icon={ListTree}
        title="Listado aún no disponible"
        description="Esta sección se conectará a GET /api/price-lists en una siguiente iteración."
      />
    </div>
  );
}
