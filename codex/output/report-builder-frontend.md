# Frontend #13 — Constructor visual de reportes tipo Excel

Implementación del **Report Builder** propio de Arefil: un diseñador lógico de
reportes (definición → parámetros → columnas → fórmulas → layout Excel →
preview) que **no depende de Stimulsoft**, conviviendo con el flujo legacy.

---

## 1. Recon inicial

Se revisó el estado completo de `dev` antes de tocar código:

| Área | Hallazgo |
| --- | --- |
| Rutas admin | `/administracion/reportes`, `/nuevo`, `/[code]`, `/[code]/designer` |
| Rutas usuario | `/donaldson/reports`, `/[code]`, `/price-list-comparison/view` |
| API clients | `browserApiClient` (`/backend-api` same-origin) y `serverApiClient` (`API_INTERNAL_URL`), ambos sobre `createApiClient` |
| Proxy | `src/app/backend-api/[...path]/route.ts` (GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS) |
| Componentes reutilizables | `ReportDefinitionForm`, `ReportParameterEditor`, `ReportPreviewTable`, `ReportRuntimeParameters`, `ErrorAlert`, `Alert`, `Skeleton`, `Card`, `Table`, `Badge` |
| Libs | `report-form.ts`, `report-runtime.ts` (`validateRuntimeParameters`), `format/decimal.ts`, `format/date.ts` |
| Stimulsoft | `stimulsoft-report-viewer.tsx`, `stimulsoft-report-designer.tsx`, `stimulsoft-*.ts` |
| Tests | 22 archivos, 155 tests (Vitest, `environment: "node"` + `// @vitest-environment jsdom` por archivo) |
| Docker | `compose.yaml` (backend + frontend), `Makefile`, `scripts/docker_preflight.sh` |

**Gap detectado:** `ApiClient` no tenía `apiPutJson` (solo `apiPutText`, usado por
las plantillas MRT). Era el único faltante para consumir el CRUD del builder.

## 2. Branch / estado

- Rama de trabajo: **`dev`** (`c520507 feat(reports): add generic report runtime`).
- `dev` y `reportes` apuntaban al mismo commit; se hizo `git checkout dev`.
- El árbol estaba limpio al iniciar. **No se descartó ningún cambio local.**
- Repo hermano `../Arefil_backend` **no fue modificado** (sigue en su rama `reportes`).

## 3. Contrato Backend #12 encontrado

Leído de los schemas y rutas reales, no inventado:

**Endpoints** (todos bajo el prefijo `/api`, consumidos vía `/backend-api/*`):

```text
GET  /report-builder/fields              -> ReportFieldResponse[]
GET  /reports/{code}/builder             -> ReportBuilderResponse
PUT  /reports/{code}/builder             -> ReportBuilderResponse   (body: ReportBuilderWrite)
POST /reports/{code}/builder/preview     -> ReportBuilderPreviewResponse
```

`POST .../builder/preview` declara `parameters: dict[str, Any]` como **cuerpo
completo**, no como objeto envolvente — el body es el mapa de parámetros pelado.

**Enums reales** (`app/db/enums.py`):

```text
ReportColumnType   : FIELD | PARAMETER | FORMULA
ReportFormatType   : text | number | currency | percent | date | datetime
ReportParameterDataType : integer | string | decimal | boolean | date | datetime
```

`ReportFormatType` **no** tiene `integer` ni `decimal`; ambos se representan con
`number`. El frontend no inventa formatos fuera de esta lista.

**Reglas de validación del backend** (`services/reports/builder.py`) replicadas
para feedback inmediato — el backend sigue siendo la autoridad:

- `key` ≙ `^[A-Za-z][A-Za-z0-9_]*$`, único case-insensitive, `label` no vacío.
- Fuente coherente: exactamente uno de `source_field` / `source_parameter` /
  `formula_definition` según `column_type`.
- `FIELD`: `source_field` debe existir en el catálogo y su `data_type` coincidir.
- `PARAMETER`: el parámetro debe existir en el reporte y su `data_type` coincidir.
- `FORMULA`: `data_type` obligatoriamente `decimal`; referencias deben existir y
  ser numéricas; se detectan ciclos por orden topológico.
