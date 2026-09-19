# Frontend #11 — administrador y catálogo de reportes

Fecha de validación: 2026-08-25

Rama base: `dev`

## 1. Recon sobre `dev`

La implementación comenzó en `cc99b68`, con `dev` limpio y sincronizado con `origin/dev`. Se conservaron Next.js 16.3.0, React 19, el App Router, el proxy same-origin `/backend-api/*`, la separación `serverApiClient`/`browserApiClient`, Docker standalone y Stimulsoft 2026.3.2.

Backend #11 se verificó en el repositorio hermano. El contrato real ofrece CRUD transaccional, detalle administrativo separado, parámetros dinámicos, preview SQL limitado, opciones allow-listed, exports CSV/XLSX y creación de reportes sin template.

## 2. Rutas finales

```text
/donaldson/reports
/donaldson/reports/PRICE_LIST_COMPARISON
/donaldson/reports/price-list-comparison/view
/administracion/reportes
/administracion/reportes/nuevo
/administracion/reportes/[code]
/administracion/reportes/[code]/designer
```

La raíz operativa ya no monta directamente la comparación A/B. Esa ejecución se movió a la ruta del código del reporte y el Viewer previo conserva su URL y handoff.

## 3. Componentes creados y reutilizados

- `ReportCatalogCards` presenta definiciones del backend sin tarjetas hardcodeadas por reporte.
- `ReportDefinitionForm` comparte alta y edición.
- `ReportParameterEditor` administra altas, bajas, edición y orden.
- `ReportRuntimeParameters` genera inputs de preview desde metadata.
- `ReportPreviewTable` muestra columnas, filas, resultado vacío y límite.
- `ReportDataDownloadButtons` reutiliza la descarga Blob centralizada.
- Se conservaron `PriceListComparison`, Viewer, Designer, runtime, eventos y dataset A/B.

Se añadieron Testing Library, user-event y jsdom únicamente como dependencias de desarrollo para probar interacciones reales.

## 4. API clients

El cliente compartido ahora soporta PATCH JSON y POST que devuelve Blob. La capa de reportes incluye:

```text
listReportDefinitions
getReportDefinition
getAdminReportDefinition / getAdminReport
createReport
updateReport
previewReport
getReportParameterOptions
downloadReportData
```

Los catálogos y páginas iniciales usan `serverApiClient`. Formularios, preview, Designer y descargas usan `browserApiClient` mediante `/backend-api`; no se agregó `fetch` ad-hoc.

## 5. Tipos

`src/types/api.ts` refleja los DTO reales: definición pública/administrativa, `HANDLER | SQL_QUERY`, tipos y controles de parámetros, configuración de select, create/update, preview y opciones. `query_text` y `data_source_key` permanecen fuera del DTO operativo.

## 6. Catálogo operativo

`/donaldson/reports` obtiene y filtra reportes habilitados, muestra nombre, descripción, categoría, template y acciones disponibles. Incluye backend caído, catálogo sin habilitados y `+ Nuevo reporte`.

Por el límite acordado con Frontend #12, Ver/Descargar se muestran solamente para `PRICE_LIST_COMPARISON`; los demás reportes explican que el Runner genérico llegará en #12. Configurar y Diseñar están disponibles para toda definición.

## 7. Catálogo administrativo

El catálogo existente evolucionó sin reemplazarse: conserva su tabla, estados y template activo, y agrega `Nuevo reporte` y `Configurar` junto a `Diseñar`. Los reportes deshabilitados permanecen visibles aquí.

## 8. Alta y configuración

El formulario guarda la definición y todos sus parámetros en una sola llamada. Impide doble submit, conserva datos ante errores, muestra mensajes backend normalizados y navega solo tras confirmación válida.

El código se normaliza al crear y queda bloqueado al editar. Los SQL nuevos se crean deshabilitados por contrato backend; la UI lo explica y permite habilitarlos posteriormente.

## 9. Editor SQL

Se usa un textarea monoespaciado y usable, sin Monaco ni parser frontend. React nunca ejecuta SQL. Toda seguridad, coherencia de binds y validación contra SQLite corresponde al backend.

## 10. Parámetros

Se soportan `string`, `integer`, `decimal`, `boolean`, `date`, `datetime` y los controles `text`, `number`, `date`, `datetime`, `checkbox`, `select`. La UI valida nombres, duplicados, etiquetas, compatibilidad y defaults básicos.

Los selects se limitan a `price_lists` y `suppliers`. Mover arriba/abajo recalcula `display_order`. Cambiar datasource solicita confirmación antes de descartar configuración incompatible.

El backend no publica un catálogo de handlers. Por decisión de esta entrega, el select cerrado contiene únicamente `price_list_comparison` y fija sus dos parámetros contractuales.

## 11. Preview

Backend #11 solo permite preview de definiciones persistidas. Por ello, alta redirige a Configuración y el botón se deshabilita mientras existan cambios sin guardar, evitando probar una query anterior bajo una UI modificada.

Preview muestra loading, errores SQL/parámetros, columnas, primeras filas, resultado vacío y `truncated`. También advierte que devolver filas no demuestra que el reporte final sea correcto.

## 12. Designer reutilizado

No se reescribió Stimulsoft. Un 404 de template ahora representa el estado válido “Sin plantilla”; el componente crea un documento con `StiReport.createNewReport()` y el primer Save usa el PUT/versionado existente.

El preview SQL registra `{ Data: rows }` mediante el runtime actual. `PRICE_LIST_COMPARISON` conserva su selector especializado y `ArefilReportData` sin cambios de contrato.

## 13. Estados UX

Se cubrieron backend caído, catálogo vacío/sin habilitados, reporte deshabilitado, sin template, create/update en progreso, código duplicado, validación backend, query/parameter error, preview vacío/error/limitado y descarga fallida. Los errores de transporte no exponen detalles internos.

## 14. Pruebas

```text
npm test:          14 archivos, 100 tests aprobados
npm run lint:      aprobado
npm run typecheck: aprobado
npm run build:     aprobado, 18 rutas generadas
git diff --check:  aprobado
```

La cobertura nueva verifica contratos/payloads, PATCH, POST Blob, errores create/preview, reglas de formulario, HANDLER, parámetros, coerción, submit confirmado, preservación después de fallo y preview renderizado.

## 15. Docker

Se construyeron ambos servicios con Compose en el proyecto aislado `arefil_frontend_issue11`, usando un directorio SQLite temporal y puertos 13011/18011. Backend y frontend quedaron healthy.

Se validaron catálogo operativo/administrativo, alta SQL transaccional, estado inicial deshabilitado, preview vacío, habilitación, configuración, Designer, primer template versión 1 y persistencia de definición/template después de `--force-recreate`. El stack se bajó y el directorio temporal se eliminó; no se tocó la base real.

## 16. Limitaciones y deuda

- Ver/Descargar genéricos continúan en Frontend #12.
- Agregar handlers exige actualizar el allow-list frontend o publicar capacidades desde backend.
- Los datasets grandes siguen sujetos a límites del backend y se descargan en memoria como Blob.
- Autenticación y roles administrativos permanecen fuera de alcance.

## 17. Confirmaciones

- Stimulsoft Viewer/Designer, runtime, licencia, eventos y template API no fueron reescritos.
- `PRICE_LIST_COMPARISON` sigue visible y conserva selección A/B, Viewer, Designer, template y export.
- SQLite, proxy interno, standalone y persistencia Compose permanecen intactos.
- No se creó commit, no se ejecutó push, no se abrió PR y no se modificó la issue de GitHub.
