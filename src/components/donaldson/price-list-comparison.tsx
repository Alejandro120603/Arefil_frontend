"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { ComparisonSummary } from "@/components/donaldson/comparison-summary";
import { ComparisonTable } from "@/components/donaldson/comparison-table";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getUserErrorMessage } from "@/lib/api/errors";
import { getPriceListComparison } from "@/lib/api/reports";
import {
  ALL_STATUSES,
  COMPARISON_STATUS_FILTERS,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  describeComparisonList,
  describePriceList,
  filterComparisonItems,
  getStatusFilterLabel,
  paginateItems,
  validateComparisonSelection,
  type ComparisonStatusFilter,
} from "@/lib/reports/comparison";
import type { ComparisonPriceList, PriceList, PriceListComparisonResponse, PriceListComparisonSummary } from "@/types/api";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

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

/** `id` is kept as a string because that is what a native `<select>` value is. */
function parseSelection(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function PriceListPicker({
  id,
  label,
  priceLists,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  priceLists: PriceList[];
  value: number | null;
  onChange: (next: number | null) => void;
  disabled: boolean;
}) {
  const selected = priceLists.find((priceList) => priceList.id === value) ?? null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={SELECT_CLASS}
        value={value == null ? "" : String(value)}
        disabled={disabled}
        onChange={(event) => onChange(parseSelection(event.target.value))}
      >
        <option value="">Selecciona una lista</option>
        {priceLists.map((priceList) => (
          <option key={priceList.id} value={priceList.id}>
            {describePriceList(priceList)}
          </option>
        ))}
      </select>
      <p className="min-h-4 truncate text-xs text-muted-foreground" title={selected?.source_filename}>
        {selected?.source_filename ?? ""}
      </p>
    </div>
  );
}

function ComparedListSummary({ label, priceList }: { label: string; priceList: ComparisonPriceList }) {
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{label}:</span> {describeComparisonList(priceList)}{" "}
      <span className="text-xs">({priceList.source_filename})</span>
    </p>
  );
}

interface PriceListComparisonProps {
  priceLists: PriceList[];
}

export function PriceListComparison({ priceLists }: PriceListComparisonProps) {
  const [priceListAId, setPriceListAId] = useState<number | null>(null);
  const [priceListBId, setPriceListBId] = useState<number | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [comparison, setComparison] = useState<PriceListComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ComparisonStatusFilter>(ALL_STATUSES);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  // State only commits on the next render, so two clicks in the same tick would
  // both still read `isComparing === false` without this ref (same guard as the
  // import and backup flows).
  const comparingRef = useRef(false);

  const selectionError = validateComparisonSelection(priceListAId, priceListBId);

  const filteredItems = useMemo(
    () => filterComparisonItems(comparison?.items ?? [], statusFilter),
    [comparison, statusFilter],
  );
  const currentPage = useMemo(() => paginateItems(filteredItems, page, pageSize), [filteredItems, page, pageSize]);

  async function handleCompare() {
    if (comparingRef.current) return;
    if (selectionError || priceListAId == null || priceListBId == null) return;
    comparingRef.current = true;
    setIsComparing(true);
    setError(null);
    try {
      const result = await getPriceListComparison({
        price_list_a_id: priceListAId,
        price_list_b_id: priceListBId,
      });
      setComparison(result);
      setStatusFilter(ALL_STATUSES);
      setPage(1);
    } catch (err) {
      setComparison(null);
      setError(getUserErrorMessage(err, "No fue posible generar la comparación. Intenta de nuevo en unos momentos."));
    } finally {
      comparingRef.current = false;
      setIsComparing(false);
    }
  }

  function handleSwap() {
    setPriceListAId(priceListBId);
    setPriceListBId(priceListAId);
  }

  function handleFilterChange(next: ComparisonStatusFilter) {
    setStatusFilter(next);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Comparación de listas de precios</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <PriceListPicker
              id="price-list-a"
              label="Lista base (A)"
              priceLists={priceLists}
              value={priceListAId}
              onChange={setPriceListAId}
              disabled={isComparing}
            />
            <div className="flex shrink-0 justify-center pt-0 sm:pt-6">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Intercambiar lista A y lista B"
                disabled={isComparing || (priceListAId == null && priceListBId == null)}
                onClick={handleSwap}
              >
                <ArrowLeftRight />
              </Button>
            </div>
            <PriceListPicker
              id="price-list-b"
              label="Lista comparación (B)"
              priceLists={priceLists}
              value={priceListBId}
              onChange={setPriceListBId}
              disabled={isComparing}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={handleCompare} disabled={isComparing || selectionError !== null}>
              {isComparing && <Loader2 className="animate-spin" />}
              {isComparing ? "Comparando..." : "Comparar"}
            </Button>
            {selectionError && <p className="text-sm text-muted-foreground">{selectionError}</p>}
          </div>
        </CardContent>
      </Card>

      {error && <ErrorAlert title="No fue posible generar la comparación" message={error} />}

      {comparison && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight">
              Comparación de listas · {comparison.supplier.name}
            </h2>
            <ComparedListSummary label="Lista A" priceList={comparison.list_a} />
            <ComparedListSummary label="Lista B" priceList={comparison.list_b} />
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
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por estado">
                  {COMPARISON_STATUS_FILTERS.map((filter) => (
                    <Button
                      key={filter}
                      type="button"
                      size="sm"
                      variant={statusFilter === filter ? "default" : "outline"}
                      aria-pressed={statusFilter === filter}
                      onClick={() => handleFilterChange(filter)}
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
                        <Label htmlFor="comparison-page-size" className="text-sm text-muted-foreground">
                          Por página
                        </Label>
                        <select
                          id="comparison-page-size"
                          className={`${SELECT_CLASS} w-20`}
                          value={String(pageSize)}
                          onChange={(event) => {
                            setPageSize(Number(event.target.value) || DEFAULT_PAGE_SIZE);
                            setPage(1);
                          }}
                        >
                          {PAGE_SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
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
      )}
    </div>
  );
}
