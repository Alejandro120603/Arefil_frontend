/**
 * Pure state/validation helpers for the Report Builder (Backend #12/#13).
 *
 * Everything here mirrors rules the backend already enforces
 * (`app/services/reports/builder.py`). The duplication buys immediate feedback
 * while editing — it is *not* a security boundary. The backend stays the only
 * authority on field allow-listing, formula parsing and cycle detection, and
 * its message is what the UI shows when a save is refused.
 */
import type {
  ReportBuilderDefinition,
  ReportBuilderWriteRequest,
  ReportColumn,
  ReportColumnType,
  ReportExcelLayout,
  ReportExcelLayoutResponse,
  ReportFieldDescriptor,
  ReportFormatType,
  ReportParameter,
  ReportParameterGroup,
  ReportParameterGroupField,
  ReportParameterDataType,
  ReportSummaryConfiguration,
  ReportTotalConfiguration,
} from "@/types/api";

export const COLUMN_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Backend caps: `width` 1..255, `header_row` 1..100, `sheet_name` <= 31 chars. */
export const MIN_COLUMN_WIDTH = 1;
export const MAX_COLUMN_WIDTH = 255;
export const MIN_HEADER_ROW = 1;
export const MAX_HEADER_ROW = 100;
export const MAX_SHEET_NAME_LENGTH = 31;
export const MAX_FORMULA_LENGTH = 512;

/** Excel forbids these in a sheet name, and so does `ReportExcelLayoutWrite`. */
const FORBIDDEN_SHEET_CHARACTERS = /[[\]:*?/\\]/;

/**
 * How each column kind is named in the UI. The kind is fixed by the action that
 * created the column ("Agregar dato de la fuente", "Agregar dato capturado",
 * "Agregar cálculo") and is never re-chosen afterwards.
 */
export const COLUMN_TYPE_LABELS: Record<ReportColumnType, string> = {
  FIELD: "Dato de la fuente",
  PARAMETER: "Dato capturado",
  FORMULA: "Cálculo",
};

export const FORMAT_TYPE_LABELS: Record<ReportFormatType, string> = {
  text: "Texto",
  number: "Número",
  currency: "Moneda",
  percent: "Porcentaje",
  date: "Fecha",
  datetime: "Fecha y hora",
};

export const NUMERIC_DATA_TYPES: ReportParameterDataType[] = ["integer", "decimal"];

export function isNumericDataType(dataType: ReportParameterDataType): boolean {
  return NUMERIC_DATA_TYPES.includes(dataType);
}

/**
 * Which formats the backend accepts for a given data type. `_validate_format`
 * rejects a numeric format on a non-numeric column, and pins `date`/`datetime`
 * to their own data type; `text` is always allowed, as is "sin formato" (null).
 */
export function formatsForDataType(dataType: ReportParameterDataType): ReportFormatType[] {
  if (isNumericDataType(dataType)) return ["text", "number", "currency", "percent"];
  if (dataType === "date") return ["text", "date"];
  if (dataType === "datetime") return ["text", "datetime"];
  return ["text"];
}

export interface ReportBuilderFormValue {
  columns: ReportColumn[];
  parameterGroups: ReportParameterGroup[];
  layout: ReportExcelLayout;
}

export function emptyExcelLayout(): ReportExcelLayout {
  return {
    sheet_name: "Data",
    title: null,
    show_report_name: true,
    show_generated_at: true,
    show_parameters: true,
    freeze_header: true,
    header_row: 1,
    totals: [],
  };
}

/** A report with no builder yet answers `excel_layout: null` — start from defaults. */
export function builderFormFromDefinition(builder: ReportBuilderDefinition): ReportBuilderFormValue {
  return {
    columns: orderedColumns(builder.columns).map((column) => ({ ...column })),
    parameterGroups: builder.parameter_groups.map((group) => ({
      ...group,
      fields: group.fields.map((field) => ({ ...field, configuration_json: field.configuration_json ? { ...field.configuration_json } : null })),
    })),
    layout: builder.excel_layout
      ? normalizeLayout(builder.excel_layout, builder.columns)
      : emptyExcelLayout(),
  };
}

export interface GroupParameterReference {
  source: string;
  key: string;
  label: string;
  field: ReportParameterGroupField;
}

