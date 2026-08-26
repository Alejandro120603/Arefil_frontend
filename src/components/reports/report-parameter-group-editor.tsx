"use client";

import { ArrowDown, ArrowUp, ListPlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ReportNumericConfiguration,
  ReportParameter,
  ReportParameterDataType,
  ReportParameterGroup,
  ReportParameterGroupField,
} from "@/types/api";

const CONTROL_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function productField(context: string): ReportParameterGroupField {
  return {
    name: "product_id",
    label: "Producto",
    data_type: "integer",
    input_type: "select",
    required: true,
    default_value: null,
    display_order: 0,
    configuration_json: { options_source: "products_by_price_list", context_parameter: context },
  };
}

function newGroup(parameters: ReportParameter[]): ReportParameterGroup {
  const context = parameters.find((parameter) => parameter.data_type === "integer")?.name ?? "price_list_id";
  return {
    name: "items",
    label: "Productos",
    resolver_key: "products_by_price_list",
    context_parameter: context,
    min_items: 1,
    max_items: null,
    display_order: 0,
    fields: [productField(context)],
  };
}

function newField(type: "number" | "text", order: number): ReportParameterGroupField {
  if (type === "text") {
    return {
      name: `text_${order}`,
      label: "Texto",
      data_type: "string",
      input_type: "text",
      required: false,
      default_value: null,
      display_order: order,
      configuration_json: null,
    };
  }
  return {
    name: `number_${order}`,
    label: "Número",
    data_type: "decimal",
    input_type: "number",
    required: false,
    default_value: null,
    display_order: order,
    configuration_json: {},
  };
}

function orderedFields(fields: ReportParameterGroupField[]): ReportParameterGroupField[] {
  return fields.map((field, display_order) => ({ ...field, display_order }));
}

