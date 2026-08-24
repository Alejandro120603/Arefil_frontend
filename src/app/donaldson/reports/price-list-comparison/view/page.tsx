import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PriceListComparisonReport } from "@/components/reports/price-list-comparison-report";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { parseViewerSelection } from "@/lib/reports/comparison-handoff";

export const metadata = {
  title: "Reporte de comparación | Arefil",
};

interface ViewerPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Dedicated page for the Stimulsoft viewer: the toolbar, the export dialogs and
 * an A4 page preview need the full width, which a modal inside
 * `/donaldson/reports` could not give them.
 *
 * The page itself stays a Server Component - only `PriceListComparisonReport`
 * is client side, and Stimulsoft is loaded from there with `ssr: false`. The
 * pair of list ids travels in the query string; the dataset itself is handed
 * over through `sessionStorage` (see `comparison-handoff.ts`).
 */
export default async function PriceListComparisonViewerPage({ searchParams }: ViewerPageProps) {
  const selection = parseViewerSelection(await searchParams);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/" },
          { label: "Donaldson" },
          { label: "Reportes", href: "/donaldson/reports" },
          { label: "Comparación de listas" },
        ]}
      />

      {selection == null ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              El enlace del reporte no indica dos listas de precios válidas para comparar.
            </p>
            <Button size="sm" nativeButton={false} render={<Link href="/donaldson/reports" />}>
              Ir a Reportes
            </Button>
          </CardContent>
        </Card>
      ) : (
        <PriceListComparisonReport selection={selection} />
      )}
    </div>
  );
}
