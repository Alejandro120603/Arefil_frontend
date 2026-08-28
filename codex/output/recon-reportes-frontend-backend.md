# Recon técnico cruzado: Reportes en Arefil Frontend y Backend

Fecha del recon: 2026-08-27 (segunda pasada, ~16:30 America/Mexico_City)
Alcance: inspección de solo lectura. No se modificó código de aplicación, branch, dependencia, migración, puerto ni dato.

> **Nota**: este archivo reemplaza un recon anterior escrito hoy mismo (más temprano) que describía el estado **antes** de que existiera el working tree actual. Ese documento previo quedó obsoleto: concluía que las fuentes de datos "no existían". Hoy sí existen — sin commitear. La copia del recon anterior quedó en el scratchpad de la sesión.

---

## 1. Resumen ejecutivo

1. El nuevo modelo de **fuentes de datos reutilizables SÍ está implementado**, en ambos repos, en la branch `feat/report-data-sources`, pero **como cambios NO COMMITEADOS** en el working tree.
2. Backend: 6 archivos nuevos sin trackear (modelo, router, specs, servicio, migración, tests) + 23 archivos modificados. Sus 197 tests pasan.
3. Frontend: el código de producción ya eliminó `SQL_QUERY`, `data_source_type` y `query_text`; ahora usa `data_source_id` y un `<select>` de fuentes.
4. **La migración `f3a7c9e4b612` está PENDIENTE**: la SQLite real está en `e8f5c3d2a901`. La tabla `report_data_sources` no existe todavía en `data/arefil.db`.
5. **Arefil no está corriendo.** El puerto `3001` lo ocupa **otro proyecto: `~/Projects/cecoc`** (`<title>CECOC | Centro de Evaluación y Certificación OC</title>`); `/administracion/reportes/nuevo` ahí devuelve 404. En `8001` no escucha nadie.
6. Los contenedores Docker activos son de **DADESK** (`dadesk-frontend:3000`, `dadesk-backend:5000`), no de Arefil.
7. Por lo tanto, la pantalla con `Tipo de fuente / SQL_QUERY / Consulta` que se está viendo proviene de una **sesión anterior de Arefil** (o de una pestaña/caché del navegador), levantada **antes** de que existieran estos cambios en el working tree.
8. Frontend y backend **no están desalineados entre sí**: el contrato nuevo coincide exactamente (`data_source_id`, `data_source`, `GET /api/report-data-sources`).
9. Lo que sí está desalineado es **el código vs. la base de datos** (migración sin aplicar) y **el código vs. el proceso que estaba sirviendo la UI**.
10. Las fuentes `PRODUCT_CATALOG`, `PRICE_LIST`, `PRICE_HISTORY`, `PRICE_LIST_COMPARISON`, `QUOTATION_ROWS` existen como specs con handlers reales y se insertan tanto por migración como por seed.
11. Trabajo incompleto real: **los tests del frontend quedaron con el contrato viejo** → `tsc --noEmit` falla (17 errores) y `vitest run` falla (20 tests, 2 archivos).
12. Nada de esto está commiteado ni pusheado; `git stash list` está vacío en ambos repos.
13. Stimulsoft fue retirado explícitamente de ambas puntas en commits previos; no es un factor.

---

## 2. Estado Git

### 2.1 Rutas confirmadas

| Repositorio | Ruta absoluta |
|---|---|
| Arefil Frontend | `/home/daniel12/Projects/Arefil_frontend` |
| Arefil Backend | `/home/daniel12/Projects/Arefil_backend` |

Otros proyectos presentes en `~/Projects` que **no** son el sistema actual: `arefil-web`, `prototipo1`, `prototipo2`, `cecoc`, `DADESK_Backend`, `DADESK_Frontend`, `Tesis_jmob`. `cecoc` y `DADESK_*` sí son relevantes, pero solo como **ocupantes de puertos** (§3.3).

### 2.2 Frontend

- Branch actual: **`feat/report-data-sources`**
- HEAD: `2d8f1b6 fix(dev): make backend port configurable` (misma posición que `dev`; 3 commits por delante de `origin/dev`)
- Remoto: `https://github.com/Alejandro120603/Arefil_frontend`
- Branches: `main`, `dev`, `reportes`, `feat/report-data-sources` (esta última **solo local**, sin remoto)
- `git stash list`: vacío

