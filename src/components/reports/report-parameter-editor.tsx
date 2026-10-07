"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Database, Loader2, Plus, Trash2, UserPen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TemplateUsageBadge } from "@/components/reports/report-template-dependency-alert";
import { getUserErrorMessage } from "@/lib/api/errors";
import { listAllReportParameterOptions } from "@/lib/api/reports";
import {
  LEGACY_PARAMETER_KIND_LABEL,
  REPORT_PARAMETER_KINDS,
  parameterShapeOf,
  relabelParameter,
  withParameterShape,
  type ReportParameterKind,
} from "@/lib/reports/report-parameter-kinds";
import {
  REPORT_PARAMETER_PRESETS,
  appendPresetParameter,
  emptyParameter,
} from "@/lib/reports/report-form";
import type { TemplatePlaceholderLocation } from "@/lib/reports/report-template-dependencies";
import type { ReportOption, ReportParameter } from "@/types/api";

const CONTROL_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function sourceParameterDescription(parameter: ReportParameter): string {
  switch (parameter.configuration_json?.options_source) {
    case "price_lists":
      return "Al generar el reporte, el usuario seleccionará una lista de precios.";
    case "products":
      return "Al generar el reporte, el usuario seleccionará un producto.";
    case "suppliers":
      return "Al generar el reporte, el usuario seleccionará un proveedor.";
    default:
      return "Este dato se solicitará al usuario cuando genere el reporte.";
  }
}

function selectPlaceholder(parameter: ReportParameter): string {
  switch (parameter.configuration_json?.options_source) {
    case "price_lists": return "Selecciona una lista de precios";
    case "products": return "Selecciona un producto";
    case "suppliers": return "Selecciona un proveedor";
    default: return "Selecciona una opción";
  }
}

function displayDefault(value: unknown): string {
  if (value == null || value === "") return "Sin valor";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value);
}

/**
 * The options endpoint answers from the *saved* report, so a list's real
 * options exist only once that exact parameter — same name, same option
 * source — has been persisted. Anything newer must be saved first.
 */
function savedWithSameOptions(parameter: ReportParameter, savedParameters: readonly ReportParameter[]): boolean {
  const saved = savedParameters.find((candidate) => candidate.name === parameter.name);
  return saved != null
    && saved.input_type === "select"
    && saved.configuration_json?.options_source === parameter.configuration_json?.options_source;
}

function SelectDefaultValue({
  id,
  parameter,
  reportCode,
  onChange,
}: {
  id: string;
  parameter: ReportParameter;
  reportCode: string;
  onChange: (value: ReportParameter["default_value"]) => void;
}) {
  const [options, setOptions] = useState<ReportOption[] | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void listAllReportParameterOptions(
      reportCode,
      parameter.name,
      undefined,
      { signal: controller.signal },
    ).then((items) => {
      if (!controller.signal.aborted) setOptions(items);
    }).catch((error) => {
      if (!controller.signal.aborted) {
        setOptions([]);
        setOptionsError(getUserErrorMessage(error, "No se pudieron cargar las opciones disponibles."));
      }
    });
    return () => controller.abort();
  }, [parameter.name, reportCode]);

  const loading = options == null;
  return (
    <>
      <select
        id={id}
        className={CONTROL_CLASS}
        value={parameter.default_value == null ? "" : String(parameter.default_value)}
        disabled={loading || optionsError != null}
        onChange={(event) => {
          const option = options?.find((item) => String(item.value) === event.target.value);
          onChange(option?.value ?? null);
        }}
      >
        <option value="">{loading ? "Cargando opciones…" : selectPlaceholder(parameter)}</option>
        {(options ?? []).map((option) => (
          <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
        ))}
      </select>
      {loading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando opciones…
        </p>
      )}
      {optionsError && <p className="text-xs text-destructive">{optionsError}</p>}
    </>
  );
}

/**
 * One default-value control per business kind. A list never falls back to a
 * free-text box: an administrator should not have to type an id.
 */
