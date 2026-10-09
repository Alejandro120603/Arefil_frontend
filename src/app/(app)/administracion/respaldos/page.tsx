import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { BackupDownloadCard } from "@/components/admin/backup-download-card";
import { Card, CardContent } from "@/components/ui/card";

export default function RespaldosPage() {
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Administración" }, { label: "Respaldos" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Respaldos</h1>
        <p className="text-sm text-muted-foreground">Respaldo de la base de datos de Arefil.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            El respaldo contiene la base SQLite completa de Arefil (proveedores, productos, listas de precios,
            items y cambios de estado). Se genera al momento con la API de respaldo nativa de SQLite y se
            verifica antes de entregarse.
          </p>
          <BackupDownloadCard />
        </CardContent>
      </Card>
    </div>
  );
}