export function groupParameterReferences(groups: ReportParameterGroup[]): GroupParameterReference[] {
  return groups.flatMap((group) => group.fields.map((field) => ({
    source: `${group.name}.${field.name}`,
    key: field.name,
    label: `${group.label} → ${field.label}`,
    field,
  })));
}

export function orderedColumns(columns: ReportColumn[]): ReportColumn[] {
  return columns
    .map((column, index) => ({ column, index }))
    .sort((left, right) => left.column.display_order - right.column.display_order || left.index - right.index)
    .map(({ column }) => column);
}

/**
 * `display_order` is derived from array position on every mutation, so the
 * list the admin sees and the order the backend persists can never drift.
 */
export function withDisplayOrder(columns: ReportColumn[]): ReportColumn[] {
  return columns.map((column, display_order) => ({ ...column, display_order }));
}

export function moveColumn(columns: ReportColumn[], index: number, direction: -1 | 1): ReportColumn[] {
  const destination = index + direction;
  if (destination < 0 || destination >= columns.length) return columns;
  const next = [...columns];
  [next[index], next[destination]] = [next[destination], next[index]];
  return withDisplayOrder(next);
}

export function removeColumn(columns: ReportColumn[], index: number): ReportColumn[] {
  return withDisplayOrder(columns.filter((_, current) => current !== index));
}

/**
 * Upgrades the pre-#20 totals row into summaries. A legacy total is a SUM whose
 * key *is* the column key, so an old report keeps rendering the same number
 * under the same label without the admin re-declaring anything.
 */
export function normalizeSummaries(
  totals: ReportTotalConfiguration[],
  columns: ReportColumn[],
): ReportSummaryConfiguration[] {
  const columnsByKey = new Map(columns.map((column) => [column.key, column]));
  return totals.map((total) => {
    if (isSummaryConfiguration(total)) {
      return {
        ...total,
        column_key: total.operation === "SUM" ? total.column_key : null,
        formula_definition: total.operation === "FORMULA" ? total.formula_definition : null,
      };
    }
    const column = columnsByKey.get(total.column_key);
    return {
      key: total.column_key,
      label: column?.label || total.column_key,
      column_key: total.column_key,
      operation: "SUM" as const,
      formula_definition: null,
      format_type: column?.format_type ?? null,
    };
  });
}

export function isSummaryConfiguration(
  total: ReportTotalConfiguration,
): total is ReportSummaryConfiguration {
  return "key" in total;
}

export function normalizeLayout(
  layout: ReportExcelLayoutResponse,
  columns: ReportColumn[],
): ReportExcelLayout {
  return { ...layout, totals: normalizeSummaries(layout.totals, columns) };
}

/** A SUM the backend would refuse: only visible numeric columns can be folded. */
export function summableColumns(columns: ReportColumn[]): ReportColumn[] {
  return columns.filter((column) => column.visible && isNumericDataType(column.data_type));
}

/**
 * Dropping a column must also drop any SUM that pointed at it, otherwise the
 * save fails on a summary the admin can no longer see to fix. FORMULA
 * summaries read parameters and other summaries, so columns never orphan them.
 */
export function pruneTotals(layout: ReportExcelLayout, columns: ReportColumn[]): ReportExcelLayout {
  const summable = new Set(summableColumns(columns).map((column) => column.key));
  const totals = layout.totals.filter(
    (total) => total.operation !== "SUM" || summable.has(total.column_key ?? ""),
  );
  return totals.length === layout.totals.length ? layout : { ...layout, totals };
}

/**
 * Keys are generated once, when the summary is created, and never edited from
 * the UI. `reserved` carries the report's parameter names: the backend refuses
 * a summary key that collides with one, and the admin could not fix it.
 */
function takenSummaryKeys(totals: ReportSummaryConfiguration[], reserved: Iterable<string>): Set<string> {
  return foldedKeys([...totals.map((total) => total.key), ...reserved]);
}

export function newSumSummary(
  column: ReportColumn,
  totals: ReportSummaryConfiguration[],
  reserved: Iterable<string> = [],
): ReportSummaryConfiguration {
  return {
    key: uniqueKey(column.key, takenSummaryKeys(totals, reserved)),
    label: column.label || column.key,
    column_key: column.key,
    operation: "SUM",
    formula_definition: null,
    format_type: column.format_type ?? "number",
  };
}