function DefaultValueField({
  id,
  parameter,
  reportCode,
  savedParameters,
  onChange,
}: {
  id: string;
  parameter: ReportParameter;
  reportCode?: string;
  savedParameters: readonly ReportParameter[];
  onChange: (value: ReportParameter["default_value"]) => void;
}) {
  const shape = parameterShapeOf(parameter);
  const label = (
    <Label htmlFor={id}>Valor predeterminado <span className="font-normal text-muted-foreground">(opcional)</span></Label>
  );

  if (shape == null) {
    // A legacy combination has no control this editor can vouch for, so its
    // stored default is shown and sent back untouched.
    return (
      <div className="grid gap-1.5">
        {label}
        <Input id={id} value={displayDefault(parameter.default_value)} readOnly disabled />
        <p className="text-xs text-muted-foreground">Se conserva el valor guardado.</p>
      </div>
    );
  }

  if (parameter.input_type === "select") {
    const message = !reportCode
      ? "Podrás elegir un valor predeterminado después de crear el reporte."
      : "Podrás elegir un valor predeterminado después de guardar los cambios.";
    return (
      <div className="grid gap-1.5">
        {label}
        {reportCode && savedWithSameOptions(parameter, savedParameters) ? (
          <SelectDefaultValue
            key={`${parameter.name}:${parameter.configuration_json?.options_source ?? ""}`}
            id={id}
            parameter={parameter}
            reportCode={reportCode}
            onChange={onChange}
          />
        ) : (
          <>
            <select id={id} className={CONTROL_CLASS} value="" disabled>
              <option value="">{selectPlaceholder(parameter)}</option>
            </select>
            <p className="text-xs text-muted-foreground">{message}</p>
          </>
        )}
      </div>
    );
  }

  if (shape.kind === "boolean") {
    return (
      <div className="grid gap-1.5">
        {label}
        <select
          id={id}
          className={CONTROL_CLASS}
          value={parameter.default_value == null ? "" : String(parameter.default_value)}
          onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")}
        >
          <option value="">Sin valor</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      </div>
    );
  }

  const type = shape.kind === "number" ? "number"
    : shape.kind === "date" ? "date"
      : shape.kind === "datetime" ? "datetime-local"
        : "text";
  return (
    <div className="grid gap-1.5">
      {label}
      <Input
        id={id}
        type={type}
        step={shape.kind === "number" ? (shape.decimals ? "any" : "1") : undefined}
        value={parameter.default_value == null ? "" : String(parameter.default_value)}
        onChange={(event) => onChange(event.target.value || null)}
      />
    </div>
  );
}

function SourceParameterField({
  parameter,
  index,
  reportCode,
  savedParameters,
  templateLocations,
  onChange,
}: {
  parameter: ReportParameter;
  index: number;
  reportCode?: string;
  savedParameters: readonly ReportParameter[];
  templateLocations?: readonly TemplatePlaceholderLocation[];
  onChange: (parameter: ReportParameter) => void;
}) {
  const labelId = `source-parameter-label-${index}`;
  const headingId = `source-parameter-heading-${index}`;

  return (
    <div role="group" aria-labelledby={headingId} className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="font-medium">{parameter.label}</h3>
        <Badge variant={parameter.required ? "secondary" : "outline"}>
          {parameter.required ? "Obligatorio" : "Opcional"}
        </Badge>
        <TemplateUsageBadge locations={templateLocations} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{sourceParameterDescription(parameter)}</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={labelId}>Nombre visible</Label>
          <Input
            id={labelId}
            value={parameter.label}
            onChange={(event) => onChange({ ...parameter, label: event.target.value })}
          />
        </div>
        <DefaultValueField
          id={`source-parameter-default-${index}`}
          parameter={parameter}
          reportCode={reportCode}
          savedParameters={savedParameters}
          onChange={(default_value) => onChange({ ...parameter, default_value })}
        />
      </div>
    </div>
  );
}

