# Mapeador visual de celdas — frontend #30

## Alcance

Convierte el inspector visual de plantilla (Frontend #29) en el editor funcional pedido por la issue: el administrador
selecciona una celda de `/administracion/reportes/[code]/plantilla` y le asigna un campo amigable del reporte
(`report`/`parameters`/`rows`/`summary`), sin escribir `{{...}}`. Los cambios se acumulan localmente y se guardan en
lote contra `PUT /api/admin/reports/{code}/excel-template/mappings` (Backend #29,
`Arefil_backend/backend/app/schemas/excel_mappings.py` / `app/services/reports/excel_mappings.py`, ya presente en el
repo backend local). No se creó PR ni se hizo commit; se construyó sobre el trabajo sin commitear de `feat/visual-template-inspector`
(#29), conservándolo tal cual.

## Arquitectura

- `src/types/api.ts`: `ExcelCellTarget`, `ExcelCellMapping`, `ExcelMappingsRequest`, `ExcelMappingIssue`,
  `ExcelMappingsResponse` — contrato tipado del PUT de mappings, espejo de `excel_mappings.py`.
- `src/lib/api/reports.ts`: `updateReportExcelTemplateMappings`.
- `src/lib/reports/report-excel-mapping.ts` (nuevo): sin DOM ni red, testeable de forma aislada.
  - `buildMappingFieldGroups`/`indexMappingOptions`: deriva el picker agrupado ("Datos del reporte", "Datos
    capturados", "Renglones / productos", "Resumen y totales") del contrato real del `ReportBuilderDefinition`
    (`getReportBuilder`) — no hardcodea `COTIZACION`. Los campos fijos de `report` replican `_REPORT_KEYS` del backend;
    `rows` usa solo columnas visibles más `row_number`; `summary` lee `excel_layout.totals`, con fallback de etiqueta
    para el total `SUM` heredado (pre-#20) que no trae `label` propio.
  - `PendingCellChange`/`pendingKey`: los cambios sin guardar viven en un `Map<"hoja!celda", change>` en el
    componente, superpuestos a la última inspección cargada.
  - `savedPlaceholderOf`/`effectivePlaceholder`: una celda solo cuenta como "con placeholder administrado" cuando su
    valor completo es un único token reconocido — igual a lo que el backend permite `clear`ar.
  - `repeatableRows`/`primaryRepeatableRow`: fila(s) con mapeos `rows.*`, contando tanto lo guardado como lo
    pendiente, incluida una celda en blanco que el backend nunca envía. Usado para resaltar la fila repetible y para
    bloquear en UI un segundo `rows.*` en otra fila.
  - `buildCellOverlays`: la insignia amigable (`[P] Cliente`) que reemplaza el placeholder crudo en la cuadrícula.
  - Cubierto por `report-excel-mapping.test.ts` (17 casos).
- `src/components/reports/report-excel-template-grid.tsx`: props nuevas y opcionales (`overlays`,
  `errorCoordinates`, `repeatableRow`); nada roto de #29. Una celda mapeada muestra la insignia amigable en vez del
  placeholder crudo (técnico disponible en `title`); una fórmula muestra un indicador `ƒx`; la fila repetible tiñe su
  encabezado; una celda con error del backend se resalta con un anillo destructivo.
- `src/components/reports/report-excel-template-inspector.tsx`: mismo nombre/ruta que #29 (la página no cambió),
  ahora con edición completa. Carga inspección + builder en paralelo; mantiene el estado de carga/sin
  plantilla/límites/error de #29 y agrega:
  - Panel de mapeo por celda: ubicación, contenido, combinación, fórmula (bloquea mapping con mensaje explícito),
    selector agrupado de campo, `Asignar`, `Quitar asignación` (solo si la celda ya tiene un placeholder guardado) y
    `Deshacer cambio` (si el cambio es local y aún no se guardó).
  - Los campos `rows.*` se deshabilitan en el selector cuando ya existe una fila repetible distinta en la hoja.
  - Indicador `Cambios sin guardar` + `beforeunload` mientras haya cambios pendientes (sin interceptar la navegación
    interna de Next.js — el mínimo que pide la issue, sin hacks frágiles).
  - `Guardar cambios`: valida en cliente que ninguna hoja termine con más de una fila repetible antes de llamar al
    backend; envía `mappings`/`clear` en un solo `PUT` con `base_version`/`base_checksum` de la última inspección;
    bloquea doble submit mientras la petición está en vuelo.
  - `409` (versión obsoleta): banner con el texto exacto de la issue y botón `Recargar`; los cambios locales se
    conservan hasta que el usuario recarga explícitamente (nunca se sobrescriben en silencio).
  - `422` con `detail.errors`: los errores con `cell` se muestran en la celda (anillo) y en el panel al seleccionarla;
    los errores sin `cell` (p. ej. `multiple_repeatable_rows` que el backend detecte) se listan aparte. Los cambios
    locales se conservan para que el usuario los corrija sin perder el resto del trabajo.
  - Al guardar con éxito se reemplaza la inspección por la que devuelve el propio `PUT` (ya trae versión/checksum
    nuevos), se limpian los pendientes y se muestra un aviso con la versión guardada.

## Decisiones

- Se reutilizó el nombre `ReportExcelTemplateInspector`/mismo archivo en vez de renombrar a "mapper": la página y sus
  imports no cambian, y el componente sigue siendo, en esencia, el inspector de #29 con edición encima.
- El indicador `[P]`/`[R]`/`[Σ]`/`[D]` es texto, no solo color, para accesibilidad; el placeholder técnico
  (`{{namespace.key}}`) queda en `title` (tooltip), nunca como texto principal.
- No se intentó reconciliar cambios pendientes tras un `409`: se descartan al recargar explícitamente. Es la opción
  seguible sin heurísticas de merge, y coincide con "no sobrescribir silenciosamente" — el usuario decide cuándo
  recargar y vuelve a aplicar sus cambios sobre la versión vigente.

## Validación del 17 de septiembre de 2026

- `npm test`: 31 archivos, 291 tests pasan (261 previos de #29 + 30 nuevos: 17 de `report-excel-mapping.test.ts`, 4
  de grid, 9 nuevos/reescritos del mapeador).
- `npm run lint`: pasa.
- `npx tsc --noEmit` en el workspace completo: mismos nueve errores preexistentes y ajenos ya documentados por #29
  (skeletons inexistentes en cinco rutas `loading.tsx`, `isActive` no exportado en `sidebar.tsx`, `deleteReport`
  inexistente en `admin-report-row.tsx`, variantes `success`/`warning` de `Badge` en `status-badge.tsx`). Ningún
  archivo tocado por esta issue aparece en la lista.
- `npm run build` en el workspace completo: falla por los mismos cinco imports de skeletons inexistentes que #29 ya
  reportó sin resolver (trabajo ajeno, sin commitear, fuera del alcance de esta issue). No se modificaron esos
  archivos. No fue posible aislar un build limpio de esta feature en esta sesión (el intento de excluir esas rutas
  para una build de verificación quedó bloqueado por la política de acciones destructivas del entorno).
- No se ejecutó contra el backend real ni en navegador en esta sesión (a diferencia de #29, que sí lo hizo);
  la superficie de red se validó únicamente con los mocks de `vitest`. El contrato usado (`excel_mappings.py`,
  `app/api/routes/admin.py`) se leyó directamente del repo `Arefil_backend` local (rama `reportes`, ya con el
  endpoint implementado).

## Pendientes para aceptación completa

Los mismos bloqueos que #29 documentó (build/typecheck del workspace por archivos ajenos, y la plantilla real Bonatti
fuera de los límites del inspector) siguen sin resolverse — no son de esta issue. Falta además: validar contra un
backend real en navegador (como sí se hizo para #29) y decidir rama/commit/PR de todo el trabajo acumulado en
`feat/visual-template-inspector`.