export function newFormulaSummary(
  totals: ReportSummaryConfiguration[],
  reserved: Iterable<string> = [],
): ReportSummaryConfiguration {
  return {
    key: uniqueKey("resumen", takenSummaryKeys(totals, reserved)),
    label: "Resumen calculado",
    column_key: null,
    operation: "FORMULA",
    formula_definition: "",
    format_type: "number",
  };
}

export function moveSummary(
  totals: ReportSummaryConfiguration[],
  index: number,
  direction: -1 | 1,
): ReportSummaryConfiguration[] {
  const destination = index + direction;
  if (destination < 0 || destination >= totals.length) return totals;
  const next = [...totals];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}

/**
 * What a summary formula may legally reference: the other summaries and the
 * report's numeric scalar parameters. Row values are gone by then — a summary
 * runs once over the whole report, which is why IVA reads `tax_rate`, never a
 * per-row column.
 */
export function allowedSummaryReferences(
  totals: ReportSummaryConfiguration[],
  parameters: ReportParameter[],
  currentKey?: string,
): FormulaReferenceOption[] {
  const references: FormulaReferenceOption[] = totals
    .filter((total) => total.key !== currentKey && COLUMN_KEY_PATTERN.test(total.key))
    .map((total) => ({ name: total.key, label: total.label || total.key, origin: "column" as const }));
  const taken = new Set(references.map((reference) => reference.name));
  for (const parameter of parameters) {
    if (!isNumericDataType(parameter.data_type) || taken.has(parameter.name)) continue;
    references.push({ name: parameter.name, label: parameter.label, origin: "parameter" });
  }
  return references;
}

function uniqueKey(candidate: string, taken: Set<string>): string {
  const base = COLUMN_KEY_PATTERN.test(candidate) ? candidate : `columna`;
  if (!taken.has(base.toLocaleLowerCase())) return base;
  for (let suffix = 2; ; suffix += 1) {
    const next = `${base}_${suffix}`;
    if (!taken.has(next.toLocaleLowerCase())) return next;
  }
}

function foldedKeys(keys: Iterable<string>): Set<string> {
  return new Set([...keys].map((key) => key.toLocaleLowerCase()));
}

/**
 * Column keys are generated once, when the column is created, and then frozen:
 * templates (`{{rows.<key>}}`), formulas and summaries may point at them.
 * `reserved` carries the report's parameter names, which the backend keeps for
 * their own PARAMETER column — a hidden key must never collide with one.
 */
function takenKeys(columns: ReportColumn[], reserved: Iterable<string> = []): Set<string> {
  return foldedKeys([...columns.map((column) => column.key), ...reserved]);
}

/** `price_list_item.unit_price` → `unit_price`, the readable half of the key. */
export function suggestedKeyFromField(fieldKey: string): string {
  const tail = fieldKey.split(".").pop() ?? fieldKey;
  return COLUMN_KEY_PATTERN.test(tail) ? tail : "campo";
}

export function newFieldColumn(
  descriptor: ReportFieldDescriptor,
  columns: ReportColumn[],
  reserved: Iterable<string> = [],
): ReportColumn {
  const [format] = formatsForDataType(descriptor.data_type);
  return {
    key: uniqueKey(suggestedKeyFromField(descriptor.key), takenKeys(columns, reserved)),
    label: descriptor.label,
    column_type: "FIELD",
    source_field: descriptor.key,
    source_parameter: null,
    formula_definition: null,
    data_type: descriptor.data_type,
    format_type: isNumericDataType(descriptor.data_type) ? "number" : format,
    display_order: columns.length,
    visible: true,
    width: null,
  };
}

/**
 * A PARAMETER column reuses the parameter's own name as its key: the backend
 * rejects any other key that collides with a parameter, and reusing it is what
 * lets a formula write `quantity` and mean both.
 */
