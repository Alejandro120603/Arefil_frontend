# Arefil Frontend — Visual Implementation

Fecha: 2026-09-03
Rama: `feat/report-data-sources` (sin commits, sin push, sin cambios de rama)
Base: `codex/output/arefil-frontend-visual-recon.md`

## 1. Resumen

Se implementó el rediseño visual progresivo completo sobre el stack actual de Arefil
(Next.js 16.3.0, React 19.2.8, TypeScript, Tailwind 4, shadcn/ui `base-nova` sobre Base UI,
Lucide). No se migró arquitectura, no se copió código de `prototipo1` ni `prototipo2`, y no se
tocó el backend ni los contratos de API.

El trabajo siguió las fases pedidas: tokens y primitives compartidos → shell → prueba de
concepto en Dashboard/Productos/Reportes → listados y detalles → importación → reportes
operativos → administración → report builder → polish.

Resultado: una sola gramática de página (`PageContainer` + `PageHeader` + `DataTableShell` +
`StatCard` + `EmptyState` + `FilterToolbar`), superficies neutras con profundidad mínima,
acción primaria única por pantalla, densidad conservada y cero animación ambiental.

Todo lo funcional se preservó: Server Components, filtros por query string, paginación
server-driven, la máquina de estados de importación, el runtime genérico de reportes con
snapshots y los dos guardados independientes del report builder.

## 2. Estado inicial

- Cuatro archivos con trabajo local sin commit al iniciar: `report-definition-form.tsx`,
  `report-definition-form.test.tsx`, `report-excel-template.ts`, `report-excel-template.test.ts`.
  **Los cuatro se preservaron** (ver §21).
- Cada página repetía `Breadcrumbs` + `h1 text-2xl` + descripción + una pila de `Card` con `gap-6`.
- Filtros, tabla y paginación vivían en cards separadas.
- Estados vacíos: una frase centrada con `py-16`.
- Sin header de escritorio, sin colapso de sidebar, sin tooltips, sin toasts, sin dialogs.
- ~22 `<select>` nativos repitiendo la misma cadena de clases; `globalThis.confirm` para
  confirmar el cambio de fuente de datos; confirmación inline para borrar la plantilla Excel.
- Tokens OKLCH totalmente neutros: canvas, cards y sidebar prácticamente del mismo tono.

## 3. Dirección visual aplicada

Archivo: `src/app/globals.css`

| Capa | Decisión |
| --- | --- |
| Application canvas | gris frío muy claro `oklch(0.977 0.0025 247)` |
| Cards | blancas, `ring-1 ring-border` + `shadow-card` (una sola capa, casi imperceptible) |
| Sidebar | superficie clara diferenciada `oklch(0.991 0.0015 250)`, **no** oscura |
| Texto | grafito `oklch(0.232 0.013 258)` |
| Primary | cobalto sobrio `oklch(0.518 0.163 259)` |
| Success / Warning / Destructive / Info | tokens semánticos con variante `*-strong` para texto sobre tinte |
| Profundidad | `--shadow-card`, `--shadow-raised`, `--shadow-overlay` |
| Movimiento | `--duration-ui: 140ms` como único presupuesto, más bloque `prefers-reduced-motion` global |

Los `*-strong` existen porque los colores semánticos de relleno no alcanzan 4.5:1 como texto
pequeño sobre un chip claro. Ningún componente define color arbitrario: se eliminaron todos los
`emerald-*` y `amber-*` hard-coded del repositorio.

Los tokens `.dark` se actualizaron en paralelo para mantener compatibilidad futura, pero
**dark mode no está activado** (nada aplica `.dark`, no se instaló `next-themes`).

## 4. Design system creado

- Escala de radios y densidad de controles: sin cambios (32 px de alto ya era correcto para B2B).
- `Card`: ahora `ring-1 ring-border` + `shadow-card`.
- `Button`: hover de la variante primaria recalculado con `color-mix` para el nuevo cobalto.
- `Badge`: variantes `success`, `warning`, `info` añadidas; `destructive` usa `text-destructive-strong`.
- `Table`: encabezado de 36 px, 12 px de texto en `muted-foreground`, celdas `px-3 py-2`,
  hover de fila con la duración global.
