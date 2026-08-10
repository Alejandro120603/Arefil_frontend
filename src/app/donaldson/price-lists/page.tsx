import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { PaginationControls } from "@/components/donaldson/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getErrorMessage } from "@/lib/api/errors";
import { listPriceLists } from "@/lib/api/price-lists";
import { formatDate } from "@/lib/format/date";
import type { Page, PriceList } from "@/types/api";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

interface PriceListsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PriceListsPage({ searchParams }: PriceListsPageProps) {
  const params = await searchParams;
  const supplier = firstValue(params.supplier) ?? "";
  const effectiveDate = firstValue(params.effective_date) ?? "";
  const page = Number(firstValue(params.page) ?? "1") || 1;
  const pageSize = Number(firstValue(params.page_size) ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE;

  let data: Page<PriceList> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await listPriceLists({
      supplier: supplier || undefined,
      effective_date: effectiveDate || undefined,
      page,
      page_size: pageSize,
    });
  } catch (error) {
    errorMessage = getErrorMessage(error);
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/" }, { label: "Donaldson" }, { label: "Listas de precios" }]}
      />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Listas de precios</h1>
        <p className="text-sm text-muted-foreground">Historial de listas de precios importadas de Donaldson.</p>
      </div>

      <Card>
        <CardContent>
          <form action="/donaldson/price-lists" method="GET" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier">Proveedor</Label>
              <Input id="supplier" name="supplier" defaultValue={supplier} placeholder="DONALDSON" className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="effective_date">Fecha de vigencia</Label>
              <Input id="effective_date" name="effective_date" type="date" defaultValue={effectiveDate} className="w-40" />
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
            {(supplier || effectiveDate) && (
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/donaldson/price-lists" />}>
                Limpiar
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {errorMessage && <ErrorAlert title="No se pudieron cargar las listas de precios" message={errorMessage} />}

      {data && data.items.length === 0 && !errorMessage && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {supplier || effectiveDate
              ? "No hay listas de precios que coincidan con los filtros aplicados."
              : "Todavía no hay listas de precios importadas."}
          </CardContent>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vigencia</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead>Archivo fuente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creada</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((priceList) => (
                  <TableRow key={priceList.id}>
                    <TableCell className="font-medium">{formatDate(priceList.effective_date)}</TableCell>
                    <TableCell>{priceList.supplier}</TableCell>
                    <TableCell>{priceList.currency}</TableCell>
                    <TableCell className="max-w-xs truncate">{priceList.source_filename}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{priceList.status}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(priceList.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/donaldson/price-lists/${priceList.id}`} />}
                      >
                        Ver detalle
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationControls meta={data.meta} basePath="/donaldson/price-lists" searchParams={params} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
