"use client";

import { useCallback, useEffect, useState } from "react";
import { EyeOff, Loader2, TriangleAlert } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { getReportBuilder, inspectReportExcelTemplate, updateReportExcelTemplateMappings } from "@/lib/api/reports";
import { ReportExcelTemplatePreview } from "@/components/reports/report-excel-template-preview";
import { ReportExcelTemplateVersionHistory } from "@/components/reports/report-excel-template-version-history";
import { WorkbookGrid } from "@/components/reports/workbook-grid";
import {
  MAX_RENDERABLE_CELLS,
  VALUE_TYPE_LABELS,
  sheetGridBounds,
  usedRangeCellCount,
} from "@/lib/reports/report-excel-inspection";
import {
  buildCellOverlays,
  buildMappingFieldGroups,
  indexMappingOptions,
  pendingKey,
  primaryRepeatableRow,
  repeatableRows,
  savedPlaceholderOf,
  splitPendingKey,
  type MappingFieldGroup,
  type MappingFieldOption,
  type PendingCellChange,
} from "@/lib/reports/report-excel-mapping";
import type {
  ExcelCellMapping,
  ExcelCellTarget,
  ExcelMappingIssue,
  ReportBuilderDefinition,
  ReportExcelTemplateInspection,
  ReportWorkbookCellInspection,
  ReportWorkbookSheetInspection,
} from "@/types/api";

type MapperState =
  | { status: "loading" }
  | { status: "no-template" }
  | { status: "limits"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; inspection: ReportExcelTemplateInspection; builder: ReportBuilderDefinition };

function isMappingIssuesDetail(detail: unknown): detail is { errors: ExcelMappingIssue[] } {
  return typeof detail === "object" && detail !== null && Array.isArray((detail as { errors?: unknown }).errors);
}

/**
 * The Visual Template Mapper (Frontend #30, on top of the read-only inspector
 * from Frontend #29 / Backend #28): the admin selects a cell and assigns it a
 * friendly report field — no `{{...}}` typing — and saves every pending edit
 * in one batch (`PUT /excel-template/mappings`, Backend #29).
 */
export function ReportExcelTemplateInspector({
  code,
  mode,
  onModeChange,
  onPreviewReady,
}: {
  code: string;
  /** Controls the Diseño/Vista previa tab from outside (the wizard, #33); uncontrolled (internal tab state) when omitted. */
  mode?: "design" | "preview";
  onModeChange?: (mode: "design" | "preview") => void;
  /** Fires once a rendered preview successfully loads — the wizard's checklist tracks this as a session fact. */
  onPreviewReady?: () => void;
}) {
  return <TemplateMapper key={code} code={code} mode={mode} onModeChange={onModeChange} onPreviewReady={onPreviewReady} />;
}

