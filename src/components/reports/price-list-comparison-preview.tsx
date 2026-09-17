"use client";

import { useMemo, useState } from "react";
import { ComparisonSummary } from "@/components/donaldson/comparison-summary";
import { ComparisonTable } from "@/components/donaldson/comparison-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  ALL_STATUSES,
  COMPARISON_STATUS_FILTERS,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  describeComparisonList,
  filterComparisonItems,
  getStatusFilterLabel,
  paginateItems,
  type ComparisonStatusFilter,
} from "@/lib/reports/comparison";
import type { PriceListComparisonResponse, PriceListComparisonSummary } from "@/types/api";

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const COUNT_BY_FILTER: Record<Exclude<ComparisonStatusFilter, typeof ALL_STATUSES>, keyof PriceListComparisonSummary> = {
  INCREASED: "increased",
  DECREASED: "decreased",
  UNCHANGED: "unchanged",
  NEW: "new",
  REMOVED: "removed",
};

function filterCount(summary: PriceListComparisonSummary, filter: ComparisonStatusFilter): number {
  return filter === ALL_STATUSES ? summary.total_products : (summary[COUNT_BY_FILTER[filter]] as number);
}

export function PriceListComparisonPreview({ comparison }: { comparison: PriceListComparisonResponse }) {
  const [statusFilter, setStatusFilter] = useState<ComparisonStatusFilter>(ALL_STATUSES);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const filteredItems = useMemo(
    () => filterComparisonItems(comparison.items, statusFilter),
    [comparison.items, statusFilter],
  );
  const currentPage = useMemo(() => paginateItems(filteredItems, page, pageSize), [filteredItems, page, pageSize]);

  function changeFilter(next: ComparisonStatusFilter) {
    setStatusFilter(next);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Comparación de listas · {comparison.supplier.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Lista A:</span> {describeComparisonList(comparison.list_a)}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Lista B:</span> {describeComparisonList(comparison.list_b)}
        </p>
      </div>

      <ComparisonSummary summary={comparison.summary} />

      {comparison.items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Las listas seleccionadas no tienen productos para comparar.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-4 overflow-x-auto">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por estado">
              {COMPARISON_STATUS_FILTERS.map((filter) => (
                <Button
                  key={filter}
                  type="button"
                  size="sm"
                  variant={statusFilter === filter ? "default" : "outline"}
                  aria-pressed={statusFilter === filter}
                  onClick={() => changeFilter(filter)}
                >
                  {getStatusFilterLabel(filter)} ({filterCount(comparison.summary, filter).toLocaleString("es-MX")})
                </Button>
              ))}
            </div>

            {currentPage.totalItems === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No hay productos con el estado seleccionado.
              </p>
            ) : (
              <>
                <ComparisonTable items={currentPage.items} currency={comparison.list_b.currency} />
                <div className="flex flex-col items-start justify-between gap-3 border-t pt-3 sm:flex-row sm:items-center">
                  <p className="text-sm text-muted-foreground">
                    {currentPage.from.toLocaleString("es-MX")}–{currentPage.to.toLocaleString("es-MX")} de{" "}
                    {currentPage.totalItems.toLocaleString("es-MX")} productos · Página {currentPage.page} de{" "}
                    {currentPage.totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="comparison-page-size" className="text-sm text-muted-foreground">Por página</Label>
                    <select
                      id="comparison-page-size"
                      className={`${SELECT_CLASS} w-20`}
                      value={String(pageSize)}
                      onChange={(event) => {
                        setPageSize(Number(event.target.value) || DEFAULT_PAGE_SIZE);
                        setPage(1);
                      }}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={currentPage.page <= 1}
                      onClick={() => setPage(currentPage.page - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={currentPage.page >= currentPage.totalPages}
                      onClick={() => setPage(currentPage.page + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