export function newParameterColumn(parameter: ReportParameter, columns: ReportColumn[]): ReportColumn {
  return {
    key: parameter.name,
    label: parameter.label || parameter.name,
    column_type: "PARAMETER",
    source_field: null,
    source_parameter: parameter.name,
    formula_definition: null,
    data_type: parameter.data_type,
    format_type: isNumericDataType(parameter.data_type) ? "number" : formatsForDataType(parameter.data_type)[0],
    display_order: columns.length,
    visible: true,
    width: null,
  };
}

export function newGroupParameterColumn(
  reference: GroupParameterReference,
  columns: ReportColumn[],
  reserved: Iterable<string> = [],
): ReportColumn {
  const dataType = reference.field.data_type;
  return {
    key: uniqueKey(reference.key, takenKeys(columns, reserved)),
    label: reference.field.label || reference.key,
    column_type: "PARAMETER",
    source_field: null,
    source_parameter: reference.source,
    formula_definition: null,
    data_type: dataType,
    format_type: isNumericDataType(dataType) ? "number" : formatsForDataType(dataType)[0],
    display_order: columns.length,
    visible: true,
    width: null,
  };
}

/** Formula columns are always decimal — the backend refuses any other type. */
export function newFormulaColumn(columns: ReportColumn[], reserved: Iterable<string> = []): ReportColumn {
  return {
    key: uniqueKey("calculo", takenKeys(columns, reserved)),
    label: "Columna calculada",
    column_type: "FORMULA",
    source_field: null,
    source_parameter: null,
    formula_definition: "",
    data_type: "decimal",
    format_type: "number",
    display_order: columns.length,
    visible: true,
    width: null,
  };
}

/**
 * Re-points a FIELD column and re-syncs the data type the backend compares.
 * The key is kept: it is the column's identity, not a mirror of its source.
 */
export function applyFieldSource(column: ReportColumn, descriptor: ReportFieldDescriptor): ReportColumn {
  return {
    ...column,
    column_type: "FIELD",
    source_field: descriptor.key,
    source_parameter: null,
    formula_definition: null,
    data_type: descriptor.data_type,
    format_type: compatibleFormat(column.format_type, descriptor.data_type),
  };
}

/**
 * The one case where a column's key follows its source: the backend requires a
 * scalar PARAMETER column to be keyed by the parameter's own name.
 */
export function applyParameterSource(column: ReportColumn, parameter: ReportParameter): ReportColumn {
  return {
    ...column,
    column_type: "PARAMETER",
    key: parameter.name,
    source_field: null,
    source_parameter: parameter.name,
    formula_definition: null,
    data_type: parameter.data_type,
    format_type: compatibleFormat(column.format_type, parameter.data_type),
  };
}

/**
 * Keeps the column's key, unless it was bound to a scalar parameter: that key
 * *is* the parameter's name, which only its own PARAMETER column may use.
 */
export function applyGroupParameterSource(
  column: ReportColumn,
  reference: GroupParameterReference,
  columns: ReportColumn[],
  reserved: Iterable<string> = [],
): ReportColumn {
  const others = columns.filter((candidate) => candidate !== column);
  const boundToScalar = column.column_type === "PARAMETER" && column.source_parameter === column.key;
  return {
    ...column,
    key: boundToScalar ? uniqueKey(reference.key, takenKeys(others, reserved)) : column.key,
    column_type: "PARAMETER",
    source_field: null,
    source_parameter: reference.source,
    formula_definition: null,
    data_type: reference.field.data_type,
    format_type: compatibleFormat(column.format_type, reference.field.data_type),
  };
}

function compatibleFormat(
  format: ReportFormatType | null,
  dataType: ReportParameterDataType,
): ReportFormatType | null {
  if (format == null) return null;
  return formatsForDataType(dataType).includes(format) ? format : formatsForDataType(dataType)[0];
}

/**
 * Identifiers a formula refers to, excluding function calls (`ROUND(...)`).
 * Mirrors the backend tokenizer closely enough to flag an unknown reference
 * before the round trip; the backend still parses the expression itself.
 */
export function formulaReferences(expression: string): string[] {
  const references: string[] = [];
  const pattern = /[A-Za-z][A-Za-z0-9_]*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(expression)) !== null) {
    const rest = expression.slice(match.index + match[0].length);
    if (/^\s*\(/.test(rest)) continue;
    if (!references.includes(match[0])) references.push(match[0]);
  }
  return references;
}

