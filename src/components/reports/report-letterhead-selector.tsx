"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, FileSpreadsheet, RefreshCw } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { LetterheadThumbnail } from "@/components/letterheads/letterhead-thumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserErrorMessage } from "@/lib/api/errors";
import { getReportLetterheadOptions } from "@/lib/api/letterhead-runtime";
import { backendApiPath } from "@/lib/api/protected-image";
import { letterheadChoices, type LetterheadSelection } from "@/lib/letterheads/letterhead-runtime";
import { cn } from "@/lib/utils";
import type { FrozenLetterhead, ReportLetterheadOption, ReportLetterheadOptions } from "@/types/letterhead-runtime";

export interface LetterheadOptionsState {
  /** Last options read; kept while a refresh is in flight. */
  data: ReportLetterheadOptions | null;
  loading: boolean;
  error: string | null;
}

/**
 * Reads the letterhead options of a report once (and again on `reload`).
 * `onLoaded` runs with every successful read so the caller can reconcile its
 * selection with what is offered now.
 */
export function useReportLetterheadOptions(
  code: string,
  enabled: boolean,
  onLoaded: (options: ReportLetterheadOptions) => void,
): LetterheadOptionsState & { reload: () => void } {
  const [state, setState] = useState<LetterheadOptionsState>({ data: null, loading: enabled, error: null });
  const [token, setToken] = useState(0);
  const onLoadedRef = useRef(onLoaded);

  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    getReportLetterheadOptions(code, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ data, loading: false, error: null });
        onLoadedRef.current(data);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          data: current.data,
          loading: false,
          error: getUserErrorMessage(error, "No se pudieron cargar las opciones de membrete."),
        }));
      });
    return () => controller.abort();
  }, [code, enabled, token]);

  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    setToken((value) => value + 1);
  }, []);

  return { ...state, reload };
}

function thumbnailPath(option: ReportLetterheadOption): string | null {
  return backendApiPath(option.thumbnail_url);
}

/**
 * «Presentación del documento» (Frontend #40): how the Excel document of the
 * next execution will look. It is presentation only — it never changes
 * prices, quantities, discounts or totals — and the choice is sent as
 * `presentation.letterhead_version_id` next to the business parameters.
 *
 * Native radio inputs keep keyboard navigation (arrows within the group) and
 * the selected state announced by screen readers; the visible card marks the
 * selection with a border and a "Seleccionado" check, not with color alone.
 * Thumbnails are a reference of the design, not a preview of the document.
 */
export function ReportLetterheadSelector({
  state,
  selection,
  disabled = false,
  onChange,
  onReload,
  staleSelection = false,
}: {
  state: LetterheadOptionsState;
  selection: LetterheadSelection;
  disabled?: boolean;
  onChange: (selection: number | null) => void;
  onReload: () => void;
  /** The chosen version stopped being offered: the user must choose again. */
  staleSelection?: boolean;
}) {
  const ids = useId();
  const { data } = state;

  // A report that does not support letterheads keeps its current form untouched.
  if (data != null && !data.supported) return null;

  const choices = data != null ? letterheadChoices(data) : [];
  const noneOption = data?.options.find((option) => option.letterhead_version_id == null);

  return (
    <Card id="presentacion" className="scroll-mt-6">
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle role="heading" aria-level={2}>Presentación del documento</CardTitle>
          <CardDescription>
            Elige cómo se verá el documento Excel. No cambia precios, cantidades, descuentos ni totales.
          </CardDescription>
        </div>
        {data != null && (
          <Button type="button" size="sm" variant="ghost" disabled={disabled || state.loading} onClick={onReload}>
            <RefreshCw className={cn(state.loading && "animate-spin")} /> Actualizar opciones
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {state.error && (
          <div className="flex flex-col items-start gap-2">
            <ErrorAlert
              title="No se pudieron cargar los membretes"
              message={`${state.error} Si generas ahora, el documento usará el formato actual (sin membrete).`}
            />
            <Button type="button" size="sm" variant="outline" disabled={disabled || state.loading} onClick={onReload}>
              <RefreshCw /> Reintentar
            </Button>
          </div>
        )}
        {data == null && state.loading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Cargando opciones de membrete">
            {[0, 1, 2].map((item) => <Skeleton key={item} className="h-40 w-full" />)}
          </div>
        )}
        {data != null && (
          <fieldset className="min-w-0" disabled={disabled || state.loading} aria-describedby={staleSelection ? `${ids}-stale` : undefined}>
            <legend className="sr-only">Presentación del documento</legend>
            {staleSelection && (
              <p id={`${ids}-stale`} role="alert" className="mb-3 text-sm text-destructive">
                El membrete que elegiste ya no está disponible o cambió de versión. Elige una opción para continuar.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <LetterheadOptionCard
                name={`${ids}-letterhead`}
                checked={selection === null}
                title={noneOption?.label ?? "Sin membrete"}
                subtitle="Utilizar formato actual"
                isDefault={noneOption?.is_default ?? data.default_letterhead_version_id == null}
                onSelect={() => onChange(null)}
              >
                <div className="flex aspect-[17/22] w-full max-w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/40 text-muted-foreground">
                  <FileSpreadsheet aria-hidden className="size-6" />
                </div>
              </LetterheadOptionCard>
              {choices.map((option) => (
                <LetterheadOptionCard
                  key={option.letterhead_version_id}
                  name={`${ids}-letterhead`}
                  checked={selection === option.letterhead_version_id}
                  title={option.display_name ?? option.label}
                  subtitle={option.version != null ? `Versión ${option.version}` : null}
                  isDefault={option.is_default}
                  onSelect={() => onChange(option.letterhead_version_id as number)}
                >
                  <LetterheadThumbnail
                    path={thumbnailPath(option)}
                    alt=""
                    width={option.thumbnail_width}
                    height={option.thumbnail_height}
                    className="max-w-24"
                  />
                </LetterheadOptionCard>
              ))}
            </div>
            {choices.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                Este reporte todavía no tiene membretes disponibles; se usará el formato actual.
              </p>
            )}
          </fieldset>
        )}
      </CardContent>
    </Card>
  );
}

function LetterheadOptionCard({
  name,
  checked,
  title,
  subtitle,
  isDefault,
  onSelect,
  children,
}: {
  name: string;
  checked: boolean;
  title: string;
  subtitle: string | null;
  isDefault: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "relative flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40",
        "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
        checked && "border-primary bg-primary/5 ring-1 ring-primary",
      )}
    >
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onSelect} />
      <span className="flex w-20 shrink-0 justify-center sm:w-24">{children}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-medium break-words">{title}</span>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        {isDefault && <Badge variant="outline" className="w-fit">Predeterminado</Badge>}
        {checked && (
          <span aria-hidden className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            <Check className="size-3.5" /> Seleccionado
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * The presentation frozen in an execution, exactly as the backend returned it.
 * It describes the generated document even if the catalog changes later.
 */
export function LetterheadPresentationSummary({ letterhead }: { letterhead: FrozenLetterhead | null }) {
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">Presentación de esta ejecución: </span>
      {letterhead == null ? (
        <span className="font-medium">Sin membrete (formato actual)</span>
      ) : (
        <span className="font-medium">{letterhead.display_name} · versión {letterhead.version}</span>
      )}
    </p>
  );
}