- Utilidad `.num` para números tabulares en importes, conteos y fechas.

## 5. Componentes compartidos

| Archivo | Rol |
| --- | --- |
| `src/components/layout/page-container.tsx` | `PageContainer` con variantes `fluid` (tablas, builder), `wide` (dashboard, detalle) y `form` (altas). Sin `max-w` global. |
| `src/components/layout/page-header.tsx` | Breadcrumb + eyebrow + título + descripción + meta + acciones. Apila en móvil. |
| `src/components/shared/stat-card.tsx` | `StatCard` (label, value, helper, icono, `tone`) y `StatCardGrid`. Sustituye a `HeaderStat`. |
| `src/components/shared/empty-state.tsx` | `EmptyState` con icono, título, descripción y acción. |
| `src/components/shared/filter-toolbar.tsx` | `FilterToolbar`, `FilterField` y `ActiveFilters` (chips con enlace de quitado individual). |
| `src/components/shared/data-table-shell.tsx` | `DataTableShell` / `DataTableHeader` / `DataTableViewport` / `DataTableFooter`. Solo estructura visual. |
| `src/components/shared/status-badge.tsx` | `StatusBadge` (mapa semántico con fallback neutro) y `EnabledBadge`. |
| `src/components/shared/form-section.tsx` | `FormSection` para formularios largos sin card-dentro-de-card. |
| `src/components/ui/native-select.tsx` | `NativeSelect`: `<select>` nativo estilizado igual que `Input`. |
| `src/components/donaldson/import-stepper.tsx` | Stepper de 4 estados derivado solo de la `Phase` del reducer. |

`DataTableShell` **no** introduce un motor de tabla: las tablas siguen usando
`src/components/ui/table.tsx` y el filtrado/orden/paginación sigue siendo server-driven.

## 6. Shell

Archivos: `src/components/layout/app-shell.tsx`, `sidebar.tsx`, `sidebar-provider.tsx`,
`app-header.tsx`, `nav-items.ts`.

- `AppShell` monta `TooltipProvider`, `SidebarProvider`, la sidebar, un header contextual y el `Toaster`.
- Sidebar clara de 240 px, colapsable a 64 px en escritorio, con tooltips cuando está colapsada.
  La preferencia se guarda en `localStorage` y se lee con `useSyncExternalStore` (no en un efecto).
- Navegación móvil con `Sheet`; se cierra al navegar y con Escape (comportamiento del primitive).
- `AppHeader` (52–56 px, sticky) contiene el trigger móvil, el toggle de colapso y la ubicación
  actual derivada de `NAV_SECTIONS` ("Donaldson / Productos").
- Las dos zonas de Reportes se distinguen sin tocar rutas: la sección Administración lleva el
  caption "Configuración", icono `SlidersHorizontal` (vs `FileChartColumn` operativo), y ambas
  páginas llevan eyebrow "Operación" / "Configuración" y enlace cruzado explícito.
- Los breadcrumbs se eliminaron de las páginas de primer nivel (ya los cubre el header
  contextual) y se conservan en detalles, `nuevo` y configuración.

## 7. Dashboard

`src/app/page.tsx`, `src/app/loading.tsx`

- Se conservó `loadDashboardData` intacto (cuatro fuentes con `Promise.allSettled` y degradación
  por card).
- `PageHeader` con eyebrow de salud del backend (indicador compacto, ya no una KPI equivalente),
  acción primaria "Importar lista" y secundaria "Listas de precios".
- Cuatro `StatCard`: productos, última vigencia, items de la última lista y cambios de estado.
- Panel amplio "Última lista importada" (archivo, vigencia, importada, moneda, proveedor, estado)
  con acciones "Ver lista" y "Cancelados"; `EmptyState` accionable cuando no hay listas.
- Card lateral de proveedor Donaldson.
- **Sin gráficas**: no existe una serie real de importaciones que justifique una.

## 8. Productos

`src/app/donaldson/products/page.tsx`