Working tree (9 archivos, +273/−353):

```
M src/app/administracion/reportes/[code]/page.tsx
M src/components/reports/report-builder-workspace.tsx
M src/components/reports/report-definition-form.test.tsx
M src/components/reports/report-definition-form.tsx
M src/components/reports/report-parameter-editor.tsx
M src/lib/api/reports.ts
D src/lib/reports/report-form.test.ts
M src/lib/reports/report-form.ts
M src/types/api.ts
```

Historial reciente:

| Commit | Cambio |
|---|---|
| `dd1f6aa` | Report manager + configuración SQL. **Aquí nació el `SQL_QUERY` hardcodeado.** |
| `c520507` | Runtime genérico de reportes (`origin/reportes`) |
| `d596ec4` | Report Builder visual (Excel) |
| `249addc` | Runtime repetible + XLSX |
| `074570d` | Retiro de Stimulsoft en frontend (`origin/dev`) |
| `4ea5c49`, `2d8f1b6` | Puertos locales 3001 / backend configurable (solo local) |

### 2.3 Backend

- Branch actual: **`feat/report-data-sources`**
- HEAD: `22a3113 refactor(reports): remove Stimulsoft backend integration` (= `origin/reportes`)
- Remoto: `https://github.com/Alejandro120603/Arefil_backend`
- Branches: `main`, `dev` (`1b2b574`), `reportes`, `feat/report-data-sources` (solo local)
- `git stash list`: vacío

Working tree — **archivos NUEVOS sin trackear (el corazón de la feature)**:

```
backend/app/api/routes/report_data_sources.py
backend/app/db/models/report_data_source.py
backend/app/services/reports/data_source_specs.py
backend/app/services/reports/data_sources.py
backend/migrations/versions/f3a7c9e4b612_reusable_report_data_sources.py
backend/tests/test_report_data_sources.py
```

Modificados (23 archivos, +629/−316): `main.py`, `db/enums.py`, `db/models/report_definition.py`, `db/models/__init__.py`, `db/seed.py`, `schemas/reports.py`, `api/routes/{admin,reports,report_builder}.py`, `services/reports/{registry,definitions,builder,field_catalog,options,parameters,repeatable,sql_query_executor,__init__}.py` y 5 archivos de tests.

**Conclusión Git**: la implementación no está "en otra branch"; está **en disco, sin commitear, en la branch en la que ya estás parado**, en los dos repos simultáneamente.

---

## 3. Cómo se ejecuta Arefil actualmente

### 3.1 `make run_panel`

Definido en `/home/daniel12/Projects/Arefil_frontend/Makefile`:

| Variable | Valor efectivo |
|---|---|
| `BACKEND_DIR` | `../Arefil_backend/backend` ✅ |
| `FRONTEND_DIR` | `.` (este repo) ✅ |
| `BACKEND_VENV` / `BACKEND_PY` | `../Arefil_backend/.venv/bin/python` |
| `BACKEND_PORT` | `8001` (override en `.env.local`) |
| `FRONTEND_PORT` | `3001` (override en `.env.local`) |

`.env.local` (untracked):
```
NEXT_PUBLIC_API_URL=/backend-api
BACKEND_PORT=8001
FRONTEND_PORT=3001
API_INTERNAL_URL=http://127.0.0.1:8001/api
```

`scripts/run_panel.sh` hace, en orden:
1. `alembic upgrade head` en `Arefil_backend/backend`
2. `python -m app.db.seed`
3. `uvicorn app.main:app --reload --host 127.0.0.1 --port 8001`
4. `./node_modules/.bin/next dev --port 3001`

Confirmado: `make run_panel` **sí** ejecuta `Arefil_frontend` + `Arefil_backend`. No hay confusión de repos en la orquestación.

### 3.2 Base de datos usada

`backend/app/core/config.py:18` → `sqlite:///{DATA_DIR}/arefil.db` = `/home/daniel12/Projects/Arefil_backend/backend/data/arefil.db` (2.0 MB, modificado hoy 12:13).

