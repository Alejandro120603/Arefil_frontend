import type {
  ReportColumn,
  ReportProductOption,
  ReportSummaryConfiguration,
} from "@/types/api";
import type { RuntimeParameterValue, RuntimeParameterValues } from "@/lib/reports/report-runtime";

/**
 * Local estimate of one line's amount while the user captures it (Frontend
 * #45). There is no backend "line total" or "discount" concept: a quotation's
 * amount is whatever the report's own builder formula says (the seed uses
 * `ROUND(quantity * unit_price, 2)`, another report may subtract a discount).
 * So the estimate evaluates *that* formula with the values the row already
 * has — the selected product's price and the captured fields — mirroring the
 * backend grammar (`app/services/reports/formulas.py`): numbers, references,
 * unary ±, + - * / %, parentheses and ROUND(x, n) half-up.
 *
 * It is display only: never sent, never persisted. The backend's Decimal
 * engine computes the real amounts when the report is generated. Anything the
 * browser cannot know (a source field other than the price, a division by
 * zero, an invalid value) yields `null`, shown as "—".
 */

type Value = number | null;

class EstimateUnavailable extends Error {}

const TOKEN = /\s*(?:(\d+(?:\.\d*)?|\.\d+)|([A-Za-z][A-Za-z0-9_]*)|([+\-*/%(),]))/y;

function tokenize(expression: string): string[] {
  const tokens: string[] = [];
  const text = expression.trim();
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    const match = TOKEN.exec(text);
    if (match == null) throw new EstimateUnavailable();
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function roundHalfUp(value: number, places: number): number {
  const factor = 10 ** places;
  const scaled = Math.abs(value) * factor;
  return Math.sign(value) * Math.round(scaled + Number.EPSILON * scaled) / factor;
}

/** Evaluates one builder formula; `resolve` answers a reference's value. */
export function evaluateFormula(expression: string, resolve: (name: string) => Value): Value {
  const tokens = tokenize(expression);
  let position = 0;
  const peek = () => tokens[position];
  const take = (expected?: string) => {
    const token = tokens[position++];
    if (token == null || (expected != null && token !== expected)) throw new EstimateUnavailable();
    return token;
  };
  const binary = (operator: string, left: Value, right: Value): Value => {
    if (left == null || right == null) return null;
    if (operator === "+") return left + right;
    if (operator === "-") return left - right;
    if (operator === "*") return left * right;
    if (right === 0) throw new EstimateUnavailable();
    return operator === "/" ? left / right : left % right;
  };

  function expressionNode(): Value {
    let value = term();
    while (peek() === "+" || peek() === "-") value = binary(take(), value, term());
    return value;
  }
  function term(): Value {
    let value = unary();
    while (peek() === "*" || peek() === "/" || peek() === "%") value = binary(take(), value, unary());
    return value;
  }
  function unary(): Value {
    if (peek() === "+" || peek() === "-") {
      const sign = take();
      const value = unary();
      return value == null ? null : sign === "-" ? -value : value;
    }
    return primary();
  }
  function primary(): Value {
    const token = take();
    if (/^[\d.]/.test(token)) return Number(token);
    if (/^[A-Za-z]/.test(token)) {
      if (peek() !== "(") return resolve(token);
      if (token.toUpperCase() !== "ROUND") throw new EstimateUnavailable();
      take("(");
      const value = expressionNode();
      let places = 0;
      if (peek() === ",") {
        take(",");
        const sign = peek() === "-" ? (take(), -1) : peek() === "+" ? (take(), 1) : 1;
        const digits = take();
        if (!/^\d+$/.test(digits)) throw new EstimateUnavailable();
        places = sign * Number(digits);
      }
      take(")");
      return value == null ? null : roundHalfUp(value, places);
    }
    if (token === "(") {
      const value = expressionNode();
      take(")");
      return value;
    }
    throw new EstimateUnavailable();
  }

  try {
    const value = expressionNode();
    if (position !== tokens.length) return null;
    return value != null && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The column whose value is a line's amount: the one the report's first
 * column total (SUM) adds up — by definition the per-line amount. A report
 * without such a total has no line amount to estimate.
 */
export function lineAmountColumn(
  columns: ReportColumn[],
  summaries: ReportSummaryConfiguration[],
): ReportColumn | null {
  const summed = summaries.find((summary) => summary.operation === "SUM" && summary.column_key);
  return columns.find((column) => column.key === summed?.column_key) ?? null;
}

/** Source fields the selected product already carries; the browser knows no other. */
function productField(sourceField: string | null, product: ReportProductOption | null): Value | undefined {
  if (product == null) return null;
  if (sourceField === "price_list_item.unit_price") return numeric(product.unit_price);
  if (sourceField === "product.id") return product.product_id;
  return undefined;
}

function numeric(value: RuntimeParameterValue | string | number | null | undefined): Value {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new EstimateUnavailable();
  return parsed;
}

export interface LineEstimateInput {
  columns: ReportColumn[];
  summaries: ReportSummaryConfiguration[];
  groupName: string;
  row: RuntimeParameterValues;
  scalars: RuntimeParameterValues;
  product: ReportProductOption | null;
}

/** Display-only discounted unit price; the backend Decimal result remains authoritative. */
export function estimateDiscountedUnitPrice(
  product: ReportProductOption | null,
  rawDiscount: RuntimeParameterValue | undefined,
): number | null {
  if (product == null || typeof rawDiscount === "boolean" || rawDiscount == null || rawDiscount === "") {
    return null;
  }
  const price = Number(product.unit_price);
  const discount = Number(rawDiscount);
  if (!Number.isFinite(price) || !Number.isFinite(discount) || discount < 0 || discount > 100) {
    return null;
  }
  return roundHalfUp(price * (1 - discount / 100), 2);
}

/** The estimated amount of one line, or `null` when it cannot be known yet. */
export function estimateLineAmount(input: LineEstimateInput): number | null {
  const target = lineAmountColumn(input.columns, input.summaries);
  if (target == null || input.product == null) return null;
  const columnsByKey = new Map(input.columns.map((column) => [column.key, column]));
  const resolving = new Set<string>();

  function resolve(name: string): Value {
    const column = columnsByKey.get(name);
    if (column == null) return numeric(input.scalars[name]);
    if (resolving.has(name)) throw new EstimateUnavailable();
    resolving.add(name);
    try {
      if (column.column_type === "FIELD") {
        const value = productField(column.source_field, input.product);
        if (value === undefined) throw new EstimateUnavailable();
        return value;
      }
      if (column.column_type === "PARAMETER") {
        const source = column.source_parameter ?? "";
        const [group, field] = source.split(".");
        if (field != null) return group === input.groupName ? numeric(input.row[field]) : null;
        return numeric(input.scalars[source]);
      }
      return evaluateFormula(column.formula_definition ?? "", resolve);
    } finally {
      resolving.delete(name);
    }
  }

  try {
    return resolve(target.key);
  } catch {
    return null;
  }
}