const KIND_HINTS: Partial<Record<ReportParameterKind, string>> = {
  product: "Selecciona un producto individual. Para capturar varios productos con precio y cantidad utiliza una fuente con renglones de cotización.",
};

function ManualParameterField({
  parameter,
  index,
  position,
  total,
  reportCode,
  savedParameters,
  takenNames,
  templateLocations,
  onChange,
  onMove,
  onRemove,
}: {
  parameter: ReportParameter;
  index: number;
  position: number;
  total: number;
  reportCode?: string;
  savedParameters: readonly ReportParameter[];
  takenNames: string[];
  templateLocations?: readonly TemplatePlaceholderLocation[];
  onChange: (parameter: ReportParameter) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const shape = parameterShapeOf(parameter);
  const title = parameter.label.trim() || `Dato ${position + 1}`;
  const headingId = `parameter-heading-${index}`;
  const locked = savedParameters.some((saved) => saved.name === parameter.name);
  const hint = shape ? KIND_HINTS[shape.kind] : undefined;

  return (
    <div role="group" aria-labelledby={headingId} className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={headingId} className="font-medium">{title}</h3>
          <TemplateUsageBadge locations={templateLocations} />
        </div>
        <div className="flex gap-2">
          <Button type="button" size="icon-sm" variant="outline" aria-label={`Mover ${title} arriba`} disabled={position === 0} onClick={() => onMove(-1)}>
            <ArrowUp />
          </Button>
          <Button type="button" size="icon-sm" variant="outline" aria-label={`Mover ${title} abajo`} disabled={position === total - 1} onClick={() => onMove(1)}>
            <ArrowDown />
          </Button>
          <Button type="button" size="icon-sm" variant="destructive" aria-label={`Quitar ${title}`} onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`parameter-label-${index}`}>Nombre visible</Label>
          <Input
            id={`parameter-label-${index}`}
            value={parameter.label}
            placeholder="Cantidad"
            onChange={(event) => onChange(relabelParameter(parameter, event.target.value, { locked, takenNames }))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`parameter-kind-${index}`}>Tipo de entrada</Label>
          {shape ? (
            <select
              id={`parameter-kind-${index}`}
              className={CONTROL_CLASS}
              value={shape.kind}
              onChange={(event) => onChange(withParameterShape(parameter, event.target.value as ReportParameterKind))}
            >
              {REPORT_PARAMETER_KINDS.map((kind) => (
                <option key={kind.kind} value={kind.kind}>{kind.label}</option>
              ))}
            </select>
          ) : (
            <>
              <select id={`parameter-kind-${index}`} className={CONTROL_CLASS} value="legacy" disabled>
                <option value="legacy">{LEGACY_PARAMETER_KIND_LABEL}</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Este dato usa una configuración anterior y se conserva tal como está.
              </p>
            </>
          )}
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <DefaultValueField
          id={`parameter-default-${index}`}
          parameter={parameter}
          reportCode={reportCode}
          savedParameters={savedParameters}
          onChange={(default_value) => onChange({ ...parameter, default_value })}
        />
        <div className="flex flex-col justify-end gap-2 pb-2 text-sm">
          {shape?.kind === "number" && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={shape.decimals}
                onChange={(event) => onChange(withParameterShape(parameter, "number", event.target.checked))}
              />
              Permitir decimales
            </label>
          )}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={parameter.required}
              onChange={(event) => onChange({ ...parameter, required: event.target.checked })}
            />
            Obligatorio
          </label>
        </div>
      </div>
    </div>
  );
}

/**
 * Two lists, one array. Source-owned parameters keep the complete backend
 * contract in state but expose only their visible name and default value.
 * The report's own inputs are described in business terms ("Tipo de entrada")
 * and the technical triple is derived by `report-parameter-kinds`; every
 * technical field of every parameter still travels back on save.
 */