/** Every reference a formula may legally use: numeric columns + numeric parameters. */
export interface FormulaReferenceOption {
  name: string;
  label: string;
  origin: "column" | "parameter";
}

export function allowedFormulaReferences(
  columns: ReportColumn[],
  parameters: ReportParameter[],
  currentKey?: string,
): FormulaReferenceOption[] {
  const references: FormulaReferenceOption[] = columns
    .filter((column) => column.key !== currentKey && isNumericDataType(column.data_type) && COLUMN_KEY_PATTERN.test(column.key))
    .map((column) => ({ name: column.key, label: column.label, origin: "column" as const }));
  const columnKeys = new Set(references.map((reference) => reference.name));
  for (const parameter of parameters) {
    if (!isNumericDataType(parameter.data_type) || columnKeys.has(parameter.name)) continue;
    references.push({ name: parameter.name, label: parameter.label, origin: "parameter" });
  }
  return references;
}

export function validateBuilderForm(
  value: ReportBuilderFormValue,
  parameters: ReportParameter[],
  fields: ReportFieldDescriptor[],
): string[] {
  const errors: string[] = [];
  const { columns, layout, parameterGroups } = value;

  if (columns.length === 0) errors.push("Agrega al menos una columna al reporte.");
  if (parameterGroups.length > 1) errors.push("Esta versión admite un solo grupo repetible por reporte.");

  errors.push(...validateParameterGroups(parameterGroups, parameters));

  const fieldKeys = new Set(fields.map((field) => field.key));
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const parametersByName = new Map(parameters.map((parameter) => [parameter.name, parameter]));
  const groupedParametersByName = new Map(
    groupParameterReferences(parameterGroups).map((reference) => [reference.source, reference.field]),
  );
  const seenKeys = new Set<string>();
  const columnsByKey = new Map<string, ReportColumn>();

  for (const [index, column] of columns.entries()) {
    const position = index + 1;
    const name = column.key || `columna ${position}`;

    if (!COLUMN_KEY_PATTERN.test(column.key)) {
      errors.push(`El nombre interno de la columna ${position} debe iniciar con letra y usar solo letras, números o _.`);
    }
    const folded = column.key.toLocaleLowerCase();
    if (folded && seenKeys.has(folded)) errors.push(`La columna '${column.key}' está duplicada.`);
    seenKeys.add(folded);
    if (!column.label.trim()) errors.push(`La columna '${name}' requiere una etiqueta.`);
    if (column.width != null && (!Number.isInteger(column.width) || column.width < MIN_COLUMN_WIDTH || column.width > MAX_COLUMN_WIDTH)) {
      errors.push(`El ancho de '${name}' debe ser un entero entre ${MIN_COLUMN_WIDTH} y ${MAX_COLUMN_WIDTH}.`);
    }
    if (column.format_type != null && !formatsForDataType(column.data_type).includes(column.format_type)) {
      errors.push(`El formato '${column.format_type}' no es compatible con el tipo de '${name}'.`);
    }

    if (column.column_type === "FIELD") {
      if (!column.source_field) {
        errors.push(`La columna '${name}' requiere un campo del catálogo.`);
      } else if (fields.length > 0 && !fieldKeys.has(column.source_field)) {
        errors.push(`El campo '${column.source_field}' no pertenece al catálogo permitido.`);
      } else {
        const descriptor = fieldsByKey.get(column.source_field);
        if (descriptor && descriptor.data_type !== column.data_type) {
          errors.push(`El tipo de '${name}' no coincide con el campo '${descriptor.key}'.`);
        }
      }
    } else if (column.column_type === "PARAMETER") {
      const parameter = column.source_parameter
        ? parametersByName.get(column.source_parameter) ?? groupedParametersByName.get(column.source_parameter)
        : undefined;
      if (!column.source_parameter) {
        errors.push(`La columna '${name}' requiere un parámetro del reporte.`);
      } else if (!parameter) {
        errors.push(`El parámetro '${column.source_parameter}' no existe en el reporte.`);
      } else if (parameter.data_type !== column.data_type) {
        errors.push(`El tipo de '${name}' no coincide con el parámetro '${parameter.name}'.`);
      }
    } else {
      const formula = (column.formula_definition ?? "").trim();
      if (!formula) {
        errors.push(`La columna calculada '${name}' requiere una fórmula.`);
      } else if (formula.length > MAX_FORMULA_LENGTH) {
        errors.push(`La fórmula de '${name}' excede ${MAX_FORMULA_LENGTH} caracteres.`);
      }
      if (column.data_type !== "decimal") {
        errors.push(`La columna calculada '${name}' debe declarar tipo decimal.`);
      }
    }

    // The backend reserves a parameter's name for its own PARAMETER column.
    if (
      parametersByName.has(column.key) &&
      !(column.column_type === "PARAMETER" && column.source_parameter === column.key)
    ) {
      errors.push(`La columna '${column.key}' entra en conflicto con un parámetro del reporte.`);
    }

    if (column.key) columnsByKey.set(column.key, column);
  }

  for (const column of columns) {
    if (column.column_type !== "FORMULA") continue;
    const name = column.key || column.label;
    for (const reference of formulaReferences(column.formula_definition ?? "")) {
      const referencedColumn = columnsByKey.get(reference);
      const referencedParameter = parametersByName.get(reference);
      if (!referencedColumn && !referencedParameter) {
        errors.push(`La fórmula de '${name}' referencia '${reference}', que no existe.`);
        continue;
      }
      const dataType = referencedColumn ? referencedColumn.data_type : referencedParameter!.data_type;
      if (!isNumericDataType(dataType)) {
        errors.push(`La fórmula de '${name}' referencia '${reference}', que no es numérico.`);
      }
      if (reference === column.key) {
        errors.push(`La fórmula de '${name}' no puede referenciarse a sí misma.`);
      }
    }
  }

  const sheetName = layout.sheet_name.trim();
  if (!sheetName) {
    errors.push("El nombre de la hoja es requerido.");
  } else if (FORBIDDEN_SHEET_CHARACTERS.test(sheetName)) {
    errors.push("El nombre de la hoja contiene caracteres no permitidos ( [ ] : * ? / \\ ).");
  } else if (sheetName.length > MAX_SHEET_NAME_LENGTH) {
    errors.push(`El nombre de la hoja no puede exceder ${MAX_SHEET_NAME_LENGTH} caracteres.`);
  }
  if (!Number.isInteger(layout.header_row) || layout.header_row < MIN_HEADER_ROW || layout.header_row > MAX_HEADER_ROW) {
    errors.push(`La fila de encabezado debe ser un entero entre ${MIN_HEADER_ROW} y ${MAX_HEADER_ROW}.`);
  }

  errors.push(...validateSummaries(layout.totals, columnsByKey, parametersByName));

  return errors;
}

