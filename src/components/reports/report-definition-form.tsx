"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Database, Loader2, RotateCcw, Save } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportParameterEditor } from "@/components/reports/report-parameter-editor";
import { ReportParameterGroupEditor } from "@/components/reports/report-parameter-group-editor";
import { ReportSaveFailureAlert, TemplateDependencyAlert } from "@/components/reports/report-template-dependency-alert";
import type { ReportBuilderDraft } from "@/hooks/use-report-builder-draft";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUserErrorMessage } from "@/lib/api/errors";
import { createReport, listReportDataSources, updateReportInputs } from "@/lib/api/reports";
import { normalizeSummaries, validateParameterGroups } from "@/lib/reports/report-builder";
import { newParameterGroup, priceListParameters } from "@/lib/reports/report-group-fields";
import {
  blockedParameterChange,
  groupFieldUsages,
  parameterDependencyErrors,
  sourceChangeDependencyErrors,
} from "@/lib/reports/report-input-dependencies";
import {
  emptyReportForm,
  mergeSourceParameters,
  normalizeReportCode,
  reportFormFromDefinition,
  toReportRequest,
  sourceParameterNames,
  toReportInputsUpdate,
  validateReportForm,
  type ReportFormValue,
} from "@/lib/reports/report-form";
import { placeholderLabelResolver, reportSaveFailure, type ReportSaveFailure } from "@/lib/reports/report-save-errors";
import {
  NO_TEMPLATE_DEPENDENCIES,
  templateDependencyBlocks,
  templateDependencyMessage,
  type TemplateDependencies,
  type TemplateDependencyBlock,
} from "@/lib/reports/report-template-dependencies";
import type { ReportAdminDefinition, ReportDataSource, ReportParameter, ReportParameterGroup } from "@/types/api";

const NO_GROUPS: ReportParameterGroup[] = [];

const SOURCE_CHANGE_CONFIRMATION = "Cambiar la fuente reemplazará los parámetros exigidos por la fuente anterior. Los parámetros propios del reporte se conservan.";
const DROP_GROUP_CONFIRMATION = "La nueva fuente no utiliza productos por renglón. Esta configuración se descartará.";

function quotedSource(name: string): string {
  return `"${name}"`;
}

/**
 * CREATE-only recovery from Frontend #41B: after POST succeeds, retrying only
 * repeats the builder PUT and never creates the report a second time. EDIT is
 * atomic through PUT /inputs and never enters this state.
 */
interface PendingGroups {
  report: ReportAdminDefinition;
  error: string;
}

interface SourceChangeProposal {
  source: ReportDataSource;
  parameters: ReportParameter[];
  groups: ReportParameterGroup[];
  removals: string[];
}

interface SourceChangeBlock {
  sourceName: string;
  /** What breaks in "Datos del reporte". */
  dependencies: string[];
  /** What the active Excel template still uses (#43) — the same list, fixed elsewhere. */
  templateDependencies: string[];
}

function sourceBlockTarget(block: SourceChangeBlock): string {
  if (block.dependencies.length === 0) return "la plantilla Excel";
  return block.templateDependencies.length > 0 ? "Datos del reporte y la plantilla Excel" : "Datos del reporte";
}

function groupsForSource(
  current: ReportParameterGroup[],
  source: ReportDataSource,
  parameters: ReportParameter[],
): ReportParameterGroup[] {
  if (!source.capabilities.includes("REPEATABLE_ROWS")) return [];
  if (current.length === 0) return [newParameterGroup(parameters)];
  const contexts = priceListParameters(parameters);
  return current.map((group) => {
    if (parameters.some((parameter) => parameter.name === group.context_parameter && parameter.data_type === "integer")) {
      return group;
    }
    const context = contexts[0]?.name ?? group.context_parameter;
    return {
      ...group,
      context_parameter: context,
      fields: group.fields.map((field) => {
        const configuration = field.configuration_json as Record<string, unknown> | null;
        return field.input_type === "select" && configuration?.options_source === "products_by_price_list"
          ? { ...field, configuration_json: { options_source: "products_by_price_list", context_parameter: context } }
          : field;
      }),
    };
  });
}

