import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { PriceListComparison } from "@/components/donaldson/price-list-comparison";
import { Card, CardContent } from "@/components/ui/card";
import { getUserErrorMessage } from "@/lib/api/errors";
import { listAllPriceLists } from "@/lib/api/price-lists";
import type { PriceList } from "@/types/api";

export const metadata = {
  title: "Reportes | Arefil",
};

/**
 * The price list catalogue is fetched server side (`serverApiClient`) so the
 * picker is populated on first paint; the comparison itself is requested from
 * the browser through the `/backend-api/*` proxy once the user picks A and B.
 */
export default async function ReportsPage() {
  let priceLists: PriceList[] = [];
  let errorMessage: string | null = null;
  try {
    priceLists = await listAllPriceLists();
  } catch (error) {
    errorMessage = getUserErrorMessage(
      error,
      "No se pudo comunicar con el backend. Verifica que el servicio esté disponible e intenta de nuevo.",
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Donaldson" }, { label: "Reportes" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Reportes derivados del catálogo Donaldson. El primero disponible compara dos listas de precios.
        </p>
      </div>

      {errorMessage && <ErrorAlert title="No se pudieron cargar las listas de precios" message={errorMessage} />}

      {!errorMessage && priceLists.length < 2 && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {priceLists.length === 0
              ? "No hay listas disponibles para comparar."
              : "Se necesitan al menos dos listas de precios importadas para generar una comparación."}
          </CardContent>
        </Card>
      )}

      {!errorMessage && priceLists.length >= 2 && <PriceListComparison priceLists={priceLists} />}
    </div>
  );
}
