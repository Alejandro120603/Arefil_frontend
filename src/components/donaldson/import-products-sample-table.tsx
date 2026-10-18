import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format/decimal";
import type { ImportProductSample } from "@/types/api";

interface ImportProductsSampleTableProps {
  products: ImportProductSample[];
  currency: string | null;
  totalProducts: number;
}

export function ImportProductsSampleTable({ products, currency, totalProducts }: ImportProductsSampleTableProps) {
  if (products.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Muestra de productos ({products.length} de {totalProducts.toLocaleString("es-MX")})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número de parte</TableHead>
              <TableHead>Número de artículo</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Precio unitario</TableHead>
              <TableHead>Marca del proveedor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product, index) => (
              <TableRow key={`${product.part_number}-${index}`}>
                <TableCell className="font-medium">{product.part_number}</TableCell>
                <TableCell>{product.item_number ?? "—"}</TableCell>
                <TableCell className="min-w-48 max-w-sm whitespace-normal break-words">{product.description ?? "—"}</TableCell>
                <TableCell className="text-right">{formatCurrency(product.unit_price, currency ?? undefined)}</TableCell>
                <TableCell>
                  {product.is_new ? <Badge>Nuevo</Badge> : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-2 text-xs text-muted-foreground">
          «Nuevo» es la marca que el proveedor pone en su lista; no indica si el producto ya existe en el catálogo de AREFIL.
        </p>
      </CardContent>
    </Card>
  );
}
