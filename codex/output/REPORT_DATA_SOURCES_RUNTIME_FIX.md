# ReportDataSource runtime fix

Fecha: 2026-08-28  
Estado: **FIXED**

## 1. Estado inicial de Frontend

- Ruta: `/home/daniel12/Projects/Arefil_frontend`
- Árbol de trabajo limpio; sin cambios staged.
- Branch: `feat/report-data-sources`.
- HEAD: `0b81371 (HEAD -> feat/report-data-sources, origin/feat/report-data-sources) prueba`.
- No había procesos Next de Arefil ni listener en 3000/3001.

## 2. Estado inicial de Backend

- Ruta: `/home/daniel12/Projects/Arefil_backend`
- Árbol de trabajo limpio; sin cambios staged.
- Branch: `feat/report-data-sources`.
- HEAD: `4c3ab27 (HEAD -> feat/report-data-sources, origin/feat/report-data-sources) prueba`.
- No había procesos Uvicorn de Arefil ni listener en 8000/8001.

## 3. Branches

Ambos repositorios se confirmaron expresamente en `feat/report-data-sources`. No se cambió de branch.

## 4. Commits iniciales

- Frontend: `0b81371 prueba`.
- Backend: `4c3ab27 prueba`.
- No se creó ningún commit ni se ejecutó push.

## 5. Puertos encontrados

El preflight no encontró listeners en 3000, 3001, 8000 ni 8001. La configuración efectiva de Arefil resultó ser:

- Frontend: `127.0.0.1:3001`.
- Backend: `127.0.0.1:8001`.

Durante `make run_panel`, `ss` confirmó Next en 3001 y Uvicorn en 8001.

## 6. Procesos encontrados

Inicialmente no había procesos `next` ni `uvicorn`. Durante la validación se identificaron exclusivamente procesos con estos working directories:

- Next: `/home/daniel12/Projects/Arefil_frontend`.
- Uvicorn: `/home/daniel12/Projects/Arefil_backend/backend`.

Todos los procesos iniciados para la prueba fueron detenidos mediante el cleanup de `scripts/run_panel.sh`.

## 7. Configuración `.env` relevante

Frontend `.env.local` existente, ignorado por Git y sin modificaciones:

```text
NEXT_PUBLIC_API_URL=/backend-api
BACKEND_PORT=8001
FRONTEND_PORT=3001
API_INTERNAL_URL=http://127.0.0.1:8001/api
```

Backend `.env`:

```text
DATABASE_URL=sqlite:///./data/arefil.db
```

La configuración de proxy era consistente. El fallo de navegador adicional fue una protección de Next.js 16: los assets dev solicitados desde `127.0.0.1` eran bloqueados porque el servidor se inicializa como `localhost`. Se añadió `allowedDevOrigins: ["127.0.0.1"]` siguiendo la documentación incluida en la versión instalada de Next.

## 8. Alembic current/head antes

- `current`: `f3a7c9e4b612 (head)`.
- `heads`: `f3a7c9e4b612 (head)`.
- `upgrade head` se ejecutó y fue no-op.
- Se observó un warning no bloqueante del entorno Python sobre `sys.prefix`; Alembic funcionó correctamente.

## 9. Estado de SQLite antes

SQLite efectiva: `/home/daniel12/Projects/Arefil_backend/backend/data/arefil.db`.

Antes de seed/E2E:

- 3 reportes; 0 `data_source_id` nulos.
- 6 fuentes totales: 5 base y `LEGACY_SQL_2`.
- 5 parámetros.
- 1 grupo de parámetros, con 3 campos.
- 10 columnas Builder.
- 1 configuración Excel.

`report_data_sources` y `report_definitions.data_source_id NOT NULL` ya existían.

## 10. Causas confirmadas

- **C — CONFIRMADA:** el backend no estaba levantado al iniciar el diagnóstico.
- **K — CONFIRMADA:** fixtures/tests frontend todavía utilizaban `SQL_QUERY`, `data_source_type`, `data_source_key`, `query_text` y `dataSourceKey`. Causaban 20 tests fallidos, typecheck fallido y build fallido.
- **O — CONFIRMADA PARCIALMENTE:** `LEGACY_SQL_2` estaba correctamente preservada y relacionada, pero el endpoint de catálogo la listaba como seleccionable. Se corrigió el catálogo sin eliminar ni inutilizar la fuente.
- **Next.js dev origin — CONFIRMADA:** `127.0.0.1:3001` recibía HTML, pero Next 16 bloqueaba chunks/HMR; React no hidrataba y el selector permanecía deshabilitado.
- **Lint frontend — CONFIRMADA:** `setSourceError(null)` se llamaba sincrónicamente dentro de un effect y existía estado `dirty` sin uso.

## 11. Causas descartadas o no aplicables

