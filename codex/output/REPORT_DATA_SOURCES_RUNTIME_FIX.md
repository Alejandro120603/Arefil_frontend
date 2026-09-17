# ReportDataSource runtime fix

Fecha: 2026-08-28  
Estado: **FIXED**

## 1. Estado inicial de Frontend

- Ruta: `/home/daniel12/Projects/Arefil_frontend`.
- Branch: `feat/report-data-sources`.
- HEAD: `8b25f24 actualizacion reportes`.
- Working tree limpio; sin cambios staged y sin stashes reportados.
- No había una instancia de Arefil, pero Tesis ocupaba el puerto 3000.

## 2. Estado inicial de Backend

- Ruta: `/home/daniel12/Projects/Arefil_backend`.
- Branch: `feat/report-data-sources`.
- HEAD: `474d178 actualizacion de reportes`.
- Working tree limpio; sin cambios staged y sin stashes reportados.
- Arefil no estaba levantado. El puerto 8001 estaba ocupado por el backend de Tesis.

## 3. Branches

Ambos repositorios se confirmaron expresamente en `feat/report-data-sources`. No se cambió de branch.

## 4. Commits iniciales

- Frontend: `8b25f24 actualizacion reportes`.
- Backend: `474d178 actualizacion de reportes`.
- No se creó ningún commit ni se ejecutó push o force push.

## 5. Puertos encontrados

| Puerto | PID/proyecto | Estado |
|---:|---|---|
| 3000 | Next.js, Tesis_jmob | Ocupado por proyecto ajeno |
| 3001 | — | Libre; asignado a Arefil frontend |
| 8000 | — | Libre; asignado a Arefil backend |
| 8001 | PID 66052, Tesis_jmob backend | Ocupado por proyecto ajeno |

Durante la ejecución, Arefil escuchó exclusivamente en `127.0.0.1:8000` y `:3001`.

## 6. Procesos encontrados

- PID 66052: Uvicorn, CWD `/home/daniel12/Projects/Tesis_jmob/backend`, puerto 8001.
- PID 66081/66094/66106/66170: Next.js, CWD `/home/daniel12/Projects/Tesis_jmob/frontend`, puerto 3000.

No se envió ninguna señal a esos PID. Los procesos de Arefil iniciados por `make run_panel` tuvieron CWD exclusivamente en los repos de Arefil y se detuvieron mediante el cleanup del script. La comprobación final no encontró procesos de Arefil ni `chromedriver`, y dejó libres 3001, 8000 y 9515. Tesis volvió a estar activo externamente en 8001 (backend) y 3002 (frontend); no se intervino.

## 7. Configuración `.env` relevante

El override inicial apuntaba a 8001, ocupado por Tesis. Se corrigió únicamente `.env.local`, ignorado por Git:

```text
NEXT_PUBLIC_API_URL=/backend-api
BACKEND_PORT=8000
FRONTEND_PORT=3001
API_INTERNAL_URL=http://127.0.0.1:8000/api
```

`.env.example` ya usa `API_INTERNAL_URL=http://127.0.0.1:8000/api`; no requirió cambios. El backend usa `DATABASE_URL=sqlite:///./data/arefil.db`. No se imprimieron secretos.

`server-client.ts` conserva `http://127.0.0.1:8000/api` únicamente como fallback. `next.config.ts` ya contiene `allowedDevOrigins: ["127.0.0.1"]`, conforme a la documentación local de Next.js 16.3.0.

## 8. Alembic current/head antes

- `current`: `f3a7c9e4b612 (head)`.
- `heads`: `f3a7c9e4b612 (head)`.
- Se revisó el historial completo desde `fa59ceac2a5d` hasta `f3a7c9e4b612`.
- `alembic upgrade head` se ejecutó directamente y mediante `make run_panel`; ambos fueron no-op.
- El entorno Python mostró un warning no bloqueante de `sys.prefix`.

## 9. Estado de SQLite antes

SQLite efectiva: `/home/daniel12/Projects/Arefil_backend/backend/data/arefil.db`.

- `report_data_sources`: existente.
- `report_definitions.data_source_id`: `INTEGER NOT NULL`.
- 6 fuentes totales: cinco base y `LEGACY_SQL_2` interna.
- 5 reportes, 5 parámetros, 1 grupo con 3 campos, 14 columnas Builder y 3 layouts Excel.
- 0 `data_source_id` nulos y `PRAGMA foreign_key_check` sin errores.
- SHA-256 del estado de tablas de reportes: `ff7588793046569a4d048dab6f0593fe8600bb52641eb0846d19a21ce0c2c49f`.

## 10. Causas confirmadas

- **B — CONFIRMADA:** Tesis ocupaba los puertos asumidos inicialmente, 3000 y 8001.
- **C — CONFIRMADA:** no había una instancia de backend Arefil levantada.
- **G — CONFIRMADA:** `API_INTERNAL_URL` y `BACKEND_PORT` apuntaban a 8001, donde respondía otro proyecto.

