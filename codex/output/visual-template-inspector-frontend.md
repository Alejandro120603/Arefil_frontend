# Inspector visual de plantilla XLSX — frontend #29

## Ruta e integración

`/administracion/reportes/[code]/plantilla`, accesible desde **Editar visualmente** en `ReportExcelTemplateCard` solamente cuando existe una plantilla activa. La implementación estaba sin commitear sobre `feat/visual-template-inspector` al iniciar esta revisión. Se conservó esa rama y el trabajo ajeno del workspace. No se creó PR ni se cerró la issue.

Se consume `GET /api/admin/reports/{code}/excel-template/inspect` mediante `browserApiClient`, sin parsing XLSX en frontend. Contrato contrastado con `../Arefil_backend/backend/app/schemas/excel_inspection.py` y `app/services/reports/excel_inspector.py` del backend local.

## Arquitectura

- `src/types/api.ts`: contrato tipado de inspección, hojas, celdas, estilos y drawings; sin `any`.
- `src/lib/api/reports.ts`: `inspectReportExcelTemplate`, con encoding del código y soporte de cancelación.
- `src/lib/reports/report-excel-inspection.ts`: coordenadas, rango, merges, dimensiones y estilos básicos.
- `src/components/reports/report-excel-template-grid.tsx`: tabla por hoja; reconstruye celdas vacías omitidas, representa regiones combinadas y marcadores de imágenes/gráficas.
- `src/components/reports/report-excel-template-inspector.tsx`: carga/cancelación, estados, tabs y panel de selección. Cambiar el reporte reinicia la carga; cambiar hoja limpia la selección.
- `src/app/administracion/reportes/[code]/plantilla/page.tsx`: página Server Component que carga la definición y monta el inspector cliente.
- `src/components/ui/tabs.tsx`: tabs existentes del workspace, utilizados por el inspector.

Upload, reemplazo, descarga, eliminación, validación, Report Builder y runtime mantienen sus implementaciones actuales.

## Grid y performance

El rectángulo se calcula desde `used_range`, ampliándolo únicamente para incluir anchors de drawings: Excel puede devolver un objeto fuera del rango de celdas. El límite de 4,000 posiciones también se aplica a esta ampliación antes de renderizar. Una hoja más grande muestra un estado explícito, sin crear miles de nodos adicionales. No se agregó una dependencia de spreadsheet ni virtualización.

Se memoizan geometría e índices de celdas/drawings. `<colgroup>` y un ancho explícito de tabla preservan las dimensiones aproximadas de columnas. La cuadrícula tiene scroll en ambos ejes, altura máxima y encabezados sticky. Clic, Enter y Espacio seleccionan una celda; el foco de teclado tiene indicador visible.

Los merges se representan con `rowSpan`/`colSpan` en su anchor; las celdas esclavas no aparecen como controles independientes. Un drawing anclado a una celda esclava se muestra sobre el anchor combinado. La selección conserva los colores originales y agrega un indicador.

## Estados y fidelidad

Estados: cargando, sin plantilla (404), error backend, workbook fuera de límites/no inspeccionable (422), hoja vacía, múltiples hojas y límite de renderizado local. Una sola hoja también muestra su nombre. El panel expone coordenada, contenido/fórmula, tipo, formato y placeholders reconocidos.

Dimensiones aproximadas, estilos básicos y marcadores de objetos; no reproduce tema/indexed colors, formato condicional, rich text ni binarios de imágenes/charts. No evalúa fórmulas, edita contenido ni guarda mappings.

## Validación del 17 de septiembre de 2026

- `npm test`: 30 archivos, 261 tests pasan.
- `npm run lint`: pasa.
- `git diff --check`: pasa.
- `npm run typecheck` en el workspace completo: falla por nueve errores preexistentes ajenos al inspector (skeletons inexistentes en cinco rutas, `isActive` no exportado, `deleteReport` inexistente y variantes `success`/`warning` de Badge).
- `npm run build` en el workspace completo: falla por los cinco imports de skeletons inexistentes. No se movieron ni modificaron archivos de ese trabajo.
- Build aislado: copia de `git archive HEAD` con los archivos de la feature y `ui/tabs.tsx`, en `/tmp/arefil-issue29-u83xti9z`. `npm run build` pasa e incluye la ruta nueva; `npm run typecheck` pasa después de generar los tipos de Next con el build. Esto valida la feature, pero no reemplaza las comprobaciones fallidas del workspace completo.

### Backend real y navegador

Se levantó el backend local con Uvicorn y se consultó la plantilla activa de `COTIZACION`. Devuelve 422: `La inspección XLSX excede el límite columns: 16384 > 256.` La plantilla Bonatti utiliza un rango hasta XFD. No se modificó el template ni los límites backend; debe resolverse ese rango o el contrato backend para inspeccionar ese archivo específico.

Para validar la superficie funcional se levantó otra instancia del mismo backend en `127.0.0.1:8029`, con una base SQLite temporal independiente, seed real y un XLSX gestionado `acceptance.xlsx` v3. El frontend aislado en `127.0.0.1:3029` consumió el endpoint mediante `/backend-api`, usando `API_INTERNAL_URL`.

Chromium real confirmó: carga y metadata, contenido/placeholder `{{report.name}}`, merge A1:B2 seleccionable desde A1 sin controles esclavos, columna A de 145px, fórmula visible, marcador de gráfica en E5 aunque el backend devuelve `used_range=A1:C4`, cambio a Anexos, estado de hoja vacía y selección limpia. Los servidores y navegador de validación se detuvieron al finalizar. No se validó Compose.

Captura: [acceptance.png](visual-template-inspector/acceptance.png).

Tests adicionales de esta revisión: drawing fuera del used range/anclado a merge, estilos y dimensiones aplicados en DOM, y limpieza del workbook anterior mientras carga otro reporte.

## Pendientes para aceptación completa

Resolver los errores del trabajo ajeno para que typecheck/build pasen en el workspace completo. La plantilla real Bonatti debe quedar dentro de los límites del endpoint para poder inspeccionarla. La implementación frontend y su validación aislada están disponibles; esos dos bloqueos impiden declarar todos los criterios de la issue cumplidos.
