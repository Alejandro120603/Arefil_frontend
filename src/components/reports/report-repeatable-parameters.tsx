"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ReportProductSearch } from "@/components/reports/report-product-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resolveReportProductOption } from "@/lib/api/reports";
import { getUserErrorMessage } from "@/lib/api/errors";
import { formatCurrency } from "@/lib/format/decimal";
import {
  createRuntimeGroupRow,
  estimateLineTotal,
  orderedGroupFields,
  orderedParameterGroups,
  productSearchField,
  QUOTATION_DISCOUNT_FIELD,
  QUOTATION_QUANTITY_FIELD,
  type RuntimeGroupValues,
  type RuntimeParameterValues,
} from "@/lib/reports/report-runtime";
import type {
  ReportNumericConfiguration,
  ReportParameterGroup,
  ReportParameterGroupField,
  ReportProductOption,
} from "@/types/api";

/** Selected product per row, keyed by `${group.name}:${row.id}`. */
type SelectedProducts = Record<string, ReportProductOption>;

function productKey(groupName: string, rowId: string): string {
  return `${groupName}:${rowId}`;
}

function numericConstraints(field: ReportParameterGroupField): ReportNumericConfiguration {
  return field.input_type === "number" ? (field.configuration_json ?? {}) as ReportNumericConfiguration : {};
}

function isPercentField(field: ReportParameterGroupField): boolean {
  const constraints = numericConstraints(field);
  return field.input_type === "number"
    && Number(constraints.minimum) === 0
    && Number(constraints.maximum) === 100;
}

/**
 * Line items as a compact table (Frontend #22).
 *
 * A quotation carries many rows, so each one is a table row rather than a card,
 * and the product cell is a server-side search instead of a `<select>` holding
 * the whole price list. Everything else stays metadata driven: the group's
 * fields decide which columns exist and how each cell validates.
 */
