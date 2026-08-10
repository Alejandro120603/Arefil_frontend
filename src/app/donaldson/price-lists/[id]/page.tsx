import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { DownloadButtons } from "@/components/donaldson/download-buttons";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { HeaderStat } from "@/components/donaldson/header-stat";
import { PaginationControls } from "@/components/donaldson/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, getErrorMessage } from "@/lib/api/errors";
import { getPriceList, listPriceListItems } from "@/lib/api/price-lists";
import { formatDate } from "@/lib/format/date";
import { formatCurrency, formatNumber } from "@/lib/format/decimal";
import type { Page, PriceListDetail, PriceListItem } from "@/types/api";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "part_number", label: "Número de parte (A→Z)" },
  { value: "-part_number", label: "Número de parte (Z→A)" },
  { value: "price", label: "Precio (menor a mayor)" },
  { value: "-price", label: "Precio (mayor a menor)" },
  { value: "classification", label: "Clasificación (A→Z)" },
  { value: "-classification", label: "Clasificación (Z→A)" },
];
interface PriceListDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PriceListDetailPage({ params, searchParams }: PriceListDetailPageProps) {
  const { id } = await params;
  const priceListId = Number(id);
  const query = await searchParams;

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Donaldson" },
    { label: "Listas de precios", href: "/donaldson/price-lists" },
    { label: Number.isFinite(priceListId) ? `#${priceListId}` : id },
  ];

  if (!Number.isFinite(priceListId)) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs items={breadcrumbs} />
        <ErrorAlert title="Lista de precios no encontrada" message={`El identificador "${id}" no es válido.`} />
      </div>
    );
  }

  let priceList: PriceListDetail | null = null;
  let notFound = false;
  let loadError: string | null = null;
  try {
    priceList = await getPriceList(priceListId);
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
        <ErrorAlert
          title="Lista de precios no encontrada"
          message={`No existe una lista de precios con id #${priceListId}.`}
        />
        <div>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/donaldson/price-lists" />}>
            Volver al listado
          </Button>
        </div>
      </div>
    );
  }

  if (loadError || !priceList) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs items={breadcrumbs} />
        <ErrorAlert
          title="No se pudo cargar la lista de precios"
          message={loadError ?? "Error inesperado del servidor."}
        />
      </div>
    );
  }

  const search = firstValue(query.search) ?? "";
  const classification = firstValue(query.classification) ?? "";
  // Only defaulted when absent - an explicitly invalid value (e.g. a hand-edited
  // URL) is passed through so the backend's 422 surfaces via `itemsError` below,
  // instead of being silently coerced away.
  const sort = firstValue(query.sort) ?? "part_number";
  const page = Number(firstValue(query.page) ?? "1") || 1;
  const pageSize = Number(firstValue(query.page_size) ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE;

  let items: Page<PriceListItem> | null = null;
  let itemsError: string | null = null;
  try {
    items = await listPriceListItems(priceListId, {
      search: search || undefined,
      classification: classification || undefined,
      sort,
      page,
      page_size: pageSize,
    });
  } catch (error) {
    itemsError = getErrorMessage(error);
  }

  const baseFilename = priceList.source_filename.replace(/\.[^.]+$/, "") || `price_list_${priceListId}`;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={breadcrumbs} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lista de precios #{priceList.id}</h1>
        <p className="text-sm text-muted-foreground">{priceList.source_filename}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <HeaderStat label="Proveedor" value={priceList.supplier} />
        <HeaderStat label="Vigencia" value={formatDate(priceList.effective_date)} />
        <HeaderStat label="Moneda" value={priceList.currency} />
        <HeaderStat label="Estado" value={<Badge variant="secondary">{priceList.status}</Badge>} />
        <HeaderStat label="Items" value={items ? items.meta.total_items.toLocaleString("es-MX") : priceList.items_count.toLocaleString("es-MX")} />
        <HeaderStat label="Cambios de estado" value={priceList.status_changes_count.toLocaleString("es-MX")} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Descargas</CardTitle>
        </CardHeader>
        <CardContent>
          <DownloadButtons
            priceListId={priceList.id}
            fallbackFilenames={{
              xlsx: `${baseFilename}.xlsx`,
              csv: `${baseFilename}.csv`,
              source: priceList.source_filename,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <form
            action={`/donaldson/price-lists/${priceListId}`}
            method="GET"
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="search">Buscar</Label>
              <Input
                id="search"
                name="search"
                defaultValue={search}
                placeholder="Número de parte, artículo o descripción"
                className="w-64"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="classification">Clasificación</Label>
              <Input id="classification" name="classification" defaultValue={classification} className="w-36" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sort">Ordenar por</Label>
              <select
                id="sort"
                name="sort"
                defaultValue={sort}
                className="h-8 w-56 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="page_size">Por página</Label>
              <select
                id="page_size"
                name="page_size"
                defaultValue={String(pageSize)}
                className="h-8 w-24 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm">
              Filtrar
            </Button>
            {(search || classification || sort !== "part_number") && (
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href={`/donaldson/price-lists/${priceListId}`} />}
              >
                Limpiar
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {itemsError && <ErrorAlert title="No se pudieron cargar los items" message={itemsError} />}

      {items && items.items.length === 0 && !itemsError && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {search || classification
              ? "No hay items que coincidan con los filtros aplicados."
              : "Esta lista de precios no tiene items."}
          </CardContent>
        </Card>
      )}

      {items && items.items.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número de parte</TableHead>
                  <TableHead>Número de artículo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Precio unitario</TableHead>
                  <TableHead>Clasificación</TableHead>
                  <TableHead>Código SAT</TableHead>
                  <TableHead>Nuevo</TableHead>
                  <TableHead className="text-right">Cant. paquete</TableHead>
                  <TableHead className="text-right">Peso (kg)</TableHead>
                  <TableHead className="text-right">Cubicaje (ft³)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <Link href={`/donaldson/products/${item.product_id}`} className="hover:underline">
                        {item.part_number}
                      </Link>
                    </TableCell>
                    <TableCell>{item.item_number ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate" title={item.description ?? undefined}>{item.description ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unit_price, priceList.currency)}</TableCell>
                    <TableCell>{item.classification ?? "—"}</TableCell>
                    <TableCell>{item.sat_code ?? "—"}</TableCell>
                    <TableCell>{item.is_new ? <Badge>Nuevo</Badge> : "—"}</TableCell>
                    <TableCell className="text-right">{item.std_package_qty ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.unit_weight_kg)}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.cubes_ft3)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationControls meta={items.meta} basePath={`/donaldson/price-lists/${priceListId}`} searchParams={query} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
