"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, Loader2 } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { getPriceListComparison, getReportTemplate, saveReportTemplate } from "@/lib/api/reports";
import { describePriceList, validateComparisonSelection } from "@/lib/reports/comparison";
import {
  PRICE_LIST_COMPARISON_REPORT_CODE,
  toArefilReportData,
  type ArefilReportData,
} from "@/lib/reports/stimulsoft-dataset";
import type { PriceList, ReportDefinition } from "@/types/api";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

function DesignerPlaceholder() {
  return (
    <div className="flex h-full min-h-[32rem] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Cargando Designer de Stimulsoft...
    </div>
  );
}

const StimulsoftReportDesigner = dynamic(() => import("@/components/reports/stimulsoft-report-designer"), {
  ssr: false,
  loading: DesignerPlaceholder,
});

interface TemplateLoadState {
  code: string;
  template: string | null;
  error: string | null;
}

interface SaveState {
  status: "idle" | "saving" | "success" | "error";
  message: string | null;
}

class PreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewError";
  }
}

function parseSelection(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function PreviewListPicker({
  id,
  label,
  priceLists,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  priceLists: PriceList[];
  value: number | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
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

export function ReportDesignerWorkspace({
  reportDefinition,
  priceLists,
}: {
  reportDefinition: ReportDefinition;
  priceLists: PriceList[];
}) {
  const { code } = reportDefinition;
  const previewSupported = code === PRICE_LIST_COMPARISON_REPORT_CODE;
  const [loadState, setLoadState] = useState<TemplateLoadState | null>(null);
  const [activeVersion, setActiveVersion] = useState(reportDefinition.active_template_version);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle", message: null });
  const [priceListAId, setPriceListAId] = useState<number | null>(null);
  const [priceListBId, setPriceListBId] = useState<number | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [designerError, setDesignerError] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const savingRef = useRef(false);
  const currentLoad = loadState?.code === code ? loadState : null;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const template = await getReportTemplate(code, { signal: controller.signal });
        if (!controller.signal.aborted) setLoadState({ code, template, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        const fallback =
          error instanceof ApiError && error.status === 404
            ? "Este reporte no tiene una plantilla activa. Backend #10 debe registrar una plantilla antes de diseñarla."
            : "No se pudo cargar la plantilla desde el backend. Verifica que el servicio esté disponible.";
        setLoadState({ code, template: null, error: getUserErrorMessage(error, fallback) });
      }
    }
    void load();
    return () => controller.abort();
  }, [code]);

  const handleSaveTemplate = useCallback(
    async (template: string) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaveState({ status: "saving", message: "Guardando la plantilla..." });
      try {
        const result = await saveReportTemplate(code, template);
        setActiveVersion(result.version);
        setSaveState({
          status: "success",
          message: `Plantilla guardada correctamente como versión ${result.version}.`,
        });
      } catch (error) {
        setSaveState({
          status: "error",
          message: getUserErrorMessage(
            error,
            "No se pudo guardar la plantilla. El backend no confirmó ningún cambio.",
          ),
        });
      } finally {
        savingRef.current = false;
      }
    },
    [code],
  );

  const loadPreviewData = useCallback(async (): Promise<ArefilReportData> => {
    if (!previewSupported) {
      throw new PreviewError("Este reporte todavía no tiene un adaptador de Preview en el frontend.");
    }
    const selectionError = validateComparisonSelection(priceListAId, priceListBId);
    if (selectionError || priceListAId == null || priceListBId == null) {
      throw new PreviewError(selectionError ?? "Selecciona dos listas para previsualizar.");
    }
    setIsLoadingPreview(true);
    setPreviewMessage(null);
    setPreviewError(null);
    try {
      const comparison = await getPriceListComparison({
        price_list_a_id: priceListAId,
        price_list_b_id: priceListBId,
      });
      setPreviewMessage("Datos de preview cargados desde Arefil.");
      return toArefilReportData(comparison);
    } catch (error) {
      throw new PreviewError(
        getUserErrorMessage(error, "No se pudieron cargar los datos para previsualizar el reporte."),
      );
    } finally {
      setIsLoadingPreview(false);
    }
  }, [previewSupported, priceListAId, priceListBId]);

  const handleEventError = useCallback((error: unknown) => {
    if (error instanceof PreviewError) {
      setPreviewError(error.message);
      return;
    }
    setDesignerError("Stimulsoft no pudo procesar la plantilla. Recarga la página e intenta de nuevo.");
  }, []);

  const handleSelectionChange = (setter: (value: number | null) => void) => (value: number | null) => {
    setter(value);
    setPreviewMessage(null);
    setPreviewError(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Datos para Preview</p>
              <p className="text-xs text-muted-foreground">
                El Designer solicitará la comparación al backend al abrir la pestaña Preview.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Versión activa: <span className="font-medium text-foreground">{activeVersion ?? "Sin plantilla"}</span>
            </p>
          </div>

          {!previewSupported ? (
            <p className="text-sm text-muted-foreground">
              Este código puede editarse y guardarse, pero todavía no tiene Preview configurado en el frontend.
            </p>
          ) : priceLists.length >= 2 ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <PreviewListPicker
                id="designer-price-list-a"
                label="Lista base (A)"
                priceLists={priceLists}
                value={priceListAId}
                disabled={isLoadingPreview}
                onChange={handleSelectionChange(setPriceListAId)}
              />
              <PreviewListPicker
                id="designer-price-list-b"
                label="Lista comparación (B)"
                priceLists={priceLists}
                value={priceListBId}
                disabled={isLoadingPreview}
                onChange={handleSelectionChange(setPriceListBId)}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Se necesitan al menos dos listas de precios para usar Preview. La plantilla todavía puede editarse.
            </p>
          )}

          {isLoadingPreview && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando datos de preview...
            </p>
          )}
          {previewMessage && <p className="text-sm text-muted-foreground">{previewMessage}</p>}
          {previewError && <ErrorAlert title="No se pudo abrir el Preview" message={previewError} />}
        </CardContent>
      </Card>

      {saveState.status === "success" && saveState.message && (
        <Alert>
          <CircleCheck />
          <AlertTitle>Plantilla guardada</AlertTitle>
          <AlertDescription>{saveState.message}</AlertDescription>
        </Alert>
      )}
      {saveState.status === "saving" && (
        <Alert>
          <Loader2 className="animate-spin" />
          <AlertTitle>Guardando</AlertTitle>
          <AlertDescription>No cierres esta página hasta recibir confirmación del backend.</AlertDescription>
        </Alert>
      )}
      {saveState.status === "error" && saveState.message && (
        <ErrorAlert title="No se guardó la plantilla" message={saveState.message} />
      )}
      {designerError && <ErrorAlert title="Error del Designer" message={designerError} />}
      {currentLoad?.error && <ErrorAlert title="No se pudo abrir el Designer" message={currentLoad.error} />}

      {currentLoad == null && <DesignerPlaceholder />}
      {currentLoad?.template != null && (
        <div className="h-[calc(100dvh-17rem)] min-h-[42rem] overflow-hidden rounded-xl border bg-card [&>div]:h-full">
          <StimulsoftReportDesigner
            designerId={`arefil-designer-${code.toLowerCase().replaceAll("_", "-")}`}
            template={currentLoad.template}
            onSaveTemplate={handleSaveTemplate}
            loadPreviewData={loadPreviewData}
            onEventError={handleEventError}
          />
        </div>
      )}
    </div>
  );
}
