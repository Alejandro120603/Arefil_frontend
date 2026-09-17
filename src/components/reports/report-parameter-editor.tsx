"use client";

import { ArrowDown, ArrowUp, Database, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DATA_TYPES,
  INPUTS_BY_DATA_TYPE,
  REPORT_PARAMETER_PRESETS,
  appendPresetParameter,
  emptyParameter,
} from "@/lib/reports/report-form";
import type { ReportParameter, ReportParameterDataType, ReportParameterInputType } from "@/types/api";

const CONTROL_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function defaultInput(dataType: ReportParameterDataType): ReportParameterInputType {
  return INPUTS_BY_DATA_TYPE[dataType][0];
}

/**
 * Two lists, one array. The data source owns the parameters it named in its
 * contract — their key, type and obligation are fixed, and `price_list_id`
 * stays administered by the source that declared it. Everything else is the
 * report's own: Cliente, Fecha, IVA %… free to add, rename, reorder or drop.
 */
export function ReportParameterEditor({
  parameters,
  sourceParameterNames = [],
  onChange,
}: {
  parameters: ReportParameter[];
  sourceParameterNames?: readonly string[];
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

  function renderParameter(parameter: ReportParameter, index: number, locked: boolean, position: number, total: number) {
    return (
      <div key={index} className="rounded-xl border p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`parameter-name-${index}`}>Nombre</Label>
            <Input
              id={`parameter-name-${index}`}
              className="font-mono"
              value={parameter.name}
              disabled={locked}
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
              disabled={locked}
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
              disabled={locked}
              onChange={(event) => replace(index, { ...parameter, required: event.target.checked })}
            />
            Requerido
          </label>
          {!locked && (
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
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4" aria-labelledby="source-parameters-heading">
        <div>
          <h2 id="source-parameters-heading" className="flex items-center gap-2 text-lg font-semibold">
            <Database className="h-4 w-4 text-muted-foreground" /> Parámetros de fuente
          </h2>
          <p className="text-sm text-muted-foreground">
            La fuente fija su clave, tipo y obligatoriedad. Puedes ajustar etiqueta, control y valor predeterminado.
          </p>
        </div>
        {sourceEntries.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            La fuente seleccionada no exige parámetros.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {sourceEntries.map(({ parameter, index }) => renderParameter(parameter, index, true, 0, 1))}
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
              Los valores que el reporte pide al usuario y que no provienen de la fuente.
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
              renderParameter(parameter, index, false, position, reportEntries.length))}
          </div>
        )}
      </section>
    </div>
  );
}