- **A — DESCARTADA:** no había frontend viejo ejecutándose.
- **B — DESCARTADA:** ningún otro proyecto ocupaba 3000/3001/8000/8001.
- **D — DESCARTADA:** Alembic ya estaba en head.
- **E — DESCARTADA:** `report_data_sources` existía.
- **F — DESCARTADA:** las fuentes base y metadatos de seed ya existían; el seed fue además idempotente.
- **G — DESCARTADA:** `API_INTERNAL_URL` apuntaba a 8001 correctamente.
- **H — DESCARTADA:** `NEXT_PUBLIC_API_URL=/backend-api` era correcto.
- **I — DESCARTADA:** backend y proxy devolvieron el mismo JSON.
- **J — DESCARTADA:** ambos repositorios estaban en la misma branch esperada.
- **L — DESCARTADA:** no había instancia vieja sirviendo `.next`; después se hizo build y arranque limpios.
- **M — DESCARTADA:** Builder usa `report.data_source`; PRODUCT_CATALOG devolvió 8 campos y COTIZACION 16, sin campos globales ajenos.
- **N — DESCARTADA:** todos los reportes tenían una relación válida y no nula.
- Las apariciones backend de `query_text`, `data_source_type` y `data_source_key` se clasificaron como compatibilidad DB/migraciones, ejecución interna o tests de seguridad. No forman parte del esquema público.
- Las apariciones frontend restantes de términos antiguos son aserciones negativas de tests. La frase natural “Consulta los reportes habilitados” no es un control de consulta SQL y no afecta el flujo administrativo.

## 12. Archivos modificados

Backend:

- `backend/app/services/reports/data_sources.py`
- `backend/tests/test_report_data_sources.py`

Frontend:

- `next.config.ts`
- `src/components/reports/report-definition-form.tsx`
- `src/components/reports/report-definition-form.test.tsx`
- `src/components/reports/report-builder-workspace.test.tsx`
- `src/components/reports/generic-report-runtime.test.tsx`
- `src/components/reports/report-catalog-cards.test.tsx`
- `src/lib/api/reports.test.ts`
- `src/lib/reports/report-builder.test.ts`
- `codex/output/REPORT_DATA_SOURCES_RUNTIME_FIX.md`

## 13. Razón de cada modificación

- `data_sources.py`: limita el catálogo público/selector a fuentes `HANDLER` habilitadas; conserva `INTERNAL_SQL` para compatibilidad y runtime de reportes migrados.
- Test backend: cubre que una fuente interna no aparezca en el catálogo, pero que su reporte existente pueda editarse y ejecutarse.
- `next.config.ts`: permite el origen dev local `127.0.0.1` requerido por las URLs reales de Arefil.
- Formulario: elimina el effect inválido/estado muerto y diferencia fuentes deshabilitadas de fuentes migradas no catalogables, sin mostrar detalles técnicos.
- Tests frontend: actualizan fixtures al contrato `data_source_id` + `data_source`, capacidades y endpoint Builder por reporte.

## 14. Migración ejecutada

Se ejecutó `alembic upgrade head` tanto directamente como mediante `make run_panel`. En ambos casos fue no-op porque la DB ya estaba en `f3a7c9e4b612`.

## 15. Backup creado

`/home/daniel12/Projects/Arefil_backend/backend/data/backups/arefil-before-report-data-sources-20260828-152904.db`

- Tamaño: 2,027,520 bytes.
- Creado con el comando de backup nativo de SQLite.
- `PRAGMA integrity_check`: `ok`.
- La ruta está cubierta por `.gitignore` y no aparece en Git.

## 16. Fuentes encontradas

Fuentes base:

| ID | Código | Parámetros | Campos | Capacidades |
|---:|---|---:|---:|---|
| 1 | PRODUCT_CATALOG | 0 | 8 | — |
| 2 | PRICE_LIST | 1 | 19 | — |
| 3 | PRICE_HISTORY | 1 | 21 | — |
| 4 | PRICE_LIST_COMPARISON | 2 | 10 | — |
| 5 | QUOTATION_ROWS | 1 | 16 | REPEATABLE_ROWS |

También existe `LEGACY_SQL_2`, preservada internamente y excluida de `GET /api/report-data-sources`.

## 17. Reportes migrados

Relaciones iniciales preservadas:

- `PRICE_LIST_COMPARISON` → `PRICE_LIST_COMPARISON`.
- `RODUCT_QUOTATION` → `LEGACY_SQL_2`.
- `COTIZACION` → `QUOTATION_ROWS`.

El código existente `RODUCT_QUOTATION` ya estaba almacenado así antes del trabajo; no se renombró ni se alteró fuera del alcance solicitado.

Después del E2E se añadió:

- `CODEX_E2E_PRODUCT_CATALOG` → `PRODUCT_CATALOG`.

## 18. Prueba GET `/report-data-sources`

`GET http://127.0.0.1:8001/api/report-data-sources` devolvió 200 y exactamente las cinco fuentes base. No contiene `query_text`, `handler_key` ni `executor_type`.

Los detalles PRODUCT_CATALOG, PRICE_LIST y PRICE_HISTORY devolvieron parámetros y campos esperados. PRICE_HISTORY declara `product_id` con selector de productos; PRICE_LIST declara `price_list_id` con selector de listas.