### 3.3 Qué está corriendo AHORA (hallazgo crítico)

```
:3001  → pid 174572  next-server (v14.2.35)
         cwd = /home/daniel12/Projects/cecoc     ← NO es Arefil
:8001  → nadie escucha (curl → connection refused)
docker → dadesk-frontend :3000, dadesk-backend :5000  ← NO es Arefil
```

Verificación directa:
```
GET http://127.0.0.1:3001/                        → 200  <title>CECOC | ...</title>
GET http://127.0.0.1:3001/administracion/reportes/nuevo → 404
```

Es decir: **en este momento no hay ninguna instancia de Arefil levantada**, y el puerto 3001 está ocupado por otro proyecto. Un `make run_panel` ahora mismo chocaría con ese puerto.

---

## 4. Arquitectura actual de Reportes — Frontend

### 4.1 Ruta `/administracion/reportes/nuevo`

`src/app/administracion/reportes/nuevo/page.tsx` → `<ReportDefinitionForm />` (sin props ⇒ modo creación).

### 4.2 Estado **committeado** (`git show HEAD`) — el que produce la pantalla reportada

- `src/lib/reports/report-form.ts` → `emptyReportForm()` fija `data_source_type: "SQL_QUERY"`, `query_text: ""`, `enabled: false`.
- `src/components/reports/report-definition-form.tsx` → `<select id="report-source">` con `<option value="SQL_QUERY">` y `<option value="HANDLER">`; cuando el valor es `SQL_QUERY`, renderiza la Card **"Fuente de datos"** con el `<textarea>` **"Consulta"** ligado a `query_text`.
- `src/types/api.ts` → `export type ReportDataSourceType = "HANDLER" | "SQL_QUERY"`.
- Constantes `KNOWN_REPORT_HANDLER = "price_list_comparison"`, `REPEATABLE_REPORT_HANDLER = "repeatable_rows"`.

### 4.3 Estado **en el working tree** (no commiteado) — el flujo deseado, ya escrito

- `report-form.ts`: `ReportFormValue` ahora es `{ code, name, description, category, data_source_id: number|null, enabled, parameters }`. Desaparecen `data_source_type`, `data_source_key`, `query_text`. `emptyReportForm()` → `data_source_id: null`, `enabled: true`.
- Nueva `parametersFromDataSource(source)`: los parámetros del reporte se **derivan del contrato de la fuente**, ya no se escriben a mano.
- `validateReportForm()`: el único requisito de fuente es `"Selecciona una fuente de datos."`.
- `report-definition-form.tsx`: `useEffect` → `listReportDataSources()`; Card **"Fuente de datos"** con icono `Database` y un `<select id="report-data-source">` poblado desde el backend; al cambiar de fuente se reemplazan los parámetros por el contrato de la nueva fuente (con `confirm()`). Se eliminó por completo el bloque de preview SQL del formulario.
- `types/api.ts`: nuevos `ReportDataSourceSummary` y `ReportDataSource` (`{ id, code, name, description, enabled, capabilities, parameters, fields }`); `ReportDefinition` gana `data_source_id: number` y `data_source: ReportDataSourceSummary`; `ReportAdminDefinition = ReportDefinition` (ya no agrega `query_text`).
- `lib/api/reports.ts`: nuevos `listReportDataSources()` y `getReportDataSource(code)`; `getReportFieldCatalog` pasa de `/report-builder/fields` (global) a `/reports/{code}/builder/fields` (por reporte, derivado de su fuente).

Grep de control en código de producción del working tree: **cero ocurrencias** de `SQL_QUERY`, `data_source_type` o `query_text`. Las únicas ocurrencias restantes están en archivos `*.test.*` (ver §12).

---

## 5. Arquitectura actual de Reportes — Backend

### 5.1 Nuevo (working tree, sin commitear)

- `app/db/models/report_data_source.py` → `class ReportDataSource` (tabla `report_data_sources`), con `CheckConstraint valid_executor`:
  `(HANDLER ⇒ handler_key NOT NULL AND query_text NULL)` o `(INTERNAL_SQL ⇒ handler_key NULL AND query_text NOT NULL)`.
  Campos: `id, code(unique), name, description, executor_type, handler_key, query_text, input_schema(JSON), output_schema(JSON), capabilities(JSON), enabled, created_at, updated_at`.
  Comentario textual en el modelo: *"Internal-only definition. Public schemas deliberately never include it."* → el SQL **nunca** se expone por API.