export function ReportParameterEditor({
  parameters,
  sourceParameterNames = [],
  savedParameters = [],
  reportCode,
  templateUsage,
  onChange,
}: {
  parameters: ReportParameter[];
  sourceParameterNames?: readonly string[];
  /** The parameters as last persisted: their names are frozen and only they have loadable options. */
  savedParameters?: readonly ReportParameter[];
  reportCode?: string;
  /** `parameter.name` → where the active Excel template uses it (#43). */
  templateUsage?: ReadonlyMap<string, TemplatePlaceholderLocation[]>;
  onChange: (parameters: ReportParameter[]) => void;
}) {
  const entries = parameters.map((parameter, index) => ({ parameter, index }));
  const sourceEntries = entries.filter(({ parameter }) => sourceParameterNames.includes(parameter.name));
  const reportEntries = entries.filter(({ parameter }) => !sourceParameterNames.includes(parameter.name));

  function replace(index: number, next: ReportParameter) {
    onChange(parameters.map((parameter, current) => (current === index ? next : parameter)));
  }

  /** Reorders within the report's own list, so a source key never drifts into it. */
  function move(position: number, direction: -1 | 1) {
    const destination = position + direction;
    if (destination < 0 || destination >= reportEntries.length) return;
    const next = [...parameters];
    const from = reportEntries[position].index;
    const to = reportEntries[destination].index;
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
  }

  /** A generated name avoids every other current name and every saved one. */
  function takenNamesFor(index: number): string[] {
    return [
      ...parameters.filter((_, current) => current !== index).map((parameter) => parameter.name),
      ...savedParameters.map((parameter) => parameter.name),
    ];
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4" aria-labelledby="source-parameters-heading">
        <div>
          <h2 id="source-parameters-heading" className="flex items-center gap-2 text-lg font-semibold">
            <Database className="h-4 w-4 text-muted-foreground" /> Datos que pide la fuente
          </h2>
          <p className="text-sm text-muted-foreground">
            La fuente necesita estos datos para generar el reporte. Puedes cambiar cómo se llaman y su valor inicial.
          </p>
        </div>
        {sourceEntries.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            La fuente seleccionada no requiere datos adicionales.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {sourceEntries.map(({ parameter, index }) => (
              <SourceParameterField
                key={`${reportCode ?? "new"}:${parameter.name}:${parameter.input_type}:${parameter.configuration_json?.options_source ?? "none"}`}
                parameter={parameter}
                index={index}
                reportCode={reportCode}
                savedParameters={savedParameters}
                templateLocations={templateUsage?.get(parameter.name)}
                onChange={(next) => replace(index, next)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="report-parameters-heading">
        <div>
          <h2 id="report-parameters-heading" className="flex items-center gap-2 text-lg font-semibold">
            <UserPen className="h-4 w-4 text-muted-foreground" /> Datos adicionales que capturará el usuario
          </h2>
          <p className="text-sm text-muted-foreground">
            Por ejemplo cliente, fecha o IVA. Se pedirán al generar el reporte y podrás usarlos en columnas y en la
            plantilla.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Agregar rápido">
          <span className="text-sm text-muted-foreground">Agregar rápido:</span>
          {REPORT_PARAMETER_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onChange(appendPresetParameter(parameters, preset.key))}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        {reportEntries.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Este reporte todavía no pide datos adicionales.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {reportEntries.map(({ parameter, index }, position) => (
              <ManualParameterField
                key={index}
                parameter={parameter}
                index={index}
                position={position}
                total={reportEntries.length}
                reportCode={reportCode}
                savedParameters={savedParameters}
                takenNames={takenNamesFor(index)}
                templateLocations={templateUsage?.get(parameter.name)}
                onChange={(next) => replace(index, next)}
                onMove={(direction) => move(position, direction)}
                onRemove={() => onChange(parameters.filter((_, current) => current !== index))}
              />
            ))}
          </div>
        )}

        <div>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange([...parameters, emptyParameter(parameters.length)])}>
            <Plus /> Agregar dato
          </Button>
        </div>
      </section>
    </div>
  );
}
