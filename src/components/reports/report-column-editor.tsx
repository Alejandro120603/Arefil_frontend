"use client";

import { ArrowDown, ArrowUp, Calculator, Database, Sigma, SlidersHorizontal, Trash2 } from "lucide-react";
import { ReportFormulaInput } from "@/components/reports/report-formula-input";
import { TemplateUsageBadge } from "@/components/reports/report-template-dependency-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COLUMN_TYPE_LABELS,
  FORMAT_TYPE_LABELS,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  applyFieldSource,
  applyGroupParameterSource,
  applyParameterSource,
  formatsForDataType,
  groupFieldCatalog,
  groupParameterReferences,
  moveColumn,
  newFieldColumn,
  newFormulaColumn,
  newGroupParameterColumn,
  newParameterColumn,
  removeColumn,
  withDisplayOrder,
  type GroupParameterReference,
} from "@/lib/reports/report-builder";
import type { TemplatePlaceholderLocation } from "@/lib/reports/report-template-dependencies";
import type {
  ReportColumn,
  ReportColumnType,
  ReportFieldDescriptor,
  ReportFormatType,
  ReportParameter,
  ReportParameterGroup,
} from "@/types/api";

const CONTROL_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const TYPE_ICONS: Record<ReportColumnType, typeof Database> = {
  FIELD: Database,
  PARAMETER: SlidersHorizontal,
  FORMULA: Sigma,
};

/** "Item de lista → Precio unitario": the catalog's own group and label. */
function fieldLabel(field: ReportFieldDescriptor): string {
  return `${field.group} → ${field.label}`;
}

/**
 * The human name of whatever a PARAMETER column reads. The technical name is
 * only a last resort, for a source the report no longer declares.
 */
function parameterLabel(
  source: string | null,
  parameters: ReportParameter[],
  groupedParameters: GroupParameterReference[],
): string | null {
  if (!source) return null;
  const parameter = parameters.find((candidate) => candidate.name === source);
  if (parameter) return parameter.label || parameter.name;
  return groupedParameters.find((candidate) => candidate.source === source)?.label ?? null;
}

/** Secondary line under the title: what this column actually reads. */
function sourceSummary(
  column: ReportColumn,
  fields: ReportFieldDescriptor[],
  parameters: ReportParameter[],
  groupedParameters: GroupParameterReference[],
): string {
  if (column.column_type === "FIELD") {
    const descriptor = fields.find((field) => field.key === column.source_field);
    if (!descriptor) return column.source_field ?? "Sin dato seleccionado";
    return fieldLabel(descriptor);
  }
  if (column.column_type === "PARAMETER") {
    return parameterLabel(column.source_parameter, parameters, groupedParameters)
      ?? column.source_parameter
      ?? "Sin dato seleccionado";
  }
  return column.formula_definition?.trim() || "Sin fórmula";
}

