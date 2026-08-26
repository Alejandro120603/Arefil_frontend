# Frontend #12 — Runtime genérico de reportes

Fecha de validación: 2026-08-26. Base: `dev` en `dd1f6aa`, con Backend #11 en `dev` (`1b2b574`).

## 1. Recon sobre `dev`

- Ya existían el catálogo/administración, definición de parámetros, proxy same-origin, cliente blob, Viewer, Designer, runtime/licencia compartidos y el adapter A/B.
- La ruta `[code]`, el catálogo y el Designer todavía discriminaban `PRICE_LIST_COMPARISON`; los reportes SQL solo tenían preview administrativo.
- La línea base estaba limpia y pasaba 100 tests, lint y typecheck.

## 2. Rutas

- `/donaldson/reports/[code]` es el runtime único para `HANDLER` y `SQL_QUERY`.
- `/donaldson/reports/price-list-comparison/view` se conserva como compatibilidad; no es requisito del flujo nuevo.
- Designer y Configurar conservan `/administracion/reportes/[code]/designer` y `/administracion/reportes/[code]`.
- El catálogo enlaza Ver y Descargar al runtime genérico; bloquea ambas acciones cuando el reporte está deshabilitado.

## 3. Formulario dinámico

`ReportRuntimeParameters` consume metadata ordenada por `display_order` y soporta `text`, `number`, `date`, `datetime`, `checkbox` y `select`. Normaliza defaults para controles nativos y obtiene opciones exclusivamente de `/{code}/parameters/{name}/options`.

La validación frontend cubre requeridos, enteros/números finitos, fechas y opciones. Los decimales se mantienen como texto; `false` es un booleano válido. A ≠ B vive en una política del runtime por código, no dentro del formulario genérico. Errores 4xx continúan viniendo del backend como fuente de verdad.

## 4. Cliente API genérico

Se agregó `executeReport<T>(code, parameters, options)` sobre `POST /reports/{code}/data`. Preview, template, opciones y exports continúan usando `browserApiClient`; no se agregó `fetch` ad-hoc ni se expone `backend:8000` al navegador.

La descarga blob ahora soporta `filename` y `filename*`, sanea separadores, rechaza archivos vacíos y permite cancelar mediante `AbortController`.

## 5. `GenericReportViewer`

El orquestador solicita ejecución y template en paralelo, adapta el payload y monta el Viewer existente mediante `next/dynamic({ ssr: false })`. Distingue ejecución, template faltante, template inconsistente, adapter inválido y error de Stimulsoft. Un cambio de parámetros desmonta/aborta el resultado anterior; Regenerar crea una ejecución nueva.

No se importó el Designer en el Viewer ni se modificó el componente Stimulsoft de bajo nivel.

## 6. Estrategia de datasets Stimulsoft

El datasource continúa llamándose `ArefilReportData`.

- `SQL_QUERY`: convención común `report: [metadata]`, `parameters: [submittedParameters]`, `rows: [...]`. Los objetos singleton se representan como tablas de una fila para `DataSet.readJson`.
- `HANDLER`: registro estático por código. `PRICE_LIST_COMPARISON` reutiliza exactamente `toArefilReportData`, con `report`, `supplier`, `list_a`, `list_b`, `summary` e `items`.
- Un handler desconocido falla claramente. No existen imports, conexiones ni adapters controlados por metadata de usuario.

## 7. Migración de A/B

El catálogo abre `PRICE_LIST_COMPARISON` en `[code]`; sus dos selects vienen de metadata y opciones backend. La política conserva A ≠ B y el adapter conserva summary/detail, `NEW`, `REMOVED`, campos raw/formateados y el template activo.

La UI y handoff A/B anteriores permanecen como compatibilidad acotada. Refresh y URLs nuevas no dependen de `sessionStorage`: siempre pueden ejecutar `/data`.

## 8. Descarga XLSX/CSV

El runtime ofrece ambos formatos antes o después de generar, siempre con los parámetros actuales y mediante endpoints backend. La respuesta conserva el filename de `Content-Disposition`, muestra loading/error, bloquea dobles clics, permite cancelar y no guarda blobs vacíos.

## 9. Preview genérico del Designer

El workspace usa el mismo formulario y adapters que runtime. `SQL_QUERY` llama `/preview` y registra la muestra limitada; `HANDLER` llama `/data` y pasa por el registro allow-listed. Se eliminó el picker A/B especial y la carga server-side de listas en la página del Designer.

