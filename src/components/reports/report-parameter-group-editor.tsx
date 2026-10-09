"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ListPlus, Package, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GROUP_FIELD_PRESET_LABELS,
  PRODUCTS_OPTIONS_SOURCE,
  contextOptions,
  groupFieldShapeOf,
  limitsSummary,
  newGroupField,
  newParameterGroup,
  newProductField,
  priceListParameters,
  withGroupFieldShape,
  type GroupFieldPreset,
} from "@/lib/reports/report-group-fields";
import { LEGACY_PARAMETER_KIND_LABEL, relabelParameter } from "@/lib/reports/report-parameter-kinds";
import type {
  ReportNumericConfiguration,
  ReportParameter,
  ReportParameterGroup,
  ReportParameterGroupField,
} from "@/types/api";

const CONTROL_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const NO_PRICE_LIST_MESSAGE = "Para usar productos por renglón, la fuente necesita una lista de precios.";

const PRESETS: GroupFieldPreset[] = ["quantity", "discount", "number", "text"];

function orderedFields(fields: ReportParameterGroupField[]): ReportParameterGroupField[] {
  return fields.map((field, display_order) => ({ ...field, display_order }));
}

/**
 * Repeatable rows in business terms (Frontend #40). Internal names are never
 * shown: a new group or subfield is named after its visible name while it is
 * still unsaved and unreferenced, and is frozen afterwards — columns read it as
 * `<grupo>.<campo>` and Excel templates as `rows.*`. The product filter (the
 * group's `context_parameter`) is inferred when the source has a single price
 * list. Every technical field still travels back on save.
 */