export function ReportRepeatableParameters({
  code,
  groups,
  scalarValues,
  values,
  disabled = false,
  errors = {},
  groupErrors = {},
  onOptionsStateChange,
  onChange,
}: {
  code: string;
  groups: ReportParameterGroup[];
  scalarValues: RuntimeParameterValues;
  values: RuntimeGroupValues;
  disabled?: boolean;
  errors?: Record<string, Record<number, Record<string, string>>>;
  groupErrors?: Record<string, string>;
  onOptionsStateChange?: (state: { loading: boolean; ready: boolean }) => void;
  onChange: (values: RuntimeGroupValues) => void;
}) {
  const [products, setProducts] = useState<SelectedProducts>({});
  const [revalidating, setRevalidating] = useState(false);
  const [revalidationError, setRevalidationError] = useState<string | null>(null);
  const nextRowId = useRef(1_000);
  const orderedGroups = useMemo(() => orderedParameterGroups(groups), [groups]);
  // Read by the revalidation effect, which must never re-run on a row edit.
  // Declared first so it is refreshed before that effect runs in the same commit.
  const latest = useRef({ values, onChange });
  useEffect(() => { latest.current = { values, onChange }; });

  const searchable = useMemo(
    () => orderedGroups
      .map((group) => ({ group, field: productSearchField(group) }))
      .filter((entry): entry is { group: ReportParameterGroup; field: ReportParameterGroupField } => entry.field != null),
    [orderedGroups],
  );
  const contextKey = searchable
    .map(({ group }) => `${group.name}:${String(scalarValues[group.context_parameter] ?? "").trim()}`)
    .join("|");

  /**
   * The price list changed: every already-picked product must be re-resolved
   * against the new list. A product missing from it is dropped, one still in it
   * keeps the line and picks up the new list's price.
   */
  useEffect(() => {
    const pending = searchable.flatMap(({ group, field }) => {
      const context = String(scalarValues[group.context_parameter] ?? "").trim();
      return (latest.current.values[group.name] ?? []).map((row, index) => ({
        group, field, context, row, index,
        productId: Number(row.values[field.name] ?? ""),
      }));
    }).filter(({ context, productId }) => context !== "" && Number.isInteger(productId) && productId > 0);

    if (pending.length === 0) {
      setRevalidationError(null);
      return;
    }
    const controller = new AbortController();
    setRevalidating(true);
    void Promise.all(pending.map(async (entry) => ({
      entry,
      option: await resolveReportProductOption(
        code,
        `${entry.group.name}.${entry.field.name}`,
        { [entry.group.context_parameter]: entry.context },
        entry.productId,
        { signal: controller.signal },
      ),
    }))).then((resolutions) => {
      if (controller.signal.aborted) return;
      setProducts((current) => {
        const next = { ...current };
        for (const { entry, option } of resolutions) {
          const key = productKey(entry.group.name, entry.row.id);
          if (option == null) delete next[key];
          else next[key] = option;
        }
        return next;
      });

      const dropped = resolutions.filter(({ option }) => option == null);
      if (dropped.length > 0) {
        const nextValues = { ...latest.current.values };
        for (const { entry } of dropped) {
          nextValues[entry.group.name] = (nextValues[entry.group.name] ?? []).map((row, index) => index === entry.index
            ? { ...row, values: { ...row.values, [entry.field.name]: "" } }
            : row);
        }
        latest.current.onChange(nextValues);
      }
      setRevalidationError(null);
      setRevalidating(false);
    }).catch((cause) => {
      if (controller.signal.aborted) return;
      setRevalidationError(getUserErrorMessage(cause, "No se pudieron revalidar los productos de la lista."));
      setRevalidating(false);
    });
    return () => {
      controller.abort();
      setRevalidating(false);
    };
    // Row edits carry their own product data; only a context change re-resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, contextKey]);

  const ready = !revalidating && revalidationError == null;
  useEffect(() => onOptionsStateChange?.({ loading: revalidating, ready }), [onOptionsStateChange, ready, revalidating]);

  const replaceCell = useCallback((groupName: string, rowIndex: number, fieldName: string, value: string | boolean) => {
    onChange({
      ...values,
      [groupName]: (values[groupName] ?? []).map((row, index) => index === rowIndex
        ? { ...row, values: { ...row.values, [fieldName]: value } }
        : row),
    });
  }, [onChange, values]);

  return (
    <div className="flex flex-col gap-5">
      {orderedGroups.map((group) => {
        const rows = values[group.name] ?? [];
        const fields = orderedGroupFields(group.fields);
        const product = productSearchField(group);
        const editableFields = fields.filter((field) => field !== product);
        const context = String(scalarValues[group.context_parameter] ?? "").trim();
        const atMaximum = group.max_items != null && rows.length >= group.max_items;
        const columnCount = 2 + (product ? 4 : 0) + editableFields.length;
        return (
          <section key={group.name} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-medium">{group.label}</h3>
                <p className="text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? "renglón" : "renglones"}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || atMaximum || (product != null && context === "")}
                onClick={() => onChange({
                  ...values,
                  [group.name]: [...rows, createRuntimeGroupRow(group, `${group.name}-${nextRowId.current++}`)],
                })}
              >
                <Plus /> {product ? "Agregar producto" : "Agregar renglón"}
              </Button>
            </div>
            {groupErrors[group.name] && <p className="text-sm text-destructive">{groupErrors[group.name]}</p>}
            {revalidationError && <p className="text-sm text-destructive">{revalidationError}</p>}
            {product != null && context === "" && (
              <p className="text-sm text-muted-foreground">Selecciona una lista de precios para buscar productos.</p>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    {product && <TableHead className="min-w-36">{product.label}</TableHead>}
                    {product && <TableHead className="min-w-48">Descripción</TableHead>}
                    {product && <TableHead className="text-right">P. Unitario</TableHead>}
                    {editableFields.map((field) => (
                      <TableHead key={field.name}>
                        {field.label}{isPercentField(field) ? " (%)" : ""}{field.required ? " *" : ""}
                      </TableHead>
                    ))}
                    {product && <TableHead className="text-right">Total</TableHead>}
                    <TableHead className="w-10"><span className="sr-only">Acciones</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columnCount} className="py-6 text-center text-sm text-muted-foreground">
                        No hay renglones capturados.
                      </TableCell>
                    </TableRow>
                  ) : rows.map((row, rowIndex) => {
                    const selected = product ? products[productKey(group.name, row.id)] ?? null : null;
                    const productError = product ? errors[group.name]?.[rowIndex]?.[product.name] : undefined;
                    const lineTotal = product
                      ? estimateLineTotal(
                        selected?.unit_price,
                        row.values[QUOTATION_QUANTITY_FIELD],
                        row.values[QUOTATION_DISCOUNT_FIELD],
                      )
                      : null;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="text-muted-foreground tabular-nums">{rowIndex + 1}</TableCell>
                        {product && (
                          <TableCell>
                            <ReportProductSearch
                              code={code}
                              parameterName={`${group.name}.${product.name}`}
                              context={{ [group.context_parameter]: context }}
                              contextKey={context}
                              selected={selected}
                              label={`${product.label} ${rowIndex + 1}`}
                              disabled={disabled || context === ""}
                              invalid={productError != null}
                              onSelect={(option) => {
                                setProducts((current) => {
                                  const next = { ...current };
                                  const key = productKey(group.name, row.id);
                                  if (option == null) delete next[key];
                                  else next[key] = option;
                                  return next;
                                });
                                replaceCell(group.name, rowIndex, product.name, option ? String(option.product_id) : "");
                              }}
                            />
                            {productError && <p className="text-xs text-destructive">{productError}</p>}
                          </TableCell>
                        )}
                        {product && (
                          <TableCell className="text-sm text-muted-foreground">
                            {selected?.description ?? "—"}
                          </TableCell>
                        )}
                        {product && (
                          <TableCell className="text-right tabular-nums">
                            {selected ? formatCurrency(selected.unit_price, selected.currency) : "—"}
                          </TableCell>
                        )}
                        {editableFields.map((field) => {
                          const id = `runtime-${group.name}-${row.id}-${field.name}`;
                          const error = errors[group.name]?.[rowIndex]?.[field.name];
                          const value = row.values[field.name] ?? (field.input_type === "checkbox" ? false : "");
                          const constraints = numericConstraints(field);
                          const cellLabel = `${field.label}${isPercentField(field) ? " (%)" : ""}${field.required ? " *" : ""} ${rowIndex + 1}`;
                          return (
                            <TableCell key={field.name}>
                              {field.input_type === "checkbox" ? (
                                <input
                                  id={id}
                                  type="checkbox"
                                  aria-label={cellLabel}
                                  checked={Boolean(value)}
                                  disabled={disabled}
                                  onChange={(event) => replaceCell(group.name, rowIndex, field.name, event.target.checked)}
                                />
                              ) : (
                                <Input
                                  id={id}
                                  aria-label={cellLabel}
                                  className="min-w-24"
                                  type={field.input_type === "datetime" ? "datetime-local" : field.input_type}
                                  step={field.data_type === "decimal" ? "any" : undefined}
                                  min={constraints.minimum}
                                  max={constraints.maximum}
                                  value={String(value)}
                                  disabled={disabled}
                                  aria-invalid={error != null}
                                  onChange={(event) => replaceCell(group.name, rowIndex, field.name, event.target.value)}
                                />
                              )}
                              {error && <p className="text-xs text-destructive">{error}</p>}
                            </TableCell>
                          );
                        })}
                        {product && (
                          <TableCell className="text-right tabular-nums">
                            {lineTotal == null ? "—" : formatCurrency(lineTotal, selected?.currency)}
                          </TableCell>
                        )}
                        <TableCell>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="destructive"
                            aria-label={`Eliminar renglón ${rowIndex + 1}`}
                            disabled={disabled}
                            onClick={() => {
                              setProducts((current) => {
                                const next = { ...current };
                                delete next[productKey(group.name, row.id)];
                                return next;
                              });
                              onChange({ ...values, [group.name]: rows.filter((_, index) => index !== rowIndex) });
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {product != null && rows.length > 0 && (
              <p className="text-xs text-muted-foreground">
                El total por renglón es una estimación local; los importes definitivos, IVA y total los calcula el backend al generar el reporte.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