Sigue siendo tabla. `PageContainer fluid` + `PageHeader` + un solo `DataTableShell` con
título/conteo, `FilterToolbar` (búsqueda con icono, número de parte, artículo, page size),
chips de filtros activos con quitado individual, tabla, `EmptyState` diferenciado
(con filtros vs catálogo vacío) y paginación en el footer.

El número de parte es el identificador visual (mono, link al detalle); la descripción es
secundaria (`muted-foreground`, truncada). El botón "Ver detalle" repetido se sustituyó por un
`DropdownMenu` de fila con etiqueta accesible.

## 9. Listas de precios

- `src/app/donaldson/price-lists/page.tsx`: misma anatomía que Productos; "Importar lista" como
  acción primaria del header; `StatusBadge` semántico; `DropdownMenu` de fila con "Ver detalle" y
  "Ver cancelados".
- `src/app/donaldson/price-lists/[id]/page.tsx`: cabecera de entidad (vigencia como título,
  archivo como descripción, `#id` + estado como eyebrow, proveedor/moneda/fecha como meta),
  strip de 4 `StatCard`, y una sola superficie para toolbar + items + paginación.
  Las descargas se movieron al header como acción única con menú (`DownloadButtons` reescrito a
  `DropdownMenu` + toasts), eliminando la card "Descargas".

**Decisión sobre Tabs Items / Cambios de estado:** no se implementaron. "Cambios de estado" ya es
una ruta propia (`/donaldson/cancelados?price_list_id=…`) con su propia paginación server-driven;
convertirla en tab exigiría duplicar esa lógica. En su lugar hay un botón explícito en el header.

## 10. Cancelados

`src/app/donaldson/cancelados/page.tsx`

Tabla conservada. Selector de lista dentro de la `FilterToolbar`, strip de `StatCard`
(lista seleccionada, vigencia, total de cambios, desglose de la página) y `EmptyState`
accionable tanto para "sin listas importadas" como para "sin cancelados en esta lista".

**Decisión sobre Combobox:** se mantuvo `NativeSelect` en lugar de introducir Popover + Command.
El backend limita el selector a 100 listas, el control nativo soporta type-ahead de teclado y la
página sigue siendo un Server Component con formulario GET. Un combobox habría añadido estado de
cliente sin resolver un problema real. Queda documentado como el punto donde introducirlo si el
catálogo crece.

## 11. Importación

`src/app/donaldson/import/page.tsx` y todos los `import-*.tsx`.

- **El reducer y la máquina de estados no se tocaron.** Se reutilizaron `ImportDropzone`,
  `SelectedFileCard`, `ImportPreviewSummary`, `ImportProductsSampleTable`, `ImportIssuesPanel` y
  `ImportResult`.
- Nuevo `ImportStepper`: Archivo → Validación → Confirmación → Resultado, derivado exclusivamente
  de `Phase` (horizontal en escritorio, "Paso N de 4" en móvil).
- Todo el flujo vive en una sola card con footer de acción contextual ("Analizar archivo" /
  "Confirmar importación") y una línea que explica qué hace el botón.
- `Progress` indeterminado durante la validación.
- La dropzone se compacta a una fila al seleccionar archivo (`SelectedFileCard` ya no es Card).
- Preview sin cards anidadas: metadata + `StatCard` de resumen + tabla de muestra + incidencias.
- Errores bloqueantes siempre visibles; advertencias en `Collapsible`.
- Éxito de confirmación con toast, además del estado de resultado con KPIs y acciones.

**No se inventó nada:** sin porcentaje de progreso, sin detección de hojas, sin selección de hoja.
`src/lib/api/imports.ts` no expone esos datos.

## 12. Reportes operativos

- `src/app/donaldson/reports/page.tsx`: el grid de cards se reemplazó por lista tabular compacta
  (`report-catalog-list.tsx`, sustituye a `report-catalog-cards.tsx`): Reporte + descripción,
  Categoría, Estado, Acciones. "Generar" es primaria; "Configurar" queda visible como secundaria
  ghost porque es la única entrada a la superficie administrativa desde aquí. Escala a 50+ filas.
