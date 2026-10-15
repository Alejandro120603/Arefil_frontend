import Link from "next/link";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { LetterheadDetail } from "@/components/letterheads/admin/letterhead-detail";
import { Button } from "@/components/ui/button";
import { parseLetterheadId } from "@/lib/letterheads/letterhead-admin";

export const metadata = {
  title: "Membrete | Arefil",
};

export default async function LetterheadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = parseLetterheadId(raw);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/" },
          { label: "Administración" },
          { label: "Membretes", href: "/administracion/membretes" },
          { label: id != null ? `Membrete ${id}` : "Membrete" },
        ]}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Detalle del membrete</h1>
          <p className="text-sm text-muted-foreground">Nombre, estado, nuevas versiones e historial inmutable.</p>
        </div>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/administracion/membretes" />}>
          Volver a membretes
        </Button>
      </div>
      {id == null ? (
        <ErrorAlert title="Membrete no válido" message="El identificador del membrete no es válido." />
      ) : (
        <LetterheadDetail id={id} />
      )}
    </div>
  );
}
