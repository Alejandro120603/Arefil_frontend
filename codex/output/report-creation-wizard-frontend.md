# Wizard guiado de creación/configuración de reportes — frontend #33

## Alcance

Reemplaza la pantalla larga de `/administracion/reportes/[code]` como experiencia principal por un asistente de 7
pasos (`Información`, `Fuente y entradas`, `Datos del reporte`, `Plantilla Excel`, `Mapear campos`, `Vista previa`,
`Finalizar`), tanto para crear un reporte (`/administracion/reportes/nuevo`) como para configurar uno existente
(`/administracion/reportes/[code]/configurar`, ruta nueva). No se creó PR ni se hizo commit todavía; se construyó
sobre `feat/visual-template-inspector`.

Esta issue es **orquestación, no un motor nuevo**: cada paso compone un componente ya existente y ya probado
(`ReportDefinitionForm`, `ReportBuilderWorkspace`, `ReportExcelTemplateCard`, `ReportExcelTemplateInspector`
de #29–#32) mediante props aditivas, nunca un fork.

## Flujo final

```text
1. Información            — ReportDefinitionForm(section="information")
2. Fuente y entradas       — ReportDefinitionForm(section="source")   ← guarda/crea aquí
3. Datos del reporte       — ReportBuilderWorkspace (sin cambios)
4. Plantilla Excel         — ReportExcelTemplateCard (+ onTemplateChange)
5. Mapear campos    ┐      — ReportExcelTemplateInspector, mode="design"
6. Vista previa      ┘        (misma instancia, mode="preview")
7. Finalizar               — ReportWizardFinalizeStep (nuevo)
```

- El stepper (`ReportWizardStepper`, nuevo) es una fila de pasos clicables en pantallas ≥ `sm`, y una línea
  compacta "Paso N de 7 · Título" con barra de progreso en móvil — ambas versiones están siempre en el DOM; CSS
  decide cuál se ve, así que no hay nada que difiera entre servidor y cliente.
- Todo el contenido de los 7 pasos permanece **siempre montado** (oculto con `hidden`, no desmontado) mientras el
  reporte exista: cambiar de paso nunca pierde texto sin guardar en un formulario ni el estado interno de un
  editor — el mismo patrón que ya se usó en #31 para Diseño/Vista previa, ahora aplicado a todo el wizard. Solo la
  barra de navegación (`Anterior`/`Continuar`) se renderiza para el paso activo, para no tener varios botones
  "Continuar" idénticos a la vez.
- Pasos 5 y 6 son la **misma instancia** de `ReportExcelTemplateInspector`: su pestaña interna Diseño/Vista previa
  (#31) ahora puede controlarse desde afuera (`mode`/`onModeChange`, opcional — sin esos props se comporta
  exactamente igual que antes). El `Continuar` del wizard en el paso 5 solo cambia esa pestaña a "preview"; no hay
  una segunda cuadrícula ni un segundo editor.

## Persistencia progresiva

`ReportCreateRequest`/`ReportUpdateRequest` exigen `data_source_id` (backend, no negociable) — un `POST` con solo
Información nunca sería aceptado. Por eso los pasos 1 y 2 comparten **un solo** `ReportDefinitionForm` montado una
vez, con un nuevo prop `section` (`"information" | "source" | "all"`, default `"all"` — la pantalla vieja no
cambia) que decide qué tarjetas mostrar; el guardado real (crear o actualizar) sigue siendo el mismo `onSubmit` de
siempre, ahora expuesto también como `onSaved`/`createRedirectPath` para que el wizard reaccione:

```text
Paso 1 (Información)         → solo navegación, nunca guarda solo.
Paso 2 (Fuente y entradas)   → botón real "Crear reporte"/"Guardar cambios" (el de siempre).
  ├─ creando  → POST crea el reporte → redirect real del navegador a
  │             /administracion/reportes/{code}/configurar?step=3
  │             (igual al flujo que pide la issue: no hay "reporte fantasma" en localStorage).
  └─ editando → PATCH actualiza → el wizard actualiza su propio estado y avanza a Paso 3
                sin recargar la página (mismo patrón que #30 ya usaba para refrescar tras un save).
```

Los pasos 3–7 (`ReportBuilderWorkspace`, `ReportExcelTemplateCard`, el mapper/preview, Finalizar) solo se montan
una vez que existe un `code` — antes de eso el stepper los muestra deshabilitados, sin clic posible.

## Plantilla opcional (`Omitir por ahora`)

`ReportExcelTemplateCard` gana un prop opcional `onTemplateChange` (se dispara al cargar y en cada
subir/eliminar/restaurar) para que el wizard sepa si hay plantilla activa sin duplicar su fetch. Sin plantilla,
`Continuar` del paso 4 desaparece y en su lugar aparece `Omitir por ahora`, que salta directo a `Finalizar` y marca
la plantilla como pendiente en el checklist — el reporte puede guardarse/habilitarse sin ella (ya lo soportaba el
backend; el wizard solo lo hace explícito) y el admin puede volver al paso 4 en cualquier momento desde el stepper.

## Checklist (Paso 7) — `src/lib/reports/report-wizard.ts`

Lógica pura, separada del componente y con 11 tests unitarios propios. Cada ítem se lee del backend **en el
momento de abrir el paso**, nunca de "esta pantalla ya se visitó":

```text
✓/○ Información guardada           — siempre true al llegar aquí (el reporte existe).
✓/○ Fuente configurada: {nombre}   — report.data_source.enabled.
✓/○ N columnas configuradas        — builder.columns.length (fetch fresco).
✓/○ Plantilla Excel · vN           — existencia del template (fetch fresco).
✓/○ N campos mapeados              — cuenta placeholders reconocidos vía inspección fresca,
                                      reutilizando savedPlaceholderOf() de #30 (mismo criterio
                                      que decide si una celda "trae un mapeo administrado").
✓/○ Fila de productos configurada  — solo si la fuente declara REPEATABLE_ROWS; detecta un
                                      mapeo rows.* en la inspección fresca.
✓/○ Vista previa generada          — el único hecho que el backend no persiste: se guarda como
                                      estado de sesión (onPreviewReady, nuevo en
                                      ReportExcelTemplatePreview/ReportExcelTemplateInspector),
                                      explícitamente así por diseño — la issue lo pide "durante
                                      la sesión", no reconstruido de otra fuente.
```

Sin puntuaciones ni porcentajes — cada ítem es `done: boolean` más una etiqueta factual. Un fallo cargando este
estado (backend caído) muestra error + botón "Reintentar", nunca asume que todo está listo.

La acción final usa el `enabled` real: si está deshabilitado, `Habilitar reporte` hace el único `PATCH` con
`enabled: true` (nunca lo alterna a `false` — deshabilitar un reporte vivo queda fuera de este paso). Si ya está
habilitado, el botón es `Guardar y finalizar`, que regresa al catálogo — nunca finge un flujo de publicación nuevo
sobre un reporte que ya está en producción.

## Reanudar / deep-link

Para un reporte existente sin `?step=` explícito, el wizard hace un fetch ligero (`getReportBuilder` +
`getReportExcelTemplate`, best-effort) para decidir el primer paso con pendientes entre 3 y 4 (sin columnas → Datos
del reporte; con columnas pero sin plantilla → Plantilla Excel; con ambos → Mapear campos) — nunca intenta detectar
"tiene mappings" o "tiene preview" de antemano, para no pagar una inspección extra solo por decidir dónde aterrizar
cuando el propio stepper permite llegar ahí en un clic. No se persiste "último paso" en base de datos, tal como
permite la issue.

El paso actual se sincroniza al URL vía `router.replace(..., { scroll: false })` (sin `useSearchParams`/`Suspense`:
el paso `searchParams` del propio Server Component alimenta el primer render, evitando el requisito de build de
Next de envolver en `Suspense` a quien llame `useSearchParams`).

## Catálogo administrativo

`Configurar` en `/administracion/reportes` ahora enlaza a `/administracion/reportes/{code}/configurar` (el
wizard). La pantalla larga original (`/administracion/reportes/[code]/page.tsx`) se dejó intacta como vista de
depuración secundaria — ya componía los mismos tres componentes sin lógica propia que duplicar, así que conservarla
no viola "no reescribir cada editor"; simplemente dejó de ser el punto de entrada principal.

## Rutas

```text
/administracion/reportes                          (catálogo — botón Configurar actualizado)
/administracion/reportes/nuevo                     (wizard, creación)
/administracion/reportes/[code]/configurar         (wizard, edición — NUEVA)
/administracion/reportes/[code]                    (pantalla larga original, sin cambios — fallback/debug)
/administracion/reportes/[code]/plantilla          (editor visual standalone de #29–#31, sin cambios)
/donaldson/reports, /donaldson/reports/[code]      (runtime público — sin tocar)
```

## Componentes nuevos

- `report-configuration-wizard.tsx` — el shell: estado de paso, gating, sincronía de modo mapper↔wizard, redirect
  progresivo, sincronía de URL.
- `report-wizard-stepper.tsx` — el stepper presentacional.
- `report-wizard-finalize-step.tsx` — Paso 7.
- `report-wizard.ts` — lógica pura (orden de pasos, paso de reanudación, checklist).

## Componentes extendidos (props aditivos, sin romper comportamiento previo)

- `ReportDefinitionForm`: `section`, `createRedirectPath`, `onSaved`.
- `ReportExcelTemplateCard`: `onTemplateChange`.
- `ReportExcelTemplateInspector`: `mode`/`onModeChange` (controlado opcional), `onPreviewReady`.
- `ReportExcelTemplatePreview`: `onPreviewReady`.

## Validación del 17 de septiembre de 2026

- `npm test`: 37 archivos, 356 tests pasan (332 previos de #29–#32 + 24 nuevos: 11 de `report-wizard.ts`, 5 del
  stepper, 6 de `ReportWizardFinalizeStep`, 13 del shell — con los 5 componentes existentes reemplazados por dobles
  de prueba deliberadamente, para probar la orquestación del wizard sin volver a probar cada editor ya cubierto en
  su propio archivo). Las 13 pruebas de `ReportDefinitionForm` y las de `ReportExcelTemplateCard` siguen pasando sin
  cambios tras los props aditivos.
- `npm run lint`: pasa.
- `npx tsc --noEmit` en el workspace completo: mismos nueve errores preexistentes y ajenos ya documentados por
  #29–#32 (cinco `loading.tsx` con skeletons inexistentes, `isActive` no exportado en `sidebar.tsx`, `deleteReport`
  inexistente en `admin-report-row.tsx`, variantes `success`/`warning` de `Badge` en `status-badge.tsx`). Ningún
  archivo tocado por esta issue aparece en la lista.