- `src/app/donaldson/reports/[code]/page.tsx`: header con código, categoría y accesos
  "Catálogo" / "Configurar".
- `src/components/reports/generic-report-runtime.tsx`: layout split en escritorio — panel de
  parámetros sticky de 360 px + vista previa a ancho completo; apilado en móvil. Barra de
  ejecución con la hora de generación y las descargas asociadas a *esa* ejecución, manteniendo la
  distinción entre "Documento" (snapshot `execution_id`) y "Exportar datos" (parámetros).
  `EmptyState` mientras no hay ejecución. "Regenerar reporte" sigue visible en el panel.

**Decisión sobre colapsar parámetros:** no se auto-colapsan. Los renglones repetibles deben
permanecer editables para regenerar, y el split ya resuelve el problema de espacio.

## 13. Administración de reportes

- `src/app/administracion/reportes/page.tsx`: tabla con toolbar (búsqueda, estado, categoría) y
  chips de filtros activos. Columnas: Reporte, Código, **Fuente de datos**, Categoría, Estado,
  Acciones. El filtrado ocurre en el Server Component sobre la respuesta completa de
  `listReportDefinitions` (la API no expone parámetros de búsqueda), pero el estado sigue en la URL.
- `src/app/administracion/reportes/nuevo/page.tsx`: `PageContainer form` (max-w-3xl), página
  dedicada.
- `src/components/reports/report-definition-form.tsx`: dividido en `FormSection` General → Fuente
  de datos → Parámetros → Archivo, con footer de acciones sticky, `Textarea` y `NativeSelect` en
  lugar de controles con clases duplicadas, éxito por toast y errores de validación inline.
  El `globalThis.confirm` del cambio de fuente se sustituyó por un `AlertDialog`.

**Eliminar reporte: bloqueado.** `src/lib/api/reports.ts` solo expone `deleteReportExcelTemplate`;
no hay endpoint para borrar una definición. La acción no se renderiza (ver §22).

## 14. Report Builder

`src/app/administracion/reportes/[code]/page.tsx` y
`src/components/reports/report-builder-workspace.tsx`.

- **No se reescribió la lógica.** Estado, validaciones, guardado, preview y contratos quedaron
  idénticos; solo cambió la presentación.
- Una sola tira de tabs para toda la configuración: **General · Entradas · Columnas · Totales ·
  Excel · Vista previa**. El workspace es dueño de los tabs porque ya es dueño del estado del
  builder; el formulario de definición y la card de plantilla Excel se le pasan como slots
  (`generalSlot`, `templateSlot`) para evitar tabs anidados.
- **Los errores nunca se esconden:** todas las alertas (carga, validación, guardado, éxito) se
  renderizan por encima de la tira de tabs. Los tabs con cambios pendientes muestran un punto
  ámbar y Columnas muestra un punto rojo cuando hay errores de validación.
- Barra de guardado sticky **por ámbito**: solo aparece en los tabs del constructor y dice
  "Guardar constructor". No existe "Guardar todo": definición, builder y plantilla son tres
  escrituras independientes en el backend y la UI no promete atomicidad que no existe.
- El borrado de plantilla Excel pasó de confirmación inline a `AlertDialog`.
- El estado se conserva al cambiar de tab porque vive en el workspace, no en los paneles.

**Sheet para editar un elemento individual: no implementado.** Los editores de columnas, totales
y parámetros mantienen todo el array en el estado del padre y validan de forma cruzada
(fórmulas que referencian otras columnas/resúmenes). Extraerlos a un Sheet exigía tocar
exactamente la lógica que el brief pidió no reescribir, con el mayor riesgo del proyecto. Los
tabs ya resolvieron el problema de scroll; queda como siguiente paso aislado.

## 15. Responsive

- `PageContainer` con tres anchos: `fluid` (tablas y builder usan todo el espacio disponible),
  `wide` (1480 px máx.) y `form` (max-w-3xl, para que las altas no ocupen 1920 px).
- `PageHeader`, `FilterToolbar` y las barras de acciones apilan con `flex-wrap` en pantallas
  estrechas.