export function ReportParameterGroupEditor({
  groups,
  parameters,
  savedGroups = [],
  referencedSources = [],
  fieldUsages,
  required = false,
  disabled = false,
  onChange,
}: {
  groups: ReportParameterGroup[];
  parameters: ReportParameter[];
  /** The groups as last persisted: their names and their subfields' names are frozen. */
  savedGroups?: readonly ReportParameterGroup[];
  /** `source_parameter` of every column, so a referenced `grupo.campo` is frozen too. */
  referencedSources?: readonly string[];
  /** `grupo.campo` → title of a saved column showing it: such a subfield cannot be removed. */
  fieldUsages?: ReadonlyMap<string, string>;
  /** The source demands exactly one group (REPEATABLE_ROWS), so it is never offered for removal. */
  required?: boolean;
  disabled?: boolean;
  onChange: (groups: ReportParameterGroup[]) => void;
}) {
  const group = groups[0];
  const priceLists = priceListParameters(parameters);
  const [blocked, setBlocked] = useState<string | null>(null);

  if (!group) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="mb-3 text-sm text-muted-foreground">Este reporte todavía no pide productos por renglón.</p>
        <Button type="button" variant="outline" disabled={disabled || priceLists.length === 0} onClick={() => onChange([newParameterGroup(parameters)])}>
          <ListPlus /> Agregar productos por renglón
        </Button>
        {priceLists.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{NO_PRICE_LIST_MESSAGE}</p>}
      </div>
    );
  }

  const savedGroup = savedGroups.find((saved) => saved.name === group.name);
  const groupLocked = savedGroup != null || referencedSources.some((source) => source.startsWith(`${group.name}.`));
  const contexts = contextOptions(parameters, group.context_parameter);
  const currentContext = parameters.find((parameter) => parameter.name === group.context_parameter);
  const hasProduct = group.fields.some((field) => groupFieldShapeOf(field)?.kind === "product");

  function fieldLocked(field: ReportParameterGroupField): boolean {
    return (savedGroup?.fields.some((saved) => saved.name === field.name) ?? false)
      || referencedSources.includes(`${group.name}.${field.name}`);
  }

  /** Other subfields' names and every saved one, so a deleted name is never silently reused. */
  function takenFieldNames(except?: number): string[] {
    return [
      ...group.fields.filter((_, current) => current !== except).map((field) => field.name),
      ...(savedGroup?.fields.map((field) => field.name) ?? []),
    ];
  }

  function replaceGroup(patch: Partial<ReportParameterGroup>) {
    const context = patch.context_parameter ?? group.context_parameter;
    // The rewrite below only re-points the product selector at the current
    // context parameter, so it has to start from the patch's own fields;
    // reading group.fields here would silently drop every add/remove/edit.
    const fields = patch.fields ?? group.fields;
    onChange([{
      ...group,
      ...patch,
      fields: fields.map((field) => field.input_type === "select"
        ? { ...field, configuration_json: { options_source: PRODUCTS_OPTIONS_SOURCE, context_parameter: context } }
        : field),
    }]);
  }

  function replaceField(index: number, next: ReportParameterGroupField) {
    replaceGroup({ fields: group.fields.map((field, current) => current === index ? next : field) });
  }

  function moveField(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= group.fields.length) return;
    const fields = [...group.fields];
    [fields[index], fields[destination]] = [fields[destination], fields[index]];
    replaceGroup({ fields: orderedFields(fields) });
  }

  function addField(preset: GroupFieldPreset) {
    replaceGroup({ fields: orderedFields([...group.fields, newGroupField(preset, group.fields.length, takenFieldNames())]) });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="group-label">Nombre visible del grupo</Label>
          <Input
            id="group-label"
            value={group.label}
            disabled={disabled}
            onChange={(event) => replaceGroup(relabelParameter(group, event.target.value, {
              locked: groupLocked,
              takenNames: parameters.map((parameter) => parameter.name),
            }))}
          />
        </div>
        <div className="grid gap-1.5">
          {contexts.length > 1 || (contexts.length === 1 && currentContext?.name !== contexts[0].name) ? (
            <>
              <Label htmlFor="group-context">Lista usada para productos</Label>
              <select id="group-context" className={CONTROL_CLASS} value={group.context_parameter} disabled={disabled} onChange={(event) => replaceGroup({ context_parameter: event.target.value })}>
                {!currentContext && <option value="">Selecciona una lista…</option>}
                {contexts.map((parameter) => <option key={parameter.name} value={parameter.name}>{parameter.label || parameter.name}</option>)}
              </select>
            </>
          ) : contexts.length === 1 ? (
            <>
              <p className="text-sm font-medium">Los productos se toman de</p>
              <p className="flex h-9 items-center rounded-lg border bg-muted/40 px-3 text-sm">{contexts[0].label || contexts[0].name}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Los productos se toman de</p>
              <p role="alert" className="text-sm text-destructive">{NO_PRICE_LIST_MESSAGE}</p>
            </>
          )}
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">Renglones</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="group-min" className="font-normal text-muted-foreground">Mínimo</Label>
            <Input id="group-min" type="number" min={0} step={1} value={group.min_items} disabled={disabled} onChange={(event) => replaceGroup({ min_items: Number(event.target.value) })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="group-max" className="font-normal text-muted-foreground">Máximo</Label>
            <Input id="group-max" type="number" min={1} step={1} placeholder="Sin límite" value={group.max_items ?? ""} disabled={disabled} onChange={(event) => replaceGroup({ max_items: event.target.value === "" ? null : Number(event.target.value) })} />
          </div>
        </div>
      </fieldset>

      <section className="flex flex-col gap-3" aria-labelledby="group-fields-heading">
        <h3 id="group-fields-heading" className="text-sm font-medium">Datos que captura el usuario en cada renglón</h3>
        <div className="flex flex-wrap gap-2">
          {!hasProduct && (
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => replaceGroup({ fields: orderedFields([...group.fields, newProductField(group.context_parameter, group.fields.length)]) })}>
              <Plus /> Producto
            </Button>
          )}
          {PRESETS.map((preset) => (
            <Button key={preset} type="button" size="sm" variant="outline" disabled={disabled} onClick={() => addField(preset)}>
              <Plus /> {GROUP_FIELD_PRESET_LABELS[preset]}
            </Button>
          ))}
        </div>

        {blocked && (
          <Alert variant="destructive"><AlertDescription>{blocked}</AlertDescription></Alert>
        )}
        <ul className="flex list-none flex-col gap-3 p-0">
          {group.fields.map((field, index) => (
            <GroupFieldCard
              key={index}
              field={field}
              index={index}
              total={group.fields.length}
              disabled={disabled}
              onChange={(next) => replaceField(index, next)}
              onRelabel={(label) => replaceField(index, relabelParameter(field, label, {
                locked: fieldLocked(field),
                takenNames: takenFieldNames(index),
              }))}
              onMove={(direction) => moveField(index, direction)}
              onRemove={() => {
                const usedBy = fieldUsages?.get(`${group.name}.${field.name}`);
                if (usedBy != null) {
                  setBlocked(`No puedes quitar "${field.label || field.name}" porque se utiliza en la columna "${usedBy}".`);
                  return;
                }
                setBlocked(null);
                replaceGroup({ fields: orderedFields(group.fields.filter((_, current) => current !== index)) });
              }}
            />
          ))}
        </ul>
      </section>

      {!required && (
        <div className="flex justify-end">
          <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={() => onChange([])}>
            <Trash2 /> Quitar productos por renglón
          </Button>
        </div>
      )}
    </div>
  );
}