- `npm run build` en el workspace completo: falla por los mismos cinco imports de skeletons inexistentes que
  #29–#32 ya reportaron sin resolver (trabajo ajeno, sin commitear, fuera del alcance de esta issue). Ninguna de las
  rutas o componentes nuevos de esta issue aparece entre los errores.
- `git diff --check`: pasa.

## E2E

**No se ejecutó un recorrido E2E real contra un backend en navegador en esta sesión** (la issue lo marca como
obligatorio; no se dispuso de un backend `reportes` corriendo ni se cargaron las herramientas de navegador). Lo que
sí se validó: cada pieza de orquestación (gating de pasos, redirect progresivo, sincronía de modo, checklist,
persistencia del estado al cambiar de paso) tiene tests de integración con la superficie de red simulada. Falta,
como paso siguiente antes de dar la issue por completa, repetir el recorrido `Nuevo reporte → Información → Fuente
QUOTATION_ROWS → columnas/fórmulas/totales → subir XLSX → mapear visualmente → preview con varias partidas →
descargar Excel de prueba → habilitar → runtime público → documento final` contra el backend real, tal como #29
sí hizo para su propia entrega.

## Limitaciones y pendientes

- Los mismos bloqueos que #29–#32 documentaron (build/typecheck del workspace por archivos ajenos sin commitear, la
  plantilla real Bonatti fuera de los límites del inspector) siguen sin resolverse — no son de esta issue.
- El fetch de reanudación (`resumeReportWizardStep`) es best-effort: si falla, el wizard abre silenciosamente en
  Información en vez de mostrar un error — una decisión consciente para no bloquear la apertura del wizard por un
  fallo en un cálculo cosmético, pero vale la pena revisarla si en la práctica confunde a un administrador.
- No se agregó una acción para deshabilitar un reporte ya habilitado desde el wizard (fuera del alcance explícito
  de la issue: "no fingir un proceso de publicación nuevo" se interpretó como "nunca apagar accidentalmente desde
  aquí").
- Falta decidir si vale la pena enlazar desde la pantalla larga (`/administracion/reportes/[code]`) de vuelta al
  wizard para mejorar descubribilidad; no se hizo en esta sesión.
