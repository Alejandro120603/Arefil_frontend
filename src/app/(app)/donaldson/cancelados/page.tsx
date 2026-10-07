import Link from "next/link";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { HeaderStat } from "@/components/donaldson/header-stat";
import { PaginationControls } from "@/components/donaldson/pagination-controls";
import { StatusChangeBadge } from "@/components/donaldson/status-change-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, getErrorMessage } from "@/lib/api/errors";
import { listPriceLists, listPriceListStatusChanges } from "@/lib/api/price-lists";
import { formatDate } from "@/lib/format/date";
import type { Page, PriceList, StatusChange } from "@/types/api";

const DEFAULT_PAGE_SIZE = 25;
const PRICE_LIST_OPTIONS_LIMIT = 100;

interface CanceladosPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const BREADCRUMBS = [
  { label: "Dashboard", href: "/" },
  { label: "Donaldson" },
  { label: "Cancelados" },
];

export default async function CanceladosPage({ searchParams }: CanceladosPageProps) {
  const query = await searchParams;

  let priceLists: Page<PriceList> | null = null;
  let listsError: string | null = null;
  try {
    priceLists = await listPriceLists({ page_size: PRICE_LIST_OPTIONS_LIMIT });
  } catch (error) {
    listsError = getErrorMessage(error);
  }

  if (listsError) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs items={BREADCRUMBS} />
        <PageHeader />
        <ErrorAlert title="No se pudieron cargar las listas de precios" message={listsError} />
      </div>
    );
  }

  if (!priceLists || priceLists.items.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs items={BREADCRUMBS} />
        <PageHeader />
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Todavía no hay listas de precios importadas. Importa una lista Donaldson primero.
          </CardContent>
        </Card>
      </div>
    );
  }

  const priceListIdParam = firstValue(query.price_list_id);
  if (!priceListIdParam) {
    redirect(`/donaldson/cancelados?price_list_id=${priceLists.items[0].id}`);
  }

  const priceListId = Number(priceListIdParam);
  const selectedPriceList = priceLists.items.find((item) => item.id === priceListId) ?? null;

  const page = Number(firstValue(query.page) ?? "1") || 1;
  const pageSize = Number(firstValue(query.page_size) ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE;

  let statusChanges: Page<StatusChange> | null = null;
  let statusChangesError: string | null = null;
  let notFound = false;

  if (!Number.isFinite(priceListId)) {
    notFound = true;
  } else {
    try {
      statusChanges = await listPriceListStatusChanges(priceListId, { page, page_size: pageSize });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        notFound = true;
      } else {
        statusChangesError = getErrorMessage(error);
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={BREADCRUMBS} />
      <PageHeader />

      <Card>
        <CardContent>
          <form action="/donaldson/cancelados" method="GET" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="price_list_id">Lista de precios</Label>
              <select
                id="price_list_id"
                name="price_list_id"
                defaultValue={Number.isFinite(priceListId) ? String(priceListId) : undefined}
                className="h-8 w-96 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {priceLists.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    #{item.id} · {formatDate(item.effective_date)} · {item.source_filename}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm">
              Ver
            </Button>
          </form>
        </CardContent>
      </Card>

      {selectedPriceList && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeaderStat label="Proveedor" value={selectedPriceList.supplier} />
          <HeaderStat label="Vigencia" value={formatDate(selectedPriceList.effective_date)} />
          <HeaderStat label="Archivo" value={selectedPriceList.source_filename} />
          <HeaderStat
            label="Total cambios de estado"
            value={statusChanges ? statusChanges.meta.total_items.toLocaleString("es-MX") : "—"}
          />
        </div>
      )}

      {notFound && (
        <ErrorAlert
          title="Lista de precios no encontrada"
          message={`No existe una lista de precios con id #${priceListIdParam}.`}
        />
      )}

      {statusChangesError && (
        <ErrorAlert title="No se pudieron cargar los cambios de estado" message={statusChangesError} />
      )}

      {statusChanges && statusChanges.items.length === 0 && !statusChangesError && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Esta lista de precios no tiene cancelados ni productos fuera de catálogo.
          </CardContent>
        </Card>
      )}

      {statusChanges && statusChanges.items.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número de parte</TableHead>
                  <TableHead>Número de artículo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Reemplazo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statusChanges.items.map((change) => (
                  <TableRow key={change.id}>
                    <TableCell className="font-medium">{change.part_number}</TableCell>
                    <TableCell>{change.item_number ?? "—"}</TableCell>
                    <TableCell>
                      <StatusChangeBadge status={change.status} />
                    </TableCell>
                    <TableCell>
                      {change.replacement_product_id ? (
                        <Link
                          href={`/donaldson/products/${change.replacement_product_id}`}
                          className="hover:underline"
                        >
                          {change.replacement_part_number ?? `Producto #${change.replacement_product_id}`}
                        </Link>
                      ) : (
                        (change.replacement_part_number ?? "—")
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationControls meta={statusChanges.meta} basePath="/donaldson/cancelados" searchParams={query} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Cancelados</h1>
      <p className="text-sm text-muted-foreground">
        Productos cancelados o fuera de catálogo por lista de precios Donaldson.
      </p>
    </div>
  );
}
