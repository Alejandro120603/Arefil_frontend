# Visual Template Builder — aceptación E2E final (batch #28–#33)

Fecha de la corrida: **2026-09-19**
Alcance: aceptación E2E real de **Frontend #33** sobre el stack completo, validación del
batch **#28–#33** en ambos repos y preparación (sin merge) hacia `reportes`.

---

## 1. SHAs y branches auditados

| Repo | Branch | SHA HEAD | `origin/reportes` | Relación |
|---|---|---|---|---|
| `Arefil_frontend` | `feat/visual-template-inspector` | `1d6342a` + los 2 commits de esta sesión (ver §11) | `7b934adce09e50c6a68ce6bce85070f7a7451696` | 15 commits por delante; base `7e6eb07` |
| `Arefil_backend` | `reportes` | `c9ac7e9594737d6d397176eac1e35527807ba8b8` | `893d9df850ddf5609a38b8afda75d5851429b72b` | 2 commits por delante (fast-forward posible) |

SHA de inicio de sesión en frontend: `9c43a7544d834f16894c5d5eafe4fd16e512538d`
(los dos commits nuevos `1d6342a` y `569a03a` se explican en §5/§6).

### Verificación de la base de partida

- `git diff 7e6eb07 origin/reportes` en frontend → **vacío**. El único commit que
  `origin/reportes` tiene y la rama no (`7b934ad`) es el merge commit de
  `feat/report-data-sources`, cuyo contenido ya está en la base. **No hay trabajo previo
  en riesgo de perderse.**
- Backend: `git merge-base --is-ancestor origin/reportes HEAD` → **sí**, merge fast-forward.
- Simulación de merge sin tocar el árbol (`git merge-tree --write-tree origin/reportes HEAD`)
  → **sin conflictos en ambos repos**.

---

## 2. Estado git de ambos repos

### Frontend — archivos sin commitear (todos AJENOS al batch, **preservados intactos**)

```
codex/output/arefil-frontend-visual-implementation.md
codex/output/arefil-frontend-visual-recon.md
codex/output/cotizacion-bonatti-e2e.md
codex/output/cotizacion-bonatti/                     (incluye COTIZACION_BONATTI_v1.xlsx — NO se subió al repo)
codex/output/delete-reports-price-lists.md
codex/scripts/
src/app/administracion/reportes/[code]/loading.tsx
src/app/administracion/reportes/nuevo/loading.tsx
src/app/administracion/respaldos/loading.tsx
src/app/donaldson/import/loading.tsx
src/app/donaldson/reports/[code]/loading.tsx
src/components/donaldson/delete-price-list-button.tsx
src/components/donaldson/import-stepper.tsx
src/components/donaldson/price-list-delete-dialog.tsx
src/components/donaldson/price-list-row.test.tsx
src/components/donaldson/price-list-row.tsx
src/components/layout/app-header.tsx
src/components/layout/page-container.tsx
src/components/layout/page-header.tsx
src/components/layout/sidebar-provider.tsx
src/components/reports/admin-report-row.test.tsx
src/components/reports/admin-report-row.tsx
src/components/reports/report-catalog-list.test.tsx
src/components/reports/report-catalog-list.tsx
src/components/shared/
src/components/ui/collapsible.tsx
src/components/ui/dropdown-menu.tsx
src/components/ui/progress.tsx
src/components/ui/sonner.tsx
src/components/ui/textarea.tsx
src/components/ui/tooltip.tsx
src/lib/api/price-list-actions.test.ts
src/lib/api/price-list-actions.ts
```

La lista es **idéntica** a la del inicio de la sesión. No se borró, movió ni reescribió
ninguno de estos archivos (se usó una cuarentena temporal **fuera del repo** sólo para
medir el build limpio, con restauración verificada).

### Backend — archivos sin commitear (AJENOS, preservados)

```
backend/app/db/models/report_deletion_marker.py
backend/app/services/catalog/price_lists.py
backend/migrations/versions/ab3d5e7f9012_preserve_report_deletions.py
```

> Nota: `make run_panel` aplicó esa migración ajena (`ab3d5e7f9012`) a la base local de
> desarrollo, porque es el head actual del árbol de trabajo. No se modificó el archivo.

---

## 3. Stack real levantado

Método del proyecto: `make run_panel` (Alembic upgrade + seed + uvicorn + `next dev`).

- Puertos: backend **8010**, frontend **3010**.
  El default (8000) estaba ocupado por un contenedor de **otro proyecto**
  (`cecoc-chatbot-backend-1`), que **no** se detuvo.
