# Reintegración de eliminación de reportes y listas de precios

Fecha: 2026-10-05
Repositorios: `Arefil_frontend/dev` y `Arefil_backend/dev`
Integración posterior al cierre técnico:

- Backend `dev`: `1339faa feat: delete reports and price lists`, pusheado a `origin/dev`.
- Frontend `dev`: `a66266a feat: delete reports and price lists`, pusheado a `origin/dev`.

## 1. Recon inicial

Antes de modificar código se ejecutaron en ambos repositorios:

```bash
git status
git branch --show-current
git log --oneline -20
```

Resultado inicial:

- Frontend: rama `dev`, alineada con `origin/dev`, worktree limpio.
- Backend: rama `dev`, alineada con `origin/dev`, con tres restos no rastreados que ya estaban presentes:
  - `backend/app/db/models/report_deletion_marker.py`
  - `backend/app/services/catalog/price_lists.py`
  - `backend/migrations/versions/ab3d5e7f9012_preserve_report_deletions.py`
- No se cambió a `main`, no se hizo merge, commit ni push.

Historial frontend observado:

```text
4ee0137 fix(products): align frontend with backend product contracts
1a3369d feat(dev): standardize local lifecycle with compose commands
2ef8820 Merge branch 'feat/visual-template-inspector' into dev
3600a49 docs(reports): add report builder main integration notes
6cd3623 docs(reports): add Visual Template Builder dev integration notes
798b09c docs(reports): add Visual Template Builder final E2E acceptance notes
b99e7ed fix(reports): keep subfield edits in the repeatable group editor
5bd83b9 fix(reports): stop duplicating rows.row_number in the mapper picker
770f297 fix(reports): refresh template metadata after mapper mutations
e5eff75 fix(reports): close wizard creation preview and history E2E blockers
15357ad fix(reports): include template history dialog dependencies
97e0be8 docs(reports): add report creation wizard delivery notes
be5f1e6 feat(reports): add guided wizard for report creation/configuration
7819d10 docs(reports): add version history delivery notes
409d406 feat(reports): add Excel template version history and restore
370fb35 docs(reports): add visual template preview delivery notes
2e36554 feat(reports): add rendered-document preview to the visual template editor
daf1e97 docs(reports): add visual template inspector/mapper delivery notes
a771524 feat(reports): add visual template inspector and cell mapper
e4dc028 docs(reports): add Visual Template Builder final E2E acceptance notes
```

Historial backend observado:

```text
fc87347 docs(reports): add report builder main integration notes
f4d176e docs(reports): add Visual Template Builder dev integration notes
c9ac7e9 test(reports): cover disabled builder preview snapshots
40f4c76 feat(reports): integrate visual XLSX inspector mappings preview and history
893d9df Merge pull request #27 from Alejandro120603/feat/report-data-sources
8a3f8a3 feat(reports): support dynamic XLSX filenames
129305e feat(reports): add immutable execution snapshots
e7f211c feat(reports): validate XLSX templates before activation
feac21d feat(reports): add native XLSX row numbering
ba957c3 feat(reports): replace Stimulsoft with XLSX report templates
0ac5138 feat(reports): add document templates and Stimulsoft exports
9d33dc7 feat(reports): complete dynamic quotation engine
474d178 actualizacion de reportes
4c3ab27 prueba
22a3113 refactor(reports): remove Stimulsoft backend integration
cda8d80 feat(reports): add repeatable report runtime and configurable XLSX export
645b04b feat(reports): add report builder core
1b2b574 feat(reports): add configurable SQL report engine
ab6e98d feat(reports): add dynamic SQL report engine
6b7ef4f feat(reports): add report registry and template storage
```

También se revisó `codex/output/delete-reports-price-lists.md` sólo como referencia histórica y se leyó la documentación instalada de Next.js 16.3 sobre Server/Client Components, fetching, mutaciones y navegación antes de cambiar componentes App Router.