- Tablas dentro de `overflow-x-auto` (el primitive `Table` ya lo provee); ningún `body` con
  scroll horizontal — verificado en el navegador (`documentElement.scrollWidth === innerWidth`).
- Sidebar oculta bajo `md` y sustituida por `Sheet`; runtime de reportes pasa de split a stack
  bajo `xl`.
- Se sustituyeron los anchos fijos (`w-96`, `w-64`, `w-56`) por `w-full sm:w-…`.

**Limitación honesta:** el gestor de ventanas de este entorno ignoró los intentos de redimensionar
Chrome por debajo de ~1250 px, así que las verificaciones visuales reales se hicieron a ~1675 px.
Los breakpoints (`sm`/`md`/`lg`/`xl`) están aplicados por construcción, pero **no se pudo tomar una
captura real a 390 px ni a tablet**. Recomiendo una pasada manual en esos anchos.

## 16. Accesibilidad

- `focus-visible` con anillo de 3 px conservado en todos los primitives; los links de tabla
  (número de parte, vigencia, reemplazo) lo llevan explícitamente.
- Columnas de acciones con `<span className="sr-only">Acciones</span>`; icon buttons con
  `aria-label` que nombra la fila ("Acciones de P181050").
- Toggle de sidebar con `aria-label` + `aria-pressed`; tooltips en la sidebar colapsada.
- Stepper de importación con `aria-current="step"` y `aria-label` en la lista.
- Confirmaciones destructivas con `AlertDialog` (atrapa foco) en vez de `window.confirm` y de
  botones inline.
- El color nunca es la única señal: badges y `StatCard` llevan siempre etiqueta, y los semánticos
  llevan icono.
- Tokens `*-strong` para garantizar contraste de texto sobre chips tintados.
- `prefers-reduced-motion` respetado globalmente; la sidebar cambia de ancho sin transición para
  no desplazar la columna de contenido.

## 17. Dependencias agregadas

| Dependencia | Motivo |
| --- | --- |
| `sonner` (^2.0.8) | Toasts accesibles para guardado, descargas e importación confirmada. La alternativa era seguir empujando el layout con Alerts inline en cada éxito. La instaló el componente `sonner` de shadcn. |

- `next-themes` entró como dependencia transitiva del componente `sonner` de shadcn y **se
  desinstaló**: el `Toaster` se fijó a `theme="light"` porque dark mode está fuera de alcance.
- **No** se agregaron: Framer Motion, Motion, Three, React Three Fiber, cobe, dotted-map, Tremor,
  Tabler Icons, React Icons, Recharts, TanStack Table, React Hook Form, Zod, next-themes,
  react-day-picker, react-resizable-panels.

Componentes shadcn generados con la configuración actual (`base-nova`, Base UI), no copiados de
los prototipos: `dropdown-menu`, `tooltip`, `tabs`, `sheet`, `alert-dialog`, `sonner`
(primera tanda) y `progress`, `collapsible`, `textarea` (al llegar a las pantallas que los
necesitaban). No se generaron `popover`, `command` ni `scroll-area` porque ninguna pantalla los
necesitó (ver §10).

## 18. Archivos creados

```
src/components/layout/page-container.tsx
src/components/layout/page-header.tsx
src/components/layout/app-header.tsx
src/components/layout/sidebar-provider.tsx
src/components/shared/stat-card.tsx
src/components/shared/empty-state.tsx
src/components/shared/filter-toolbar.tsx
src/components/shared/data-table-shell.tsx
src/components/shared/status-badge.tsx
src/components/shared/form-section.tsx
src/components/donaldson/import-stepper.tsx
src/components/reports/report-catalog-list.tsx
src/components/reports/report-catalog-list.test.tsx   (renombrado desde report-catalog-cards.test.tsx)
src/components/ui/native-select.tsx
src/components/ui/dropdown-menu.tsx
src/components/ui/tooltip.tsx
src/components/ui/tabs.tsx
src/components/ui/sheet.tsx
src/components/ui/alert-dialog.tsx
src/components/ui/sonner.tsx
src/components/ui/progress.tsx
src/components/ui/collapsible.tsx
src/components/ui/textarea.tsx
src/app/donaldson/import/loading.tsx
src/app/donaldson/reports/[code]/loading.tsx
src/app/administracion/reportes/[code]/loading.tsx
src/app/administracion/reportes/nuevo/loading.tsx
src/app/administracion/respaldos/loading.tsx
```