/**
 * The repeatable-row half of `validateBuilderForm`, also run on its own by
 * "Fuente y entradas" (Frontend #41B), where the groups are saved without
 * touching columns or layout.
 */
export function validateParameterGroups(
  parameterGroups: ReportParameterGroup[],
  parameters: ReportParameter[],
): string[] {
  const errors: string[] = [];
  // Repeatable rows speak business language: internal names are hidden, so a
  // message names what the admin sees (the visible names) whenever it can.
  for (const group of parameterGroups) {
    const groupName = group.label.trim() || "Productos por renglón";
    if (!group.label.trim()) errors.push("Los productos por renglón requieren un nombre visible.");
    else if (!COLUMN_KEY_PATTERN.test(group.name)) errors.push(`El grupo '${groupName}' tiene un identificador interno no válido.`);
    if (parameters.some((parameter) => parameter.name.toLocaleLowerCase() === group.name.toLocaleLowerCase())) {
      errors.push(`El grupo '${groupName}' usa el mismo identificador que un dato del reporte; cámbiale el nombre visible.`);
    }
    const context = parameters.find((parameter) => parameter.name === group.context_parameter);
    if (!context) errors.push("Para usar productos por renglón, la fuente necesita una lista de precios.");
    else if (context.data_type !== "integer") errors.push(`'${context.label || context.name}' no puede usarse como lista de precios para los productos.`);
    if (!Number.isInteger(group.min_items) || group.min_items < 0) errors.push("El mínimo de renglones debe ser un entero mayor o igual que cero.");
    if (group.max_items != null && (!Number.isInteger(group.max_items) || group.max_items < 1)) {
      errors.push("El máximo de renglones debe ser un entero mayor o igual que uno.");
    } else if (group.max_items != null && group.max_items < group.min_items) {
      errors.push("El máximo de renglones debe ser mayor o igual que el mínimo.");
    }
    if (group.fields.length === 0) errors.push(`El grupo '${groupName}' requiere al menos un dato por renglón.`);
    const fieldNames = new Set<string>();
    let productSelects = 0;
    for (const [index, field] of group.fields.entries()) {
      const fieldName = field.label.trim() || `dato ${index + 1}`;
      if (!field.label.trim()) errors.push(`El dato ${index + 1} de cada renglón requiere un nombre visible.`);
      else if (!COLUMN_KEY_PATTERN.test(field.name)) errors.push(`El dato '${fieldName}' tiene un identificador interno no válido.`);
      const folded = field.name.toLocaleLowerCase();
      if (folded && fieldNames.has(folded)) errors.push(`El dato '${fieldName}' está duplicado.`);
      fieldNames.add(folded);
      const configuration = field.configuration_json ?? {};
      if (field.input_type === "select") {
        productSelects += 1;
        if (
          !("options_source" in configuration) || configuration.options_source !== "products_by_price_list"
          || !("context_parameter" in configuration) || configuration.context_parameter !== group.context_parameter
          || field.data_type !== "integer"
        ) {
          errors.push(`'${fieldName}' debe elegirse entre los productos de la lista de precios.`);
        }
      } else if ((field.data_type === "integer" || field.data_type === "decimal") && !("options_source" in configuration)) {
        const minimum = configuration.minimum == null ? null : Number(configuration.minimum);
        const maximum = configuration.maximum == null ? null : Number(configuration.maximum);
        if (minimum != null && !Number.isFinite(minimum)) errors.push(`El valor mínimo de '${fieldName}' no es válido.`);
        if (maximum != null && !Number.isFinite(maximum)) errors.push(`El valor máximo de '${fieldName}' no es válido.`);
        if (field.data_type === "integer" && [minimum, maximum].some((bound) => bound != null && Number.isFinite(bound) && !Number.isInteger(bound))) {
          errors.push(`Los límites de '${fieldName}' deben ser enteros, o permite decimales.`);
        }
        if (minimum != null && maximum != null && minimum > maximum) errors.push(`El valor mínimo de '${fieldName}' no puede superar su máximo.`);
      }
    }
    if (productSelects !== 1) errors.push(`El grupo '${groupName}' requiere exactamente un dato de tipo Producto.`);
  }
  return errors;
}