## 2. Causa de la funcionalidad incompleta

El commit frontend `4ee0137` incorporó componentes, diálogos y tests históricos de borrado, pero no conectó esos componentes a las páginas Server Component actuales. Además:

- `AdminReportRow` importaba un `deleteReport` inexistente.
- `/administracion/reportes` y `/donaldson/price-lists` seguían construyendo filas estáticas.
- El detalle de lista no renderizaba `DeletePriceListButton`.
- Backend no registraba el modelo de marker, no exponía ninguno de los dos DELETE y no consultaba markers desde los seeds.
- Los tres archivos backend históricos estaban sin rastrear y la migración reutilizaba el revision ID antiguo advertido en el requerimiento.

La suite frontend dirigida pasaba inicialmente porque `AdminReportRow` mockeaba por completo el módulo de API y las páginas no tenían pruebas que demostraran que realmente usaban esa fila.

## 3. Arquitectura encontrada

### Reportes

- Identificador público: `ReportDefinition.code`, único y normalizado.
- Clave interna: `ReportDefinition.id`.
- Fuente compartida: `ReportDefinition.data_source_id -> ReportDataSource.id`, `ON DELETE RESTRICT`; no hay cascade desde reporte hacia fuente.
- Hijos propios con `ON DELETE CASCADE` y/o `cascade="all, delete-orphan"`:
  - `ReportParameter`
  - `ReportParameterGroup`
  - `ReportParameterGroupField` a través del grupo
  - `ReportColumn`
  - `ReportExcelLayout`
  - `ReportExcelTemplate`
  - `ReportExecution`
- Tablas históricas sin modelo ORM, pero con FK `ON DELETE CASCADE` conservada por las migraciones:
  - `legacy_report_templates`
  - `legacy_stimulsoft_document_templates`
- Los snapshots de ejecución son propios del reporte y se eliminan con él.

### Listas de precios

- `PriceListItem.price_list_id` y `ProductStatusChange.price_list_id` son FK obligatorias sin `ON DELETE CASCADE`; deben eliminarse explícitamente.
- `PriceList.supplier_id` e `import_id` apuntan a entidades compartidas/de auditoría y no se eliminan.
- `Product`, incluidas referencias directas y de reemplazo desde cambios de estado, es compartido.
- El archivo físico pertenece al `ImportJob`; no existe una cascade ni política actual que autorice borrarlo con la lista.
- Reportes reciben IDs de listas como parámetros/snapshots JSON, no mediante FK relacional hacia `PriceList`.

## 4. Archivos modificados

### Backend

- `backend/app/api/routes/reports.py`
- `backend/app/api/routes/price_lists.py`
- `backend/app/db/models/__init__.py`
- `backend/app/db/models/report_deletion_marker.py`
- `backend/app/db/seed.py`
- `backend/app/services/reports/definitions.py`
- `backend/app/services/catalog/__init__.py`
- `backend/app/services/catalog/price_lists.py`
- `backend/migrations/versions/1f7c2d9a6b40_preserve_report_deletions.py`
- `backend/tests/test_report_registry.py`
- `backend/tests/test_catalog_api.py`
- `backend/tests/test_seed.py`

### Frontend

- `src/app/administracion/reportes/page.tsx`
- `src/components/reports/admin-report-row.tsx`
- `src/components/reports/admin-report-row.test.tsx`
- `src/lib/api/reports.ts`
- `src/lib/api/reports.test.ts`
- `src/app/donaldson/price-lists/page.tsx`
- `src/app/donaldson/price-lists/[id]/page.tsx`
- `src/components/donaldson/delete-price-list-button.tsx`
- `src/components/donaldson/price-list-row.test.tsx`
- `codex/output/delete-reports-reintegration.md`

Los componentes históricos `price-list-delete-dialog.tsx`, `price-list-row.tsx` y `price-list-actions.ts` ya tenían la conducta correcta; se conservaron y ahora sí se usan desde las páginas actuales.