Eliminados: `src/components/donaldson/header-stat.tsx` (absorbido por `StatCard`) y
`src/components/reports/report-catalog-cards.tsx` (sustituido por la lista tabular).

## 19. Archivos modificados

**Tokens y primitives:** `src/app/globals.css`, `src/components/ui/card.tsx`, `button.tsx`,
`badge.tsx`, `table.tsx`.

**Shell:** `src/components/layout/app-shell.tsx`, `sidebar.tsx`, `nav-items.ts`,
`page-skeletons.tsx`.

**Páginas:** `src/app/page.tsx`, `src/app/error.tsx`,
`src/app/donaldson/{import,price-lists,price-lists/[id],products,products/[id],cancelados,reports,reports/[code]}/page.tsx`,
`src/app/administracion/{reportes,reportes/nuevo,reportes/[code],respaldos}/page.tsx`.

**Componentes de dominio:** `donaldson/{download-buttons,pagination-controls,selected-file-card,
import-dropzone,import-preview-summary,import-products-sample-table,import-issues-panel,
import-result,comparison-summary,comparison-status-badge,comparison-table,status-change-badge,
price-change-indicator}.tsx`, `admin/backup-download-card.tsx`.

**Reportes:** `generic-report-runtime.tsx`, `report-builder-workspace.tsx`,
`report-definition-form.tsx`, `report-excel-template-card.tsx`, `report-column-editor.tsx`,
`report-parameter-editor.tsx`, `report-parameter-group-editor.tsx`, `report-summary-editor.tsx`,
`report-runtime-parameters.tsx`, `report-formula-input.tsx`, `price-list-comparison-preview.tsx`.

**Tests actualizados por cambio de estructura:** `report-builder-workspace.test.tsx`
(activar el tab correspondiente antes de interactuar), `report-definition-form.test.tsx`
(confirmar el cambio de fuente en `AlertDialog` en vez de mockear `globalThis.confirm`),
`report-catalog-list.test.tsx` (renombrado).

## 20. Decisiones técnicas importantes

1. **`NativeSelect` en vez de migrar todo a `Select` de Base UI.** Todos los filtros son
   formularios GET renderizados por Server Components; un `<select>` nativo envía su valor sin
   JavaScript de cliente. El primitive existe para que 22 usos dejen de repetir la misma cadena
   de clases y para igualar la apariencia de `Input`. `Select` queda para controles ya dentro de
   componentes cliente que necesiten items ricos.
2. **Tabs del builder con paneles desmontados.** El estado vive en el workspace, así que
   desmontar el panel no pierde datos y evita el problema de `keepMounted` (contenido oculto que
   sigue en el árbol de accesibilidad). Coste: los selects de opciones del tab "Vista previa"
   vuelven a pedir catálogos al reactivarse.
3. **Ninguna barra "Guardar todo".** Definición, builder y plantilla son tres escrituras
   independientes; la barra sticky es por ámbito.
4. **`useSyncExternalStore` para la preferencia de sidebar.** Leerla en un `useEffect` provocaba
   renders en cascada (regla `react-hooks/set-state-in-effect` del lint del proyecto).
5. **Sin transición de ancho en la sidebar.** Animar el ancho desplaza toda la columna de
   contenido; además, en pruebas reales la transición dejaba el ancho computado atascado.
6. **"Precio más reciente" solo cuando el histórico cabe en una página.** El endpoint devuelve
   las entradas de más antigua a más reciente; en la página 1 de un histórico paginado el último
   elemento no es el más reciente del producto. Se muestra la KPI únicamente si
   `meta.total_pages <= 1`, en vez de mostrar un dato posiblemente falso.