## 19. Prueba del proxy `/backend-api`

`GET http://127.0.0.1:3001/backend-api/report-data-sources` devolvió 200 y contenido idéntico al backend directo. La prueba final comparó ambos cuerpos y obtuvo `backend_proxy_match=yes`.

## 20. Prueba de creación de reporte

Se creó vía API `CODEX_E2E_PRODUCT_CATALOG` con:

```json
{
  "code": "CODEX_E2E_PRODUCT_CATALOG",
  "name": "Codex E2E Product Catalog",
  "data_source_id": 1,
  "enabled": true,
  "parameters": []
}
```

Ni request ni response contienen `query_text`, `data_source_type` o `data_source_key`.

No existe endpoint DELETE; por instrucción expresa no se manipuló SQLite para borrarlo. El reporte E2E permanece registrado.

## 21. Prueba de ejecución `/data`

`POST /api/reports/CODEX_E2E_PRODUCT_CATALOG/data` con `{}` devolvió:

- 200 OK.
- 6,207 filas reales.
- Campos de producto y proveedor.
- Primera muestra validada desde el catálogo persistente.

El reporte legado `RODUCT_QUOTATION` también se ejecutó correctamente, demostrando que ocultar su fuente del selector no rompe su runtime.

## 22. Validación del Report Builder

PRODUCT_CATALOG:

- `builder/fields`: exactamente 8 campos de producto/proveedor; ningún campo de listas o historial.
- `builder`: inicialmente vacío.
- `PUT builder`: guardó columnas `part_number` y `description` con layout Excel.
- `builder/preview`: 100 filas, `truncated=true`, datos reales.

COTIZACION:

- Fuente: `QUOTATION_ROWS`.
- 16 campos disponibles.
- 10 columnas guardadas, 1 grupo repetible y layout `Cotización` preservados.
- Se reenvió el mismo contrato mediante PUT y permaneció intacto.
- Preview real con lista/producto devolvió una fila, ocho columnas visibles y totales correctos.

Los metadatos directos de PRICE_LIST y PRICE_HISTORY confirmaron catálogos de 19 y 21 campos respectivamente. Los tests backend cubren su ejecución y aislamiento por fuente.

## 23. Resultado pytest

```text
198 passed, 1 warning in 5.24s
```

El warning es una deprecación de Starlette TestClient/httpx2 y no afecta el resultado.

## 24. Resultado frontend test

```text
17 test files passed
132 tests passed
```

## 25. Resultado lint

`npm run lint`: exitoso, sin errores ni warnings.

## 26. Resultado typecheck

`npm run typecheck`: exitoso.

## 27. Resultado build

`npm run build`: exitoso con Next.js 16.3.0; compilación, TypeScript y generación de rutas completadas.

## 28. URLs finales

- Frontend: `http://127.0.0.1:3001`.
- Nuevo reporte: `http://127.0.0.1:3001/administracion/reportes/nuevo`.
- Backend: `http://127.0.0.1:8001/api`.
- Catálogo backend: `http://127.0.0.1:8001/api/report-data-sources`.
- Catálogo proxy: `http://127.0.0.1:3001/backend-api/report-data-sources`.

Las instancias de prueba se detuvieron al terminar; ejecutar `make run_panel` vuelve a levantar estas URLs.

## 29. Estado Git final

No se hizo commit, push, force push ni reset. El backend contiene únicamente el filtro de catálogo y su test. El frontend contiene la corrección de origen dev, formulario, tests actualizados y este reporte. El backup y `.env.local` permanecen ignorados.

Frontend `git status --short`:

```text
 M next.config.ts
 M src/components/reports/generic-report-runtime.test.tsx
 M src/components/reports/report-builder-workspace.test.tsx
 M src/components/reports/report-catalog-cards.test.tsx
 M src/components/reports/report-definition-form.test.tsx
 M src/components/reports/report-definition-form.tsx
 M src/lib/api/reports.test.ts
 M src/lib/reports/report-builder.test.ts
?? codex/output/REPORT_DATA_SOURCES_RUNTIME_FIX.md
```

Backend `git status --short`:

```text
 M backend/app/services/reports/data_sources.py
 M backend/tests/test_report_data_sources.py
```

## 30. Deuda técnica restante

- `RODUCT_QUOTATION` conserva un código aparentemente truncado que preexistía. No se corrigió porque cambiar códigos/URLs de reportes existentes estaba fuera del alcance y podía romper consumidores.
- El entorno Python emite warnings de `sys.prefix` y Starlette recomienda migrar de `httpx` a `httpx2`; no bloquean runtime ni tests.
- `CODEX_E2E_PRODUCT_CATALOG` queda como dato de prueba porque no existe una operación DELETE segura en la API.

## Resultado resumido

- Backend, proxy, UI, creación, ejecución y Builder: validados en ejecución real.
- La UI carga fuentes reales desde backend y no muestra SQL_QUERY/HANDLER/Consulta.
- Backend y frontend completos: verdes.
- Sin commit ni push.