const CONTROL_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ReportDefinitionForm({
  report = null,
  section = "all",
  createRedirectPath,
  onSaved,
  builder,
  onDefinitionSaved,
  onGoToData,
  templateDependencies = NO_TEMPLATE_DEPENDENCIES,
  onGoToMapping,
  onTemplateMayHaveChanged,
}: {
  report?: ReportAdminDefinition | null;
  /**
   * Which cards to render — the wizard (Frontend #33) shows "Definición" as its
   * own step and "Fuente de datos"/parámetros as the next one, while
   * every field still belongs to the one combined save this component already
   * does (the backend has no partial update). `"all"` (the default) is the
   * original single-page behavior, unchanged.
   */
  section?: "information" | "source" | "all";
  /** Overrides where a successful creation redirects; defaults to the plain admin detail page. */
  createRedirectPath?: (code: string) => string;
  /** Fires after a successful create/update, in addition to the router navigation this already does. */
  onSaved?: (saved: ReportAdminDefinition) => void;
  /**
   * The wizard-owned builder (Frontend #41B). When given, "Fuente y entradas"
   * also configures the repeatable rows (`builder.draft.parameterGroups`).
   * CREATE keeps POST + builder PUT; EDIT sends source, parameters and groups
   * together through PUT /inputs. Without it, the form sends empty groups.
   */
  builder?: ReportBuilderDraft;
  /**
   * Receives the report nested in the atomic inputs response. `onSaved` fires
   * immediately afterwards, once the complete operation succeeded.
   */
  onDefinitionSaved?: (saved: ReportAdminDefinition) => void;
  /** Opens Paso 3 from a blocked datasource change. */
  onGoToData?: () => void;
  /**
   * What the active Excel template uses (Frontend #43, from the wizard's
   * shared inspection). Removing a parameter it uses is refused locally;
   * Backend #37 still has the final word on save.
   */
  templateDependencies?: TemplateDependencies;
  /** Opens "Mapear campos" from a template dependency block. */
  onGoToMapping?: () => void;
  /** A save was refused for template reasons or a conflict: the shared inspection may be stale. */
  onTemplateMayHaveChanged?: () => void;
}) {
  const creating = report == null;
  const router = useRouter();
  const [value, setValue] = useState<ReportFormValue>(() => report ? reportFormFromDefinition(report) : emptyReportForm());
  /** The parameters the backend last confirmed: their names are frozen, and only they can load options. */
  const [savedParameters, setSavedParameters] = useState(() => report?.parameters ?? []);
  const [sources, setSources] = useState<ReportDataSource[] | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<ReportSaveFailure | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [dependencyError, setDependencyError] = useState<string | null>(null);
  const [sourceBlock, setSourceBlock] = useState<SourceChangeBlock | null>(null);
  const [templateBlock, setTemplateBlock] = useState<TemplateDependencyBlock[] | null>(null);
  const [sourceProposal, setSourceProposal] = useState<SourceChangeProposal | null>(null);
  const [pending, setPending] = useState<PendingGroups | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listReportDataSources({ signal: controller.signal })
      .then(setSources)
      .catch((error) => {
        if (!controller.signal.aborted) {
          setSourceError(getUserErrorMessage(error, "No se pudo cargar el catálogo de fuentes de datos."));
        }
      });
    return () => controller.abort();
  }, []);

  const selectedSource = sources?.find((source) => source.id === value.data_source_id) ?? null;
  const unavailableCurrentSource = report && value.data_source_id === report.data_source_id && !selectedSource
    ? report.data_source
    : null;
  /**
   * A migrated source is absent from the catalog, so its contract is unknown
   * and nothing can be locked: the backend stays the one that refuses a report
   * missing a parameter its source requires.
   */
  const contractNames = sourceParameterNames(selectedSource);

  const capabilities = selectedSource?.capabilities ?? unavailableCurrentSource?.capabilities ?? [];
  /** Repeatable rows are configured here only inside the wizard, for a source that has them. */
  const supportsRows = builder != null && capabilities.includes("REPEATABLE_ROWS");
  const persisted = builder?.persisted ?? null;
  const groups = builder?.draft?.parameterGroups ?? NO_GROUPS;
  const activeGroups = supportsRows ? groups : NO_GROUPS;
  const updateDraft = builder?.updateDraft;

  // A source with repeatable rows demands exactly one group: start it from the
  // canonical shape (#40) as soon as there is a price list to filter by.
  const needsGroup = supportsRows && builder?.draft != null && groups.length === 0
    && priceListParameters(value.parameters).length > 0;
  useEffect(() => {
    if (!needsGroup || updateDraft == null) return;
    updateDraft((draft) => draft.parameterGroups.length > 0 ? draft : { ...draft, parameterGroups: [newParameterGroup(value.parameters)] });
  }, [needsGroup, updateDraft, value.parameters]);

  function changeGroups(next: ReportParameterGroup[]) {
    updateDraft?.((draft) => ({ ...draft, parameterGroups: next }));
  }

  /** Refuses a parameter edit that would break a saved column, formula or the groups. */
  function changeParameters(next: ReportParameter[]) {
    // A rename keeps nothing in common with what the template reads, so only
    // names that disappear count — labels, types and defaults never block.
    const templateBlocks = templateDependencyBlocks(templateDependencies, { parameters: value.parameters }, { parameters: next });
    if (templateBlocks.length > 0) {
      setDependencyError(null);
      setTemplateBlock(templateBlocks);
      return;
    }
    setTemplateBlock(null);
    const blocked = builder ? blockedParameterChange(value.parameters, next, persisted, activeGroups) : null;
    setDependencyError(blocked);
    if (blocked) return;
    change({ parameters: next });
  }

  function change(patch: Partial<ReportFormValue>) {
    setValue((current) => ({ ...current, ...patch }));
    setSuccessMessage(null);
  }

  function changeSource(rawId: string) {
    const next = sources?.find((source) => source.id === Number(rawId));
    if (!next || next.id === value.data_source_id) return;
    const dropsGroups = builder != null && groups.length > 0 && !next.capabilities.includes("REPEATABLE_ROWS");
    // Only the source half is replaced; the report's own parameters survive.
    const previous = contractNames;
    const parameters = mergeSourceParameters(value.parameters, next, previous);
    const nextGroups = builder ? groupsForSource(groups, next, parameters) : NO_GROUPS;
    const builderDependencies = !creating && builder
      ? sourceChangeDependencyErrors({ persisted, targetSource: next, parameters, groups: nextGroups })
      : [];
    const templateDependencyMessages = creating
      ? []
      : templateDependencyBlocks(templateDependencies, { parameters: value.parameters }, { parameters })
        .map(templateDependencyMessage);
    if (builderDependencies.length > 0 || templateDependencyMessages.length > 0) {
      setSourceProposal(null);
      setSourceBlock({ sourceName: next.name, dependencies: builderDependencies, templateDependencies: templateDependencyMessages });
      return;
    }
    const nextNames = new Set(next.parameters.map((parameter) => parameter.name));
    const removals = [
      ...(dropsGroups ? ["Productos por renglón"] : []),
      ...value.parameters
        .filter((parameter) => previous.includes(parameter.name) && !nextNames.has(parameter.name))
        .map((parameter) => parameter.label || parameter.name),
    ];
    const proposal = { source: next, parameters, groups: nextGroups, removals };
    setSourceBlock(null);
    if (!creating) {
      setSourceProposal(proposal);
      return;
    }
    const warnings = [
      ...(previous.length > 0 ? [SOURCE_CHANGE_CONFIRMATION] : []),
      ...(dropsGroups ? [DROP_GROUP_CONFIRMATION] : []),
    ];
    if (warnings.length > 0 && !globalThis.confirm(`${warnings.join(" ")} ¿Continuar?`)) return;
    applySourceChange(proposal);
  }

  function applySourceChange(proposal: SourceChangeProposal) {
    setSourceProposal(null);
    setSourceBlock(null);
    if (builder) changeGroups(proposal.groups);
    change({ data_source_id: proposal.source.id, parameters: proposal.parameters });
  }

  function finishCreate(created: ReportAdminDefinition) {
    onSaved?.(created);
    router.push(createRedirectPath ? createRedirectPath(created.code) : `/administracion/reportes/${encodeURIComponent(created.code)}/configurar`);
  }

  function finishUpdate(updated: ReportAdminDefinition) {
    setSuccessMessage("La configuración se guardó con la confirmación del backend.");
    onSaved?.(updated);
  }

  async function retryGroups() {
    if (pending == null || builder == null || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await builder.saveGroups(pending.report.code);
      const { report: saved } = pending;
      setPending(null);
      finishCreate(saved);
    } catch (error) {
      setPending({ ...pending, error: getUserErrorMessage(error, "No se pudieron guardar los productos por renglón.") });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    if (pending) {
      await retryGroups();
      return;
    }
    const validationErrors = validateReportForm(value, creating, selectedSource);
    if (supportsRows) {
      if (groups.length === 0) validationErrors.push("Para usar productos por renglón, la fuente necesita una lista de precios.");
      validationErrors.push(...validateParameterGroups(groups, value.parameters));
    }
    if (builder) {
      // Only what this edit would newly break: a saved builder that is already
      // inconsistent must not lock the admin out of the definition.
      const before = new Set(parameterDependencyErrors(savedParameters, { persisted, groups: activeGroups, labelsFrom: savedParameters }));
      validationErrors.push(...parameterDependencyErrors(value.parameters, { persisted, groups: activeGroups, labelsFrom: savedParameters })
        .filter((message) => !before.has(message)));
    }
    if (!creating) {
      validationErrors.push(...templateDependencyBlocks(templateDependencies, { parameters: savedParameters }, { parameters: value.parameters })
        .map(templateDependencyMessage));
    }
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;
    savingRef.current = true;
    setSaving(true);
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      if (creating) {
        const created = await createReport(toReportRequest(value));
        if (supportsRows) {
          // The report exists from here on: a failure below must never lead to
          // a second POST, only to retrying the builder PUT on this code.
          try {
            await builder!.saveGroups(created.code);
          } catch (error) {
            setPending({ report: created, error: getUserErrorMessage(error, "No se pudieron guardar los productos por renglón.") });
            return;
          }
        }
        finishCreate(created);
        return;
      }
      const saved = await updateReportInputs(
        value.code,
        toReportInputsUpdate(value, activeGroups),
      );
      builder?.applyInputsResponse(saved);
      setValue(reportFormFromDefinition(saved.report));
      setSavedParameters(saved.report.parameters);
      onDefinitionSaved?.(saved.report);
      finishUpdate(saved.report);
    } catch (error) {
      const fallback = "No se pudo guardar el reporte. Tus cambios siguen en el formulario.";
      // Only an edit can collide with the active template; a create's 409 is a duplicated code.
      const failure: ReportSaveFailure = creating
        ? { kind: "message", message: getUserErrorMessage(error, fallback) }
        : reportSaveFailure(error, fallback);
      setSubmitError(failure);
      if (failure.kind === "template" || failure.kind === "conflict") onTemplateMayHaveChanged?.();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Revisa el formulario</AlertTitle>
          <AlertDescription><ul className="list-disc pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></AlertDescription>
        </Alert>
      )}
      {submitError && (
        <ReportSaveFailureAlert
          title="No se guardó el reporte"
          failure={submitError}
          resolveLabel={placeholderLabelResolver({ parameters: [...savedParameters, ...value.parameters], columns: persisted?.columns, summaries: persisted ? normalizeSummaries(persisted.excel_layout?.totals ?? [], persisted.columns) : [] })}
          onGoToMapping={onGoToMapping}
        />
      )}
      {pending && (
        <Alert variant="destructive">
          <AlertTitle>El reporte se creó, pero no se pudieron guardar los productos por renglón.</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>{pending.error}</span>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => { void retryGroups(); }}>
              {saving ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {successMessage && (
        <Alert><CircleCheck /><AlertTitle>Reporte actualizado</AlertTitle><AlertDescription>{successMessage}</AlertDescription></Alert>
      )}

      {(section === "all" || section === "information") && (
        <Card>
          <CardHeader><CardTitle>Definición</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="report-name">Nombre</Label>
              <Input id="report-name" value={value.name} onChange={(event) => change({ name: event.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="report-code">Código</Label>
              <Input
                id="report-code"
                className="font-mono"
                value={value.code}
                disabled={!creating}
                placeholder="MI_REPORTE"
                onBlur={() => creating && change({ code: normalizeReportCode(value.code) })}
                onChange={(event) => change({ code: event.target.value })}
              />
              {!creating && <p className="text-xs text-muted-foreground">El código es inmutable porque forma parte de las URLs del reporte.</p>}
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="report-description">Descripción</Label>
              <textarea id="report-description" className={`${CONTROL_CLASS} min-h-20 py-2`} value={value.description} onChange={(event) => change({ description: event.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="report-category">Categoría</Label>
              <Input id="report-category" value={value.category} onChange={(event) => change({ category: event.target.value })} />
            </div>
            {/* Publishing lives in Finalizar, gated by backend readiness (#44). */}
          </CardContent>
        </Card>
      )}

      {(section === "all" || section === "source") && (
        <>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Database /> Fuente de datos</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {sourceError && <ErrorAlert title="No se cargaron las fuentes" message={sourceError} />}
              {sourceBlock && (
                <Alert variant="destructive">
                  <AlertTitle>Antes de cambiar a {quotedSource(sourceBlock.sourceName)}, ajusta estos elementos en {sourceBlockTarget(sourceBlock)}:</AlertTitle>
                  <AlertDescription className="flex flex-col items-start gap-3">
                    <ul className="list-disc pl-5">
                      {[...sourceBlock.dependencies, ...sourceBlock.templateDependencies].map((dependency) => <li key={dependency}>{dependency}</li>)}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                      {onGoToData && sourceBlock.dependencies.length > 0 && (
                        <Button type="button" size="sm" onClick={onGoToData}>Ir a Datos del reporte</Button>
                      )}
                      {onGoToMapping && sourceBlock.templateDependencies.length > 0 && (
                        <Button type="button" size="sm" onClick={onGoToMapping}>Ir a Mapear campos</Button>
                      )}
                      <Button type="button" size="sm" variant="outline" onClick={() => setSourceBlock(null)}>Cancelar</Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              {sourceProposal && (
                <Alert>
                  <AlertTitle>Confirmar cambio a {quotedSource(sourceProposal.source.name)}</AlertTitle>
                  <AlertDescription className="flex flex-col items-start gap-3">
                    <p>La fuente reemplazará su contrato de entradas.</p>
                    {sourceProposal.removals.length > 0 && (
                      <><p>Al cambiar se quitará:</p><ul className="list-disc pl-5">{sourceProposal.removals.map((item) => <li key={item}>{item}</li>)}</ul></>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setSourceProposal(null)}>Cancelar</Button>
                      <Button type="button" size="sm" onClick={() => applySourceChange(sourceProposal)}>Cambiar fuente</Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid max-w-xl gap-1.5">
                <Label htmlFor="report-data-source">Fuente de datos</Label>
                <select
                  id="report-data-source"
                  className={CONTROL_CLASS}
                  value={value.data_source_id ?? ""}
                  disabled={sources == null || sources.length === 0}
                  onChange={(event) => changeSource(event.target.value)}
                >
                  <option value="">Seleccionar fuente</option>
                  {unavailableCurrentSource && (
                    <option value={unavailableCurrentSource.id} disabled>
                      {unavailableCurrentSource.name} ({unavailableCurrentSource.enabled ? "no seleccionable" : "deshabilitada"})
                    </option>
                  )}
                  {sources?.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                </select>
                {sources == null && !sourceError && <p className="text-xs text-muted-foreground">Cargando fuentes disponibles…</p>}
              </div>

              {(selectedSource || unavailableCurrentSource) && (
                <div className="grid gap-4 rounded-xl border bg-muted/20 p-4">
                  <div>
                    <p className="font-medium">{selectedSource?.name ?? unavailableCurrentSource?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedSource?.description ?? unavailableCurrentSource?.description ?? "Sin descripción."}
                    </p>
                  </div>
                  {unavailableCurrentSource && (
                    <Alert variant="destructive">
                      <AlertTitle>{unavailableCurrentSource.enabled ? "Fuente no seleccionable" : "Fuente deshabilitada"}</AlertTitle>
                      <AlertDescription>
                        {unavailableCurrentSource.enabled
                          ? "Este reporte conserva su fuente migrada, pero no está disponible en el catálogo para reportes nuevos."
                          : "Este reporte conserva su relación, pero la fuente ya no puede seleccionarse para reportes nuevos ni ejecutarse."}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <ReportParameterEditor
                parameters={value.parameters}
                sourceParameterNames={contractNames}
                savedParameters={savedParameters}
                reportCode={report?.code}
                templateUsage={templateDependencies.parameters}
                onChange={changeParameters}
              />
              {templateBlock && (
                <div className="mt-4">
                  <TemplateDependencyAlert blocks={templateBlock} onGoToMapping={onGoToMapping} onCancel={() => setTemplateBlock(null)} />
                </div>
              )}
              {dependencyError && (
                <Alert variant="destructive" className="mt-4"><AlertDescription>{dependencyError}</AlertDescription></Alert>
              )}
            </CardContent>
          </Card>

          {supportsRows && builder?.draft != null && (
            <Card>
              <CardHeader><CardTitle>Productos por renglón</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Define los datos que el usuario capturará una vez por producto. El precio y la descripción se toman de
                  la lista seleccionada.
                </p>
                <ReportParameterGroupEditor
                  groups={groups}
                  parameters={value.parameters}
                  savedGroups={persisted?.parameter_groups ?? NO_GROUPS}
                  referencedSources={[...(persisted?.columns ?? []), ...(builder.draft.columns)]
                    .flatMap((column) => column.source_parameter?.includes(".") ? [column.source_parameter] : [])}
                  fieldUsages={groupFieldUsages(persisted)}
                  required
                  disabled={saving || pending != null}
                  onChange={changeGroups}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {section !== "information" && <div className="flex justify-end">
        <Button type="submit" disabled={saving || sources == null || pending != null || builder?.loading === true}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? "Guardando..." : builder ? "Guardar y continuar" : creating ? "Crear reporte" : "Guardar cambios"}
        </Button>
      </div>}
    </form>
  );
}