7. **Filtrado de administración en el servidor sobre la respuesta completa.** `listReportDefinitions`
   no acepta parámetros; el filtro se aplica en el Server Component y el estado sigue en la URL.
8. **Toasts solo para lo no bloqueante** (guardados confirmados, descargas iniciadas, importación
   confirmada). Errores de validación y de guardado siguen inline.

## 21. Funcionalidades que deliberadamente NO se cambiaron

- `loadDashboardData` y su tolerancia a fallos por card.
- El reducer completo del flujo de importación y sus guardas de doble envío.
- El runtime genérico de reportes: validación, `AbortController`, invalidación de la ejecución al
  editar parámetros y separación documento/datos por `execution_id`.
- Toda la lógica del report builder: validadores, normalización, `saveReportBuilder`, preview.
- Los contratos de `src/lib/api/**` y `src/types/api.ts`.
- El chart SVG de histórico (`price-history-chart.tsx`) — no se introdujo Recharts.
- Filtrado, orden y paginación server-driven por query string en todos los listados.
- **Trabajo local previo preservado íntegro:** `src/lib/reports/report-excel-template.ts` y
  `report-excel-template.test.ts` no se tocaron; `report-definition-form.tsx` y su test
  conservan los cambios locales y solo recibieron capas de presentación encima.

## 22. Bloqueos encontrados

1. **Eliminar un reporte: sin API.** `src/lib/api/reports.ts` expone `createReport`,
   `updateReport` y `deleteReportExcelTemplate`, pero **ninguna operación de borrado de la
   definición**. La acción no se implementó ni se dejó deshabilitada; hay un comentario en
   `src/app/administracion/reportes/page.tsx` explicándolo. Cuando exista el endpoint, el patrón
   listo para usar es `DropdownMenu → Eliminar → AlertDialog`.
2. **Importación: sin hojas ni progreso.** `previewDonaldsonImport` devuelve una sola respuesta
   sin porcentaje y `ImportPreviewResponse` no expone hojas del Excel. El stepper deriva solo de
   la `Phase` y la validación usa `Progress` indeterminado.
3. **Incidencias de importación sin estructura.** `errors`/`warnings` son `string[]`; no se
   parsean en el frontend. Cuando el backend devuelva `{sheet,row,column,severity}` convendrá una
   tabla filtrable.
4. **Tabs "Items / Cambios de estado" en el detalle de lista:** no implementados porque la
   segunda vista es otra ruta paginada (ver §9).
5. **Sheet por elemento en el builder:** no implementado por riesgo sobre la lógica de
   validación cruzada (ver §14).
6. **Verificación responsive real bajo ~1250 px:** imposible en este entorno (ver §15).

## 23. Validaciones ejecutadas

`package.json` no define `make` ni Makefile; los scripts disponibles son `dev`, `build`, `start`,
`lint`, `test`, `typecheck`. Se ejecutaron los cuatro relevantes tras cada fase y al final:

| Comando | Resultado final |
| --- | --- |
| `npm run typecheck` | OK, sin errores |
| `npm run lint` | OK, 0 errores y 0 warnings |
| `npm test` | 23 archivos, **214 tests, todos en verde** |
| `npm run build` | OK, 16 rutas generadas |

Además se hizo verificación en navegador (`next dev`) del dashboard, productos, importación, del
colapso de la sidebar, de la navegación desde la sidebar colapsada y de la ausencia de overflow
horizontal. El backend no estaba disponible, lo que sirvió para confirmar que todas las pantallas
degradan a `ErrorAlert` / `EmptyState` sin romper el layout.

No se corrigieron bugs ajenos al rediseño.

## 24. Resultado final

Arefil pasa de "panel funcional pero sin terminar" a una aplicación B2B con una gramática visual
única: canvas neutro, superficies blancas con profundidad mínima, cobalto reservado para la acción
primaria, color semántico reservado para significado, densidad alta y movimiento de 140 ms
limitado a hover, tabs y overlays.

La estructura funcional quedó intacta. No hay commits ni push: todos los cambios están en el
árbol de trabajo de `feat/report-data-sources` para revisión manual.
