import { Archive } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function RespaldosPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Respaldos</h1>
        <p className="text-sm text-muted-foreground">Respaldos de la base de datos.</p>
      </div>
      <EmptyState
        icon={Archive}
        title="Respaldos aún no disponibles"
        description="Esta sección se conectará a GET /api/admin/database/backup en una siguiente iteración."
      />
    </div>
  );
}
