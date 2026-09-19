"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getUserErrorMessage } from "@/lib/api/errors";
import { searchReportProductOptions } from "@/lib/api/reports";
import type { ReportProductOption } from "@/types/api";

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Incremental product picker for one quotation line (Backend #21).
 *
 * The catalog is never materialized in the browser: every keystroke asks the
 * backend for one bounded page scoped to the selected price list, and each hit
 * already carries the description and unit price the row needs.
 */
export function ReportProductSearch({
  code,
  parameterName,
  context,
  contextKey,
  selected,
  label,
  disabled = false,
  invalid = false,
  onSelect,
}: {
  code: string;
  /** Dotted parameter path, e.g. `items.product_id`. */
  parameterName: string;
  context: Record<string, string | number | boolean | undefined>;
  /** Changes whenever the price list changes; resets the suggestion cache. */
  contextKey: string;
  selected: ReportProductOption | null;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  onSelect: (option: ReportProductOption | null) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ReportProductOption[]>([]);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      searchReportProductOptions(code, parameterName, context, query, { signal: controller.signal })
        .then((options) => {
          if (controller.signal.aborted) return;
          setResults(options);
          setActive(0);
          setError(null);
          setLoading(false);
        })
        .catch((cause) => {
          if (controller.signal.aborted) return;
          setResults([]);
          setError(getUserErrorMessage(cause, "No se pudieron buscar productos."));
          setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // `contextKey` stands in for `context`, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, contextKey, open, parameterName, query]);

  function choose(option: ReportProductOption) {
    onSelect(option);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onSelect(null);
    setQuery("");
    setResults([]);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (results.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + delta + results.length) % results.length);
      return;
    }
    if (event.key === "Enter" && open && results[active]) {
      event.preventDefault();
      choose(results[active]);
    }
  }

  if (selected != null) {
    return (
      <div className="flex items-start gap-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{selected.part_number}</p>
          {selected.item_number && <p className="truncate text-xs text-muted-foreground">Item {selected.item_number}</p>}
        </div>
        <button
          type="button"
          className="ml-auto rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
          aria-label={`Quitar ${label}`}
          disabled={disabled}
          onClick={clear}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid}
        autoComplete="off"
        placeholder="Buscar parte, item o descripción"
        value={query}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
        onKeyDown={handleKeyDown}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md">
          {loading && (
            <p className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
            </p>
          )}
          {error && <p className="px-2 py-1.5 text-xs text-destructive">{error}</p>}
          {!loading && !error && results.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Sin coincidencias.</p>
          )}
          <ul id={listId} role="listbox" className="list-none p-0">
            {results.map((option, index) => (
              <li key={option.product_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${index === active ? "bg-accent" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                >
                  <span className="block font-medium">{option.part_number}</span>
                  <span className="block truncate text-muted-foreground">{option.description ?? option.item_number ?? "Sin descripción"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
