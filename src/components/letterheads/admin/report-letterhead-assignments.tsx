"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, RefreshCw, Save, Undo2 } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { LetterheadNotice } from "@/components/letterheads/admin/letterhead-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { getReportLetterheadAssignments, replaceReportLetterheadAssignments } from "@/lib/api/letterhead-admin";
import {
  buildAssignmentRows,
  buildAssignmentsWrite,
  canBeDefault,
  moveRow,
  type AssignmentRow,
} from "@/lib/letterheads/letterhead-admin";
import type { LetterheadAdmin, ReportLetterheadAssignments } from "@/types/letterhead-admin";

interface EditorState {
  server: ReportLetterheadAssignments;
  rows: AssignmentRow[];
  defaultId: number | null;
}

function editorState(server: ReportLetterheadAssignments): EditorState {
  return { server, rows: buildAssignmentRows(server.assignments, []), defaultId: server.default_letterhead_id };
}

/**
 * Rows refreshed with the latest catalog: name, letterhead state and current
 * version follow the catalog, while the admin's own choices (availability,
 * order) and the revision they were made against stay untouched. Catalog
 * letterheads the editor does not list yet are appended as "not assigned".
 */
function withCatalog(rows: AssignmentRow[], catalog: LetterheadAdmin[]): AssignmentRow[] {
  const byId = new Map(catalog.map((letterhead) => [letterhead.id, letterhead]));
  const refreshed = rows.map((row) => {
    const latest = byId.get(row.letterhead_id);
    if (latest == null) return row;
    return {
      ...row,
      display_name: latest.display_name,
      letterhead_is_active: latest.is_active,
      current_version: latest.current_version?.version ?? null,
    };
  });
  const known = new Set(rows.map((row) => row.letterhead_id));
  const missing = buildAssignmentRows([], catalog.filter((letterhead) => !known.has(letterhead.id)));
  return [...refreshed, ...missing];
}

/** What the PUT would say: rows it sends, in order, and the default. */
function snapshot(rows: AssignmentRow[], defaultId: number | null): string {
  const sent = rows.filter((row) => row.assigned || row.is_active).map((row) => [row.letterhead_id, row.is_active]);
  return JSON.stringify({ sent, defaultId });
}

/**
 * Which letterheads a report offers, in which order, and which one starts
 * selected. The whole state is saved with a single PUT that replaces the
 * previous one, guarded by the `revision` read here: if anyone changed the
 * assignments in between, nothing is written and the admin decides whether to
 * reload. There is never an automatic retry with a fresher revision.
 */