## 5. Endpoints finales

```text
DELETE /api/reports/{code}
204 eliminado
404 código inexistente o inválido
409 dependencia relacional protegida

DELETE /api/price-lists/{price_list_id}
204 eliminado
404 ID inexistente
409 dependencia relacional protegida
```

Ambos devuelven cuerpo vacío en éxito. El cliente de reportes llama exactamente a `/reports/${encodeURIComponent(code)}`.

## 6. Estrategia de borrado

### Reportes

1. Resolver una única instancia por `code` mediante el lookup normalizado actual.
2. Crear `ReportDeletionMarker(code)` si todavía no existe.
3. Eliminar esa instancia ORM; sus hijos propios desaparecen por las cascadas actuales.
4. Ejecutar un único `commit` que incluye marker y hard delete.
5. Ante `IntegrityError`, hacer rollback y devolver 409.
6. Ante cualquier otra excepción, hacer rollback y propagar el error.

Nunca se borra `ReportDataSource` ni se usa un DELETE masivo.

### Listas de precios

En una sola transacción y siempre filtrando por el ID solicitado:

1. DELETE de `ProductStatusChange` de esa lista.
2. DELETE de `PriceListItem` de esa lista.
3. DELETE de la instancia `PriceList`.
4. Un único commit.

Se conservan `Product`, `Supplier`, `ImportJob`, archivo físico, otras listas y sus historiales. `IntegrityError` hace rollback y se traduce a 409; cualquier otro fallo también hace rollback.

## 7. Relaciones y cascades verificadas

Además de inspeccionar modelos y migraciones, los tests verifican que:

- reporte objetivo, parámetros, grupos/campos, columnas, layout, templates XLSX, ejecuciones y tablas legacy desaparecen;
- otro reporte que comparte la fuente permanece;
- `ReportDataSource` permanece;
- una FK externa `ON DELETE RESTRICT` fuerza 409 y el rollback restaura hijos y evita dejar marker;
- lista objetivo, items y cambios desaparecen;
- otra lista, sus items/cambios, producto, proveedor e import jobs permanecen;
- una FK externa protegida fuerza 409 y restaura el borrado explícito previo.

## 8. Protección anti-resurrección de seeds

`ReportDeletionMarker` guarda únicamente:

- `code` como clave primaria;
- `deleted_at` con timestamp de servidor.

No guarda configuración, snapshots ni datos sensibles. `seed_report_registry` y `seed_quotation_products_report` no recrean un código ausente que tenga marker. `create_report_definition` elimina el marker del mismo código dentro de la transacción de creación; si el commit de creación falla, también se restaura el marker.

## 9. Migración creada

```text
Revision: 1f7c2d9a6b40
Down revision: d9f2a6b4c801
Archivo: backend/migrations/versions/1f7c2d9a6b40_preserve_report_deletions.py
```

Se descartó el revision ID histórico `ab3d5e7f9012`. `alembic heads` devuelve un único head: `1f7c2d9a6b40`.

Validación aislada realizada:

- `alembic upgrade head` desde base vacía: correcto.
- Inspección de tabla/columnas: correcta.
- `alembic downgrade d9f2a6b4c801`: correcto; elimina sólo el marker.

## 10. Tests agregados o adaptados

### Backend — reportes

- 204 y cuerpo vacío.
- 404.
- eliminación exclusiva del grafo solicitado, incluidos hijos ORM, tablas legacy y snapshots.
- preservación de fuente compartida y otro reporte.
- 409 real mediante FK restrictiva.
- rollback de hijos y marker ante conflicto.
- rollback completo ante fallo forzado de commit.
- seed eliminado no reaparece.
- seed de cotización respeta marker.
- recreación explícita del mismo código elimina marker.

### Backend — listas