/**
 * Mirrors `_validate_layout`: keys are identifiers, unique, never a parameter
 * name; SUM points at a visible numeric column; FORMULA references only other
 * summaries and numeric parameters, without cycles.
 */
function validateSummaries(
  totals: ReportSummaryConfiguration[],
  columnsByKey: Map<string, ReportColumn>,
  parametersByName: Map<string, ReportParameter>,
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const summariesByKey = new Map<string, ReportSummaryConfiguration>();

  for (const [index, total] of totals.entries()) {
    const name = total.key || `resumen ${index + 1}`;
    if (!COLUMN_KEY_PATTERN.test(total.key)) {
      errors.push(`El nombre interno del resumen '${name}' debe iniciar con letra y usar solo letras, números o _.`);
    }
    const folded = total.key.toLocaleLowerCase();
    if (folded && seen.has(folded)) errors.push(`El resumen '${total.key}' está duplicado.`);
    seen.add(folded);
    if (!total.label.trim()) errors.push(`El resumen '${name}' requiere una etiqueta.`);
    if (parametersByName.has(total.key)) {
      errors.push(`El resumen '${total.key}' entra en conflicto con un parámetro del reporte.`);
    }

    if (total.operation === "SUM") {
      const column = total.column_key ? columnsByKey.get(total.column_key) : undefined;
      if (!total.column_key) {
        errors.push(`El resumen '${name}' requiere una columna a sumar.`);
      } else if (!column) {
        errors.push(`El resumen '${name}' referencia la columna inexistente '${total.column_key}'.`);
      } else if (!isNumericDataType(column.data_type)) {
        errors.push(`SUM solo puede aplicarse a una columna numérica ('${total.column_key}').`);
      } else if (!column.visible) {
        errors.push(`SUM solo puede aplicarse a una columna visible ('${total.column_key}').`);
      }
    } else {
      const formula = (total.formula_definition ?? "").trim();
      if (!formula) errors.push(`El resumen '${name}' requiere una fórmula.`);
      else if (formula.length > MAX_FORMULA_LENGTH) {
        errors.push(`La fórmula del resumen '${name}' excede ${MAX_FORMULA_LENGTH} caracteres.`);
      }
    }
    if (total.key) summariesByKey.set(total.key, total);
  }

  const dependencies = new Map<string, string[]>();
  for (const total of totals) {
    if (total.operation !== "FORMULA" || !total.key) continue;
    const references: string[] = [];
    for (const reference of formulaReferences(total.formula_definition ?? "")) {
      if (summariesByKey.has(reference)) {
        references.push(reference);
        if (reference === total.key) errors.push(`La fórmula del resumen '${total.key}' no puede referenciarse a sí misma.`);
        continue;
      }
      const parameter = parametersByName.get(reference);
      if (!parameter) {
        errors.push(`El resumen '${total.key}' referencia '${reference}', que no existe.`);
      } else if (!isNumericDataType(parameter.data_type)) {
        errors.push(`El resumen '${total.key}' referencia '${reference}', que no es numérico.`);
      }
    }
    dependencies.set(total.key, references);
  }

  if (hasSummaryCycle(dependencies)) errors.push("Los resúmenes contienen una dependencia cíclica.");
  return errors;
}

