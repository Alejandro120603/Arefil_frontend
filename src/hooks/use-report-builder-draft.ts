"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getUserErrorMessage } from "@/lib/api/errors";
import { getReportBuilder, getReportFieldCatalog, saveReportBuilder } from "@/lib/api/reports";
import {
  builderFormFromDefinition,
  emptyExcelLayout,
  toBuilderRequest,
  type ReportBuilderFormValue,
} from "@/lib/reports/report-builder";
import type { ReportBuilderDefinition, ReportFieldDescriptor } from "@/types/api";

/**
 * The single frontend owner of a report's builder inside the configuration
 * wizard (Frontend #41A). It loads `GET /builder` and `GET /builder/fields`
 * once per report, keeps what the backend last confirmed (`persisted`) apart
 * from what the admin is editing (`draft`), and saves the draft with the same
 * transactional `PUT /builder` the workspace used to send itself.
 *
 * `persisted` is the backend's own response, never mutated; `draft` is always
 * a fresh copy built from it (`builderFormFromDefinition` clones every column,
 * group and summary), so editing one can never leak into the other.
 */
export interface ReportBuilderDraft {
  code: string | null;
  /** True until the builder request has answered (never true for a new report). */
  loading: boolean;
  loadError: string | null;
  catalogError: string | null;
  /** The field catalog, or `null` while it loads; `[]` when it failed or there is no report yet. */
  fields: ReportFieldDescriptor[] | null;
  /** What the admin is editing; `null` only while the builder loads. */
  draft: ReportBuilderFormValue | null;
  /** The last builder the backend confirmed; `null` for a new report or a failed load. */
  persisted: ReportBuilderDefinition | null;
  /** Whether the draft differs from what the backend last confirmed. */
  dirty: boolean;
  /** Whether saving would change the repeatable groups ("Fuente y entradas", #41B). */
  groupsDirty: boolean;
  saving: boolean;
  updateDraft: (update: (draft: ReportBuilderFormValue) => ReportBuilderFormValue) => void;
  /**
   * Sends `toBuilderRequest(draft)`. Resolves with the saved builder (and
   * re-seeds both copies from it), or `null` when a save was already running.
   * Rejects with the API error and leaves `draft` and `persisted` untouched.
   */
  save: () => Promise<ReportBuilderDefinition | null>;
  /**
   * Saves *only* the draft's repeatable groups (Frontend #41B): the PUT
   * carries the persisted columns and layout — never unsaved edits from
   * "Datos del reporte" — plus `draft.parameterGroups`. On success the
   * persisted builder and the draft's groups follow the response, while the
   * draft's columns and layout keep whatever the admin has not saved yet.
   * `targetCode` is the report just created by "Fuente y entradas", before
   * this hook knows its code; a new report starts from no columns and the
   * default layout. Rejects with the API error, changing nothing.
   */
  saveGroups: (targetCode?: string) => Promise<ReportBuilderDefinition>;
  /** Re-reads the builder and the field catalog, discarding the draft. */
  reload: () => void;
}

interface DraftState {
  code: string | null;
  revision: number;
  loading: boolean;
  loadError: string | null;
  catalogError: string | null;
  fields: ReportFieldDescriptor[] | null;
  draft: ReportBuilderFormValue | null;
  persisted: ReportBuilderDefinition | null;
}

export function emptyBuilderForm(): ReportBuilderFormValue {
  return { columns: [], parameterGroups: [], layout: emptyExcelLayout() };
}

function initialState(code: string | null, revision = 0): DraftState {
  if (code == null) {
    // A report that does not exist yet has no remote builder to ask for.
    return {
      code, revision, loading: false, loadError: null, catalogError: null,
      fields: [], draft: emptyBuilderForm(), persisted: null,
    };
  }
  return {
    code, revision, loading: true, loadError: null, catalogError: null,
    fields: null, draft: null, persisted: null,
  };
}

/** What a save starts from: the persisted builder, or the empty one of a new report. */
function persistedForm(persisted: ReportBuilderDefinition | null): ReportBuilderFormValue {
  return persisted ? builderFormFromDefinition(persisted) : emptyBuilderForm();
}