- 204 y cuerpo vacío.
- 404.
- eliminación exclusiva de lista, items y cambios.
- preservación de otra lista, items/cambios, producto, proveedor e import jobs.
- 409 real mediante FK restrictiva y rollback de los DELETE previos.
- rollback completo ante fallo forzado de commit.

### Frontend

- menú muestra Configurar/Generar/Eliminar.
- abrir y cancelar no llaman DELETE.
- confirmación llama una sola vez con el código/ID exacto.
- controles se deshabilitan y muestran `Eliminando...`.
- éxito quita la fila, muestra toast y refresca.
- fallo conserva fila y diálogo.
- 409 muestra el mensaje del backend.
- código se codifica con `encodeURIComponent`.
- detalle de lista vuelve al listado y refresca.

## 11. Resultado exacto backend tests

Línea base dirigida antes de implementar:

```text
27 passed, 1 warning in 2.46s
```

Primera suite completa después de implementar:

```text
Comando: .venv/bin/pytest -q
338 passed, 1 warning in 41.48s
```

Warning preexistente/no bloqueante: `StarletteDeprecationWarning` de `fastapi.testclient` por la transición de `httpx` a `httpx2`.

Después de ampliar la aserción de cascades legacy se repitieron los tests relevantes:

```text
15 passed, 1 warning in 1.88s
```

Validación final de la suite completa sobre el estado entregado:

```text
Comando: .venv/bin/pytest -q
338 passed, 1 warning in 36.68s
```

## 12. Resultado exacto frontend tests

```text
Comando: npm test
Test Files  39 passed (39)
Tests       370 passed (370)
Duration    12.66s
```

El mensaje jsdom `Not implemented: navigation to another Document` apareció durante la suite, pero el proceso terminó con código 0 y todos los tests pasaron; proviene de una prueba existente de navegación del DOM.

## 13. Lint

```text
Comando: npm run lint
Resultado: correcto, exit code 0, sin errores ni warnings.
```

## 14. Typecheck

```text
Comando: npm run typecheck
Resultado: correcto, exit code 0, sin errores.
```

## 15. Build

```text
Comando: npm run build
Resultado: correcto.
Next.js 16.3.0 compiló en 3.3s, TypeScript terminó en 3.1s y generó 13 páginas estáticas.
```

Las rutas dinámicas actuales, incluidos `/administracion/reportes`, `/donaldson/price-lists` y su detalle, se generaron correctamente.

## 16. Prueba E2E/local

Se usó el flujo oficial `make compose_up`, aislado de datos reales:

- SQLite temporal bajo `/tmp`.
- uploads/backups temporales.
- backend en `127.0.0.1:18000`.
- frontend en `127.0.0.1:13001`.
- migración y seed ejecutados por el propio target oficial.

Validaciones realizadas:

1. Las páginas de administración mostraron los reportes y dos listas fixture.
2. DELETE de reporte atravesó el proxy `/backend-api` de Next y devolvió 204.
3. La página server-rendered dejó de contener el reporte.
4. Se detuvo y volvió a levantar realmente el stack sobre la misma base.
5. El seed de arranque se ejecutó y el reporte siguió ausente.
6. La creación explícita por el proxy devolvió 201, restauró el reporte y eliminó el marker.
7. DELETE de lista por el proxy devolvió 204 y el listado dejó de mostrarla.
8. La otra lista permaneció.
9. Permanecieron `Product`, `Supplier`, ambos `ImportJob` y el archivo físico de la lista eliminada.
10. Desaparecieron sólo items y cambios de estado de la lista objetivo.

Cancelar, loading, doble envío y errores se validaron con tests de componentes jsdom; el repositorio no incluye un runner de navegador E2E para automatizar clicks reales. El stack temporal se detuvo y sus directorios se eliminaron al finalizar.

## 17. Riesgos o pendientes

