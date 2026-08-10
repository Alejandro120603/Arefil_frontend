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
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product, index) => (
              <TableRow key={`${product.part_number}-${index}`}>
                <TableCell className="font-medium">{product.part_number}</TableCell>
                <TableCell>{product.item_number ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate">{product.description ?? "—"}</TableCell>
                <TableCell className="text-right">{formatCurrency(product.unit_price, currency ?? undefined)}</TableCell>
                <TableCell>
                  {product.is_new ? (
                    <Badge>Nuevo</Badge>
                  ) : (
                    <Badge variant="secondary">Existente</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
