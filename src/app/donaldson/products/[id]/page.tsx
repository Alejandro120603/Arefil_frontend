import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { HeaderStat } from "@/components/donaldson/header-stat";
import { PaginationControls } from "@/components/donaldson/pagination-controls";
import { PriceChangeIndicator } from "@/components/donaldson/price-change-indicator";
import { PriceHistoryChart } from "@/components/donaldson/price-history-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, getErrorMessage } from "@/lib/api/errors";
import { getProduct, getProductPriceHistory } from "@/lib/api/products";
import { formatDate } from "@/lib/format/date";
import { formatCurrency } from "@/lib/format/decimal";
import type { Page, PriceHistoryEntry, Product } from "@/types/api";

const DEFAULT_PAGE_SIZE = 25;

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductDetailPage({ params, searchParams }: ProductDetailPageProps) {
  const { id } = await params;
  const productId = Number(id);
  const query = await searchParams;

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Donaldson" },
    { label: "Productos", href: "/donaldson/products" },
    { label: Number.isFinite(productId) ? `#${productId}` : id },
  ];

  if (!Number.isFinite(productId)) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs items={breadcrumbs} />
        <ErrorAlert title="Producto no encontrado" message={`El identificador "${id}" no es válido.`} />
      </div>
    );
  }

  let product: Product | null = null;
  let notFound = false;
  let loadError: string | null = null;
  try {
    product = await getProduct(productId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound = true;
    } else {
      loadError = getErrorMessage(error);
    }
  }

  if (notFound) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs items={breadcrumbs} />
        <ErrorAlert title="Producto no encontrado" message={`No existe un producto con id #${productId}.`} />
        <div>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/donaldson/products" />}>
            Volver al catálogo
          </Button>
        </div>
      </div>
    );
  }

  if (loadError || !product) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs items={breadcrumbs} />
        <ErrorAlert title="No se pudo cargar el producto" message={loadError ?? "Error inesperado del servidor."} />
      </div>
    );
  }

  const page = Number(firstValue(query.page) ?? "1") || 1;
  const pageSize = Number(firstValue(query.page_size) ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE;

  let history: Page<PriceHistoryEntry> | null = null;
  let historyError: string | null = null;
  try {
    history = await getProductPriceHistory(productId, { page, page_size: pageSize });
  } catch (error) {
    historyError = getErrorMessage(error);
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={breadcrumbs} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{product.part_number}</h1>
        <p className="text-sm text-muted-foreground">{product.description ?? "Sin descripción disponible."}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeaderStat label="Número de artículo" value={product.item_number ?? "—"} />
        <HeaderStat label="Código SAT" value={product.sat_code ?? "—"} />
        <HeaderStat label="Proveedor" value={product.supplier} />
        <HeaderStat
          label="Entradas de histórico"
          value={history ? history.meta.total_items.toLocaleString("es-MX") : "—"}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Creado {formatDate(product.created_at)} · Actualizado {formatDate(product.updated_at)}
      </p>

      {historyError && <ErrorAlert title="No se pudo cargar el histórico de precios" message={historyError} />}

      {history && history.items.length === 0 && !historyError && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Este producto no tiene histórico de precios todavía.
          </CardContent>
        </Card>
      )}

      {history && history.items.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Evolución del precio</CardTitle>
          </CardHeader>
          <CardContent>
            <PriceHistoryChart entries={history.items} />
          </CardContent>
        </Card>
      )}

      {history && history.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Histórico de precios</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vigencia</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead>Clasificación</TableHead>
                  <TableHead>Variación</TableHead>
                  <TableHead>Lista de precios</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.items.map((entry) => (
                  <TableRow key={entry.price_list_id}>
                    <TableCell className="font-medium">{formatDate(entry.effective_date)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(entry.price, entry.currency)}</TableCell>
                    <TableCell>{entry.currency}</TableCell>
                    <TableCell>{entry.classification ?? "—"}</TableCell>
                    <TableCell>
                      <PriceChangeIndicator
                        absoluteChange={entry.absolute_change}
                        percentageChange={entry.percentage_change}
                        currency={entry.currency}
                      />
                    </TableCell>
                    <TableCell>
                      <Link href={`/donaldson/price-lists/${entry.price_list_id}`} className="hover:underline">
                        #{entry.price_list_id}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationControls meta={history.meta} basePath={`/donaldson/products/${productId}`} searchParams={query} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
