"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DATA_TYPES,
  INPUTS_BY_DATA_TYPE,
  emptyParameter,
} from "@/lib/reports/report-form";
import type { ReportParameter, ReportParameterDataType, ReportParameterInputType } from "@/types/api";

const CONTROL_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function defaultInput(dataType: ReportParameterDataType): ReportParameterInputType {
  return INPUTS_BY_DATA_TYPE[dataType][0];
}

export function ReportParameterEditor({
  parameters,
  locked = false,
  onChange,
}: {
  parameters: ReportParameter[];
  locked?: boolean;
  onChange: (parameters: ReportParameter[]) => void;
}) {
  function replace(index: number, next: ReportParameter) {
    onChange(parameters.map((parameter, current) => (current === index ? next : parameter)));
  }

  function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= parameters.length) return;
    const next = [...parameters];
    [next[index], next[destination]] = [next[destination], next[index]];
    onChange(next);
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="report-parameters-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="report-parameters-heading" className="text-lg font-semibold">Parámetros</h2>
          <p className="text-sm text-muted-foreground">
            Define los valores que el backend validará al ejecutar el reporte.
          </p>
        </div>
        {!locked && (
          <Button type="button" size="sm" variant="outline" onClick={() => onChange([...parameters, emptyParameter(parameters.length)])}>
            <Plus /> Agregar parámetro
          </Button>
        )}
      </div>

      {locked && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          La fuente fija las claves, tipos y obligatoriedad de adquisición. Puedes ajustar etiquetas, controles y valores predeterminados para la presentación del reporte.
        </p>
      )}

      {parameters.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Este reporte no tiene parámetros declarados.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {parameters.map((parameter, index) => (
            <div key={index} className="rounded-xl border p-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label htmlFor={`parameter-name-${index}`}>Nombre</Label>
                  <Input
                    id={`parameter-name-${index}`}
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
                    <Button type="button" size="icon-sm" variant="outline" aria-label="Mover parámetro arriba" disabled={index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button type="button" size="icon-sm" variant="outline" aria-label="Mover parámetro abajo" disabled={index === parameters.length - 1} onClick={() => move(index, 1)}>
                      <ArrowDown />
                    </Button>
                    <Button type="button" size="icon-sm" variant="destructive" aria-label="Quitar parámetro" onClick={() => onChange(parameters.filter((_, current) => current !== index))}>
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
