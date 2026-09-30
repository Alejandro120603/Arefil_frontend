# Eliminación de reportes y listas de precios

Fecha: 2026-09-03  
Branches revisadas: `feat/report-data-sources` en `Arefil_frontend` y `Arefil_backend`  
Commits/push: no realizados

## 1. Recon realizado

Se revisaron ambos repositorios antes de modificar código: ramas y worktrees, modelos SQLAlchemy, migraciones Alembic, esquema SQLite migrado, rutas FastAPI, servicios, schemas, seeds de arranque, clientes HTTP, páginas App Router, componentes UI y pruebas existentes.

En frontend se encontró un worktree previamente modificado, incluidos los listados objetivo y los componentes `AlertDialog`, `DropdownMenu` y Sonner. Esos cambios se preservaron y la implementación se hizo de forma localizada.

Se leyó la documentación incluida con Next.js 16.3 para Server/Client Components, fetching, mutaciones y navegación antes de escribir componentes interactivos.

## 2. Problema encontrado

- No existía endpoint para eliminar definiciones de reportes.
- No existía endpoint para eliminar listas de precios.
- Los listados no ofrecían una acción destructiva con confirmación.
- `PriceListItem` y `ProductStatusChange` referencian `PriceList` sin `ON DELETE CASCADE`; un borrado directo del padre produce un error de integridad.
- Los seeds se ejecutan en cada arranque y recreaban dos reportes base eliminados. Aunque el DELETE quitara la fila de SQLite, esos reportes reaparecían después de reiniciar.
- No había flujo de refetch, toast, loading ni prevención de doble envío para estos borrados.

## 3. Backend existente antes del cambio

### Reportes

- Modelo padre: `ReportDefinition` (`report_definitions`).
- ID interno real: entero `report_definitions.id`.
- Identificador público y de navegación: `ReportDefinition.code`, único y normalizado.
- Rutas existentes: `GET/POST /api/reports`, `GET/PATCH /api/reports/{code}` y rutas de ejecución/exportación.
- Sólo existía DELETE para la plantilla Excel activa: `DELETE /api/admin/reports/{code}/excel-template`.
- Eliminación previa: no había soft delete ni hard delete de la definición.

### Listas de precios

- Modelo padre: `PriceList` (`price_lists`).
- Identificador público: entero `price_lists.id`.
- Rutas existentes: listado, detalle, items, cambios de estado, exports y archivo fuente.
- No existía `DELETE /api/price-lists/{price_list_id}`.
- No había soft delete.

## 4. Frontend existente antes del cambio

### Administración → Reportes

- Página Server Component en `/administracion/reportes`.
- Tabla con conteo `Definiciones X de X`, filtros y navegación por `report.code`.
- Acciones existentes: Configurar/Generar. Un comentario indicaba explícitamente que Eliminar no se mostraba porque el API no lo soportaba.

### Donaldson → Listas de precios

- Página Server Component paginada en `/donaldson/price-lists`.
- Menú por fila con Ver detalle y Ver cancelados.
- Detalle en `/donaldson/price-lists/[id]` sin acción de eliminación.

### Infraestructura UI

- `DropdownMenu`, `AlertDialog`, `Button`, Sonner y Lucide ya estaban disponibles.
- El `Toaster` ya estaba montado en `AppShell`.
- El cliente HTTP ya soportaba `apiDelete` y el proxy same-origin ya reenviaba DELETE.

## 5. Cambios realizados

- Se agregó eliminación transaccional de un reporte por su `code` público, resolviendo primero una sola instancia ORM con su ID interno.
- Se agregó eliminación transaccional de una lista por su ID entero.
- Se traduce `IntegrityError` a 409 después de rollback; cualquier otro error también hace rollback y no se oculta.
- Se agregó `ReportDeletionMarker`, una marca independiente que evita que los seeds automáticos resuciten un reporte eliminado físicamente.
- Una recreación explícita del mismo código elimina esa marca.
- Se añadieron menús destructivos, diálogos de confirmación, estado loading, bloqueo de doble click, toasts y actualización automática.
- Tras un 204 la fila se retira y `router.refresh()` vuelve a consultar la página Server Component.
- Desde el detalle de una lista, el éxito redirige con `router.replace('/donaldson/price-lists')`.