En Chromium real, el Designer del SQL creado por UI inicializó sin alertas y su botón Preview registró 100 filas, indicó “limitado” y montó el Viewer interno.

## 10. Sin template / sin parámetros

- Sin template: ejecución y exports siguen disponibles, se muestra “Datos disponibles · Diseño pendiente”, enlace a Diseñar y hasta 100 filas SQL; no se monta un Viewer vacío.
- Sin parámetros: no se dibuja un formulario vacío y Generar/CSV/XLSX quedan disponibles directamente.
- Dataset vacío: se considera éxito y se informa explícitamente.

## 11. Performance

Validación aislada con dos workbooks existentes de 6,188 y 6,000 items:

| Operación | Resultado |
|---|---:|
| A/B `POST /data` por proxy | 2,085,698 bytes · 0.575 s |
| A/B XLSX | 425,992 bytes · 1.145 s |
| A/B CSV | 612,475 bytes |
| SQL_QUERY de 6,200 filas | 462,945 bytes · 0.076 s |
| SQL CSV / XLSX | 227,304 / 128,339 bytes |
| Chromium tras Viewer A/B | ~101.5 MB JS heap usado |
| Chunk Stimulsoft lazy | 15.41 MB decoded · 5.65 MB transfer · 1.22 s |

El catálogo no creó DOM Stimulsoft y su recurso más grande fue 229 KB decoded. El dataset y chunk pesado aparecieron únicamente después de Generar en la ruta de ejecución.

## 12. Tests

- 21 archivos y 120 tests pasan.
- Cobertura nueva: API genérica, RFC 5987, todos los controles, orden/defaults/coerción, validación, A/B, adapters SQL/HANDLER, handler rechazado, no parámetros, sin template, dataset vacío, Viewer, exports vacíos/cancelados, catálogo disabled y Preview del Designer.
- `npm run lint`, `npm run typecheck` y `git diff --check` pasan.
- `npm run build` compila correctamente dentro de la imagen oficial: compile 12.8 s, typecheck 5.9 s y 14 páginas estáticas generadas. El shell restringido sigue impidiendo el puerto interno de Turbopack, por lo que Docker es la evidencia válida del build.

## 13. E2E HANDLER

En Compose aislado se importaron y confirmaron dos workbooks existentes, se cargaron opciones con fecha/proveedor/moneda/archivo, se ejecutó A/B por el proxy, se exportó CSV/XLSX y se abrió el runtime en Chromium. Tras Generar, `StiViewer` y sus paneles existían en DOM sin alertas.

## 14. E2E SQL_QUERY nuevo

Chromium creó `CODEX_UI_REPORT12` desde `/administracion/reportes/nuevo`, confirmó el redirect a Configuración, lo habilitó y recibió confirmación backend. Se adjuntó una plantilla válida en la base temporal, se ejecutaron 6,200 filas en `[code]`, se montó el Viewer sin alertas y el Designer abrió y previsualizó 100 filas.

Un segundo reporte temporal validó directamente `/data`, CSV, XLSX, filenames, estado sin template y persistencia del template.

## 15. Docker

La imagen standalone compiló y ambos contenedores quedaron healthy en puertos aislados 3300/8300. Se verificaron health, catálogo, proxy same-origin, rutas HANDLER/SQL, exports y template. Tras `--force-recreate`, definición y template persistieron en el bind mount temporal. Los contenedores y red de prueba se eliminaron; la DB auditable queda en `/tmp/arefil-report12-data` y nunca se tocó `backend/data`.

## 16. Deuda restante

- El registro HANDLER solo contiene A/B hasta que backend agregue otro handler explícito.
- La ruta/UI A/B anterior puede retirarse en una issue de limpieza después del periodo de compatibilidad.
- No se agregaron scheduler, correo, roles, SQL visual, DB externas ni cambios de SQLite.

## 17. Confirmación Stimulsoft

No se reescribieron `stimulsoft-report-viewer.tsx`, `stimulsoft-report-designer.tsx`, runtime/licencia ni eventos del Designer. Se reutilizaron el datasource controlado, limpieza de conexiones, template backend y carga client-only/lazy existentes.

## 18. Git

No se creó commit, no se hizo push y no se abrió PR.
