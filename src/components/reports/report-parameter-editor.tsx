"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Database, Loader2, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUserErrorMessage } from "@/lib/api/errors";
import { listAllReportParameterOptions } from "@/lib/api/reports";
import {
  DATA_TYPES,
  INPUTS_BY_DATA_TYPE,
  REPORT_PARAMETER_PRESETS,
  appendPresetParameter,
  emptyParameter,
} from "@/lib/reports/report-form";
import type {
  ReportOption,
  ReportParameter,
  ReportParameterDataType,
  ReportParameterInputType,
} from "@/types/api";

const CONTROL_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function defaultInput(dataType: ReportParameterDataType): ReportParameterInputType {
  return INPUTS_BY_DATA_TYPE[dataType][0];
}

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

function SourceParameterField({
  parameter,
  index,
  reportCode,
  onChange,
}: {
  parameter: ReportParameter;
  index: number;
  reportCode?: string;
  onChange: (parameter: ReportParameter) => void;
}) {
  const isSelect = parameter.input_type === "select";
  const [options, setOptions] = useState<ReportOption[] | null>(isSelect && reportCode ? null : []);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSelect || !reportCode) return;

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
  }, [isSelect, parameter.name, reportCode]);

  const defaultId = `source-parameter-default-${index}`;
  const labelId = `source-parameter-label-${index}`;
  const headingId = `source-parameter-heading-${index}`;
  const loadingOptions = isSelect && reportCode != null && options == null;

  return (
    <div role="group" aria-labelledby={headingId} className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={headingId} className="font-medium">{parameter.label}</h3>
            <Badge variant={parameter.required ? "secondary" : "outline"}>
              {parameter.required ? "Obligatorio" : "Opcional"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {sourceParameterDescription(parameter)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={labelId}>Etiqueta para el usuario</Label>
          <Input
            id={labelId}
            value={parameter.label}
            onChange={(event) => onChange({ ...parameter, label: event.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={defaultId}>Valor predeterminado <span className="font-normal text-muted-foreground">(opcional)</span></Label>
          {isSelect ? (
            <>
              <select
                id={defaultId}
                className={CONTROL_CLASS}
                value={parameter.default_value == null ? "" : String(parameter.default_value)}
                disabled={!reportCode || loadingOptions || optionsError != null}
                onChange={(event) => {
                  const option = options?.find((item) => String(item.value) === event.target.value);
                  onChange({ ...parameter, default_value: option?.value ?? null });
                }}
              >
                <option value="">
                  {!reportCode
                    ? "Disponible después de crear el reporte"
                    : loadingOptions
                      ? "Cargando opciones…"
                      : selectPlaceholder(parameter)}
                </option>
                {(options ?? []).map((option) => (
                  <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
                ))}
              </select>
              {!reportCode && (
                <p className="text-xs text-muted-foreground">
                  Podrás elegir un valor predeterminado después de crear el reporte.
                </p>
              )}
              {loadingOptions && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando opciones…
                </p>
              )}
              {optionsError && <p className="text-xs text-destructive">{optionsError}</p>}
            </>
          ) : parameter.data_type === "boolean" ? (
            <select
              id={defaultId}
              className={CONTROL_CLASS}
              value={parameter.default_value == null ? "" : String(parameter.default_value)}
              onChange={(event) => onChange({
                ...parameter,
                default_value: event.target.value === "" ? null : event.target.value === "true",
              })}
            >
              <option value="">Sin valor</option>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          ) : (
            <Input
              id={defaultId}
              type={
                parameter.input_type === "datetime" ? "datetime-local" :
                parameter.input_type === "number" ? "number" : parameter.input_type
              }
              step={parameter.data_type === "decimal" ? "any" : undefined}
              value={parameter.default_value == null ? "" : String(parameter.default_value)}
              onChange={(event) => onChange({
                ...parameter,
                default_value: event.target.value || null,
              })}
            />
          )}
        </div>
      </div>

      <details className="mt-4 rounded-lg bg-muted/40 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-muted-foreground">
          Ver configuración técnica
        </summary>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Nombre interno</dt><dd className="font-mono">{parameter.name}</dd></div>
          <div><dt className="text-muted-foreground">Tipo de dato</dt><dd className="font-mono">{parameter.data_type}</dd></div>
          <div><dt className="text-muted-foreground">Control</dt><dd className="font-mono">{parameter.input_type}</dd></div>
          {parameter.configuration_json?.options_source && (
            <div><dt className="text-muted-foreground">Fuente de opciones</dt><dd className="font-mono">{parameter.configuration_json.options_source}</dd></div>
          )}
        </dl>
      </details>
    </div>
  );
}

/**
 * Two lists, one array. Source-owned parameters keep the complete backend
 * contract in state but expose only presentation choices. Everything else is
 * the report's own advanced configuration and remains fully editable.
 */
export function ReportParameterEditor({
  parameters,
  sourceParameterNames = [],
  reportCode,
  onChange,
}: {
  parameters: ReportParameter[];
  sourceParameterNames?: readonly string[];
  reportCode?: string;
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

  function renderReportParameter(parameter: ReportParameter, index: number, position: number, total: number) {
    return (
      <div key={index} className="rounded-xl border p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`parameter-name-${index}`}>Nombre</Label>
            <Input
              id={`parameter-name-${index}`}
              className="font-mono"
              value={parameter.name}
              placeholder="fecha_inicio"
              onChange={(event) => replace(index, { ...parameter, name: event.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`parameter-label-${index}`}>Etiqueta</Label>
            <Input
              id={`parameter-label-${index}`}
              value={parameter.label}
              placeholder="Fecha inicial"
              onChange={(event) => replace(index, { ...parameter, label: event.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`parameter-type-${index}`}>Tipo</Label>
            <select
              id={`parameter-type-${index}`}
              className={CONTROL_CLASS}
              value={parameter.data_type}
              onChange={(event) => {
                const data_type = event.target.value as ReportParameterDataType;
                replace(index, {
                  ...parameter,
                  data_type,
                  input_type: defaultInput(data_type),
                  default_value: null,
                  configuration_json: null,
                });
              }}
            >
              {DATA_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`parameter-input-${index}`}>Control</Label>
            <select
              id={`parameter-input-${index}`}
              className={CONTROL_CLASS}
              value={parameter.input_type}
              onChange={(event) => {
                const input_type = event.target.value as ReportParameterInputType;
                replace(index, {
                  ...parameter,
                  input_type,
                  configuration_json: input_type === "select" ? { options_source: "price_lists" } : null,
                });
              }}
            >
              {INPUTS_BY_DATA_TYPE[parameter.data_type].map((input) => (
                <option key={input} value={input}>{input}</option>
              ))}
            </select>
          </div>
          {parameter.input_type === "select" && (
            <div className="grid gap-1.5">
              <Label htmlFor={`parameter-source-${index}`}>Fuente de opciones</Label>
              <select
                id={`parameter-source-${index}`}
                className={CONTROL_CLASS}
                value={parameter.configuration_json?.options_source ?? "price_lists"}
                onChange={(event) => replace(index, {
                  ...parameter,
                  configuration_json: { options_source: event.target.value as "price_lists" | "suppliers" | "products" },
                })}
              >
                <option value="price_lists">Listas de precios</option>
                <option value="suppliers">Proveedores</option>
                <option value="products">Productos</option>
              </select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`parameter-default-${index}`}>Valor predeterminado</Label>
            {parameter.data_type === "boolean" ? (
              <select
                id={`parameter-default-${index}`}
                className={CONTROL_CLASS}
                value={parameter.default_value == null ? "" : String(parameter.default_value)}
                onChange={(event) => replace(index, {
                  ...parameter,
                  default_value: event.target.value === "" ? null : event.target.value === "true",
                })}
              >
                <option value="">Sin valor</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            ) : (
              <Input
                id={`parameter-default-${index}`}
                type={parameter.data_type === "date" ? "date" : parameter.data_type === "datetime" ? "datetime-local" : "text"}
                value={parameter.default_value == null ? "" : String(parameter.default_value)}
                onChange={(event) => replace(index, { ...parameter, default_value: event.target.value || null })}
              />
            )}
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={parameter.required}
              onChange={(event) => replace(index, { ...parameter, required: event.target.checked })}
            />
            Requerido
          </label>
          <div className="flex items-end justify-end gap-2 xl:col-start-4">
            <Button type="button" size="icon-sm" variant="outline" aria-label={`Mover ${parameter.name || position + 1} arriba`} disabled={position === 0} onClick={() => move(position, -1)}>
              <ArrowUp />
            </Button>
            <Button type="button" size="icon-sm" variant="outline" aria-label={`Mover ${parameter.name || position + 1} abajo`} disabled={position === total - 1} onClick={() => move(position, 1)}>
              <ArrowDown />
            </Button>
            <Button type="button" size="icon-sm" variant="destructive" aria-label={`Quitar ${parameter.name || position + 1}`} onClick={() => onChange(parameters.filter((_, current) => current !== index))}>
              <Trash2 />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4" aria-labelledby="source-parameters-heading">
        <div>
          <h2 id="source-parameters-heading" className="flex items-center gap-2 text-lg font-semibold">
            <Database className="h-4 w-4 text-muted-foreground" /> Datos necesarios
          </h2>
          <p className="text-sm text-muted-foreground">
            Define cómo se presentarán los datos que esta fuente solicitará al generar el reporte.
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
                onChange={(next) => replace(index, next)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="report-parameters-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="report-parameters-heading" className="flex items-center gap-2 text-lg font-semibold">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" /> Parámetros del reporte
            </h2>
            <p className="text-sm text-muted-foreground">
              Configuración avanzada para valores adicionales que no exige la fuente de datos.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="parameter-preset">Agregar parámetro común</Label>
              <select
                id="parameter-preset"
                className={`${CONTROL_CLASS} min-w-52`}
                value=""
                onChange={(event) => {
                  if (event.target.value) onChange(appendPresetParameter(parameters, event.target.value));
                  event.target.value = "";
                }}
              >
                <option value="">Selecciona uno…</option>
                {REPORT_PARAMETER_PRESETS.map((preset) => (
                  <option key={preset.key} value={preset.key}>{preset.label}</option>
                ))}
              </select>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => onChange([...parameters, emptyParameter(parameters.length)])}>
              <Plus /> Agregar parámetro
            </Button>
          </div>
        </div>

        {reportEntries.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Este reporte no declara parámetros propios todavía.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {reportEntries.map(({ parameter, index }, position) =>
              renderReportParameter(parameter, index, position, reportEntries.length))}
          </div>
        )}
      </section>
    </div>
  );
}