export function ReportLetterheadAssignmentsEditor({
  code,
  label,
  catalog,
  reloadToken,
  onSaved,
}: {
  code: string;
  label: string;
  catalog: LetterheadAdmin[];
  /** Changes when the catalog changed elsewhere on the page (state or new letterhead). */
  reloadToken: number;
  onSaved?: () => void;
}) {
  const ids = useId();
  const [state, setState] = useState<EditorState | null>(null);
  const [initial, setInitial] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** A background refresh failed while the editor (maybe with a draft) is shown. */
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [manualReload, setManualReload] = useState(0);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const hasStateRef = useRef(false);

  const rows = useMemo(() => (state != null ? withCatalog(state.rows, catalog) : []), [catalog, state]);
  const dirty = state != null && initial != null && snapshot(rows, state.defaultId) !== initial;

  useEffect(() => {
    dirtyRef.current = dirty;
    hasStateRef.current = state != null;
  }, [dirty, state]);

  const apply = useCallback((server: ReportLetterheadAssignments) => {
    const next = editorState(server);
    setState(next);
    setInitial(snapshot(next.rows, next.defaultId));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void getReportLetterheadAssignments(code, { signal: controller.signal })
      .then((server) => {
        if (controller.signal.aborted) return;
        // Pending edits are never thrown away by a background refresh; the
        // revision they were made against still guards the save.
        if (!dirtyRef.current) apply(server);
        setLoadError(null);
        setRefreshError(null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof ApiError && error.status === 404
          ? `El reporte ${code} no existe en este servidor.`
          : getUserErrorMessage(error, "No se pudieron cargar las asignaciones de membretes.");
        // With an editor on screen the failure must not hide (or cost) its draft.
        if (hasStateRef.current) setRefreshError(message);
        else setLoadError(message);
        setLoading(false);
      });
    return () => controller.abort();
  }, [apply, code, reloadToken, manualReload]);

  const defaultCandidates = useMemo(() => rows.filter(canBeDefault), [rows]);
  const defaultInvalid = state?.defaultId != null
    && !defaultCandidates.some((row) => row.letterhead_id === state.defaultId);

  function update(nextRows: AssignmentRow[], defaultId: number | null) {
    if (state == null) return;
    setState({ ...state, rows: nextRows, defaultId });
    setNotice(null);
    setSaveError(null);
  }

  function toggle(index: number) {
    if (state == null) return;
    const nextRows = rows.map((row, position) => (position === index ? { ...row, is_active: !row.is_active } : row));
    const row = nextRows[index];
    if (state.defaultId === row.letterhead_id && !canBeDefault(row)) {
      update(nextRows, null);
      setNotice(`«${row.display_name}» dejó de estar disponible, así que la opción inicial vuelve a ser «Sin membrete».`);
      return;
    }
    update(nextRows, state.defaultId);
  }

  function discard() {
    if (state == null) return;
    apply(state.server);
    setSaveError(null);
    setNotice(null);
  }

  /** Read the server again without discarding the draft (it is applied only if there is none). */
  function retryRefresh() {
    setRefreshError(null);
    setManualReload((value) => value + 1);
  }

  /** Discard everything local and read the server state (after a conflict, with consent). */
  function reload() {
    setConflict(false);
    setRefreshError(null);
    setSaveError(null);
    setNotice(null);
    dirtyRef.current = false;
    hasStateRef.current = false;
    setInitial(null);
    setState(null);
    setLoading(true);
    setManualReload((value) => value + 1);
  }

  async function save() {
    if (state == null || savingRef.current) return;
    let body;
    try {
      body = buildAssignmentsWrite(rows, state.defaultId, state.server.revision);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Revisa el membrete predeterminado.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setNotice(null);
    try {
      const saved = await replaceReportLetterheadAssignments(code, body);
      apply(saved);
      setNotice(`Se guardaron los membretes de ${label}.`);
      onSaved?.();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(true);
      } else {
        setSaveError(getUserErrorMessage(error, "No se pudieron guardar las asignaciones."));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (loadError != null || state == null) {
    return (
      <div className="flex flex-col items-start gap-2">
        <ErrorAlert title={`No se pudieron cargar los membretes de ${label}`} message={loadError ?? "Sin datos."} />
        <Button type="button" size="sm" variant="outline" onClick={reload}>
          <RefreshCw /> Reintentar
        </Button>
      </div>
    );
  }

  const busy = saving || conflict;

  return (
    <div className="flex flex-col gap-4">
      {conflict && (
        <div className="flex flex-col items-start gap-2">
          <ErrorAlert
            title="Las asignaciones cambiaron"
            message={`Otra persona modificó los membretes de ${label} mientras editabas. No se guardó nada para no sobrescribir sus cambios. Recarga para ver el estado actual y vuelve a aplicar tus cambios.`}
          />
          <Button type="button" size="sm" onClick={reload}>
            <RefreshCw /> Recargar datos
          </Button>
        </div>
      )}
      {refreshError && (
        <div className="flex flex-col items-start gap-2">
          <ErrorAlert
            title="No se pudo actualizar el estado de los membretes"
            message={`${refreshError} Tus cambios sin guardar se conservan.`}
          />
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={retryRefresh}>
            <RefreshCw /> Reintentar
          </Button>
        </div>
      )}
      {saveError && <ErrorAlert title="No se pudo guardar" message={saveError} />}
      {notice && <LetterheadNotice message={notice} tone={notice.startsWith("Se guardaron") ? "success" : "info"} />}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay membretes en el catálogo. Crea uno para poder ofrecerlo en {label}.
        </p>
      ) : (
        <section className="flex flex-col gap-2" aria-labelledby={`${ids}-order`}>
          <div>
            <h3 id={`${ids}-order`} className="text-sm font-medium">Membretes disponibles y orden</h3>
            <p className="text-sm text-muted-foreground">
              Marca los membretes que se podrán elegir en {label}. El orden es el que verá el usuario.
            </p>
          </div>
          <ol className="flex flex-col gap-2">
            {rows.map((row, index) => {
              const checkboxId = `${ids}-row-${row.letterhead_id}`;
              return (
                <li key={row.letterhead_id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
                  <label htmlFor={checkboxId} className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                    <input
                      id={checkboxId}
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                      checked={row.is_active}
                      disabled={busy}
                      onChange={() => toggle(index)}
                    />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="font-medium">
                        <span className="sr-only">Disponible en {label}: </span>
                        {row.display_name}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {!row.letterhead_is_active && <Badge variant="warning">Membrete inactivo</Badge>}
                        {row.current_version == null && <Badge variant="warning">Sin versión</Badge>}
                        {row.current_version != null && <Badge variant="outline">Versión {row.current_version}</Badge>}
                        {!row.assigned && <Badge variant="outline">Sin asignar</Badge>}
                      </span>
                    </span>
                  </label>
                  <div className="flex gap-1 self-end sm:self-center">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      aria-label={`Subir ${row.display_name}`}
                      disabled={busy || index === 0}
                      onClick={() => update(moveRow(rows, index, -1), state.defaultId)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      aria-label={`Bajar ${row.display_name}`}
                      disabled={busy || index === rows.length - 1}
                      onClick={() => update(moveRow(rows, index, 1), state.defaultId)}
                    >
                      <ArrowDown />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="text-sm font-medium">Opción inicial al generar {label}</legend>
        <p className="text-sm text-muted-foreground">
          El usuario siempre puede cambiarla antes de generar. Solo puede ser predeterminado un membrete disponible y activo.
        </p>
        {defaultInvalid && (
          <p role="alert" className="text-sm text-destructive">
            El membrete predeterminado ya no está activo o disponible. Elige otra opción inicial antes de guardar.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${ids}-default`}
              className="size-4 accent-primary"
              checked={state.defaultId == null}
              onChange={() => update(rows, null)}
            />
            Sin membrete — formato actual
          </label>
          {defaultCandidates.map((row) => (
            <label key={row.letterhead_id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${ids}-default`}
                className="size-4 accent-primary"
                checked={state.defaultId === row.letterhead_id}
                onChange={() => update(rows, row.letterhead_id)}
              />
              {row.display_name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy || !dirty} onClick={() => void save()}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? "Guardando..." : "Guardar cambios"}
        </Button>
        <Button type="button" variant="ghost" disabled={busy || !dirty} onClick={discard}>
          <Undo2 /> Descartar cambios
        </Button>
        {dirty && !busy && <p className="text-sm text-muted-foreground">Hay cambios sin guardar.</p>}
      </div>
    </div>
  );
}