- Formatos numéricos exigen columna numérica; `date`/`datetime` exigen su tipo.
- Una `key` no puede colisionar con un parámetro salvo que sea su propia columna `PARAMETER`.
- `width` 1..255, `header_row` 1..100, `sheet_name` ≤31 sin `[ ] : * ? / \`.
- `totals`: `SUM` únicamente, sin duplicados, sobre columna **existente, numérica y visible**.

**Motor de fórmulas** (`services/reports/formulas.py`): operadores `+ - * / %`,
función `ROUND(valor, decimales)`, paréntesis, números literales; sin `eval`,
con `Decimal` exacto y límites de longitud/tokens/profundidad.

## 4. Arquitectura frontend final

La pantalla `/administracion/reportes/[code]` es un server component que rinde
dos bloques hermanos:

```text
ConfigureReportPage (server)
├─ ReportDefinitionForm        (legacy, intacto) → Definición · Fuente · Parámetros · Probar consulta
└─ ReportBuilderWorkspace      (nuevo, client)
   ├─ Card "Columnas del reporte" → ReportColumnEditor
   │                                 └─ ReportFormulaInput  (por columna FORMULA)
   ├─ Card "Formato Excel"        → ReportExcelLayoutEditor
   ├─ Botón "Guardar constructor"
   └─ Card "Vista previa"         → ReportRuntimeParameters + ReportBuilderPreviewTable