function TemplateMapper({
  code,
  mode: controlledMode,
  onModeChange,
  onPreviewReady,
}: {
  code: string;
  mode?: "design" | "preview";
  onModeChange?: (mode: "design" | "preview") => void;
  onPreviewReady?: () => void;
}) {
  const [state, setState] = useState<MapperState>({ status: "loading" });
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [selectedCell, setSelectedCell] = useState<ReportWorkbookCellInspection | null>(null);
  const [draftPlaceholder, setDraftPlaceholder] = useState("");
  const [previousSelectionKey, setPreviousSelectionKey] = useState<string | null>(null);
  const [pendingMappings, setPendingMappings] = useState<Map<string, PendingCellChange>>(new Map());
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [cellErrors, setCellErrors] = useState<Map<string, ExcelMappingIssue>>(new Map());
  const [globalErrors, setGlobalErrors] = useState<ExcelMappingIssue[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [uncontrolledMode, setUncontrolledMode] = useState<"design" | "preview">("design");
  const mode = controlledMode ?? uncontrolledMode;
  function setMode(next: "design" | "preview") {
    if (controlledMode === undefined) setUncontrolledMode(next);
    onModeChange?.(next);
  }

  const load = useCallback(
    (signal?: AbortSignal) =>
      Promise.all([
        inspectReportExcelTemplate(code, { signal }),
        getReportBuilder(code, { signal }),
      ])
        .then(([inspection, builder]) => {
          if (signal?.aborted) return;
          setState({ status: "ready", inspection, builder });
          setActiveSheetIndex(0);
          setSelectedCell(null);
        })
        .catch((error: unknown) => {
          if (signal?.aborted) return;
          if (error instanceof ApiError && error.status === 404) {
            setState({ status: "no-template" });
            return;
          }
          if (error instanceof ApiError && error.status === 422) {
            setState({ status: "limits", message: error.message });
            return;
          }
          setState({ status: "error", message: getUserErrorMessage(error, "No se pudo abrir el editor visual.") });
        }),
    [code],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (pendingMappings.size === 0) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [pendingMappings.size]);

  const sheet: ReportWorkbookSheetInspection | null =
    state.status === "ready" ? (state.inspection.sheets[activeSheetIndex] ?? state.inspection.sheets[0] ?? null) : null;

  // Resets the picker's draft whenever the selection itself changes, without
  // clobbering it on every unrelated re-render (e.g. pendingMappings changing
  // elsewhere) — the sanctioned "adjust state during render" pattern, not an
  // effect: https://react.dev/learn/you-might-not-need-an-effect.
  const selectionKey = sheet && selectedCell ? pendingKey(sheet.name, selectedCell.coordinate) : null;
  if (selectionKey !== previousSelectionKey) {
    setPreviousSelectionKey(selectionKey);
    const change = selectionKey ? pendingMappings.get(selectionKey) : undefined;
    const effective = change ? (change.kind === "map" ? change.placeholder : null) : selectedCell ? savedPlaceholderOf(selectedCell) : null;
    setDraftPlaceholder(effective ?? "");
  }

  function handleReload() {
    setPendingMappings(new Map());
    setSelectedCell(null);
    setConflict(false);
    setCellErrors(new Map());
    setGlobalErrors([]);
    setSaveError(null);
    setSavedNotice(null);
    setState({ status: "loading" });
    void load();
  }

  function stageMapping(placeholder: string) {
    if (!sheet || !selectedCell) return;
    const key = pendingKey(sheet.name, selectedCell.coordinate);
    setPendingMappings((previous) => {
      const next = new Map(previous);
      next.set(key, { kind: "map", placeholder });
      return next;
    });
    dropCellError(key);
    setSavedNotice(null);
  }

  function stageClear() {
    if (!sheet || !selectedCell) return;
    const key = pendingKey(sheet.name, selectedCell.coordinate);
    setPendingMappings((previous) => {
      const next = new Map(previous);
      next.set(key, { kind: "clear" });
      return next;
    });
    dropCellError(key);
    setSavedNotice(null);
  }

  function revertPending() {
    if (!sheet || !selectedCell) return;
    const key = pendingKey(sheet.name, selectedCell.coordinate);
    setPendingMappings((previous) => {
      if (!previous.has(key)) return previous;
      const next = new Map(previous);
      next.delete(key);
      return next;
    });
    dropCellError(key);
  }

  function dropCellError(key: string) {
    setCellErrors((previous) => {
      if (!previous.has(key)) return previous;
      const next = new Map(previous);
      next.delete(key);
      return next;
    });
  }

  async function handleSave() {
    if (state.status !== "ready" || saving || pendingMappings.size === 0) return;

    const rowProblems = state.inspection.sheets
      .map((candidate) => ({ sheet: candidate.name, rows: [...repeatableRows(candidate, pendingMappings)].sort((a, b) => a - b) }))
      .filter((candidate) => candidate.rows.length > 1);
    if (rowProblems.length > 0) {
      setGlobalErrors(
        rowProblems.map((problem) => ({
          code: "multiple_repeatable_rows",
          sheet: problem.sheet,
          message: `Solo se permite una fila repetible por hoja; en "${problem.sheet}" hay filas mapeadas: ${problem.rows.join(", ")}.`,
        })),
      );
      return;
    }

    const mappings: ExcelCellMapping[] = [];
    const clear: ExcelCellTarget[] = [];
    for (const [key, change] of pendingMappings) {
      const target = splitPendingKey(key);
      if (change.kind === "map") mappings.push({ ...target, placeholder: change.placeholder });
      else clear.push(target);
    }

    setSaving(true);
    setSaveError(null);
    setGlobalErrors([]);
    setCellErrors(new Map());
    try {
      const response = await updateReportExcelTemplateMappings(code, {
        base_version: state.inspection.template.version,
        base_checksum: state.inspection.template.checksum,
        mappings,
        clear,
      });
      setState({ status: "ready", inspection: response.inspection, builder: state.builder });
      setPendingMappings(new Map());
      setSelectedCell(null);
      setCellErrors(new Map());
      setSavedNotice(`Cambios guardados. Versión ${response.version}.`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(true);
      } else if (error instanceof ApiError && error.status === 422 && isMappingIssuesDetail(error.detail)) {
        const perCell = new Map<string, ExcelMappingIssue>();
        const global: ExcelMappingIssue[] = [];
        for (const issue of error.detail.errors) {
          if (issue.cell) perCell.set(pendingKey(issue.sheet, issue.cell), issue);
          else global.push(issue);
        }
        setCellErrors(perCell);
        setGlobalErrors(global);
      } else {
        setSaveError(getUserErrorMessage(error, "No se pudieron guardar los cambios."));
      }
    } finally {
      setSaving(false);
    }
  }

  if (state.status === "loading") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Editor visual de plantilla</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (state.status === "no-template") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Editor visual de plantilla</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Este reporte todavía no tiene una plantilla Excel activa. Sube una plantilla para poder mapear sus celdas.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (state.status === "limits") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Editor visual de plantilla</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorAlert title="Workbook fuera de límites" message={state.message} />
        </CardContent>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Editor visual de plantilla</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorAlert title="Error de inspección" message={state.message} />
        </CardContent>
      </Card>
    );
  }

  const { inspection, builder } = state;
  const bounds = sheet ? sheetGridBounds(sheet) : null;
  const cellCount = bounds ? usedRangeCellCount(bounds) : 0;
  const tooLargeToRender = bounds != null && cellCount > MAX_RENDERABLE_CELLS;
  const groups = buildMappingFieldGroups(builder);
  const optionsByPlaceholder = indexMappingOptions(groups);
  const overlays = sheet ? buildCellOverlays(sheet, pendingMappings, optionsByPlaceholder) : undefined;
  const repeatableRow = sheet ? primaryRepeatableRow(sheet, pendingMappings) : null;
  const sheetErrorCoordinates = new Set(
    [...cellErrors.keys()].filter((key) => splitPendingKey(key).sheet === sheet?.name).map((key) => splitPendingKey(key).cell),
  );
  const isDirty = pendingMappings.size > 0;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Editor visual de plantilla</CardTitle>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
              Cambios sin guardar
            </Badge>
          )}
          <Badge variant="outline">
            {inspection.template.filename} · v{inspection.template.version}
          </Badge>
          <ReportExcelTemplateVersionHistory
            code={code}
            disabledReason={isDirty ? "Guarda o descarta tus cambios antes de restaurar otra versión." : null}
            onRestored={handleReload}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Tabs value={mode} onValueChange={(value) => setMode(value === "preview" ? "preview" : "design")}>
          <TabsList>
            <TabsTrigger value="design">Diseño</TabsTrigger>
            <TabsTrigger value="preview">Vista previa</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* `display: contents` (not `hidden`) keeps each mode's children as direct
            flex items of this CardContent, so both panes keep their state across a
            switch instead of remounting — only one is ever visible. */}
        <div className={mode === "design" ? "contents" : "hidden"}>
          <p className="text-sm text-muted-foreground">
            Selecciona una celda y asígnale un dato del reporte — no necesitas escribir <code>{"{{...}}"}</code>.
          </p>

          {conflict && (
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>La plantilla cambió</AlertTitle>
              <AlertDescription>
                <p>La plantilla activa cambió desde que abriste el editor.</p>
                <p>Recarga la versión actual antes de guardar.</p>
                <Button type="button" size="sm" className="mt-2" onClick={handleReload}>
                  Recargar
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {globalErrors.length > 0 && (
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>No se guardó ningún cambio</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {globalErrors.map((issue, index) => (
                    <li key={index}>{issue.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {saveError && <ErrorAlert title="No se pudieron guardar los cambios" message={saveError} />}

          {inspection.sheets.length > 1 && (
            <Tabs
              value={String(activeSheetIndex)}
              onValueChange={(value) => {
                setActiveSheetIndex(Number(value));
                setSelectedCell(null);
              }}
            >
              <TabsList>
                {inspection.sheets.map((sheetOption, index) => (
                  <TabsTrigger key={sheetOption.name} value={String(index)}>
                    {sheetOption.hidden && <EyeOff className="h-3 w-3" />}
                    {sheetOption.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {inspection.sheets.length === 1 && sheet && <p className="text-sm font-medium">Hoja: {sheet.name}</p>}

          {sheet && sheet.cells.length === 0 && (
            <p className="text-sm text-muted-foreground">Esta hoja no tiene contenido.</p>
          )}

          {sheet &&
            (tooLargeToRender ? (
              <ErrorAlert
                title="Hoja demasiado grande para mostrarse"
                message={`Esta hoja tiene ${cellCount.toLocaleString("es-MX")} celdas en su rango usado, más de las ${MAX_RENDERABLE_CELLS.toLocaleString("es-MX")} que el inspector puede mostrar de forma legible. Reduce el rango usado en Excel (elimina filas/columnas con formato sobrante) para poder inspeccionarla aquí.`}
              />
            ) : (
              <WorkbookGrid
                sheet={sheet}
                styles={inspection.styles}
                selectedCoordinate={selectedCell?.coordinate ?? null}
                onSelectCell={setSelectedCell}
                overlays={overlays}
                errorCoordinates={sheetErrorCoordinates}
                repeatableRow={repeatableRow}
              />
            ))}

          <MappingPanel
            cell={selectedCell}
            sheetName={sheet?.name ?? ""}
            groups={groups}
            optionsByPlaceholder={optionsByPlaceholder}
            pendingMappings={pendingMappings}
            repeatableRow={repeatableRow}
            error={selectedCell ? cellErrors.get(pendingKey(sheet?.name ?? "", selectedCell.coordinate)) : undefined}
            draftPlaceholder={draftPlaceholder}
            onDraftChange={setDraftPlaceholder}
            onAssign={() => stageMapping(draftPlaceholder)}
            onClear={stageClear}
            onRevert={revertPending}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <p className="text-sm text-muted-foreground">{savedNotice}</p>
            <Button type="button" onClick={() => void handleSave()} disabled={!isDirty || saving}>
              {saving && <Loader2 className="animate-spin" />} Guardar cambios
            </Button>
          </div>
        </div>

        <div className={mode === "preview" ? "contents" : "hidden"}>
          <ReportExcelTemplatePreview
            report={builder.report}
            hasSummaries={(builder.excel_layout?.totals?.length ?? 0) > 0}
            templateVersion={inspection.template.version}
            hasUnsavedChanges={isDirty}
            onPreviewReady={onPreviewReady}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MappingPanel({
  cell,
  sheetName,
  groups,
  optionsByPlaceholder,
  pendingMappings,
  repeatableRow,
  error,
  draftPlaceholder,
  onDraftChange,
  onAssign,
  onClear,
  onRevert,
}: {
  cell: ReportWorkbookCellInspection | null;
  sheetName: string;
  groups: MappingFieldGroup[];
  optionsByPlaceholder: Map<string, MappingFieldOption>;
  pendingMappings: Map<string, PendingCellChange>;
  repeatableRow: number | null;
  error: ExcelMappingIssue | undefined;
  draftPlaceholder: string;
  onDraftChange: (value: string) => void;
  onAssign: () => void;
  onClear: () => void;
  onRevert: () => void;
}) {
  if (!cell) {
    return <p className="text-sm text-muted-foreground">Ninguna celda seleccionada.</p>;
  }

  const change = pendingMappings.get(pendingKey(sheetName, cell.coordinate));
  const saved = savedPlaceholderOf(cell);
  const effective = change ? (change.kind === "map" ? change.placeholder : null) : saved;
  const effectiveOption = effective ? optionsByPlaceholder.get(effective) : undefined;
  const isFormula = cell.value_type === "formula";
  const isDirtyCell = change != null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3" aria-label="Celda seleccionada">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Celda seleccionada: {cell.coordinate}</p>
        {isDirtyCell && <Badge variant="outline">Cambio sin guardar</Badge>}
      </div>

      <p className="text-sm text-muted-foreground">Hoja: {sheetName}</p>
      <p className="text-sm text-muted-foreground">
        Contenido actual: {isFormula ? cell.formula : cell.value != null ? String(cell.value) : "(vacío)"}
      </p>
      <p className="text-sm text-muted-foreground">Tipo: {VALUE_TYPE_LABELS[cell.value_type]}</p>
      <p className="text-sm text-muted-foreground">Formato: {cell.number_format}</p>
      {cell.merged_range && <p className="text-sm text-muted-foreground">Combinada: {cell.merged_range}</p>}

      {effective && (
        <p className="text-sm">
          Asignado:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs" title={`{{${effective}}}`}>
            [{effectiveOption?.abbreviation ?? "?"}] {effectiveOption?.label ?? effective}
          </code>
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {isFormula ? (
        <p className="text-sm text-muted-foreground">
          Esta celda contiene una fórmula de Excel y no se reemplaza desde el mapeador.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="mapping-field-select">Asignar dato</Label>
          <NativeSelect
            id="mapping-field-select"
            value={draftPlaceholder}
            onChange={(event) => onDraftChange(event.target.value)}
          >
            <option value="">Selecciona un campo…</option>
            {groups.map((group) => (
              <optgroup key={group.namespace} label={group.title}>
                {group.options.map((option) => {
                  const blocked = group.namespace === "rows" && repeatableRow != null && repeatableRow !== cell.row;
                  return (
                    <option key={option.placeholder} value={option.placeholder} disabled={blocked}>
                      [{option.abbreviation}] {option.label}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </NativeSelect>

          {repeatableRow != null && repeatableRow !== cell.row && (
            <p className="text-xs text-muted-foreground">
              Los campos de &quot;Renglones / productos&quot; están limitados a la fila {repeatableRow}, la fila repetible de esta
              hoja.
            </p>
          )}
          {repeatableRow != null && repeatableRow === cell.row && (
            <p className="text-xs text-muted-foreground">Fila {cell.row} · se repetirá por cada renglón del reporte.</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={onAssign} disabled={!draftPlaceholder || draftPlaceholder === effective}>
              Asignar
            </Button>
            {isDirtyCell && (
              <Button type="button" size="sm" variant="outline" onClick={onRevert}>
                Deshacer cambio
              </Button>
            )}
            {!isDirtyCell && saved && (
              <Button type="button" size="sm" variant="outline" onClick={onClear}>
                Quitar asignación
              </Button>
            )}
          </div>
          {!isDirtyCell && saved && (
            <p className="text-xs text-muted-foreground">
              Quitar la asignación deja la celda vacía; restaurar el contenido anterior se resuelve con el historial de
              versiones.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
