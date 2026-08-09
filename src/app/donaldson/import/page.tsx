import { Upload } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function ImportDonaldsonPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importar lista</h1>
        <p className="text-sm text-muted-foreground">Importación de listas de precios Donaldson.</p>
      </div>
      <EmptyState
        icon={Upload}
        title="Importación aún no disponible"
        description="Esta sección se conectará a POST /api/imports/donaldson/preview y /api/imports/{id}/confirm en una siguiente iteración."
      />
    </div>
  );
}