```

El builder se alimenta de `report.parameters` **ya persistidos** por el server
component: una columna `PARAMETER` o una referencia de fórmula sobre un
parámetro sin guardar sería rechazada por el backend. Guardar la definición
dispara `router.refresh()` y el builder recibe la lista nueva.

Una sola pantalla bien seccionada con Cards; sin wizard, sin drag-and-drop.

## 5. Field catalog

`getReportFieldCatalog()` consume `GET /report-builder/fields`. **No hay ningún
catálogo hardcodeado en el frontend.** `groupFieldCatalog()` agrupa preservando
el orden del backend y la UI muestra `Etiqueta · key.tecnico`:

```text
Producto          → Número de parte · product.part_number
Lista de precios  → Moneda · price_list.currency
Item de lista     → Precio unitario · price_list_item.unit_price
```

Estados cubiertos: `loading` (Skeleton), `error` (ErrorAlert con el mensaje del
backend), `vacío` (aviso en `muted`). Un fallo del catálogo **no bloquea** el
resto de la pantalla.

## 6. Editor de columnas

`ReportColumnEditor` — una tarjeta por columna con título, resumen de origen
(`Campo · Producto → Número de parte`), badge `Oculta`, y controles `↑ ↓ 🗑`.
Campos editables, todos existentes en el contrato: `label`, `key`,
`column_type`, `format_type`, la fuente correspondiente, `width`, `visible`.
No se muestra ningún campo que el backend no soporte.

Reordenar reescribe `display_order` desde la posición del arreglo
(`withDisplayOrder`), así lista visible y orden persistido nunca divergen.
Eliminar una columna poda automáticamente los `totals` que la referenciaban
(`pruneTotals`), evitando un 422 sobre un total ya invisible.

## 7. FIELD / PARAMETER / FORMULA

- **FIELD** — se elige del catálogo agrupado; `applyFieldSource` fija
  `source_field`, resincroniza `data_type` con el descriptor y corrige el
  formato si dejó de ser compatible. No se pueden escribir source fields libres.
- **PARAMETER** — el `select` solo ofrece parámetros reales del reporte y omite
  los ya consumidos. La `key` queda fijada al nombre del parámetro (input
  deshabilitado), que es lo único que el backend acepta.
- **FORMULA** — siempre `data_type: decimal`, sin fuentes residuales
  (`retypeColumn` limpia `source_field`/`source_parameter` al cambiar de tipo).

## 8. Formula UX

`ReportFormulaInput`: input de texto controlado + `select` "Insertar
referencia" + botones de operador `+ - * / % ( )` y `ROUND`.

- El `select` ofrece **solo** columnas numéricas y parámetros numéricos, nunca
  la propia columna (`allowedFormulaReferences`).
- `formulaReferences()` extrae identificadores ignorando llamadas a función y
  marca inline las **referencias desconocidas** antes del round trip.
- No hay editor de JavaScript, no hay `eval`, no se recalcula ningún importe
  monetario en React.
- Vista técnica y edición son la misma cadena (`price * quantity`), legible y
  editable a mano.

Errores del backend (referencia inexistente, ciclo, división entre cero,
expresión inválida, tipo incompatible) se muestran con **su texto real** vía
`getUserErrorMessage`. Verificado contra el backend:

```text
Las fórmulas contienen una dependencia cíclica.
El campo 'products.part_number' no pertenece al catálogo permitido.
Error en la fila 1: No se permite dividir entre cero.
```

## 9. Excel layout

`ReportExcelLayoutEditor` cubre exactamente `ReportExcelLayoutWrite`:
`sheet_name`, `title`, `show_report_name`, `show_generated_at`,
`show_parameters`, `freeze_header`, `header_row` y la fila de totales (`SUM`,
la única operación del backend), ofrecida solo sobre columnas numéricas
visibles.

**No** se implementó canvas, diseñador celda por celda, merge, macros ni VBA.

## 10. API clients

Extendido `src/lib/api/reports.ts` (sin crear un segundo cliente, sin `fetch()`
ad-hoc):

```ts
getReportFieldCatalog(options?)
getReportBuilder(code, options?)
saveReportBuilder(code, request, options?)
previewReportBuilder(code, parameters, options?)
```

Todas sobre `browserApiClient` → `/backend-api/*` same-origin, con
`AbortSignal` y `getUserErrorMessage`. `serverApiClient` sigue sirviendo el
render inicial (`report-catalog.ts`). Nunca se filtran `backend:8000`, rutas
SQLite ni stack traces: `ApiError` normaliza `detail` y los fallos de transporte
colapsan en un mensaje genérico.

Se añadió `apiPutJson` a `createApiClient` (el proxy ya reenviaba `PUT`).

## 11. Tipos TypeScript

Añadidos a `src/types/api.ts`, espejo de los schemas reales, sin `any`, sin
casts peligrosos y sin duplicar enums existentes:

```text
ReportColumnType · ReportFormatType · ReportFieldDescriptor · ReportColumn
ReportTotalConfiguration · ReportExcelLayout · ReportBuilderDefinition
ReportBuilderWriteRequest · ReportBuilderPreviewColumn · ReportBuilderPreviewResponse
```

`ReportParameterDataType` se reutiliza tal cual. Los `Decimal` siguen tipados
como `DecimalString`.

## 12. Builder CRUD

Un único `PUT` transaccional con `columns` + `excel_layout` juntos — nunca
columna por columna. UX:

- `Guardando...` con el botón deshabilitado; `savingRef` bloquea el doble submit.
- El éxito (`Constructor guardado`) **solo** se muestra tras respuesta válida.
- En error, el estado editado se preserva íntegro en pantalla.
- Tras guardar se re-siembra el formulario desde la respuesta persistida, así lo
  que queda en pantalla es lo que el backend realmente almacenó.
- La validación local corre antes del envío y lista los problemas en un `Alert`.

## 13. Preview sin Stimulsoft

`ReportBuilderPreviewTable` consume `POST /reports/{code}/builder/preview` y
renderiza `columns` / `rows` / `totals` según el contrato real, reutilizando
`Card`, `Table`, `Badge` y los formateadores de `lib/format`. Refleja columnas
configuradas, labels, orden, valores y fórmulas calculadas, con fila de totales
cuando el layout la declara.

Estados: `loading`, `empty`, `error`, `truncated`, más "sin columnas visibles" y
el bloqueo de preview con cambios sin guardar.

**Verificado en navegador:** la carga completa de la pantalla del builder no
solicita ningún asset de Stimulsoft (0 requests que contengan `stimulsoft`).
El test correspondiente lo asegura en CI.

## 14. Caso Cotización

Configurado íntegramente desde el contrato, sin tocar código, y previsualizado
contra backend real:

| Columna | Tipo | Fuente / fórmula |
| --- | --- | --- |
| SKU | FIELD | `product.part_number` |
| Descripción | FIELD | `product.description` |
| Cantidad | PARAMETER | `quantity` |
| Precio | FIELD | `price_list_item.unit_price` |
| Subtotal | FORMULA | `price * quantity` |
| Descuento | FORMULA | `ROUND(subtotal * discount / 100, 2)` |
| Neto | FORMULA | `subtotal - discount_amount` |
| IVA | FORMULA | `ROUND(net_amount * 0.16, 2)` |
| Total | FORMULA | `net_amount + tax` |

Resultado real del preview (`quantity=3`, `discount=10`):

```text
P181050  Filtro de aire primario  3  $1,250.50  $3,751.50  $375.15  $3,376.35  $540.22  $3,916.57
P552100  Filtro de aceite         3    $489.00  $1,467.00   $146.70  $1,320.30  $211.25  $1,531.55
Totales                                         $5,218.50                                $5,448.12
```

Las filas repetibles (`items[]`) **no** se implementaron: corresponden a
Backend #13 / Frontend #14.

## 15. Tests

`npm test` → **23 archivos, 173 tests, todos en verde** (155 previos + 18 nuevos;
no se borró cobertura existente).

- `src/lib/reports/report-builder.test.ts` (30 tests): catálogo agrupado, alta de
  columnas FIELD/PARAMETER/FORMULA, de-duplicación de keys, retipado,
  reordenar/eliminar/`display_order`, poda de totales, formatos por tipo,
  extracción de referencias, y todas las reglas de validación (key inválida,
  duplicada, campo fuera del catálogo, parámetro inexistente, referencia
  inexistente, referencia no numérica, auto-referencia, formato incompatible,
  width fuera de rango, colisión con parámetro, sheet name ilegal, header row,
  SUM sobre columna oculta), carga de builder existente, layout por defecto y
  normalización del request.
- `src/lib/api/reports.test.ts` (+5): catálogo desde backend, GET builder, PUT
  transaccional, preview con body pelado, y propagación del mensaje real del
  backend. Se preserva el split browser/server (todas las URLs son `/backend-api/*`).
- `src/components/reports/report-builder-workspace.test.tsx` (18): carga y
  agrupación del catálogo, error de catálogo, builder inexistente, carga de
  builder existente, alta de las tres clases de columna, referencias numéricas
  únicamente, construcción de fórmula por controles, referencia desconocida,
  reordenar/ocultar/eliminar, save bloqueado por validación, save transaccional,
  error de backend con estado preservado, ausencia de éxito prematuro y de doble
  submit, preview renderizado **sin Stimulsoft**, preview vacío, preview con
  error, y bloqueo de preview con cambios sin guardar.

## 16-18. Lint · Typecheck · Build

```text
npm run lint       ✓ sin hallazgos
npm run typecheck  ✓ tsc --noEmit limpio
npm run build      ✓ Compiled successfully — 18 rutas, sin rutas perdidas
git diff --check   ✓ limpio
```

## 19. Docker / Compose

Validado con los repos hermanos usando un **directorio de datos aislado**
(`scratchpad/e2e-data`), proyecto `arefil-fe13-e2e` y puertos 3111/8111, para no
tocar datos comerciales reales.

```text
docker compose up --detach --build --wait   → backend Healthy, frontend Healthy
```

`../Arefil_backend/backend/data` (DB real, uploads, backups) **no fue tocado ni
borrado** — verificado por timestamp posterior a la prueba.

## 20. E2E

Flujo completo ejecutado contra backend real (Backend #12 en el árbol del repo
hermano):

```text
Compose up → backend healthy → frontend healthy
→ Administración > Reportes → abrir reporte
→ field catalog cargado desde /backend-api/report-builder/fields
→ columnas FIELD + PARAMETER + FORMULA configuradas
→ guardado transaccional (PUT builder) confirmado
→ refrescar: configuración persiste y se recarga en la UI
→ preview funciona sin Stimulsoft (0 requests stimulsoft)
→ docker compose up --force-recreate --wait
→ configuración sigue persistiendo (columnas, fórmulas, layout y totales)
→ preview post-recreación: 2 filas, totales idénticos
```

Errores de backend verificados en vivo: ciclo, campo fuera del catálogo y
división entre cero (esta última en tiempo de evaluación, no de guardado).

## 21. Regresiones verificadas

Rutas frontend (200): `/donaldson/reports`, `/administracion/reportes`,
`/administracion/reportes/nuevo`, `/administracion/reportes/[code]`,
`/administracion/reportes/PRICE_LIST_COMPARISON`, `.../designer`,
`/donaldson/reports/PRICE_LIST_COMPARISON`,
`/donaldson/reports/price-list-comparison/view`, `/donaldson/products`,
`/donaldson/price-lists`.

API vía proxy (200): `GET /reports`, `GET /admin/reports/{code}`,
`GET /reports/{code}/template` (MRT), `POST /reports/{code}/preview` (SQL
legacy), `PATCH /reports/{code}`, `POST /reports/{code}/export/xlsx`,
`POST /reports/{code}/export/csv`.

El Designer de Stimulsoft se abrió en navegador y carga normalmente. Ningún
código legacy fue eliminado: flujo Stimulsoft y Report Builder coexisten.

## 22. Deuda para Backend #13 / Frontend #14

- **`items[]` repetibles**: hoy la captura es escalar (una cantidad, un
  producto). El builder ya modela el cascarón; falta la fila repetible.
- **Consumo del layout**: el frontend configura `ReportExcelLayout`, pero el
  render final del XLSX con ese layout vive en el backend; falta verificar el
  archivo generado extremo a extremo.
- **Runtime de usuario**: el preview del builder vive solo en administración;
  `/donaldson/reports/[code]` sigue usando el runtime genérico anterior.
- **Fórmulas**: solo `+ - * / %` y `ROUND`. Sin condicionales ni agregados por
  fila; `totals` solo soporta `SUM`.
- **Cleanup de Stimulsoft**: pospuesto a Backend #14 / Frontend #15.
- **Reutilización de `ReportPreviewTable`**: el contrato del builder difiere
  (columnas como objetos + totales), por lo que se creó
  `ReportBuilderPreviewTable`. Ambas podrán unificarse al retirar el runtime legacy.

## 23. Archivos modificados

**Nuevos**

```text
src/lib/reports/report-builder.ts
src/lib/reports/report-builder.test.ts
src/components/reports/report-builder-workspace.tsx
src/components/reports/report-builder-workspace.test.tsx
src/components/reports/report-column-editor.tsx
src/components/reports/report-formula-input.tsx
src/components/reports/report-excel-layout-editor.tsx
src/components/reports/report-builder-preview-table.tsx
codex/output/report-builder-frontend.md
```

**Modificados**

```text
src/types/api.ts                                 (+ contratos del builder)
src/lib/api/client.ts                            (+ apiPutJson)
src/lib/api/reports.ts                           (+ 4 funciones del builder)
src/lib/api/reports.test.ts                      (+ 5 tests)
src/app/administracion/reportes/[code]/page.tsx  (+ ReportBuilderWorkspace)
```

Ningún archivo legacy de Stimulsoft fue tocado.

## 24. Comandos ejecutados

```bash
git checkout dev
npm test
npm run lint
npm run typecheck
npm run build
git diff --check

# E2E aislado (datos reales intactos)
AREFIL_UID=… BACKEND_DATA_DIR=<scratchpad>/e2e-data COMPOSE_PROJECT_NAME=arefil-fe13-e2e \
  docker compose up --detach --build --wait
curl … /backend-api/report-builder/fields
curl -X POST … /backend-api/reports                       # alta de COTIZACION
curl -X PUT  … /backend-api/reports/COTIZACION/builder    # cascarón completo
curl -X POST … /backend-api/reports/COTIZACION/builder/preview
docker compose up --detach --build --force-recreate --wait   # persistencia
docker compose down
```

## 25. Confirmación

**No se realizó commit, push ni PR.** No se creó, cerró ni modificó ninguna
issue de GitHub. No se ejecutó `git reset --hard` ni `git clean -fd`. No se
descartó ningún cambio local del usuario. El repo hermano `Arefil_backend` no
fue modificado y permanece en su rama original. Los datos persistentes reales
del backend (DB, uploads, backups) no fueron alterados ni borrados.