function GroupFieldCard({
  field,
  index,
  total,
  disabled,
  onChange,
  onRelabel,
  onMove,
  onRemove,
}: {
  field: ReportParameterGroupField;
  index: number;
  total: number;
  disabled: boolean;
  onChange: (field: ReportParameterGroupField) => void;
  onRelabel: (label: string) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const shape = groupFieldShapeOf(field);
  const product = shape?.kind === "product";
  const title = field.label.trim() || `Dato ${index + 1}`;
  const constraints = (shape?.kind === "number" ? field.configuration_json ?? {} : {}) as ReportNumericConfiguration;
  const summary = shape?.kind === "number" ? limitsSummary(constraints) : null;

  function setConstraints(patch: Partial<ReportNumericConfiguration>) {
    onChange({ ...field, configuration_json: { ...constraints, ...patch } });
  }

  return (
    <li role="group" aria-label={title} className="rounded-xl border p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-medium">
          {product && <Package className="h-4 w-4 text-muted-foreground" />}
          {title}
          {product && field.required && <Badge variant="secondary">Obligatorio</Badge>}
        </p>
        <div className="flex gap-2">
          <Button type="button" size="icon-sm" variant="outline" aria-label={`Mover ${title} arriba`} disabled={disabled || index === 0} onClick={() => onMove(-1)}><ArrowUp /></Button>
          <Button type="button" size="icon-sm" variant="outline" aria-label={`Mover ${title} abajo`} disabled={disabled || index === total - 1} onClick={() => onMove(1)}><ArrowDown /></Button>
          {/* The backend requires exactly one product per row, so it is never offered for removal. */}
          {!product && <Button type="button" size="icon-sm" variant="destructive" aria-label={`Quitar ${title}`} disabled={disabled} onClick={onRemove}><Trash2 /></Button>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`group-field-label-${index}`}>Nombre visible</Label>
          <Input id={`group-field-label-${index}`} value={field.label} disabled={disabled} onChange={(event) => onRelabel(event.target.value)} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={`group-field-type-${index}`}>Tipo</Label>
          {shape && !product ? (
            <select
              id={`group-field-type-${index}`}
              className={CONTROL_CLASS}
              value={shape.kind}
              disabled={disabled}
              onChange={(event) => onChange(withGroupFieldShape(field, event.target.value as "text" | "number"))}
            >
              <option value="text">Texto</option>
              <option value="number">Número</option>
            </select>
          ) : (
            <select id={`group-field-type-${index}`} className={CONTROL_CLASS} value="fixed" disabled>
              <option value="fixed">{product ? "Producto de la lista" : LEGACY_PARAMETER_KIND_LABEL}</option>
            </select>
          )}
          {product && <p className="text-xs text-muted-foreground">El usuario elige entre los productos de la lista seleccionada.</p>}
          {!shape && <p className="text-xs text-muted-foreground">Este dato usa una configuración anterior y se conserva tal como está.</p>}
        </div>

        {shape?.kind === "text" && (
          <div className="grid gap-1.5">
            <Label htmlFor={`group-field-default-${index}`}>Valor predeterminado</Label>
            <Input id={`group-field-default-${index}`} value={field.default_value == null ? "" : String(field.default_value)} disabled={disabled} onChange={(event) => onChange({ ...field, default_value: event.target.value === "" ? null : event.target.value })} />
          </div>
        )}
        {shape?.kind === "number" && (
          <div className="grid gap-1.5">
            <Label htmlFor={`group-field-default-${index}`}>Valor predeterminado</Label>
            <Input id={`group-field-default-${index}`} type="number" step={shape.decimals ? "any" : 1} value={field.default_value == null ? "" : String(field.default_value)} disabled={disabled} onChange={(event) => onChange({ ...field, default_value: event.target.value === "" ? null : event.target.value })} />
          </div>
        )}

        <div className="flex flex-col justify-end gap-2 pb-2 text-sm">
          {shape?.kind === "number" && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={shape.decimals} disabled={disabled} onChange={(event) => onChange(withGroupFieldShape(field, "number", event.target.checked))} />
              Permitir decimales
            </label>
          )}
          {/* A product is always asked for; a legacy optional one keeps its checkbox. */}
          {!(product && field.required) && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={field.required} disabled={disabled} onChange={(event) => onChange({ ...field, required: event.target.checked })} />
              Obligatorio
            </label>
          )}
        </div>
      </div>

      {shape?.kind === "number" && (
        <details className="mt-4 rounded-lg border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            Límites{summary && <span className="font-normal text-muted-foreground"> · {summary}</span>}
          </summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`group-field-min-${index}`}>Valor mínimo</Label>
              <Input id={`group-field-min-${index}`} type="number" step={shape.decimals ? "any" : 1} value={constraints.minimum ?? ""} disabled={disabled} onChange={(event) => setConstraints({ minimum: event.target.value || undefined })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`group-field-max-${index}`}>Valor máximo</Label>
              <Input id={`group-field-max-${index}`} type="number" step={shape.decimals ? "any" : 1} value={constraints.maximum ?? ""} disabled={disabled} onChange={(event) => setConstraints({ maximum: event.target.value || undefined })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={constraints.exclusive_minimum ?? false} disabled={disabled} onChange={(event) => setConstraints({ exclusive_minimum: event.target.checked })} />
              El valor debe ser mayor que el mínimo
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={constraints.exclusive_maximum ?? false} disabled={disabled} onChange={(event) => setConstraints({ exclusive_maximum: event.target.checked })} />
              El valor debe ser menor que el máximo
            </label>
          </div>
        </details>
      )}
    </li>
  );
}
