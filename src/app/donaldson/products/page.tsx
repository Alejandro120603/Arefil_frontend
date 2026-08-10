import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { PaginationControls } from "@/components/donaldson/pagination-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getErrorMessage } from "@/lib/api/errors";
import { listProducts } from "@/lib/api/products";
import type { Page, Product } from "@/types/api";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

interface ProductsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const search = firstValue(params.search) ?? "";
  const partNumber = firstValue(params.part_number) ?? "";
  const itemNumber = firstValue(params.item_number) ?? "";
  const page = Number(firstValue(params.page) ?? "1") || 1;
  const pageSize = Number(firstValue(params.page_size) ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE;

  let data: Page<Product> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await listProducts({
      search: search || undefined,
      part_number: partNumber || undefined,
      item_number: itemNumber || undefined,
      page,
      page_size: pageSize,
    });
  } catch (error) {
    errorMessage = getErrorMessage(error);
  }

  const hasFilters = Boolean(search || partNumber || itemNumber);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Donaldson" }, { label: "Productos" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
        <p className="text-sm text-muted-foreground">Catálogo de productos Donaldson.</p>
      </div>

      <Card>
        <CardContent>
          <form action="/donaldson/products" method="GET" className="flex flex-wrap items-end gap-3">
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
              <Label htmlFor="part_number">Número de parte</Label>
              <Input id="part_number" name="part_number" defaultValue={partNumber} className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item_number">Número de artículo</Label>
              <Input id="item_number" name="item_number" defaultValue={itemNumber} className="w-40" />
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
            {hasFilters && (
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/donaldson/products" />}>
                Limpiar
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {errorMessage && <ErrorAlert title="No se pudo cargar el catálogo" message={errorMessage} />}

      {data && data.items.length === 0 && !errorMessage && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {hasFilters
              ? "No hay productos que coincidan con los filtros aplicados."
              : "Todavía no hay productos en el catálogo."}
          </CardContent>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número de parte</TableHead>
                  <TableHead>Número de artículo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Código SAT</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.part_number}</TableCell>
                    <TableCell>{product.item_number ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate" title={product.description ?? undefined}>{product.description ?? "—"}</TableCell>
                    <TableCell>{product.sat_code ?? "—"}</TableCell>
                    <TableCell>{product.supplier}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/donaldson/products/${product.id}`} />}
                      >
                        Ver detalle
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationControls meta={data.meta} basePath="/donaldson/products" searchParams={params} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