## 6. Archivos modificados

### Arefil_backend

- `backend/app/api/routes/reports.py`
- `backend/app/api/routes/price_lists.py`
- `backend/app/db/models/__init__.py`
- `backend/app/db/models/report_deletion_marker.py`
- `backend/app/db/seed.py`
- `backend/app/services/reports/definitions.py`
- `backend/app/services/catalog/__init__.py`
- `backend/app/services/catalog/price_lists.py`
- `backend/migrations/versions/ab3d5e7f9012_preserve_report_deletions.py`
- `backend/tests/test_report_registry.py`
- `backend/tests/test_catalog_api.py`

### Arefil_frontend

- `src/app/administracion/reportes/page.tsx`
- `src/app/donaldson/price-lists/page.tsx`
- `src/app/donaldson/price-lists/[id]/page.tsx`
- `src/components/reports/admin-report-row.tsx`
- `src/components/reports/admin-report-row.test.tsx`
- `src/components/donaldson/price-list-delete-dialog.tsx`
- `src/components/donaldson/price-list-row.tsx`
- `src/components/donaldson/price-list-row.test.tsx`
- `src/components/donaldson/delete-price-list-button.tsx`
- `src/lib/api/reports.ts`
- `src/lib/api/reports.test.ts`
- `src/lib/api/price-list-actions.ts`
- `src/lib/api/price-list-actions.test.ts`
- `codex/output/delete-reports-price-lists.md`

## 7. Endpoints implementados

### `DELETE /api/reports/{code}`

- 204: definición eliminada.
- 404: código inexistente o inválido.
- 409: una dependencia protegida impide el borrado.
- Usa la convención pública ya existente (`code`), no expone un segundo identificador ambiguo.

### `DELETE /api/price-lists/{price_list_id}`

- 204: lista eliminada.
- 404: ID inexistente.
- 409: una dependencia protegida impide el borrado.

## 8. Estrategia de eliminación de Report

La eliminación es hard delete. Se obtiene una sola definición por código único y se elimina la instancia ORM; no hay operación masiva ni DELETE sin filtro.

En la misma transacción se inserta una marca por código y se elimina la definición. La marca no contiene la definición ni sus datos: sólo comunica al seed de arranque que una ausencia fue intencional. Si falla el commit, el rollback restaura definición/hijos y revierte también la marca.

Los hijos propios se eliminan por cascadas ORM/DB. La fuente reusable no se elimina.

## 9. Estrategia de eliminación de PriceList

La eliminación es hard delete y explícitamente ordenada dentro de una sola transacción:

1. `ProductStatusChange` filtrados por `price_list_id`.
2. `PriceListItem` filtrados por `price_list_id`.
3. La única instancia `PriceList` solicitada.
4. Commit único.

`Product`, `ImportJob` y `Supplier` no participan en el borrado. Un error hace rollback de las tres operaciones.

## 10. Relaciones/cascades encontradas

### ReportDefinition

Se eliminan con el reporte porque son configuración o snapshots propios:

- `ReportParameter`: FK `ON DELETE CASCADE`, cascade ORM.
- `ReportParameterGroup`: FK `ON DELETE CASCADE`, cascade ORM.
- `ReportParameterGroupField`: cascade a través del grupo.
- `ReportColumn`: FK `ON DELETE CASCADE`, cascade ORM.
- `ReportExcelLayout`: FK `ON DELETE CASCADE`, cascade ORM.
- `ReportExcelTemplate`: FK `ON DELETE CASCADE`, cascade ORM.
- `ReportExecution`: FK `ON DELETE CASCADE`, cascade ORM.
- `legacy_report_templates`: FK `ON DELETE CASCADE` en el esquema migrado.
- `legacy_stimulsoft_document_templates`: FK `ON DELETE CASCADE` en el esquema migrado.

Se conserva:

- `ReportDataSource`: el reporte apunta a una fuente reusable mediante FK `ON DELETE RESTRICT`; eliminar el reporte no elimina ni modifica la fuente, aunque sea compartida.

### PriceList

Se eliminan porque sólo tienen sentido dentro de la lista solicitada:

- `PriceListItem`: FK no nullable sin cascade; borrado explícito por lista.
- `ProductStatusChange`: FK no nullable sin cascade; borrado explícito por lista.
- El tramo de historial de precios derivado de los items de la lista eliminada desaparece con esa lista; los items/cambios de todas las demás listas permanecen intactos.

Se conservan:

- `Product`: catálogo maestro compartido entre listas.
- `ImportJob`: auditoría de importación y referencia al archivo almacenado.
- `Supplier`: entidad compartida.
- Definiciones de reportes y fuentes de datos.
- `ReportExecution` de otros reportes: contiene snapshots JSON y no tiene FK relacional a `PriceList`.

No se encontró ninguna relación relacional desde reportes hacia `PriceList`; los IDs usados como parámetros viven en contratos/configuración o snapshots JSON.

## 11. Pruebas agregadas

### Backend — reportes

- Elimina una definición existente con 204.
- Devuelve 404 para código inexistente.
- Elimina parámetros, grupos/campos, columnas, layout, plantillas y ejecuciones.
- Conserva una `ReportDataSource` compartida y el otro reporte que la usa.
- Traduce conflictos a 409.
- Hace rollback de reporte, hijos y marca si falla el commit.
- Un reporte base eliminado no reaparece al reejecutar seeds.
- La recreación explícita del código elimina la marca.

### Backend — listas

- Elimina una lista existente con 204.
- Elimina sólo sus `PriceListItem` y `ProductStatusChange`.
- Conserva `Product` e `ImportJob`.
- Devuelve 404 para ID inexistente.
- Conserva lista, items y cambios históricos de otras listas.
- Traduce conflictos a 409.
- Hace rollback completo ante fallo de commit.

### Frontend

- Expone Editar/Ver y Eliminar en menú por fila.
- Abrir confirmación no llama DELETE.
- Cancelar no elimina.
- Confirmar llama el endpoint correcto una sola vez.
- Durante el request deshabilita Cancelar/Eliminar y conserva el diálogo.
- En éxito elimina la fila, muestra toast y refresca.
- En error conserva fila/diálogo, vuelve a habilitar y muestra el mensaje del backend.
- Desde detalle redirige al listado después del éxito.
- Los clientes codifican el `code` del reporte y usan el ID numérico de la lista.

## 12. Resultado pytest

Comando: `../.venv/bin/pytest -q`  
Resultado: **247 passed**, 1 warning en 18.68 s.  
Warning no bloqueante: deprecación Starlette/FastAPI TestClient respecto a `httpx2`.

## 13. Resultado frontend tests

Comando equivalente real del proyecto: `npm test` (`package-lock.json` es el lockfile del repositorio).  
Resultado: **26 archivos, 225 tests passed**.

## 14. Lint

Comando: `npm run lint`  
Resultado: **correcto, sin errores ni warnings**.

## 15. Typecheck

Comando: `npm run typecheck`  
Resultado: **correcto, sin errores**.

## 16. Build

Comando: `npm run build`  
Resultado: **correcto**. Next.js 16.3 compiló, verificó TypeScript y generó 13 rutas.

## 17. Riesgos o pendientes

- Debe aplicarse la migración `ab3d5e7f9012` antes de usar el nuevo DELETE de reportes en un entorno existente; el entrypoint Docker ya ejecuta `alembic upgrade head`.
- Eliminar una lista quita deliberadamente la porción de historial representada por esa lista y sus cambios de estado; no altera historiales de otras listas.
- `ImportJob` y su archivo físico se conservan por auditoría. Esto puede dejar archivos sin una lista navegable; cualquier política futura de retención/limpieza debe ser explícita y separada.
- Eliminar un reporte también elimina sus snapshots `ReportExecution`, conforme al cascade actual del modelo.
- No se realizaron commits ni push.
