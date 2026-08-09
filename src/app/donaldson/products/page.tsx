import { Package } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function ProductsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
        <p className="text-sm text-muted-foreground">Catálogo de productos Donaldson.</p>
      </div>
      <EmptyState
        icon={Package}
        title="Catálogo aún no disponible"
        description="Esta sección se conectará a GET /api/products en una siguiente iteración."
      />
    </div>
  );
}
