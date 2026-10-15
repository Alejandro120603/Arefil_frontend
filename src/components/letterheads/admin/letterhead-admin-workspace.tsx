"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Stamp } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { LetterheadCatalogCard } from "@/components/letterheads/admin/letterhead-catalog-card";
import { LetterheadCreateForm } from "@/components/letterheads/admin/letterhead-create-form";
import { LetterheadNotice } from "@/components/letterheads/admin/letterhead-notice";
import { ReportLetterheadAssignmentsEditor } from "@/components/letterheads/admin/report-letterhead-assignments";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { listLetterheads } from "@/lib/api/letterhead-admin";
import { LETTERHEAD_REPORTS } from "@/lib/letterheads/letterhead-admin";
import {
  freshnessClock,
  mergeCatalogRead,
  mergeConfirmedLetterhead,
  type CatalogSnapshot,
} from "@/lib/letterheads/freshness";
import type { LetterheadAdmin } from "@/types/letterhead-admin";

const EMPTY_STAMPS: Record<number, number> = {};
const FORBIDDEN_MESSAGE = "No tienes permisos para administrar membretes.";

/**
 * Letterhead administration (Frontend #39): the catalog the backend returns —
 * never invented identities — plus where each letterhead is offered.
 * Kept apart from the BONATTI template editor: a letterhead is a global
 * identity assigned to reports, not a report's own template.
 */
export function LetterheadAdminWorkspace() {
  /** Confirmed catalog data with its per-letterhead freshness (see `freshnessClock`). */
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null);
  const catalog = snapshot?.items ?? null;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const issuedAt = freshnessClock();
    void listLetterheads({ signal: controller.signal })
      .then((items) => {
        if (controller.signal.aborted) return;
        setSnapshot((current) => mergeCatalogRead(current, items, issuedAt));
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof ApiError && error.status === 403
            ? FORBIDDEN_MESSAGE
            : getUserErrorMessage(error, "No se pudo cargar el catálogo de membretes. Verifica que el backend esté disponible."),
        );
      });
    return () => controller.abort();
  }, [reloadToken]);

  const refresh = useCallback(() => setReloadToken((value) => value + 1), []);

  const handleChanged = useCallback((updated: LetterheadAdmin, message: string, confirmedAt: number) => {
    // The PATCH response is confirmed data: it is shown (and wins over older
    // reads) right away, whether or not the follow-up reads succeed.
    setSnapshot((current) => mergeConfirmedLetterhead(current, updated, confirmedAt));
    setNotice(message);
    // A deactivation also clears defaults on the server: re-read everything.
    refresh();
  }, [refresh]);

  const loading = catalog == null && loadError == null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!creating && (
          <Button type="button" disabled={loadError === FORBIDDEN_MESSAGE} onClick={() => { setCreating(true); setNotice(null); }}>
            <Plus /> Nuevo membrete
          </Button>
        )}
      </div>

      {notice && <LetterheadNotice message={notice} />}

      {creating && (
        <LetterheadCreateForm
          onCancel={() => setCreating(false)}
          onCreated={(created) => {
            // Confirmed by the backend: shown now, the read below only reconciles.
            const confirmedAt = freshnessClock();
            setSnapshot((current) => mergeConfirmedLetterhead(current, created, confirmedAt));
            setCreating(false);
            setNotice(`Se creó «${created.display_name}» con su versión 1. Asígnalo a un reporte para ofrecerlo.`);
            refresh();
          }}
        />
      )}

      <section className="flex flex-col gap-3" aria-labelledby="catalogo-membretes">
        <h2 id="catalogo-membretes" className="text-lg font-semibold">Catálogo</h2>
        {loadError && (
          <div className="flex flex-col items-start gap-2">
            <ErrorAlert title="No se pudo cargar el catálogo" message={loadError} />
            {loadError !== FORBIDDEN_MESSAGE && (
              <Button type="button" size="sm" variant="outline" onClick={refresh}>
                <RefreshCw /> Reintentar
              </Button>
            )}
          </div>
        )}
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Cargando membretes">
            {[0, 1, 2].map((item) => <Skeleton key={item} className="h-80 w-full" />)}
          </div>
        )}
        {catalog != null && catalog.length === 0 && (
          <Card>
            <EmptyState
              icon={Stamp}
              title="Todavía no hay membretes"
              description="Crea el primero con «Nuevo membrete» subiendo su XLSX original. Los membretes no se importan automáticamente."
            />
          </Card>
        )}
        {catalog != null && catalog.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {catalog.map((letterhead) => (
              <li key={letterhead.id}>
                <LetterheadCatalogCard letterhead={letterhead} onChanged={handleChanged} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {catalog != null && (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>Disponibilidad por reporte</CardTitle>
            <CardDescription>
              Elige qué membretes se ofrecen al generar cada reporte, su orden y la opción inicial.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={LETTERHEAD_REPORTS[0].code}>
              <TabsList>
                {LETTERHEAD_REPORTS.map((report) => (
                  <TabsTrigger key={report.code} value={report.code}>{report.label}</TabsTrigger>
                ))}
              </TabsList>
              {LETTERHEAD_REPORTS.map((report) => (
                <TabsContent key={report.code} value={report.code} keepMounted className="pt-3">
                  <ReportLetterheadAssignmentsEditor
                    code={report.code}
                    label={report.label}
                    catalog={catalog}
                    catalogStamps={snapshot?.stamps ?? EMPTY_STAMPS}
                    reloadToken={reloadToken}
                    onSaved={refresh}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