export function ReportColumnEditor({
  columns,
  fields,
  parameters,
  parameterGroups,
  disabled = false,
  templateUsage,
  onChange,
}: {
  columns: ReportColumn[];
  fields: ReportFieldDescriptor[];
  parameters: ReportParameter[];
  parameterGroups: ReportParameterGroup[];
  disabled?: boolean;
  /** `column.key` → where the active Excel template reads it as `{{rows.<key>}}` (#43). */
  templateUsage?: ReadonlyMap<string, TemplatePlaceholderLocation[]>;
  onChange: (columns: ReportColumn[]) => void;
}) {
  const groups = groupFieldCatalog(fields);
  const usedParameters = new Set(
    columns.filter((column) => column.column_type === "PARAMETER").map((column) => column.source_parameter),
  );
  const availableParameters = parameters.filter((parameter) => !usedParameters.has(parameter.name));
  const groupedParameters = groupParameterReferences(parameterGroups);
  const availableGroupedParameters = groupedParameters.filter((parameter) => !usedParameters.has(parameter.source));
  // Generated keys must never take a parameter's name (see `takenKeys`).
  const reserved = parameters.map((parameter) => parameter.name);

  function replace(index: number, next: ReportColumn) {
    onChange(columns.map((column, current) => (current === index ? next : column)));
  }

  function addField(key: string) {
    const descriptor = fields.find((field) => field.key === key);
    if (!descriptor) return;
    onChange(withDisplayOrder([...columns, newFieldColumn(descriptor, columns, reserved)]));
  }

  function addParameter(name: string) {
    const parameter = parameters.find((candidate) => candidate.name === name);
    if (parameter) {
      onChange(withDisplayOrder([...columns, newParameterColumn(parameter, columns)]));
      return;
    }
    const grouped = groupedParameters.find((candidate) => candidate.source === name);
    if (grouped) onChange(withDisplayOrder([...columns, newGroupParameterColumn(grouped, columns, reserved)]));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed p-4">
        <div className="grid min-w-64 flex-1 gap-1.5">
          <Label htmlFor="builder-add-field">Agregar dato de la fuente</Label>
          <select
            id="builder-add-field"
            className={CONTROL_CLASS}
            value=""
            disabled={disabled || fields.length === 0}
            onChange={(event) => { addField(event.target.value); event.target.value = ""; }}
          >
            <option value="">¿Qué dato quieres mostrar?</option>
            {groups.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.fields.map((field) => (
                  <option key={field.key} value={field.key}>{field.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label htmlFor="builder-add-parameter">Agregar dato capturado</Label>
          <select
            id="builder-add-parameter"
            className={CONTROL_CLASS}
            value=""
            disabled={disabled || (availableParameters.length === 0 && availableGroupedParameters.length === 0)}
            onChange={(event) => { addParameter(event.target.value); event.target.value = ""; }}
          >
            <option value="">
              {availableParameters.length === 0 && availableGroupedParameters.length === 0 ? "Sin datos capturados disponibles" : "¿Qué dato capturado quieres mostrar?"}
            </option>
            {availableParameters.length > 0 && <optgroup label="Datos del reporte">
              {availableParameters.map((parameter) => (
                <option key={parameter.name} value={parameter.name}>{parameter.label || parameter.name}</option>
              ))}
            </optgroup>}
            {availableGroupedParameters.length > 0 && <optgroup label="Datos por renglón">
              {availableGroupedParameters.map((parameter) => (
                <option key={parameter.source} value={parameter.source}>{parameter.label}</option>
              ))}
            </optgroup>}
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange(withDisplayOrder([...columns, newFormulaColumn(columns, reserved)]))}
        >
          <Calculator /> Agregar cálculo
        </Button>
      </div>

      {columns.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Este reporte todavía no tiene columnas. Agrega un dato de la fuente, un dato capturado o un cálculo.
        </div>
      ) : (
        <ul className="flex list-none flex-col gap-4 p-0">
          {columns.map((column, index) => {
            const Icon = TYPE_ICONS[column.column_type];
            const formats = formatsForDataType(column.data_type);
            const title = column.label || `Columna ${index + 1}`;
            // Other columns already show these parameters; offering them again
            // would only produce a duplicated key the admin cannot see.
            const takenElsewhere = new Set(
              columns.filter((other, current) => current !== index && other.column_type === "PARAMETER")
                .map((other) => other.source_parameter),
            );
            const knownField = fields.some((field) => field.key === column.source_field);
            const currentParameterLabel = parameterLabel(column.source_parameter, parameters, groupedParameters);
            return (
              <li key={index} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{title}</span>
                      {!column.visible && <Badge variant="secondary">Oculta</Badge>}
                      <TemplateUsageBadge locations={templateUsage?.get(column.key)} />
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {COLUMN_TYPE_LABELS[column.column_type]} · {sourceSummary(column, fields, parameters, groupedParameters)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button" size="icon-sm" variant="outline" aria-label={`Mover ${title} arriba`}
                      disabled={disabled || index === 0} onClick={() => onChange(moveColumn(columns, index, -1))}
                    ><ArrowUp /></Button>
                    <Button
                      type="button" size="icon-sm" variant="outline" aria-label={`Mover ${title} abajo`}
                      disabled={disabled || index === columns.length - 1} onClick={() => onChange(moveColumn(columns, index, 1))}
                    ><ArrowDown /></Button>
                    <Button
                      type="button" size="icon-sm" variant="destructive" aria-label={`Eliminar ${title}`}
                      disabled={disabled} onClick={() => onChange(removeColumn(columns, index))}
                    ><Trash2 /></Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`column-label-${index}`}>Título de columna</Label>
                    <Input
                      id={`column-label-${index}`}
                      value={column.label}
                      disabled={disabled}
                      onChange={(event) => replace(index, { ...column, label: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`column-format-${index}`}>Formato</Label>
                    <select
                      id={`column-format-${index}`}
                      className={CONTROL_CLASS}
                      value={column.format_type ?? ""}
                      disabled={disabled}
                      onChange={(event) => replace(index, {
                        ...column,
                        format_type: (event.target.value || null) as ReportFormatType | null,
                      })}
                    >
                      <option value="">Sin formato</option>
                      {formats.map((format) => (
                        <option key={format} value={format}>{FORMAT_TYPE_LABELS[format]}</option>
                      ))}
                    </select>
                  </div>

                  {column.column_type === "FIELD" && (
                    <div className="grid gap-1.5 md:col-span-2">
                      <Label htmlFor={`column-field-${index}`}>Dato que muestra</Label>
                      <select
                        id={`column-field-${index}`}
                        className={CONTROL_CLASS}
                        value={column.source_field ?? ""}
                        disabled={disabled || fields.length === 0}
                        onChange={(event) => {
                          const descriptor = fields.find((field) => field.key === event.target.value);
                          if (descriptor) replace(index, applyFieldSource(column, descriptor));
                        }}
                      >
                        <option value="">Selecciona un dato…</option>
                        {column.source_field && !knownField && (
                          // A saved source the catalog no longer exposes: show it
                          // as-is instead of silently displaying "Selecciona…".
                          <option value={column.source_field} disabled>{column.source_field} (no disponible)</option>
                        )}
                        {fields.map((field) => (
                          <option key={field.key} value={field.key}>{fieldLabel(field)}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {column.column_type === "PARAMETER" && (
                    <div className="grid gap-1.5 md:col-span-2">
                      <Label htmlFor={`column-parameter-${index}`}>Dato capturado que muestra</Label>
                      <select
                        id={`column-parameter-${index}`}
                        className={CONTROL_CLASS}
                        value={column.source_parameter ?? ""}
                        disabled={disabled || (parameters.length === 0 && groupedParameters.length === 0)}
                        onChange={(event) => {
                          const parameter = parameters.find((candidate) => candidate.name === event.target.value);
                          if (parameter) {
                            replace(index, applyParameterSource(column, parameter));
                            return;
                          }
                          const grouped = groupedParameters.find((candidate) => candidate.source === event.target.value);
                          if (grouped) replace(index, applyGroupParameterSource(column, grouped, columns, reserved));
                        }}
                      >
                        <option value="">
                          {parameters.length === 0 && groupedParameters.length === 0 ? "El reporte no pide datos capturados" : "Selecciona un dato capturado…"}
                        </option>
                        {column.source_parameter && currentParameterLabel == null && (
                          <option value={column.source_parameter} disabled>{column.source_parameter} (no disponible)</option>
                        )}
                        {parameters.filter((parameter) => !takenElsewhere.has(parameter.name)).map((parameter) => (
                          <option key={parameter.name} value={parameter.name}>{parameter.label || parameter.name}</option>
                        ))}
                        {groupedParameters.filter((parameter) => !takenElsewhere.has(parameter.source)).map((parameter) => (
                          <option key={parameter.source} value={parameter.source}>{parameter.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {column.column_type === "FORMULA" && (
                    <div className="md:col-span-2 xl:col-span-4">
                      <ReportFormulaInput
                        index={index}
                        column={column}
                        columns={columns}
                        parameters={parameters}
                        disabled={disabled}
                        onChange={(formula) => replace(index, { ...column, formula_definition: formula })}
                      />
                    </div>
                  )}

                  <div className="grid gap-1.5">
                    <Label htmlFor={`column-width-${index}`}>Ancho</Label>
                    <Input
                      id={`column-width-${index}`}
                      type="number"
                      min={MIN_COLUMN_WIDTH}
                      max={MAX_COLUMN_WIDTH}
                      placeholder="Automático"
                      value={column.width ?? ""}
                      disabled={disabled}
                      onChange={(event) => replace(index, {
                        ...column,
                        width: event.target.value === "" ? null : Number.parseInt(event.target.value, 10),
                      })}
                    />
                  </div>
                  <label className="flex items-center gap-2 self-end pb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={column.visible}
                      disabled={disabled}
                      onChange={(event) => replace(index, { ...column, visible: event.target.checked })}
                    />
                    Visible
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