/** Two builders compare by the request they would send, not by object identity. */
function sameRequest(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function useReportBuilderDraft(code: string | null): ReportBuilderDraft {
  const [state, setState] = useState<DraftState>(() => initialState(code));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // A different report starts from scratch: nothing of report A may survive
  // into report B, not even for one render.
  let current = state;
  if (state.code !== code) {
    current = initialState(code);
    setState(current);
  }

  const latest = useRef(current);
  useEffect(() => { latest.current = current; });

  const { revision } = current;

  useEffect(() => {
    if (code == null) return;
    const controller = new AbortController();
    const stillCurrent = () => !controller.signal.aborted;

    void getReportBuilder(code, { signal: controller.signal })
      .then((builder) => {
        if (!stillCurrent()) return;
        setState((previous) => previous.code !== code ? previous : {
          ...previous, loading: false, loadError: null, persisted: builder,
          draft: builderFormFromDefinition(builder),
        });
      })
      .catch((error) => {
        if (!stillCurrent()) return;
        // Without a builder there is nothing to edit *and* nothing to lose, so
        // fall back to an empty shell rather than blocking the whole screen.
        setState((previous) => previous.code !== code ? previous : {
          ...previous, loading: false, persisted: null, draft: emptyBuilderForm(),
          loadError: getUserErrorMessage(error, "No se pudo cargar la configuración del constructor."),
        });
      });

    void getReportFieldCatalog(code, { signal: controller.signal })
      .then((fields) => {
        if (!stillCurrent()) return;
        setState((previous) => previous.code !== code ? previous : { ...previous, fields, catalogError: null });
      })
      .catch((error) => {
        if (!stillCurrent()) return;
        setState((previous) => previous.code !== code ? previous : {
          ...previous, fields: [],
          catalogError: getUserErrorMessage(error, "No se pudo cargar el catálogo de campos."),
        });
      });

    return () => controller.abort();
  }, [code, revision]);

  const updateDraft = useCallback((update: (draft: ReportBuilderFormValue) => ReportBuilderFormValue) => {
    setState((previous) => previous.draft == null ? previous : { ...previous, draft: update(previous.draft) });
  }, []);

  const save = useCallback(async (): Promise<ReportBuilderDefinition | null> => {
    const { code: savingCode, draft } = latest.current;
    if (savingCode == null || draft == null) throw new Error("No hay un reporte guardado al cual asociar el constructor.");
    if (savingRef.current) return null;
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await saveReportBuilder(savingCode, toBuilderRequest(draft));
      // Re-seed from the persisted response, so what stays on screen is what
      // the backend actually stored (normalized keys, ordering, totals).
      setState((previous) => previous.code !== savingCode ? previous : {
        ...previous, persisted: saved, draft: builderFormFromDefinition(saved),
      });
      return saved;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  const saveGroups = useCallback(async (targetCode?: string): Promise<ReportBuilderDefinition> => {
    const { code: ownCode, draft, persisted } = latest.current;
    const savingCode = targetCode ?? ownCode;
    if (savingCode == null || draft == null) throw new Error("No hay un reporte guardado al cual asociar los productos por renglón.");
    const base = persistedForm(savingCode === ownCode ? persisted : null);
    const saved = await saveReportBuilder(savingCode, toBuilderRequest({ ...base, parameterGroups: draft.parameterGroups }));
    setState((previous) => {
      if (previous.code !== savingCode || previous.draft == null) return previous;
      return {
        ...previous,
        persisted: saved,
        draft: { ...previous.draft, parameterGroups: builderFormFromDefinition(saved).parameterGroups },
      };
    });
    return saved;
  }, []);

  const reload = useCallback(() => {
    setState((previous) => previous.code == null ? previous : initialState(previous.code, previous.revision + 1));
  }, []);

  const savedRequest = current.draft == null ? null : toBuilderRequest(persistedForm(current.persisted));
  const draftRequest = current.draft == null ? null : toBuilderRequest(current.draft);
  const dirty = savedRequest != null && !sameRequest(savedRequest, draftRequest);
  const groupsDirty = savedRequest != null && !sameRequest(savedRequest.parameter_groups, draftRequest?.parameter_groups);

  return {
    code,
    loading: current.loading,
    loadError: current.loadError,
    catalogError: current.catalogError,
    fields: current.fields,
    draft: current.draft,
    persisted: current.persisted,
    dirty,
    groupsDirty,
    saving,
    updateDraft,
    save,
    saveGroups,
    reload,
  };
}
