import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { LetterheadAdminWorkspace } from "@/components/letterheads/admin/letterhead-admin-workspace";

export const metadata = {
  title: "Membretes | Arefil",
};

export default function LetterheadsAdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Administración" }, { label: "Membretes" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Membretes</h1>
        <p className="text-sm text-muted-foreground">
          Diseños de membrete para los documentos Excel de Cotización y Descuento: catálogo, versiones y disponibilidad
          por reporte.
        </p>
      </div>
      <LetterheadAdminWorkspace />
    </div>
  );
}