- `app/db/enums.py` → nuevo `DataSourceExecutorType = {HANDLER, INTERNAL_SQL}`. El viejo `ReportDataSourceType` queda marcado *"Deprecated report-owned source discriminator kept for DB compatibility"*.
- `app/services/reports/data_source_specs.py` → `DATA_SOURCE_SPECS` con las 5 fuentes canónicas:

| code | handler_key | inputs | capabilities |
|---|---|---|---|
| `PRODUCT_CATALOG` | `product_catalog` | — | — |
| `PRICE_LIST` | `price_list` | `price_list_id` (select `price_lists`) | — |
| `PRICE_HISTORY` | `price_history` | `product_id` | — |
| `PRICE_LIST_COMPARISON` | `price_list_comparison` | `price_list_a_id`, `price_list_b_id` | — |
| `QUOTATION_ROWS` | `repeatable_rows` | `price_list_id` | `REPEATABLE_ROWS` |

- `app/services/reports/data_sources.py` → `list_enabled_data_sources`, `get_data_source_by_code`, `data_source_response`, errores `ReportDataSourceNotFoundError` / `ReportDataSourceDisabledError`.
- `app/api/routes/report_data_sources.py` → `GET /api/report-data-sources`, `GET /api/report-data-sources/{code}`.
- `app/main.py` → registra el router nuevo antes de `reports`.
- `app/services/reports/registry.py` (reescrito, +327/−…): `DATA_SOURCE_HANDLERS` mapea `product_catalog`, `price_list`, `price_history`, `price_list_comparison`, `repeatable_rows` a ejecutores reales con `Request` pydantic tipado; `_execute_handler` resuelve por `source.handler_key`.
- `app/db/models/report_definition.py` → gana `data_source_id` FK `report_data_sources.id ON DELETE RESTRICT`, indexado, `nullable=False`, y relación `data_source`. Se elimina el `CheckConstraint valid_data_source`. `data_source_type` / `query_text` quedan como **columnas de compatibilidad deprecadas** ("New writes and runtime never use them").
- `app/db/seed.py` → nuevo `seed_report_data_sources()` idempotente que crea/actualiza las 5 fuentes desde los specs, y `seed_report_registry()` ahora asigna `data_source_id`.

### 5.2 Tests backend

`pytest -q` → **197 passed** en el working tree. Incluye `tests/test_report_data_sources.py` (nuevo). El backend está funcionalmente completo.

---

## 6. Modelo de base de datos

### 6.1 Tablas reales en `data/arefil.db` (estado actual, migración sin aplicar)

```
alembic_version            price_lists                report_excel_layouts
import_jobs                product_status_changes     report_parameter_group_fields
legacy_report_templates    products                   report_parameter_groups
price_list_items           report_columns             report_parameters
suppliers                  report_definitions
```

**No existe `report_data_sources`.**

### 6.2 `report_definitions` (esquema vigente en disco)

```
id, code, name, description, category,
data_source_key VARCHAR(100),
enabled BOOLEAN default '1',
created_at, updated_at,
data_source_type VARCHAR(20) NOT NULL default 'HANDLER',
query_text TEXT
```

Filas actuales:

| id | code | data_source_type | data_source_key | query_text |
|---|---|---|---|---|
| 1 | `PRICE_LIST_COMPARISON` | HANDLER | `price_list_comparison` | — |
| 2 | `RODUCT_QUOTATION` | SQL_QUERY | — | `SELECT p.id AS product_id, p.par…` |
| 3 | `COTIZACION` | HANDLER | `repeatable_rows` | — |

**El SQL vive hoy dentro del propio reporte**, en `report_definitions.query_text`. Ese es exactamente el modelo que la feature nueva elimina.

(Nota lateral: el reporte `RODUCT_QUOTATION` parece tener un typo en el código — falta la `P` inicial.)

### 6.3 Esquema objetivo (tras la migración pendiente)

