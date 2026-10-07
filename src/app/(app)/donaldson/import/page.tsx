"use client";

import { useReducer, useRef } from "react";
import Link from "next/link";
import { Loader2, TriangleAlert } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ImportDropzone } from "@/components/donaldson/import-dropzone";
import { ImportIssuesPanel } from "@/components/donaldson/import-issues-panel";
import { ImportPreviewSummary } from "@/components/donaldson/import-preview-summary";
import { ImportProductsSampleTable } from "@/components/donaldson/import-products-sample-table";
import { ImportResult } from "@/components/donaldson/import-result";
import { SelectedFileCard } from "@/components/donaldson/selected-file-card";
import { getErrorMessage } from "@/lib/api/errors";
import { confirmImport, getDuplicateImportDetail, previewDonaldsonImport } from "@/lib/api/imports";
import type { ImportConfirmResult, ImportPreviewResponse } from "@/types/api";

type Phase =
  | "idle"
  | "selected"
  | "uploading"
  | "preview-ready"
  | "preview-with-errors"
  | "confirming"
  | "success"
  | "error";

type ErrorContext = "analyze" | "confirm";

interface ImportState {
  phase: Phase;
  file: File | null;
  preview: ImportPreviewResponse | null;
  result: ImportConfirmResult | null;
  error: { context: ErrorContext; message: string; duplicateImportId: number | null } | null;
}

const initialState: ImportState = {
  phase: "idle",
  file: null,
  preview: null,
  result: null,
  error: null,
};

type Action =
  | { type: "SELECT_FILE"; file: File }
  | { type: "CLEAR_FILE" }
  | { type: "ANALYZE_START" }
  | { type: "ANALYZE_SUCCESS"; preview: ImportPreviewResponse }
  | { type: "ANALYZE_ERROR"; message: string; duplicateImportId: number | null }
  | { type: "CONFIRM_START" }
  | { type: "CONFIRM_SUCCESS"; result: ImportConfirmResult }
  | { type: "CONFIRM_ERROR"; message: string }
  | { type: "RESET" };

function reducer(state: ImportState, action: Action): ImportState {
  switch (action.type) {
    case "SELECT_FILE":
      return { ...initialState, phase: "selected", file: action.file };
    case "CLEAR_FILE":
      return initialState;
    case "ANALYZE_START":
      return { ...state, phase: "uploading", error: null };
    case "ANALYZE_SUCCESS":
      return {
        ...state,
        phase: action.preview.summary.errors > 0 ? "preview-with-errors" : "preview-ready",
        preview: action.preview,
      };
    case "ANALYZE_ERROR":
      return {
        ...state,
        phase: "error",
        error: { context: "analyze", message: action.message, duplicateImportId: action.duplicateImportId },
      };
    case "CONFIRM_START":
      return { ...state, phase: "confirming", error: null };
    case "CONFIRM_SUCCESS":
      return { ...initialState, phase: "success", result: action.result };
    case "CONFIRM_ERROR":
      return {
        ...state,
        phase: "error",
        error: { context: "confirm", message: action.message, duplicateImportId: null },
      };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

function describeError(error: unknown): { message: string; duplicateImportId: number | null } {
  const duplicate = getDuplicateImportDetail(error);
  if (duplicate) {
    return { message: duplicate.message, duplicateImportId: duplicate.existing_import_id };
  }
  return { message: getErrorMessage(error), duplicateImportId: null };
}

export default function ImportDonaldsonPage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const submittingRef = useRef(false);

  async function handleAnalyze(file: File) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    dispatch({ type: "ANALYZE_START" });
    try {
      const preview = await previewDonaldsonImport(file);
      dispatch({ type: "ANALYZE_SUCCESS", preview });
    } catch (error) {
      const { message, duplicateImportId } = describeError(error);
      dispatch({ type: "ANALYZE_ERROR", message, duplicateImportId });
    } finally {
      submittingRef.current = false;
    }
  }

  async function handleConfirm() {
    if (submittingRef.current || !state.preview) return;
    submittingRef.current = true;
    dispatch({ type: "CONFIRM_START" });
    try {
      const result = await confirmImport(state.preview.import_id);
      dispatch({ type: "CONFIRM_SUCCESS", result });
    } catch (error) {
      const { message } = describeError(error);
      dispatch({ type: "CONFIRM_ERROR", message });
    } finally {
      submittingRef.current = false;
    }
  }

  const isAnalyzing = state.phase === "uploading";
  const isConfirming = state.phase === "confirming";
  const showFileCard = state.file && state.phase !== "success";
  const showPreview = state.preview && state.phase !== "success";
  const canConfirm = state.preview !== null && state.preview.summary.errors === 0 && !isConfirming;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Donaldson" }, { label: "Importar lista" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importar lista Donaldson</h1>
        <p className="text-sm text-muted-foreground">
          Sube el Excel de Donaldson, revisa el análisis del backend y confirma para crear la lista de precios.
        </p>
      </div>

      {state.phase === "success" && state.result ? (
        <ImportResult result={state.result} onImportAnother={() => dispatch({ type: "RESET" })} />
      ) : (
        <>
          {!state.file && <ImportDropzone onFileSelected={(file) => dispatch({ type: "SELECT_FILE", file })} />}

          {showFileCard && state.file && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SelectedFileCard
                file={state.file}
                onChangeFile={() => dispatch({ type: "CLEAR_FILE" })}
                disabled={isAnalyzing || isConfirming}
              />
              {!state.preview && (
                <Button
                  type="button"
                  onClick={() => state.file && handleAnalyze(state.file)}
                  disabled={isAnalyzing}
                  className="sm:shrink-0"
                >
                  {isAnalyzing && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isAnalyzing ? "Analizando..." : "Analizar archivo"}
                </Button>
              )}
            </div>
          )}

          {state.error && (
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>
                {state.error.context === "analyze" ? "No se pudo analizar el archivo" : "No se pudo confirmar la importación"}
              </AlertTitle>
              <AlertDescription>
                <p>{state.error.message}</p>
                {state.error.duplicateImportId !== null && (
                  <p className="mt-1">
                    Referencia: ImportJob #{state.error.duplicateImportId}. El backend no expone una forma de
                    resolver la lista de precios asociada a esa importación desde aquí; consúltala en{" "}
                    <Link href="/donaldson/price-lists" className="underline underline-offset-2">
                      Listas de precios
                    </Link>
                    .
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {showPreview && state.preview && (
            <>
              <ImportPreviewSummary preview={state.preview} />
              <ImportProductsSampleTable
                products={state.preview.products_sample}
                currency={state.preview.currency}
                totalProducts={state.preview.summary.products}
              />
              <ImportIssuesPanel
                errors={state.preview.errors}
                warnings={state.preview.warnings}
                totalErrors={state.preview.summary.errors}
                totalWarnings={state.preview.summary.warnings}
              />

              {state.preview.summary.errors > 0 && (
                <Alert variant="destructive">
                  <TriangleAlert className="h-4 w-4" />
                  <AlertTitle>La confirmación está deshabilitada</AlertTitle>
                  <AlertDescription>
                    El análisis detectó {state.preview.summary.errors.toLocaleString("es-MX")} error(es) crítico(s).
                    Corrige el archivo de origen y vuelve a analizarlo antes de confirmar.
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <Button type="button" onClick={handleConfirm} disabled={!canConfirm}>
                  {isConfirming && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isConfirming ? "Confirmando..." : "Confirmar importación"}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