La causa raíz runtime fue la combinación de Arefil detenido y el override local dirigido al backend de Tesis. La arquitectura nueva y sus correcciones de código ya estaban presentes en los HEAD actuales.

## 11. Causas descartadas o no aplicables

- **A — DESCARTADA:** no había frontend viejo de Arefil ejecutándose.
- **D — DESCARTADA:** Alembic ya estaba en head.
- **E — DESCARTADA:** `report_data_sources` existía y era íntegra.
- **F — DESCARTADA:** el seed ya estaba aplicado; dos pasadas fueron idempotentes.
- **H — DESCARTADA:** `NEXT_PUBLIC_API_URL=/backend-api` era correcto.
- **I — DESCARTADA:** backend y proxy devolvieron JSON idéntico.
- **J — DESCARTADA:** ambos repos estaban en la misma branch esperada.
- **K — DESCARTADA:** tipos/tests frontend usan `data_source_id`/`data_source`; las apariciones legacy son aserciones negativas. Backend conserva referencias internas/de compatibilidad y tests de seguridad.
- **L — DESCARTADA:** no había `.next` viejo en ejecución; build y arranque limpio sirvieron la UI nueva.
- **M — DESCARTADA:** Builder consulta campos mediante `report.data_source`, no un catálogo global.
- **N — DESCARTADA:** todas las definiciones tienen fuente válida y no nula.
- **O — DESCARTADA:** `LEGACY_SQL_2` está correctamente relacionada, excluida del selector y ejecutable internamente.

Clasificación de referencias antiguas:

- Frontend: `report-definition-form.test.tsx` contiene pruebas negativas; “Consulta los reportes habilitados” es texto natural, no UI SQL.
- Backend activo: modelos/enum/seed/definitions mantienen columnas de compatibilidad; `registry.py` y `sql_query_executor.py` ejecutan fuentes internas preservadas sin exponerlas.
- Migraciones: referencias necesarias para upgrade/downgrade y preservación legacy.
- Tests backend: fixtures de migración, ejecución interna y aserciones de no exposición.
- No se encontró una referencia legacy que contradiga el contrato público actual.

## 12. Archivos modificados

Trackeado:

- `codex/output/REPORT_DATA_SOURCES_RUNTIME_FIX.md`.

Local e ignorado:

- `.env.local`: backend 8001 → 8000 y ajuste correspondiente de `API_INTERNAL_URL`.

Persistencia ignorada:

- Backup SQLite nuevo.
- Reporte E2E y configuración Builder asociados.

No se modificó código fuente frontend o backend.

## 13. Razón de cada modificación

- `.env.local`: evitar la colisión con Tesis y dirigir proxy/server components al backend real de Arefil.
- Reporte Markdown: actualizar la evidencia solicitada con el estado de esta ejecución.
- SQLite: creación E2E autorizada para probar POST, runtime y Builder. No se borró ni alteró manualmente ningún registro.

## 14. Migración ejecutada

Se ejecutó `alembic upgrade head`; fue no-op porque la DB ya estaba en `f3a7c9e4b612`.

## 15. Backup creado

`/home/daniel12/Projects/Arefil_backend/backend/data/backups/arefil-before-report-data-sources-20260828-165434.db`

- Tamaño: 2,027,520 bytes.
- Creado con `sqlite3.Connection.backup` desde una conexión source read-only.
- `PRAGMA integrity_check`: `ok`.
- No sobrescribió backups previos y está ignorado por Git.

## 16. Fuentes encontradas

| ID | Código | Parámetros | Campos | Capacidades |
|---:|---|---:|---:|---|
| 1 | PRODUCT_CATALOG | 0 | 8 | — |
| 2 | PRICE_LIST | 1 (`price_list_id`) | 19 | — |
| 3 | PRICE_HISTORY | 1 (`product_id`) | 21 | — |
| 4 | PRICE_LIST_COMPARISON | 2 | 10 | — |
| 5 | QUOTATION_ROWS | 1 | 16 | REPEATABLE_ROWS |

`LEGACY_SQL_2` permanece como sexta fuente `INTERNAL_SQL`, exclusivamente interna.

## 17. Reportes migrados

Relaciones preservadas:

- `PRICE_LIST_COMPARISON` → `PRICE_LIST_COMPARISON`.
- `RODUCT_QUOTATION` → `LEGACY_SQL_2`.
- `COTIZACION` → `QUOTATION_ROWS`.
- Dos reportes E2E preexistentes → `PRODUCT_CATALOG`.

Creado en esta ejecución:

- `CODEX_E2E_PRODUCT_CATALOG_20260828_165802` → `PRODUCT_CATALOG`.

El seed se ejecutó dos veces: ambas conservaron el SHA-256 inicial, conteos e IDs, sin duplicados y sin cambios a Builder o Excel.

## 18. Prueba GET `/report-data-sources`

`GET http://127.0.0.1:8000/api/report-data-sources` devolvió 200 y exactamente las cinco fuentes base. Claves públicas:

```text
capabilities, code, description, enabled, fields, id, name, parameters
```