```
report_data_sources (id, code UQ, name, description, executor_type,
                     handler_key, query_text, input_schema, output_schema,
                     capabilities, enabled, created_at, updated_at)
        ▲ 1
        │
        │ N
report_definitions.data_source_id  FK ON DELETE RESTRICT (indexado)
```

---

## 7. Migraciones

| | Revisión |
|---|---|
| `alembic current` (DB real) | `e8f5c3d2a901` |
| `alembic heads` (código) | **`f3a7c9e4b612 (head)`** |

⇒ **hay exactamente 1 migración pendiente**: `f3a7c9e4b612_reusable_report_data_sources.py` (untracked, `down_revision = e8f5c3d2a901`).

Qué hace `upgrade()`:
1. `create_table("report_data_sources")` con el CheckConstraint `valid_executor`.
2. `batch_alter_table("report_definitions")`: agrega `data_source_id` (nullable en esta fase), **elimina el CheckConstraint `valid_data_source`**, crea la FK y el índice.
3. Inserta las 5 fuentes baseline (`PRODUCT_CATALOG`, `PRICE_LIST`, `PRICE_HISTORY`, `PRICE_LIST_COMPARISON`, `QUOTATION_ROWS`) como `executor_type=HANDLER`.
4. **Data migration de los reportes existentes**:
   - `SQL_QUERY` → crea una fuente privada `LEGACY_SQL_{id}` con `executor_type=INTERNAL_SQL` y el `query_text` preservado, con `input_schema` derivado de los `report_parameters` actuales.
   - `HANDLER` → apunta a la fuente baseline correspondiente; si el `handler_key` no está en el baseline, crea `LEGACY_HANDLER_{id}`.

Es decir: el reporte `RODUCT_QUOTATION` **no pierde su SQL**; migra a una fuente interna. La migración está bien diseñada y no es destructiva.

`make run_panel` aplicaría esta migración automáticamente en su paso 1 — pero desde que se escribió, **no se ha vuelto a ejecutar** (la DB sigue en `e8f5c3d2a901`).

---

## 8. Contrato API

OpenAPI generado offline desde el checkout actual (`app.openapi()`), rutas relevantes:

```
GET  /api/report-data-sources              ← NUEVO
GET  /api/report-data-sources/{code}       ← NUEVO
GET  /api/reports
POST /api/reports
GET|PUT|DELETE /api/reports/{code}
GET  /api/admin/reports/{code}
POST /api/reports/{code}/data
POST /api/reports/{code}/preview
POST /api/reports/{code}/export/csv
POST /api/reports/{code}/export/xlsx
GET  /api/reports/{code}/parameters/{parameter_name}/options
GET|PUT /api/reports/{code}/builder
GET  /api/reports/{code}/builder/fields    ← movido (antes /report-builder/fields)
POST /api/reports/{code}/builder/preview
POST /api/reports/price-list-comparison/data
```

`ReportCreateRequest` (real, del OpenAPI del working tree):

```json
{
  "code": "string",
  "name": "string",
  "description": "string | null",
  "category": "string | null",
  "data_source_id": 1,
  "enabled": true,
  "parameters": [ /* ReportParameterWrite */ ]
}
```
`required: ["name", "data_source_id", "code"]`, `additionalProperties: false`.
**No hay `source_type`, ni `data_source_type`, ni `query`, ni `query_text`.** Y por `additionalProperties: false`, un cliente viejo que mandara `data_source_type`/`query_text` recibiría **422**.

`ReportDefinitionResponse` incluye `data_source_id` + `data_source` (summary embebido). `ReportDataSourceResponse` = `{id, code, name, description, enabled, capabilities, parameters[], fields[]}` — **sin `query_text`**, tal como declara el modelo.

Cotejo con `src/types/api.ts` del working tree: **coincidencia 1:1**. Frontend y backend hablan el mismo idioma.

---

## 9. `SQL_QUERY`: de dónde nace y por qué seguía apareciendo

Cadena completa, en la versión **committeada** (`HEAD`), que es la que produjo la pantalla observada:

```
UI  /administracion/reportes/nuevo
 └─ src/app/administracion/reportes/nuevo/page.tsx  →  <ReportDefinitionForm />
     └─ src/components/reports/report-definition-form.tsx
         ├─ useState(emptyReportForm())                       ← estado inicial
         ├─ <select id="report-source">                       ← "Tipo de fuente"
         │     <option value="SQL_QUERY">  <option value="HANDLER">
         └─ if (value.data_source_type === "SQL_QUERY")
               → Card "Fuente de datos" + <textarea> "Consulta" ↔ value.query_text
     └─ src/lib/reports/report-form.ts
         └─ emptyReportForm(): { data_source_type: "SQL_QUERY", query_text: "", enabled: false }
                                 ▲▲▲ EL VALOR ESTÁ HARDCODEADO AQUÍ ▲▲▲
     └─ src/types/api.ts
         └─ type ReportDataSourceType = "HANDLER" | "SQL_QUERY"
         └─ ReportCreateRequest { data_source_type, data_source_key, query_text }
     └─ src/lib/api/reports.ts  →  POST /reports
         └─ backend app/schemas/reports.py  ReportCreateRequest(data_source_type, query_text)
             └─ app/db/models/report_definition.py  CheckConstraint "valid_data_source"
                 └─ report_definitions.data_source_type = 'SQL_QUERY', .query_text = 'SELECT …'
```

Origen histórico: commit **`dd1f6aa feat(reports): add report manager and SQL configuration`** (frontend).

**Por qué se seguía viendo pese a que el working tree ya lo eliminó:**

1. La corrección **no está commiteada** — pero eso por sí solo no basta, porque `next dev` sirve desde el working tree y hace hot-reload.
2. La causa determinante es que **el proceso que estaba sirviendo esa pantalla ya no existe**. Hoy `:3001` lo ocupa `~/Projects/cecoc` y `:8001` está muerto. La pantalla observada vino de una instancia de Arefil levantada **antes** de estos cambios (o de una pestaña de navegador que quedó abierta con el HTML anterior).
3. Y aunque se levante Arefil ahora, **fallaría igual** por la migración pendiente: el `useEffect` llamaría a `GET /api/report-data-sources`, que consultaría una tabla `report_data_sources` inexistente → error 500 → el `<select>` quedaría vacío con el mensaje *"No se cargaron las fuentes"*. Esto **sólo se resuelve corriendo `alembic upgrade head`**, que `make run_panel` hace por sí solo.

---

## 10. ¿Existen realmente las fuentes de datos?

**Clasificación: B) IMPLEMENTADO PARCIALMENTE** — implementado por completo en código y verificado por tests, pero **no commiteado, no migrado y nunca ejecutado end-to-end**.

| Evidencia | Ruta |
|---|---|
| Modelo | `Arefil_backend/backend/app/db/models/report_data_source.py` (untracked) |
| Specs (PRODUCT_CATALOG / PRICE_LIST / PRICE_HISTORY / …) | `…/app/services/reports/data_source_specs.py` (untracked) |
| Servicio | `…/app/services/reports/data_sources.py` (untracked) |
| Router | `…/app/api/routes/report_data_sources.py` (untracked) |
| Migración | `…/migrations/versions/f3a7c9e4b612_reusable_report_data_sources.py` (untracked) |
| Tests | `…/backend/tests/test_report_data_sources.py` (untracked) |
| Handlers ejecutables | `…/app/services/reports/registry.py:241-244` (`DATA_SOURCE_HANDLERS`) |
| Seed idempotente | `…/app/db/seed.py` → `seed_report_data_sources()` |
| Cliente API FE | `Arefil_frontend/src/lib/api/reports.ts` → `listReportDataSources`, `getReportDataSource` |
| Tipos FE | `Arefil_frontend/src/types/api.ts` → `ReportDataSource`, `ReportDataSourceSummary` |
| UI FE | `…/src/components/reports/report-definition-form.tsx` → `<select id="report-data-source">` |

En la **base de datos real**: **D) NO EXISTE** (tabla ausente).

---

## 11. Diferencias contra el flujo deseado