- Migraciones: `alembic upgrade head` → `ab3d5e7f9012 (head)`, un solo head, sin ramas.
- Seed Donaldson: idempotente, OK (4 listas de precios, productos P-CLS/P-INC/P-SAME/P-ZERO/P-GONE).
- Proxy `/backend-api/*`: verificado (`GET /backend-api/reports` → 200 desde el backend 8010).
- Endpoints del Visual Template Builder presentes en el OpenAPI y respondiendo:
  - `GET/PUT/DELETE /api/admin/reports/{code}/excel-template`
  - `GET  …/excel-template/download`
  - `GET  …/excel-template/inspect`          (#28)
  - `PUT  …/excel-template/mappings`          (#29)
  - `POST …/excel-template/render-preview`    (#30)
  - `GET  …/excel-template/versions`, `…/versions/{v}/download`, `POST …/versions/{v}/restore` (#31)
- **Sin mocks.** Todo el E2E corrió contra este stack.

---

## 4. E2E de Frontend #33 — paso a paso y evidencia

Reporte creado: **`COTIZACION_E2E_VTB`** ("Cotización E2E VTB", categoría `Pruebas`).
Fuente: **`QUOTATION_ROWS`** (capacidad `REPEATABLE_ROWS`).

### Plantilla usada

El archivo comercial BONATTI existe localmente (`codex/output/cotizacion-bonatti/`) pero
**no se usó ni se subió al repo**. Se generó una plantilla sintética representativa en el
scratchpad de la sesión (`PLANTILLA_E2E_COTIZACION.xlsx`, 6.0 KB), con:

- título combinado `A1:E1` con fuente 18pt, color `#1F3864` y relleno `#DCE6F1`;
- subtítulo combinado `A2:E2` en itálica;
- celda de valor combinada `B5:D5` (para probar anchor de merge);
- banda de encabezados `A8:E8` (negrita, blanco sobre `#1F3864`, bordes, wrap);
- **una** fila de productos (fila 9) con formatos numéricos `"$"#,##0.00` y `#,##0`;
- banda de summary `A11:D11` combinada + `E11`;
- celda de fórmula `E13 = SUM(E9:E9)` (para probar que el mapper la rechaza);
- segunda hoja `Notas` con su propio merge;
- **grupo de ancho de columna `K → XFD` (`<col min="11" max="16384">`)** para ejercitar el
  fix de #28.

### A. Crear reporte — **PASS**

- `/administracion/reportes/nuevo`, paso 1 capturado (nombre, código, descripción, categoría,
  "Reporte habilitado" desmarcado a propósito).
- Paso 2: fuente `Renglones de cotización`; el parámetro de fuente `price_list_id` se
  autocompletó; se agregó el parámetro común `customer_name` (Cliente).
- La creación real ocurre **al final del paso 2** (botón `Crear reporte`, no antes):
  `POST /backend-api/reports` → **201**.
- Redirección al **mismo wizard** con el código persistido:
  `/administracion/reportes/COTIZACION_E2E_VTB/configurar?step=3`, con los pasos 1 y 2 marcados
  como completados.

### B. Datos del reporte — **PASS**

- Grupo repetible `items` ("Productos") con `product_id` + subcampo numérico `quantity`
  (mínimo 1).
- 6 columnas: `row_number` (FIELD `system.row_number`), `part_number`, `description`,
  `unit_price`, `quantity` (PARAMETER `items.quantity`) e `importe`
  (FORMULA `quantity * unit_price`).
- Summaries: `subtotal` = SUM(`importe`) y `total` = FORMULA `ROUND(subtotal * 1.16, 2)`.
- `PUT /api/reports/COTIZACION_E2E_VTB/builder` → 200.
- **Persistencia tras recarga completa** verificada en el navegador:
  `cols=[row_number, part_number, description, unit_price, quantity, importe]`,
  `sums=[subtotal, total]`, `fields=[product_id, quantity]`, contexto `price_list_id`.

### C. Plantilla Excel — **PASS**

- Subida real vía el input de archivo del paso 4 → `PUT …/excel-template` → **201**.
- UI: `Configurada · v1`, `Compatibilidad: Válida`, `Placeholders reconocidos: 0`,
  `Filas repetibles detectadas: 0`, acciones Reemplazar / Descargar / Editar visualmente /
  Historial / Eliminar.
- **Fix de #28 confirmado**: `GET …/excel-template/inspect` devuelve
  `max_column = 5` y **5** entradas en `column_widths` (A–E) para la hoja `Cotizacion`,
  pese a que el XLSX declara el grupo `K→XFD`. Sin el clip a `max_column` la inspección
  habría intentado materializar 16 384 anchos.
- Merges detectados: `A1:E1`, `A2:E2`, `B5:D5`, `A11:D11`; 35 celdas; 16 estilos; 2 hojas.

### D. Mapeo visual — **PASS**

12 mapeos aplicados desde la cuadrícula, siempre eligiendo el dato en un `select` con
etiquetas amigables (nunca se escribió `{{...}}`):

| Celda | Dato | Badge |
|---|---|---|
| `Cotizacion!B3` | `parameters.customer_name` | `[P] Cliente` |
| `Cotizacion!B4` | `parameters.price_list_id` | `[P] Lista de precios` |
| `Cotizacion!B5` (anchor de `B5:D5`) | `report.name` | `[D] Nombre del reporte` |
| `Cotizacion!B6` | `report.code` | `[D] Código` |
| `Cotizacion!C6` | `report.description` | `[D] Descripción` |
| `Cotizacion!A9` | `rows.row_number` | `[R] Número de renglón` |
| `Cotizacion!B9` | `rows.part_number` | `[R] Número de parte` |
| `Cotizacion!C9` | `rows.description` | `[R] Descripción` |
| `Cotizacion!D9` | `rows.quantity` | `[R] Cantidad` |
| `Cotizacion!E9` | `rows.importe` | `[R] Importe` |
| `Cotizacion!E11` | `summary.total` | `[Σ] Total` |
| `Notas!C3` | `report.category` | `[D] Categoría` |

Criterios de aceptación verificados:

- **El usuario nunca escribe `{{...}}`** — el panel lo dice explícitamente y la única entrada
  es el `select` de campos.
- **Badges amigables** — `[D] / [P] / [R] / [Σ]` + etiqueta humana en cada celda mapeada.
- **Fórmulas no editables** — al seleccionar `E13` el panel muestra
  *"Esta celda contiene una fórmula de Excel y no se reemplaza desde el mapeador"* y **no**
  ofrece ni el `select` ni el botón `Asignar`.
- **Merges respetan el anchor** — las celdas esclavas (`C5`, `D5`) no existen como celda
  seleccionable en la cuadrícula; el `colspan` vive en el anchor `B5`.
- **Segunda fila repetible no permitida** — al seleccionar `A10`, las 6 opciones `rows.*`
  quedan `disabled` con el mensaje *"Los campos de «Renglones / productos» están limitados a
  la fila 9, la fila repetible de esta hoja."*
- **Dirty state** — `Cambios sin guardar` en la cabecera y `Cambio sin guardar` por celda;
  guard `beforeunload` activo mientras hay pendientes (bloqueó una navegación real).
- **Un solo PUT al guardar** — el panel de red registra exactamente
  `1 × PUT …/excel-template/mappings → 201` por guardado (verificado en 3 guardados).
- **Persistencia tras recarga** — recarga completa del navegador: v2 con los 9 mapeos
  iniciales intactos y sus badges.

### E. Concurrencia / 409 — **PASS**

1. En el navegador (inspector cargado sobre **v2**) se dejó un mapeo pendiente (`B3`).
2. Desde un **segundo contexto** (cliente HTTP contra el mismo backend) se aplicó otro mapeo
   (`Notas!C3`) → la plantilla activa pasó a **v3** (checksum `b9feacbe…`).
3. Guardado desde el navegador (estado stale):
   - **exactamente 1** `PUT …/mappings` → **409**, **sin reintento automático**;
   - la UI muestra *"La plantilla cambió — La plantilla activa cambió desde que abriste el
     editor. Recarga la versión actual antes de guardar."* con botón `Recargar`;
   - **los cambios locales no se borraron**: `B3` siguió mostrando `[P] Cliente` y la cabecera
     siguió en `Cambios sin guardar` sobre la v2 stale.
4. `Recargar` (acción explícita del usuario) trae la v3 y descarta el borrador, como está
   documentado en el propio diálogo.

> Nota: se intentó primero con dos pestañas reales; la segunda pestaña quedó en segundo plano
> y Chrome suspendió su render (ver §12), así que el segundo contexto se ejecutó contra los
> mismos endpoints HTTP. El camino de código ejercitado es idéntico.

### F. Vista previa — **PASS**

Controles runtime reales del paso 6 (mismos componentes del runtime público):

- `Lista de precios` = `DONALDSON · 2025-10-20 · MXN · small_a.xlsx`
- `Cliente` = `BONATTI E2E S.A. de C.V.`
- 3 renglones capturados: `P-CLS ×3`, `P-INC ×5`, `P-SAME ×2`

Resultado (`POST …/builder/preview` → 200, luego `POST …/render-preview` → 200):

- `execution_id` confirmado (p. ej. `b361ab00-0750-4dad-948a-32c7036357bb` sobre v4 y
  `65628b7f-cd29-4cba-bba0-2f35032b8450` sobre v7).
- **Fila repetible expandida**: la fila 9 se convirtió en 9/10/11 y **todo lo de abajo se
  recorrió 2 filas** (TOTAL pasó de 11 → 13, la fórmula de 13 → 15, el merge `A11:D11` →
  `A13:D13`).
- **`row_number` correcto**: 1, 2, 3.
- **Summaries/totales correctos**: `subtotal = 2600`, `total = 3016` (= `ROUND(2600×1.16, 2)`).
- **Estilos conservados** (medidos sobre el DOM renderizado):
  - `A1` → `font-weight 700`, `18px`, color `rgb(31,56,100)`, fondo `rgb(220,230,241)`,
    centrado, `colSpan 5`;
  - encabezado `No. de parte` → `700`, blanco sobre `rgb(31,56,100)`;
  - `TOTAL` → `700`, alineado a la derecha, `colSpan 4`, fondo de banda.
- **Multi-hoja**: la pestaña `Notas` del preview resolvió `C3` → `Pruebas` (`report.category`).
- **Placeholders no resueltos**: en esta corrida **no quedó ninguno** (los 12 mapeos
  resolvieron). El resaltado ámbar existe en `workbook-grid.tsx` y está cubierto por
  `report-excel-template-preview.test.tsx` ("flags cells that still carry an unresolved
  placeholder…").
- **Parámetros modificados invalidan el preview viejo**: al editar `Cliente` la tabla del
  documento renderizado **desaparece** y el botón `Descargar cotización Excel` deja de
  mostrarse, exigiendo regenerar.

### G. Descarga con el MISMO `execution_id` — **PASS**

- El botón muestra *"El archivo descargado corresponde exactamente a esta vista previa
  (ejecución `b361ab00-…`)"* y llama `downloadReportDocumentXlsx(code, preview.execution_id)`
  (verificado en código y en el test *"the download button reuses the preview's own
  execution_id, not local state"*).
- Descarga real: `POST /backend-api/reports/COTIZACION_E2E_VTB/document/xlsx` → **200**,
  `content-disposition: attachment; filename="cotizacion-e2e-vtb-document.xlsx"`.
- Contenido del XLSX descargado con ese `execution_id`, inspeccionado con openpyxl:

```
sheets ['Cotizacion', 'Notas']   dims A1:E15
merges ['A2:E2', 'A1:E1', 'B5:D5', 'A13:D13']
 1 ['COTIZACION AREFIL', …]
 3 [None, 'BONATTI E2E S.A. de C.V.', …]
 5 ['Reporte:', 'Cotización E2E VTB', …]
 6 ['Codigo:', 'COTIZACION_E2E_VTB', …]
 9 [1, 'P-CLS', 'Filtro de aceite', '3', 1500]
10 [2, 'P-INC', 'Filtro de aire primario', '5', 500]
11 [3, 'P-SAME', 'Filtro hidraulico', '2', 600]
13 ['TOTAL', None, None, None, 3016]
15 [None, None, None, 'Control (formula):', '=SUM(E9:E9)']
A1: bold=True size=18 color=FF1F3864 fill=FFDCE6F1
```

Coincide **celda por celda** con la vista previa y conserva el mismo snapshot y la misma
versión de plantilla.

### H. Historial y restauración — **PASS**

- El diálogo lista v1…v4 con checksum corto, nombre, fecha y tamaño; la activa marcada
  `Activa` y **sin** botón de restaurar.
- **Descarga de versión anterior**: `GET …/excel-template/versions/2/download` → 200.
- **Restauración**: confirmación explícita *"Se creará una nueva versión activa basada en la
  v2. La versión actual no se eliminará."* → `POST …/versions/2/restore` → **201**.
- **Crea una versión NUEVA, no reactiva la histórica**:

```
5 True  09644ab733a4  (= contenido de v2)
4 False 54333711a1ce
3 False b9feacbe1d58
2 False 09644ab733a4   ← sigue inactiva
1 False 9b5d445771bb
```

- Tras restaurar, el frontend refrescó solo: `inspect`, `versions` y `excel-template`
  (metadata/checksum/versión), la cabecera pasó a `v5` y la cuadrícula mostró el contenido de
  la v2 (sin los mapeos añadidos en v3/v4).
- Se restauró también la v4 → **v6**, confirmando el comportamiento de forma repetida.

### I. Finalizar — **PASS**

Checklist leída **del backend en vivo** (no de estado de sesión, salvo el preview):

```
✓ Información guardada
✓ Fuente configurada: Renglones de cotización
✓ 6 columnas configuradas
✓ Plantilla Excel · v7
✓ 12 campos mapeados
✓ Fila de productos configurada
✓ Vista previa generada
[ Actualizar estado ]  [ Habilitar reporte ]
```

Además:

- **Atrás/adelante entre pasos**: navegación por el stepper y por `Anterior`/`Continuar`
  sin perder el estado (los paneles se mantienen montados).
- **Recarga de página**: configuración persistida verificada tras recarga completa en el
  paso 3 (columnas, summaries, grupo repetible) y en el paso 5 (12 mapeos, versión activa).
- **Mapeos sin guardar bloquean**:
  - preview: botón `Generar vista previa` deshabilitado + *"Guarda la plantilla primero"* /
    *"Guarda los cambios de la plantilla antes de generar la vista previa."*;
  - restauración: todos los botones `Restaurar esta versión` deshabilitados +
    *"Restaurar no disponible — Guarda o descarta tus cambios antes de restaurar otra versión."*

### J. Habilitar y runtime público — **PASS (parcial en UI, ver §12)**

- `PATCH /backend-api/reports/COTIZACION_E2E_VTB {"enabled": true}` → **200**, `enabled=true`.
- Aparece en el catálogo público `GET /backend-api/reports`.
- La página runtime `/donaldson/reports/COTIZACION_E2E_VTB` renderiza (HTTP 200) con
  `Parámetros del reporte`, `Lista de precios *`, `Cliente`, la tabla `Productos` repetible y
  el botón `Generar reporte`.
- Ejecución por el runtime público: `POST /backend-api/reports/…/builder/preview` → 200,
  `execution_id = 154c5601-fa85-49bb-a73b-c47f375a1816`, 3 renglones,
  `subtotal = 1800.00`, `total = 2088.00`.
- XLSX final descargado con ese mismo `execution_id`
  (`POST …/document/xlsx` → 200, `cotizacion-e2e-vtb-document.xlsx`):

```
 9 [1, 'P-INC', 'Filtro de aire primario', '3', 300]
10 [2, 'P-SAME', 'Filtro hidraulico',      '5', 1500]
11 [3, 'P-ZERO', 'Kit de sellos promocional','2', 0]
13 ['TOTAL', None, None, None, 2088]
merges ['A2:E2','A1:E1','B5:D5','A13:D13']
```

> **Limitación honesta:** el paso J se ejecutó contra los endpoints reales del stack a
> través del proxy `/backend-api/*` del frontend, **no** con clics en el navegador, porque
> a esa altura la ventana de Chrome quedó en un workspace de Hyprland que el usuario estaba
> usando activamente y la pestaña reportaba `document.visibilityState === "hidden"`, con lo
> que Chrome suspendía el render/hidratación. **Es una limitación del entorno de escritorio,
> no de la aplicación.** Los pasos A–I sí se ejecutaron con interacción real en el navegador.

---

## 5. Bugs encontrados y fixes aplicados

### Bug 1 — `rows.row_number` duplicado en el selector del mapper (DEL BATCH, #30)

- **Síntoma real:** con un reporte cuya primera columna visible es `system.row_number`, el
  selector del mapper ofrecía **dos** opciones con el mismo placeholder `rows.row_number` y
  React registraba en consola
  `Encountered two children with the same key … rows.row_number`.
- **Causa raíz:** `buildMappingFieldGroups` anteponía siempre la opción implícita
  `rows.row_number` a las columnas visibles, sin deduplicar contra una columna homónima.
- **Fix:** `src/lib/reports/report-excel-mapping.ts` — la opción implícita sólo se añade
  cuando ninguna columna visible usa la clave `row_number`.
- **Commit:** `1d6342a` (dentro del batch, porque corrige código de #30).

### Bug 2 — el editor de grupo repetible descartaba toda edición de subcampos (PREEXISTENTE)

- **Síntoma real:** en el paso 3 del wizard, `+ Campo numérico` y `+ Campo de texto` no
  agregaban nada; el botón de eliminar y los de reordenar no hacían nada; renombrar un
  subcampo revertía.
- **Causa raíz:** `replaceGroup()` hacía `{ ...group, ...patch, fields: group.fields.map(...) }`,
  de modo que la clave explícita `fields` **siempre** pisaba `patch.fields`.
- **Impacto:** bloqueaba el punto B del E2E (configurar campos/calculaciones).
- **Fix:** `src/components/reports/report-parameter-group-editor.tsx` — el remapeo parte de
  `patch.fields ?? group.fields`; sólo se re-apunta el selector de producto al parámetro de
  contexto.
- **Procedencia:** archivo introducido en `249addc` (anterior al batch) y **no tocado** por
  ningún commit de #28–#33.
- **Commit:** `569a03a`, **separado** del Visual Template Builder, tal como pide la TAREA 5.

No se cambió ningún contrato estable del backend ni del frontend.

---

## 6. Tests agregados

| Archivo | Tests | Qué cubren |
|---|---|---|
| `src/lib/reports/report-excel-mapping.test.ts` | +1 | El grupo `rows` nunca duplica `rows.row_number` cuando el reporte expone esa columna; todos los placeholders son únicos y gana la etiqueta de la columna. |
| `src/components/reports/report-parameter-group-editor.test.tsx` (nuevo) | +5 | Agregar subcampo numérico, agregar subcampo de texto, eliminar subcampo, renombrar subcampo y preservación del `context_parameter` del selector de producto. |

Ambos conjuntos se verificaron como **regresión real**: revirtiendo el fix correspondiente,
4 de los 5 tests del editor fallan y el test de dedupe falla.

Totales: frontend **363 → 369** tests (38 → 39 archivos).

---

## 7. Resultado de tests / lint / typecheck / build / Docker / migraciones

### Backend

| Check | Resultado |
|---|---|
| `pytest` (suite completa) | ✅ **328 passed**, 1 warning (deprecación de `httpx` en `starlette.testclient`, ajena) |
| `alembic heads` / `branches` | ✅ un solo head `ab3d5e7f9012`, sin ramas |
| Round-trip `upgrade head` → `downgrade base` → `upgrade head` (BD temporal) | ✅ OK |
| `docker build` | ✅ OK (`arefil-backend:e2e-check`) |
| `git diff --check` (working tree y batch) | ✅ limpio |

### Frontend

| Check | Resultado |
|---|---|
| `npm test` | ✅ **369 passed / 39 files** |
| `npm run lint` | ✅ limpio |
| `npm run typecheck` | ⚠️ **1 error, AJENO al batch** (ver §8) |
| `npm run build` | ⚠️ falla por el **mismo** error ajeno |
| `npm run build` con el árbol commiteado (`git archive HEAD`) | ✅ **OK**, 18 rutas generadas |
| `docker build` (working tree) | ⚠️ falla por errores ajenos (`sonner` + `deleteReport`) |
| `docker build` desde `git archive HEAD` | ✅ **OK** (`arefil-frontend:batch-check`) |
| `git diff --check` (working tree y batch) | ✅ limpio |

**Lectura:** el batch **#28–#33 compila, tipa y buildea limpio**. Lo que rompe `typecheck`,
`build` y `docker build` es exclusivamente trabajo **no commiteado y ajeno**.

---

## 8. Estado de los errores preexistentes de workspace

Se revisó la lista reportada:

| Archivo | Estado hoy |
|---|---|
| 5 × `loading.tsx` | ✅ **resueltos** — el commit `0491f22` añadió los alias `FormPageSkeleton` / `ReportBuilderSkeleton` / `ReportRuntimeSkeleton` / `ImportPageSkeleton` en `page-skeletons.tsx` |
| `app-header.tsx` | ✅ **resuelto** — `0491f22` exportó `isActive` desde `sidebar.tsx` |
| `status-badge.tsx` | ✅ **resuelto** — existe en `src/components/shared/status-badge.tsx` y `0491f22` añadió los variants `success` / `warning` al `Badge` |
| `admin-report-row.tsx` | ❌ **SIGUE FALLANDO** |

Error exacto que persiste:

```
src/components/reports/admin-report-row.tsx(29,10): error TS2305:
  Module '"@/lib/api/reports"' has no exported member 'deleteReport'.
```

y, adicionalmente, sólo en `npm ci` / Docker (porque `sonner` está en `node_modules` pero
**no** en `package.json` ni en `package-lock.json`):

```
src/components/ui/sonner.tsx(3,54): error TS2307: Cannot find module 'sonner'…
src/components/donaldson/price-list-delete-dialog.tsx(5,23): error TS2307: Cannot find module 'sonner'…
src/components/reports/admin-report-row.tsx(7,23): error TS2307: Cannot find module 'sonner'…
```

**No se corrigieron, a propósito.** No son correcciones triviales de compatibilidad: exigen
(a) implementar `deleteReport()` en `src/lib/api/reports.ts` contra un endpoint de borrado que
el backend todavía tiene **sin commitear** (`report_deletion_marker.py` + migración
`ab3d5e7f9012`), y (b) declarar `sonner` como dependencia real en `package.json` /
`package-lock.json`. Eso es trabajo funcional de la feature "borrar reportes y listas de
precios", ajeno al Visual Template Builder. Queda **intacto** y documentado.

> `admin-report-row.tsx` hoy está **huérfano**: ningún archivo lo importa. Mover ese archivo y
> su test fuera del árbol hace que `typecheck`, `build` y `docker build` pasen en verde; se
> restauraron ambos y `git status` quedó idéntico.

---

## 9. Diff exacto del batch contra `reportes`

### Frontend — `git diff --stat origin/reportes...HEAD`

49 archivos, ~6 500 líneas. Agrupado:

- **Inspector visual (#29):** `report-excel-template-inspector.tsx(+test)`, `workbook-grid.tsx(+test)`,
  `lib/reports/report-excel-inspection.ts(+test)`.
- **Mapper (#30):** `lib/reports/report-excel-mapping.ts(+test)`,
  `report-excel-template-validation-panel.tsx`.
- **Preview (#31):** `report-excel-template-preview.tsx(+test)`.
- **Historial/restauración (#32):** `report-excel-template-version-history.tsx(+test)`.
- **Wizard (#33):** `report-configuration-wizard.tsx(+test)`, `report-wizard-stepper.tsx(+test)`,
  `report-wizard-finalize-step.tsx(+test)`, `report-wizard-creation.test.tsx`,
  `lib/reports/report-wizard.ts(+test)`, rutas
  `administracion/reportes/[code]/configurar/page.tsx` y `…/plantilla/page.tsx`,
  `administracion/reportes/nuevo/page.tsx`, `administracion/reportes/page.tsx`.
- **Soporte compartido:** `ui/alert-dialog.tsx`, `ui/sheet.tsx`, `ui/tabs.tsx`,
  `ui/native-select.tsx`, `lib/api/reports.ts`, `types/api.ts`,
  `report-excel-template-card.tsx(+test)`, `report-definition-form.tsx`,
  `report-builder-workspace.tsx`, `lib/reports/report-excel-template.ts(+test)`.
- **Documentación:** 5 notas en `codex/output/` + 1 captura de aceptación.
- **Fix de esta sesión:** `report-excel-mapping.ts(+test)`.

Ningún componente nuevo de UI del batch introduce dependencias no declaradas: todo se apoya en
`@base-ui/react`, `lucide-react`, `class-variance-authority` y `tailwind-merge`, ya presentes
en `package.json`.

### Backend — `git diff --stat origin/reportes...HEAD`

22 archivos, ~2 144 líneas: `admin.py`, `core/config.py`, 4 esquemas nuevos
(`excel_inspection`, `excel_mappings`, `excel_render_preview`, `excel_template_history`),
3 servicios nuevos (`excel_inspector`, `excel_mappings`, `excel_render_preview`),
3 servicios modificados (`excel_renderer`, `excel_templates`, `executions`),
4 suites de tests nuevas + 1 test añadido, `README.md` (una fila de configuración) y 4 notas
en `codex/output/`. **Sin migraciones** (el batch no toca el esquema).

### Cambios NO relacionados detectados dentro del rango del batch

1. **`0491f22 fix(workspace): restore loading and status component compatibility`** — ya estaba
   en la rama antes de esta sesión. Sus tres cambios sirven **solo** a trabajo no commiteado:
   - los alias de `page-skeletons.tsx` los consumen únicamente los 5 `loading.tsx` sin commitear;
   - `export isActive` en `sidebar.tsx` lo consume únicamente `app-header.tsx` sin commitear;
   - los variants `success` / `warning` de `badge.tsx` **no los usa ningún archivo trackeado**.

   Es **aditivo e inofensivo** (sólo agrega exports y variants; no cambia comportamiento
   existente) y `lint`/`typecheck`/`build` pasan con él. Pero **no pertenece al Visual Template
   Builder**: queda a tu criterio sacarlo a su propia rama antes del merge. No lo reescribí
   porque implicaría reescribir historia.

2. **`569a03a` (mío)** — el fix preexistente del editor de grupo repetible. Está **aislado en su
   propio commit** justamente para que puedas moverlo o dejarlo según decidas.

Todo lo demás en el rango es Visual Template Builder puro.

---

## 10. Archivos/cambios ajenos preservados

- **Frontend:** los 33 paths sin commitear listados en §2, byte a byte iguales a como estaban.
  Se comprobó con `git status --porcelain` antes y después.
- **Backend:** los 3 paths sin commitear listados en §2.
- **`codex/output/cotizacion-bonatti/COTIZACION_BONATTI_v1.xlsx`**: sigue sin trackear y **no se
  subió al repo ni se usó** en el E2E.
- No se hizo `push`, `PR`, `merge`, `rebase`, `reset` ni `stash` destructivo. (Se usó un `stash`
  de un solo archivo, con `drop` inmediato, únicamente para comprobar que los tests de
  regresión fallan sin el fix; el árbol quedó idéntico y verificado.)
- No se detuvo el contenedor ajeno `cecoc-chatbot-backend-1` que ocupaba el puerto 8000; se
  usaron puertos alternos.
- No se reintrodujo Stimulsoft; no se creó ningún motor de plantillas nuevo; todo el E2E reusó
  los componentes, renderer, inspector, mappings, snapshots e historial existentes.

---

## 11. Commits que deberían entrar al merge

### Frontend (`feat/visual-template-inspector` → `reportes`)

```
a0b4c88 feat(reports): add visual template inspector and cell mapper
01bedcb docs(reports): add visual template inspector/mapper delivery notes
704d5d8 feat(reports): add rendered-document preview to the visual template editor
b8d01e4 docs(reports): add visual template preview delivery notes
adba970 feat(reports): add Excel template version history and restore
a3180e5 docs(reports): add version history delivery notes
a7b2556 feat(reports): add guided wizard for report creation/configuration
b8ed597 docs(reports): add report creation wizard delivery notes
7dee4c5 fix(reports): include template history dialog dependencies
8a836e0 fix(reports): close wizard creation preview and history E2E blockers
9c43a75 fix(reports): refresh template metadata after mapper mutations
1d6342a fix(reports): stop duplicating rows.row_number in the mapper picker   ← nuevo
<HEAD>  docs(reports): add Visual Template Builder final E2E acceptance notes ← nuevo (este documento, es el HEAD actual)
```

Fuera del alcance estricto del batch, pero presentes en la rama (decide tú):

```
0491f22 fix(workspace): restore loading and status component compatibility    ← AJENO
569a03a fix(reports): keep subfield edits in the repeatable group editor      ← preexistente, aislado
```

### Backend (`reportes` local → `origin/reportes`)

```
40f4c76 feat(reports): integrate visual XLSX inspector mappings preview and history
c9ac7e9 test(reports): cover disabled builder preview snapshots
```

Merge fast-forward posible; `git merge-tree` no reporta conflictos en ninguno de los dos repos.

---

## 12. Riesgos pendientes

1. **`typecheck` / `build` / `docker build` del frontend siguen rojos en el árbol de trabajo**
   por `admin-report-row.tsx` (`deleteReport` inexistente) y por `sonner` no declarado en
   `package.json`. Es trabajo ajeno sin commitear; si haces merge desde commits (no desde el
   árbol sucio) no afecta, pero **hay que cerrarlo antes de buildear en CI**.

2. **IDs de DOM duplicados en el wizard.** El wizard mantiene montados todos los paneles
   (`className="hidden"`) para no perder estado. Cuando dos paneles montados renderizan el
   mismo formulario runtime (el preview del paso 3 y el del paso 5/6), aparecen ids duplicados
   (`runtime-price_list_id`, `runtime-customer_name`, `runtime-items-items-0-quantity`).
   Consecuencia real: un `<label for="…">` del panel visible apunta al input del panel oculto,
   así que hacer clic en la etiqueta no enfoca el campo. **No bloquea el flujo** (el clic
   directo en el control funciona), pero es HTML inválido y una regresión de accesibilidad.
   No lo corregí para no ampliar el alcance: la solución limpia es prefijar los ids por paso,
   y eso toca componentes fuera del batch.

3. **`quantity` viaja como texto al XLSX final.** En el documento generado, la columna
   `Cantidad` queda como string (`'3'`, `'5'`, `'2'`) en vez de número, aunque la columna se
   declara `decimal` y el cálculo de `importe` sí usa el valor numérico. Es cosmético (afecta
   alineación y fórmulas de Excel sobre esa columna) y viene del camino de columnas
   `PARAMETER`, no del mapper. No es una regresión del batch.

4. **Dos `503` transitorios** en `GET /reports/{code}/parameters/price_list_id/options` vistos
   en el panel de red del navegador; el frontend reintentó y obtuvo 200. No aparecen en el log
   del backend ni del stack final, y coinciden temporalmente con recompilaciones de Turbopack
   tras mis ediciones (`Fast Refresh`), así que lo más probable es que sean 503 del dev server
   de Next. **No reproducible**; lo dejo anotado.

5. **Entorno de navegador**: la ventana de Chrome quedó en un workspace de Hyprland en uso
   activo; con la pestaña oculta Chrome suspende la hidratación de Next y el paso J no pudo
   clicarse en UI (se ejecutó por HTTP contra el mismo stack). Si quieres el paso J también
   con clics, hace falta una sesión con la ventana en primer plano.

6. **Datos de prueba en la BD de desarrollo**: quedó el reporte `COTIZACION_E2E_VTB`
   **habilitado** y visible en el catálogo local, con su plantilla en v7 y varias ejecuciones.
   Bórralo cuando quieras; no afecta a ningún repo.

7. La migración ajena `ab3d5e7f9012` quedó **aplicada** en la BD local de desarrollo
   (`backend/data/arefil.db`) porque `make run_panel` corre `alembic upgrade head`. El archivo
   sigue sin commitear.

---

## 13. Veredicto final

> ## ✅ READY TO MERGE (con una decisión tuya pendiente)

El bloque **Visual Template Builder #28–#33 está cerrado y aceptado**:

- E2E completo de Frontend #33 sobre stack real, sin mocks: **A–I PASS en navegador**,
  **J PASS contra los endpoints reales** (limitación de entorno, no de la app).
- Backend `328/328` verde, migraciones con round-trip OK, Docker build OK.
- Frontend `369/369` verde, lint verde, y **typecheck + build + Docker build verdes sobre el
  árbol commiteado**.
- Diffs de ambos repos auditados: sólo Visual Template Builder, tests y documentación.
- Merge simulado sin conflictos en ambos repos.
- Dos bugs reales encontrados y corregidos con test de regresión cada uno; ningún contrato
  estable modificado.

**Lo único que debes decidir antes de mergear** es qué hacer con el commit ajeno `0491f22`
(compatibilidad de `loading.tsx` / `app-header` / `status-badge`) y con `569a03a` (fix
preexistente del editor de grupo repetible), que dejé aislado a propósito. Ninguno de los dos
rompe nada; simplemente no son Visual Template Builder.

**No se hizo push, PR ni merge.**