No expuso `query_text`, `handler_key`, `executor_type`, `data_source_type` ni `data_source_key`.

- PRODUCT_CATALOG: 8 campos de producto/proveedor, sin parámetros.
- PRICE_LIST: `price_list_id`, selector `price_lists`, 19 campos.
- PRICE_HISTORY: `product_id`, selector `products`, 21 campos incluyendo historial.

## 19. Prueba del proxy `/backend-api`

`GET http://127.0.0.1:3001/backend-api/report-data-sources` devolvió 200. El payload fue idéntico al backend (`backend_proxy_match=true`) y no expuso campos internos.

Chromium confirmó una respuesta 200 real para ese endpoint durante la hidratación de `/administracion/reportes/nuevo`.

## 20. Prueba de creación de reporte

POST 201 para `CODEX_E2E_PRODUCT_CATALOG_20260828_165802`:

```json
{
  "code": "CODEX_E2E_PRODUCT_CATALOG_20260828_165802",
  "name": "Codex E2E Product Catalog 20260828 165802",
  "description": "Validación E2E de ReportDataSource",
  "category": "Pruebas",
  "data_source_id": 1,
  "enabled": true,
  "parameters": []
}
```

Request/response no contienen propiedades legacy. No existe endpoint DELETE; por instrucción no se manipuló SQLite y el reporte permanece registrado.

## 21. Prueba de ejecución `/data`

`POST /api/reports/CODEX_E2E_PRODUCT_CATALOG_20260828_165802/data` con `{}` devolvió:

- 200 OK.
- 6,207 filas reales.
- Campos válidos de producto/proveedor.
- Primera muestra: `BIG-00000`, proveedor `DONALDSON`.

El reporte legacy `RODUCT_QUOTATION` también devolvió 200 y una fila real, demostrando que su fuente interna sigue funcionando sin aparecer en el catálogo.

## 22. Validación del Report Builder

E2E PRODUCT_CATALOG:

- `GET builder/fields`: 200, exactamente 8 campos de producto/proveedor.
- `GET builder`: 200, definición inicialmente vacía.
- `PUT builder`: 200; guardó `product.part_number`, `product.description` y layout `Catálogo`.
- `POST builder/preview`: 200; 100 filas reales, `truncated=true`.

COTIZACION:

- Conservó 10 columnas, 1 grupo con 3 campos, layout `Cotización`, header row 4 y cuatro totales.
- `builder/fields` devolvió 16 campos de QUOTATION_ROWS.
- Preview real con lista 4/producto 9 devolvió una fila y cálculos correctos de subtotal, descuento, IVA y total.

PRICE_LIST y PRICE_HISTORY se validaron mediante sus catálogos aislados de 19 y 21 campos. Los tests backend cubren aislamiento y ejecución por fuente.

## 23. Resultado pytest

```text
198 passed, 1 warning in 6.95s
```

Warning no bloqueante: deprecación Starlette TestClient/httpx2.

## 24. Resultado frontend test

```text
17 test files passed
132 tests passed
```

## 25. Resultado lint

`npm run lint`: exitoso, sin errores.

## 26. Resultado typecheck

`npm run typecheck`: exitoso.

## 27. Resultado build

`npm run build`: exitoso con Next.js 16.3.0; compilación, TypeScript y generación de 13 páginas/rutas completadas.

## 28. URLs finales

Configuración efectiva para `make run_panel`:

- Frontend: `http://127.0.0.1:3001`.
- Nuevo reporte: `http://127.0.0.1:3001/administracion/reportes/nuevo`.
- Backend: `http://127.0.0.1:8000/api`.
- Catálogo backend: `http://127.0.0.1:8000/api/report-data-sources`.
- Catálogo proxy: `http://127.0.0.1:3001/backend-api/report-data-sources`.

Las instancias de validación fueron detenidas para no dejar procesos temporales.

## 29. Estado Git final

No se hizo commit, push, force push, reset ni cambio de branch.

Frontend:

```text
 M codex/output/REPORT_DATA_SOURCES_RUNTIME_FIX.md
```

Backend:

```text
(limpio)
```

`.env.local`, SQLite y backup permanecen ignorados por Git.

## 30. Deuda técnica restante

- `RODUCT_QUOTATION` conserva un código aparentemente truncado preexistente; no se renombró para evitar romper URLs/consumidores.
- El entorno Python emite warnings de `sys.prefix`; Starlette recomienda migrar de `httpx` a `httpx2`. No bloquean runtime ni tests.
- El reporte E2E queda persistido porque no existe DELETE seguro.
- El cambio de puerto vive solo en `.env.local`; si 8000 vuelve a ocuparse habrá que elegir otro puerto libre y sincronizar `BACKEND_PORT`/`API_INTERNAL_URL`.

## Resultado resumido

- Backend, proxy, UI hidratada, creación, ejecución, legacy runtime y Builder: validados en ejecución real.
- La UI carga las cinco fuentes reales desde backend y no muestra SQL_QUERY/HANDLER/Consulta.
- Backend y frontend completos: verdes.
- Sin commit ni push.