| COMPONENTE | ESTADO | Justificación |
|---|---|---|
| Reportes backend | ✅ | Modelo, schemas, routers, runtime, exports. 197 tests pasan. |
| Reportes frontend | ⚠️ | Código de producción migrado y funcional; los tests quedaron en el contrato viejo → `tsc` y `vitest` fallan. |
| Fuentes de datos backend | ⚠️ | Implementado y probado, pero **sin commitear y sin migrar** en la DB real. |
| Fuentes de datos frontend | ⚠️ | `<select>` + cliente + tipos listos, **sin commitear**; hoy no tiene backend vivo que le responda. |
| Parámetros | ✅ | Se derivan del `input_schema` de la fuente (`parametersFromDataSource`); `options_source` (`price_lists`, `suppliers`, `products`, `products_by_price_list`) intacto. |
| Preview | ⚠️ | `POST /reports/{code}/preview` y `/builder/preview` siguen existiendo; el preview **se retiró del formulario de definición** y ahora vive solo en el Report Builder. Cambio intencional, pero es una regresión de UX si esperabas probar la fuente al crear. |
| Ejecución SQL | ✅ | `sql_query_executor.py` sigue vivo, pero ahora sólo lo alcanzan fuentes `INTERNAL_SQL`, nunca un reporte directamente. |
| Stimulsoft | ❌ (intencional) | Retirado en `074570d` (FE) y `22a3113` (BE). No se reintroduce. |
| Descarga | ✅ | `/export/csv` y `/export/xlsx` sin cambios de contrato. |

Flujo deseado vs. real, tras aplicar lo pendiente: **coincide**. Un admin elegiría `PRODUCT_CATALOG` de un `<select>`, los parámetros llegarían del contrato de la fuente, y nunca escribiría `SELECT`.

---

## 12. Diagnóstico raíz

| # | Causa | Severidad | Evidencia |
|---|---|---|---|
| 1 | **Arefil no está corriendo**; `:3001` lo ocupa el proyecto `cecoc` y `:8001` está muerto. La pantalla observada es de una instancia previa/pestaña vieja. | **CRÍTICA** | `/proc/174572/cwd → ~/Projects/cecoc`; `curl :3001/administracion/reportes/nuevo → 404`; `curl :8001 → connection refused` |
| 2 | **Migración `f3a7c9e4b612` sin aplicar.** Con el código nuevo levantado, `GET /api/report-data-sources` reventaría por tabla inexistente. | **CRÍTICA** | `alembic current = e8f5c3d2a901` vs `heads = f3a7c9e4b612`; `.tables` sin `report_data_sources` |
| 3 | **Toda la feature está sin commitear** en ambos repos (6 archivos backend ni siquiera trackeados). Un `git stash`, `checkout` o `clean` accidental la borra por completo. | **ALTA** | `git status` en ambos repos; `git stash list` vacío |
| 4 | **Tests del frontend desactualizados**: 17 errores de `tsc --noEmit`, 20 tests fallando en 2 archivos. `next build` fallaría si el pipeline typechequea. | **ALTA** | `report-builder-workspace.test.tsx` (19 fallos), `lib/api/reports.test.ts` (1), + errores de tipo en `generic-report-runtime.test.tsx`, `report-catalog-cards.test.tsx`, `report-builder.test.ts` |
| 5 | Cambio de firma no propagado a tests: `getReportFieldCatalog()` → `getReportFieldCatalog(code)`, y `ReportBuilderWorkspace` cambió `dataSourceKey` → `dataSourceCapabilities`. | MEDIA | `report-builder-workspace.tsx:236`; `reports.test.ts:133` |
| 6 | La branch `feat/report-data-sources` es **solo local** en ambos repos; sin backup remoto. | MEDIA | `git branch -a` |
| 7 | El preview desapareció del formulario de definición (movido al Builder). | BAJA | diff de `report-definition-form.tsx` |
| 8 | Reporte legado con código mal escrito: `RODUCT_QUOTATION`. La migración lo arrastra tal cual a `LEGACY_SQL_2`. | BAJA | fila 2 de `report_definitions` |

**Frente a las 10 preguntas iniciales**: no es "frontend nuevo + backend viejo" ni al revés. Es **código nuevo en ambos, sin commitear, contra una DB vieja y sin ningún proceso Arefil vivo**.

---

## 13. Qué falta implementar