export function ReportParameterGroupEditor({
  groups,
  parameters,
  disabled = false,
  onChange,
}: {
  groups: ReportParameterGroup[];
  parameters: ReportParameter[];
  disabled?: boolean;
  onChange: (groups: ReportParameterGroup[]) => void;
}) {
  const group = groups[0];
  const contextParameters = parameters.filter((parameter) => parameter.data_type === "integer");

  if (!group) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="mb-3 text-sm text-muted-foreground">Este reporte no tiene entradas repetibles.</p>
        <Button type="button" variant="outline" disabled={disabled || contextParameters.length === 0} onClick={() => onChange([newGroup(parameters)])}>
          <ListPlus /> Agregar grupo repetible
        </Button>
        {contextParameters.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Primero guarda un parámetro integer para usarlo como contexto.</p>
        )}
      </div>
    );
  }

  function replaceGroup(patch: Partial<ReportParameterGroup>) {
    const context = patch.context_parameter ?? group.context_parameter;
    onChange([{
      ...group,
      ...patch,
      fields: group.fields.map((field) => field.input_type === "select"
        ? { ...field, configuration_json: { options_source: "products_by_price_list", context_parameter: context } }
        : field),
    }]);
  }

  function replaceField(index: number, patch: Partial<ReportParameterGroupField>) {
    replaceGroup({ fields: group.fields.map((field, current) => current === index ? { ...field, ...patch } : field) });
  }

  function moveField(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= group.fields.length) return;
    const fields = [...group.fields];
    [fields[index], fields[destination]] = [fields[destination], fields[index]];
    replaceGroup({ fields: orderedFields(fields) });
  }

  function changeNumericType(index: number, dataType: ReportParameterDataType) {
    replaceField(index, { data_type: dataType, input_type: "number" });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="grid gap-1.5"><Label htmlFor="group-label">Etiqueta</Label><Input id="group-label" value={group.label} disabled={disabled} onChange={(event) => replaceGroup({ label: event.target.value })} /></div>
        <div className="grid gap-1.5"><Label htmlFor="group-name">Nombre interno</Label><Input id="group-name" className="font-mono" value={group.name} disabled={disabled} onChange={(event) => replaceGroup({ name: event.target.value })} /></div>
        <div className="grid gap-1.5">
          <Label htmlFor="group-context">Parámetro de contexto</Label>
          <select id="group-context" className={CONTROL_CLASS} value={group.context_parameter} disabled={disabled} onChange={(event) => replaceGroup({ context_parameter: event.target.value })}>
            <option value="">Selecciona un parámetro…</option>
            {contextParameters.map((parameter) => <option key={parameter.name} value={parameter.name}>{parameter.label} · {parameter.name}</option>)}
          </select>
        </div>
        <div className="flex items-end justify-end"><Button type="button" variant="destructive" disabled={disabled} onClick={() => onChange([])}><Trash2 /> Eliminar grupo</Button></div>
        <div className="grid gap-1.5"><Label htmlFor="group-min">Mínimo de renglones</Label><Input id="group-min" type="number" min={0} value={group.min_items} disabled={disabled} onChange={(event) => replaceGroup({ min_items: Number(event.target.value) })} /></div>
        <div className="grid gap-1.5"><Label htmlFor="group-max">Máximo de renglones</Label><Input id="group-max" type="number" min={1} placeholder="Sin límite explícito" value={group.max_items ?? ""} disabled={disabled} onChange={(event) => replaceGroup({ max_items: event.target.value === "" ? null : Number(event.target.value) })} /></div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!group.fields.some((field) => field.input_type === "select") && <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => replaceGroup({ fields: orderedFields([...group.fields, productField(group.context_parameter)]) })}><Plus /> Selector de producto</Button>}
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => replaceGroup({ fields: orderedFields([...group.fields, newField("number", group.fields.length)]) })}><Plus /> Campo numérico</Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => replaceGroup({ fields: orderedFields([...group.fields, newField("text", group.fields.length)]) })}><Plus /> Campo de texto</Button>
      </div>

      <ul className="flex list-none flex-col gap-3 p-0">
        {group.fields.map((field, index) => {
          const numeric = field.input_type === "number";
          const constraints = numeric ? (field.configuration_json ?? {}) as ReportNumericConfiguration : {};
          return (
            <li key={index} className="rounded-xl border p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="font-medium">{field.label || field.name || `Subcampo ${index + 1}`}</p>
                <div className="flex gap-2">
                  <Button type="button" size="icon-sm" variant="outline" aria-label={`Mover ${field.name || index + 1} arriba`} disabled={disabled || index === 0} onClick={() => moveField(index, -1)}><ArrowUp /></Button>
                  <Button type="button" size="icon-sm" variant="outline" aria-label={`Mover ${field.name || index + 1} abajo`} disabled={disabled || index === group.fields.length - 1} onClick={() => moveField(index, 1)}><ArrowDown /></Button>
                  <Button type="button" size="icon-sm" variant="destructive" aria-label={`Eliminar ${field.name || index + 1}`} disabled={disabled} onClick={() => replaceGroup({ fields: orderedFields(group.fields.filter((_, current) => current !== index)) })}><Trash2 /></Button>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="grid gap-1.5"><Label htmlFor={`group-field-label-${index}`}>Etiqueta</Label><Input id={`group-field-label-${index}`} value={field.label} disabled={disabled} onChange={(event) => replaceField(index, { label: event.target.value })} /></div>
                <div className="grid gap-1.5"><Label htmlFor={`group-field-name-${index}`}>Nombre interno</Label><Input id={`group-field-name-${index}`} className="font-mono" value={field.name} disabled={disabled} onChange={(event) => replaceField(index, { name: event.target.value })} /></div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`group-field-type-${index}`}>Tipo</Label>
                  {field.input_type === "select" ? <Input id={`group-field-type-${index}`} value="Producto de la lista" disabled /> : (
                    <select id={`group-field-type-${index}`} className={CONTROL_CLASS} value={numeric ? field.data_type : "string"} disabled={disabled} onChange={(event) => event.target.value === "string" ? replaceField(index, { data_type: "string", input_type: "text", configuration_json: null }) : changeNumericType(index, event.target.value as ReportParameterDataType)}>
                      <option value="string">Texto</option><option value="integer">Entero</option><option value="decimal">Decimal</option>
                    </select>
                  )}
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={field.required} disabled={disabled} onChange={(event) => replaceField(index, { required: event.target.checked })} /> Obligatorio</label>
                {field.input_type !== "select" && <div className="grid gap-1.5"><Label htmlFor={`group-field-default-${index}`}>Valor predeterminado</Label><Input id={`group-field-default-${index}`} type={numeric ? "number" : "text"} value={field.default_value == null ? "" : String(field.default_value)} disabled={disabled} onChange={(event) => replaceField(index, { default_value: event.target.value === "" ? null : event.target.value })} /></div>}
                {numeric && <>
                  <div className="grid gap-1.5"><Label htmlFor={`group-field-min-${index}`}>Mínimo</Label><Input id={`group-field-min-${index}`} type="number" value={constraints.minimum ?? ""} disabled={disabled} onChange={(event) => replaceField(index, { configuration_json: { ...constraints, minimum: event.target.value || undefined } })} /></div>
                  <div className="grid gap-1.5"><Label htmlFor={`group-field-max-${index}`}>Máximo</Label><Input id={`group-field-max-${index}`} type="number" value={constraints.maximum ?? ""} disabled={disabled} onChange={(event) => replaceField(index, { configuration_json: { ...constraints, maximum: event.target.value || undefined } })} /></div>
                  <div className="flex flex-col justify-end gap-2 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={constraints.exclusive_minimum ?? false} disabled={disabled} onChange={(event) => replaceField(index, { configuration_json: { ...constraints, exclusive_minimum: event.target.checked } })} /> Mínimo exclusivo</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={constraints.exclusive_maximum ?? false} disabled={disabled} onChange={(event) => replaceField(index, { configuration_json: { ...constraints, exclusive_maximum: event.target.checked } })} /> Máximo exclusivo</label>
                  </div>
                </>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