function hasSummaryCycle(dependencies: Map<string, string[]>): boolean {
  const state = new Map<string, 1 | 2>();
  const visit = (key: string): boolean => {
    const current = state.get(key);
    if (current === 1) return true;
    if (current === 2) return false;
    state.set(key, 1);
    for (const dependency of dependencies.get(key) ?? []) {
      if (visit(dependency)) return true;
    }
    state.set(key, 2);
    return false;
  };
  return [...dependencies.keys()].some((key) => visit(key));
}

export function toBuilderRequest(value: ReportBuilderFormValue): ReportBuilderWriteRequest {
  return {
    columns: value.columns.map((column, display_order) => ({
      ...column,
      key: column.key.trim(),
      label: column.label.trim(),
      formula_definition:
        column.column_type === "FORMULA" ? (column.formula_definition ?? "").trim() : null,
      source_field: column.column_type === "FIELD" ? column.source_field : null,
      source_parameter: column.column_type === "PARAMETER" ? column.source_parameter : null,
      display_order,
    })),
    parameter_groups: value.parameterGroups.map((group, display_order) => ({
      ...group,
      name: group.name.trim(),
      label: group.label.trim(),
      display_order,
      fields: group.fields.map((field, fieldOrder) => ({
        ...field,
        name: field.name.trim(),
        label: field.label.trim(),
        display_order: fieldOrder,
      })),
    })),
    excel_layout: {
      ...value.layout,
      sheet_name: value.layout.sheet_name.trim(),
      title: value.layout.title?.trim() || null,
      totals: value.layout.totals.map((total) => ({
        ...total,
        key: total.key.trim(),
        label: total.label.trim(),
        // The backend forbids the unused half of the pair on each operation.
        column_key: total.operation === "SUM" ? total.column_key : null,
        formula_definition:
          total.operation === "FORMULA" ? (total.formula_definition ?? "").trim() : null,
      })),
    },
  };
}

export interface ReportFieldGroup {
  group: string;
  fields: ReportFieldDescriptor[];
}

/** Groups the catalog for display while preserving the backend's own order. */
export function groupFieldCatalog(fields: ReportFieldDescriptor[]): ReportFieldGroup[] {
  const groups: ReportFieldGroup[] = [];
  for (const field of fields) {
    const existing = groups.find((group) => group.group === field.group);
    if (existing) existing.fields.push(field);
    else groups.push({ group: field.group, fields: [field] });
  }
  return groups;
}