- Aplicar `1f7c2d9a6b40` antes de servir el nuevo DELETE. El entrypoint oficial ya ejecuta `alembic upgrade head` antes del seed.
- Los endpoints administrativos siguen sin autenticación/roles; es una limitación preexistente documentada por el proyecto.
- Eliminar un reporte elimina deliberadamente sus ejecuciones/snapshots y templates, incluidos históricos legacy, conforme a sus FK actuales.
- Eliminar una lista elimina el tramo de historial de precios derivado de sus items; no altera otras listas.
- `ImportJob` y el archivo quedan huérfanos de navegación, pero se conservan intencionalmente por auditoría y por el alcance solicitado.
- Permanece el warning no bloqueante de TestClient indicado arriba.

## 18. `git diff --stat`

Backend (los tres archivos nuevos no aparecen en `git diff --stat` hasta estar rastreados):

```text
 backend/app/api/routes/price_lists.py       |  20 ++-
 backend/app/api/routes/reports.py           |  14 +-
 backend/app/db/models/__init__.py           |   2 +
 backend/app/db/seed.py                      |  16 +-
 backend/app/services/catalog/__init__.py    |   9 +-
 backend/app/services/reports/definitions.py |  39 ++++-
 backend/tests/test_catalog_api.py           | 139 ++++++++++++++-
 backend/tests/test_report_registry.py       | 262 +++++++++++++++++++++++++++-
 backend/tests/test_seed.py                  |  21 ++-
 9 files changed, 508 insertions(+), 14 deletions(-)
```

Frontend (el presente documento nuevo tampoco aparece en `git diff --stat` hasta estar rastreado):

```text
 src/app/administracion/reportes/page.tsx           | 34 ++++------------------
 src/app/donaldson/price-lists/[id]/page.tsx        | 10 +++++--
 src/app/donaldson/price-lists/page.tsx             | 28 +++---------------
 .../donaldson/delete-price-list-button.tsx         |  5 +++-
 src/components/donaldson/price-list-row.test.tsx   |  1 +
 src/components/reports/admin-report-row.test.tsx   |  5 ++--
 src/components/reports/admin-report-row.tsx        | 26 +++++++++--------
 src/lib/api/reports.test.ts                        | 13 +++++++++
 src/lib/api/reports.ts                             |  4 +++
 9 files changed, 55 insertions(+), 71 deletions(-)
```

## 19. `git status --short`

Backend:

```text
 M backend/app/api/routes/price_lists.py
 M backend/app/api/routes/reports.py
 M backend/app/db/models/__init__.py
 M backend/app/db/seed.py
 M backend/app/services/catalog/__init__.py
 M backend/app/services/reports/definitions.py
 M backend/tests/test_catalog_api.py
 M backend/tests/test_report_registry.py
 M backend/tests/test_seed.py
?? backend/app/db/models/report_deletion_marker.py
?? backend/app/services/catalog/price_lists.py
?? backend/migrations/versions/1f7c2d9a6b40_preserve_report_deletions.py
```

Frontend:

```text
 M src/app/administracion/reportes/page.tsx
 M src/app/donaldson/price-lists/[id]/page.tsx
 M src/app/donaldson/price-lists/page.tsx
 M src/components/donaldson/delete-price-list-button.tsx
 M src/components/donaldson/price-list-row.test.tsx
 M src/components/reports/admin-report-row.test.tsx
 M src/components/reports/admin-report-row.tsx
 M src/lib/api/reports.test.ts
 M src/lib/api/reports.ts
?? codex/output/delete-reports-reintegration.md
```

## Resumen

```text
REPORT DELETE
Backend: OK
Frontend: OK
Seed protection: OK
Tests: 338 backend passed; 370 frontend passed

PRICE LIST DELETE
Backend: OK
Frontend: OK
Tests: incluidos en 338 backend y 370 frontend passed

Frontend commit: a66266a
Backend commit: 1339faa
Push: realizado a origin/dev en ambos repositorios
Main: NO tocado
```
