# Vista previa del documento renderizado — frontend #31

## Alcance

Agrega un modo `Vista previa` al editor visual de plantilla (mismo componente de #29/#30, en
`/administracion/reportes/[code]/plantilla`): captura parámetros de prueba con el runtime real del reporte, ejecuta
el reporte para obtener un `execution_id`, pide al backend `POST /api/admin/reports/{code}/excel-template/render-preview`
(Backend #30, ya presente en `Arefil_backend` local, rama `reportes`) y muestra el XLSX final —renglones repetibles
expandidos, totales en su lugar, placeholders sin resolver marcados— sin que el administrador tenga que descargar el
archivo para ver el resultado. No se creó PR ni se hizo commit todavía; se construyó sobre `feat/visual-template-inspector`.

## Reutilización

- **Cuadrícula**: `report-excel-template-grid.tsx` se renombró a `src/components/reports/workbook-grid.tsx`,
  exportando `WorkbookGrid` — la base compartida que pide la issue. `onSelectCell` es ahora opcional: omitirlo vuelve
  la cuadrícula de solo lectura (sin `role="button"`, sin `tabIndex`, sin manejadores de clic/teclado), que es como
  la usa la vista previa. Se agregó `warningCoordinates` (anillo ámbar) junto a `errorCoordinates` (anillo
  destructivo) ya existente, para marcar celdas con un problema menor —un placeholder que sobrevivió al render— sin
  confundirlo con un error de guardado. El editor de mapeo (#30) sigue siendo el único otro consumidor y no cambió
  de comportamiento.
- **Runtime de parámetros**: la captura de datos de prueba reutiliza `ReportRuntimeParameters` y
  `ReportRepeatableParameters` (los mismos controles del runtime genérico de reportes) más las funciones puras de
  `src/lib/reports/report-runtime.ts` (`validateRuntimeForm`, `initialRuntimeValues`, `initialRuntimeGroupValues`,
  `backendRowErrors`, `reportExecutionId`, `isReportBuilderPreviewResponse`). Cubre parámetros escalares, grupos
  repetibles y selects dependientes porque esos componentes ya lo hacen — nada de eso se reescribió.
- **Ejecución**: `executeReport` (el mismo endpoint que usa `GenericReportRuntime`), no un endpoint nuevo. El
  `execution_id` sale de la respuesta y es lo único que via ja al `render-preview`; los parámetros nunca se
  recalculan después de generar.
- **Descarga**: el botón `Descargar cotización Excel` es el `ReportDocumentDownloadButton` ya existente (#25),
  apuntado al `execution_id` que trae la propia respuesta de `render-preview` — nunca a un estado local — así el
  archivo descargado es exactamente el que se está mostrando.

## Piezas nuevas

- `src/types/api.ts`: `ReportExcelRenderPreviewRequest`, `ReportExcelRenderPreview` (extiende
  `ReportExcelTemplateInspection` con `kind`, `report_code`, `template_version`, `template_checksum`,
  `execution_id`, `generated_at` — espejo de `excel_render_preview.py`).
- `src/lib/api/reports.ts`: `renderReportExcelTemplatePreview(code, executionId)`.
- `src/lib/reports/report-excel-template.ts`: `excelTemplateValidationSummary`, para resumir en una línea el `422`
  estructurado que el backend manda cuando la plantilla deja de ser compatible con el contrato del reporte durante
  el render (caso raro, pero con forma propia — no un string simple).
- `src/components/reports/report-excel-template-preview.tsx` (`ReportExcelTemplatePreview`): el panel de "Vista
  previa" completo — formulario de parámetros, botón `Generar vista previa`, indicadores (`✓ Plantilla vN`,
  `✓ N partidas renderizadas`, `✓ Resúmenes presentes` — presencia, nunca una puntuación inventada),
  `WorkbookGrid` de solo lectura y el botón de descarga.
- `src/components/reports/report-excel-template-inspector.tsx`: agrega los tabs `Diseño`/`Vista previa` dentro del
  mismo `Card`. Ambos paneles quedan siempre montados (`display: contents` / `hidden`, nunca desmontaje): cambiar de
  tab no pierde el estado de ninguno de los dos, y el modo Diseño sigue siendo el único que permite seleccionar o
  asignar celdas — Vista previa nunca recibe `onSelectCell`.

## Estados cubiertos

- Cambios sin guardar en la plantilla: bloquea `Generar vista previa` con el mensaje exacto de la issue
  ("Guarda los cambios de la plantilla antes de generar la vista previa.") y deshabilita el botón.
- Reporte sin parámetros: se salta el formulario con una nota, el botón queda habilitado directamente.
- Parámetros faltantes/opciones cargando: reutiliza la validación y el estado `optionsReady`/`loadingOptions` de los
  mismos componentes de runtime.
- Ejecución en curso / render en curso: el botón cambia de texto (`Generando ejecución…` / `Renderizando
  documento…`) y se autodeshabilita.
- Dataset vacío (`row_count = 0`): nota informativa, no error — el preview igual se genera.
- Ejecución expirada (`404` de `render-preview`): "La vista previa expiró" + "Regenera la vista previa para
  continuar.", con el botón de generar disponible de nuevo.
- Error de render (`422`/`504`/`409`): `ErrorAlert` con el mensaje del backend, o el resumen de
  `excelTemplateValidationSummary` cuando el detalle es la validación estructurada.
- Workbook demasiado grande: mismo límite y mensaje que el inspector (#29), aplicado a la hoja renderizada activa.
- Placeholders sin resolver en el documento renderizado: alerta de advertencia con el conteo, celdas marcadas en
  ámbar en la cuadrícula — configuración incompleta, no un error de transporte.
- Cambiar cualquier parámetro invalida el preview anterior (vuelve a `idle`), igual que el patrón ya usado por
  `GenericReportRuntime`.
- "sin plantilla" no se duplicó: el tab Vista previa solo es alcanzable una vez que el editor ya está en su estado
  `ready` (plantilla activa cargada) — el estado ya lo cubre el inspector.

## Validación del 17 de septiembre de 2026

- `npm test`: 32 archivos, 308 tests pasan (295 previos de #29/#30 + 13 nuevos: 2 de `WorkbookGrid` en modo
  solo-lectura/advertencia, 11 de `ReportExcelTemplatePreview`, 2 de integración del tab en el editor).
- `npm run lint`: pasa.
- `npx tsc --noEmit` en el workspace completo: mismos nueve errores preexistentes y ajenos ya documentados por
  #29/#30 (cinco `loading.tsx` con skeletons inexistentes, `isActive` no exportado en `sidebar.tsx`, `deleteReport`
  inexistente en `admin-report-row.tsx`, variantes `success`/`warning` de `Badge` en `status-badge.tsx`). Ningún
  archivo tocado por esta issue aparece en la lista.
- `npm run build` en el workspace completo: falla por los mismos cinco imports de skeletons inexistentes que #29/#30
  ya reportaron sin resolver (trabajo ajeno, sin commitear, fuera del alcance de esta issue). No se modificaron esos
  archivos. Igual que en #30, no fue posible aislar una build limpia de esta feature en esta sesión: el entorno
  bloqueó mover esos cinco archivos fuera del repo real (política de acciones destructivas), y copiar el repo a un
  directorio temporal para probarlo ahí falló porque Turbopack rechaza un `node_modules` simbólico que apunte fuera
  del árbol del proyecto al cruzar de filesystem (`/tmp` vs `/home`).
- `git diff --check`: pasa.
- No se ejecutó contra el backend real ni en navegador en esta sesión; la superficie de red se validó solo con los
  mocks de `vitest`.

## Pendientes para aceptación completa

Los mismos bloqueos que #29/#30 documentaron (build/typecheck del workspace por archivos ajenos, la plantilla real
Bonatti fuera de los límites del inspector) siguen sin resolverse — no son de esta issue. Falta validar contra un
backend real en navegador, y decidir rama/commit/PR de todo el trabajo acumulado en `feat/visual-template-inspector`.
