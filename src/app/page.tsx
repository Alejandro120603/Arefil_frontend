import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessage, getHealth, getPriceList, listPriceLists, listProducts, listSuppliers } from "@/lib/api";
import { formatDate } from "@/lib/format/date";
import type { PriceListDetail } from "@/types/api";

const DONALDSON_SUPPLIER_CODE = "DONALDSON";
const CONNECTION_FALLBACK = "No se pudo conectar con el backend.";

interface DashboardData {
  health: { ok: boolean; error?: string };
  donaldsonSupplier: { name: string; active: boolean } | null;
  donaldsonError?: string;
  totalProducts: number | null;
  productsError?: string;
  latestPriceList: PriceListDetail | null;
  priceListError?: string;
}

async function loadDashboardData(): Promise<DashboardData> {
  const [healthResult, suppliersResult, productsResult, priceListsResult] = await Promise.allSettled([
    getHealth(),
    listSuppliers(),
    listProducts({ page_size: 1 }),
    listPriceLists({ page_size: 1 }),
  ]);

  const health =
    healthResult.status === "fulfilled"
      ? { ok: healthResult.value.status === "ok" }
      : { ok: false, error: getErrorMessage(healthResult.reason, CONNECTION_FALLBACK) };

  let donaldsonSupplier: DashboardData["donaldsonSupplier"] = null;
  let donaldsonError: string | undefined;
  if (suppliersResult.status === "fulfilled") {
    const donaldson = suppliersResult.value.find((supplier) => supplier.code === DONALDSON_SUPPLIER_CODE);
    donaldsonSupplier = donaldson ? { name: donaldson.name, active: donaldson.active } : null;
  } else {
    donaldsonError = getErrorMessage(suppliersResult.reason, CONNECTION_FALLBACK);
  }

  const totalProducts = productsResult.status === "fulfilled" ? productsResult.value.meta.total_items : null;
  const productsError = productsResult.status === "rejected" ? getErrorMessage(productsResult.reason, CONNECTION_FALLBACK) : undefined;

  let latestPriceList: PriceListDetail | null = null;
  let priceListError: string | undefined;
  if (priceListsResult.status === "fulfilled") {
    const [first] = priceListsResult.value.items;
    if (first) {
      try {
        latestPriceList = await getPriceList(first.id);
      } catch (error) {
        priceListError = getErrorMessage(error, CONNECTION_FALLBACK);
      }
    }
  } else {
    priceListError = getErrorMessage(priceListsResult.reason, CONNECTION_FALLBACK);
  }

  return {
    health,
    donaldsonSupplier,
    donaldsonError,
    totalProducts,
    productsError,
    latestPriceList,
    priceListError,
  };
}

export default async function DashboardPage() {
  const data = await loadDashboardData();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Estado general de Arefil y del proveedor Donaldson.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Backend</CardTitle>
          </CardHeader>
          <CardContent>
            {data.health.ok ? (
              <Badge className="bg-emerald-600 text-white [a]:hover:bg-emerald-600">Operativo</Badge>
            ) : (
              <Badge variant="destructive">No disponible</Badge>
            )}
            {data.health.error && <p className="mt-2 text-xs text-muted-foreground">{data.health.error}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Proveedor Donaldson</CardTitle>
          </CardHeader>
          <CardContent>
            {data.donaldsonSupplier ? (
              <div className="space-y-1">
                <p className="text-lg font-semibold">{data.donaldsonSupplier.name}</p>
                <Badge variant={data.donaldsonSupplier.active ? "default" : "secondary"}>
                  {data.donaldsonSupplier.active ? "Activo" : "Inactivo"}
                </Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {data.donaldsonError ?? "Proveedor Donaldson aún no registrado."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de productos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {data.totalProducts != null ? new Intl.NumberFormat("es-MX").format(data.totalProducts) : "—"}
            </p>
            {data.productsError && <p className="mt-2 text-xs text-muted-foreground">{data.productsError}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Lista de precios más reciente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.latestPriceList ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">{formatDate(data.latestPriceList.effective_date)}</p>
                <p className="truncate text-xs text-muted-foreground">{data.latestPriceList.source_filename}</p>
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span>{data.latestPriceList.items_count} items</span>
                  <span>{data.latestPriceList.status_changes_count} cambios de estado</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {data.priceListError ?? "Todavía no hay listas de precios importadas."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
