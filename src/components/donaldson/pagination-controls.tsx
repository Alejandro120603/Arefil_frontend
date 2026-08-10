import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { PageMeta } from "@/types/api";

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

interface PaginationControlsProps {
  meta: PageMeta;
  basePath: string;
  searchParams: SearchParamsRecord;
}

function buildHref(basePath: string, searchParams: SearchParamsRecord, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "page") continue;
    if (typeof value === "string" && value.length > 0) params.set(key, value);
  }
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

export function PaginationControls({ meta, basePath, searchParams }: PaginationControlsProps) {
  if (meta.total_items === 0) return null;

  const hasPrev = meta.page > 1;
  const hasNext = meta.page < meta.total_pages;

  return (
    <div className="flex flex-col items-start justify-between gap-3 border-t pt-3 sm:flex-row sm:items-center">
      <p className="text-sm text-muted-foreground">
        Página {meta.page} de {meta.total_pages} · {meta.total_items.toLocaleString("es-MX")} resultados
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasPrev}
          nativeButton={!hasPrev}
          render={hasPrev ? <Link href={buildHref(basePath, searchParams, meta.page - 1)} /> : undefined}
        >
          Anterior
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasNext}
          nativeButton={!hasNext}
          render={hasNext ? <Link href={buildHref(basePath, searchParams, meta.page + 1)} /> : undefined}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