### BACKEND
- Nada funcional pendiente. 197 tests en verde.
- Falta decidir si `report_definitions.data_source_type` / `query_text` (deprecados) se eliminan en una migración posterior o se dejan como compatibilidad.

### FRONTEND
- Actualizar al contrato nuevo: `report-builder-workspace.test.tsx`, `lib/api/reports.test.ts`, `generic-report-runtime.test.tsx`, `report-catalog-cards.test.tsx`, `lib/reports/report-builder.test.ts`.
- Reponer la cobertura perdida al borrar `src/lib/reports/report-form.test.ts`.
- Dejar `tsc --noEmit` y `vitest run` en verde antes de commitear.
- (Opcional) Decidir si el formulario de definición recupera un botón de preview contra la fuente seleccionada.

### BASE DE DATOS
- Aplicar `alembic upgrade head` → `f3a7c9e4b612`.
- Verificar tras migrar: las 5 fuentes baseline creadas, `LEGACY_SQL_2` generada para `RODUCT_QUOTATION`, y los 3 reportes con `data_source_id` no nulo.
- Considerar un backup previo de `data/arefil.db` (ya existe `data/backups/`).

### INTEGRACIÓN
- Liberar el puerto `3001` (o cambiar `FRONTEND_PORT` en `.env.local`) para que Arefil no choque con `cecoc`.
- Levantar `make run_panel` y validar end-to-end en `/administracion/reportes/nuevo`.
- Commitear la feature en ambos repos y pushear `feat/report-data-sources`.

---

## 14. Orden recomendado de implementación

1. **Asegurar el trabajo primero**: commit (o al menos `git add -A` + commit WIP) en **ambos** repos y push de `feat/report-data-sources`. Hoy 6 archivos backend son untracked y un `git clean` los destruye.
2. **Liberar el puerto**: detener el `next dev` de `cecoc` (pid 174572 / 174560) o mover `FRONTEND_PORT` en `.env.local`.
3. **Backup de la SQLite** (`data/arefil.db` → `data/backups/`).
4. **Aplicar la migración**: `cd Arefil_backend/backend && ../.venv/bin/python -m alembic upgrade head`, o simplemente `make run_panel`, que la aplica y luego siembra.
5. **Verificar la DB**: existe `report_data_sources` con 5+ filas; los 3 reportes tienen `data_source_id`.
6. **Verificar la API**: `GET http://127.0.0.1:8001/api/report-data-sources` devuelve el catálogo.
7. **Verificar la UI**: `/administracion/reportes/nuevo` muestra la Card "Fuente de datos" con el `<select>` poblado — sin "Tipo de fuente" ni "Consulta".
8. **Arreglar los tests del frontend** (5 archivos) hasta dejar `tsc` y `vitest` en verde.
9. **Endurecer**: eliminar o documentar las columnas deprecadas y corregir el código `RODUCT_QUOTATION`.
10. **Merge** de `feat/report-data-sources` a `dev` en ambos repos, en el mismo orden (backend primero).

---

## 15. Veredicto

**El problema ocurre porque:** la pantalla que se está mirando no la sirve el código actual. En este momento no hay ninguna instancia de Arefil corriendo — el puerto `3001` lo ocupa el proyecto `cecoc` y en `8001` no escucha nadie —, de modo que `Tipo de fuente / SQL_QUERY / Consulta` proviene de una sesión anterior levantada antes de que existieran los cambios en el working tree. Y aunque se relanzara Arefil ahora mismo, el nuevo formulario **tampoco funcionaría**, porque la migración `f3a7c9e4b612` no está aplicada: la tabla `report_data_sources` no existe todavía en `data/arefil.db`, así que el `<select>` de fuentes se quedaría vacío. La raíz de `SQL_QUERY` en el código commiteado es `src/lib/reports/report-form.ts → emptyReportForm()`, que lo fija literalmente, introducido en el commit `dd1f6aa`.

**El cambio que supuestamente eliminaba la consulta:**

```
EXISTE PARCIALMENTE — está escrito y probado en el working tree de AMBOS repos
(branch feat/report-data-sources), pero NO está commiteado, la migración NO está
aplicada, y nunca se ejecutó end-to-end. No está en otra branch: está en disco,
sin guardar en Git.
```
