# Integración Stimulsoft Designer — Frontend #10

Fecha: 2026-08-24 (America/Mexico_City)

Estado: implementado y validado localmente sobre `dev`, sin commit, push ni PR.

## 1. Rutas

Se agregaron:

```text
/administracion/reportes
/administracion/reportes/[code]/designer
```

La navegación lateral de Administración enlaza el catálogo. La ruta dinámica consulta primero la definición real del reporte y conserva la página como Server Component; solo el workspace interactivo entra al grafo cliente.

## 2. Catálogo

`GET /api/reports` alimenta una tabla con nombre, código, descripción, categoría, estado habilitado, versión activa y la acción `Diseñar`. Se implementaron estados explícitos de error y catálogo vacío. `PRICE_LIST_COMPARISON` apareció en la validación de Compose como habilitado y con su versión activa.

## 3. Integración Designer

El paquete instalado existente se reutiliza mediante su entry point oficial:

```text
stimulsoft-reports-js-react/designer 2026.3.2
```

El componente de bajo nivel crea `StiReport`, carga el JSON del backend y monta `Designer`. Viewer y Designer comparten helpers de licencia y registro de datos, pero conservan entry points separados para que el bundle de edición no entre a la ruta operativa del Viewer.

Se ocultaron abrir, nuevo, guardar como, publicar y conexiones. Los datasource/columnas/relaciones existentes son visibles, pero no modificables; recursos y propiedades de presentación permanecen editables.

## 4. Flujo load/save

```text
GET /backend-api/reports/{code}/template
  -> StiReport.load(template)
  -> usuario edita
  -> onSaveReport / onSaveAsReport
  -> report.saveToJsonString()
  -> PUT /backend-api/reports/{code}/template
  -> confirmación y nueva versión
```

El evento de guardado marca `async` y `preventDefault`, por lo que no descarga un archivo local. Un guard síncrono evita dos PUT simultáneos. La UI solo muestra éxito después de una respuesta válida y conserva los mensajes backend para errores de validación o tamaño (`422/413`).

## 5. Client boundary

`report-designer-workspace.tsx` es el límite cliente y carga `stimulsoft-report-designer.tsx` mediante `next/dynamic({ ssr: false })`. La página, catálogo, definición y catálogo de listas siguen server-side. El build de Next.js 16.3.0 confirmó que ambas rutas administrativas son dinámicas y que Stimulsoft no se evalúa durante SSR.

## 6. Preview y data dictionary

Para `PRICE_LIST_COMPARISON`, el workspace presenta selectores Lista A/Lista B. Al entrar a Preview:

1. valida que existan dos IDs distintos;
2. ejecuta `POST /api/reports/PRICE_LIST_COMPARISON/data`;
3. reutiliza `toArefilReportData`, sin recalcular negocio;
4. elimina conexiones del template;
5. registra únicamente `ArefilReportData`;
6. reanuda el callback oficial de Preview.

El diccionario conserva `report`, `supplier`, `list_a`, `list_b`, `summary` e `items`, incluidas las columnas de presentación ya verificadas por los tests del Viewer. Los códigos futuros pueden editarse/guardarse, pero Preview muestra una limitación explícita hasta que exista un adaptador permitido; no se inventan parámetros genéricos.

## 7. Persistencia

Backend #10 almacena contenido e historial en SQLite. La prueba aislada guardó una versión 2, recreó ambos contenedores y recuperó versión 2 con el mismo checksum. Después, el botón Save real del Designer emitió un PUT y creó versión 3; una segunda recreación devolvió versión 3. La seed no reemplazó la versión activa.

El directorio y los contenedores temporales se eliminaron al terminar. No se tocó la base real del proyecto.

## 8. Compatibilidad con Viewer

El Viewer ya no solicita `/reports/price-list-comparison.mrt`. Usa el mismo endpoint activo de Backend #10 y no tiene fallback estático que pueda ocultar un error o una versión obsoleta.

En navegador headless se entregó un dataset controlado y el Viewer obtuvo `X-Report-Template-Version: 3`, renderizó proveedor, listas, resumen y toolbar sin mostrar error de template. El `.mrt` en `public/` queda solamente como referencia de compatibilidad para las pruebas de bindings; no participa en runtime.

## 9. Docker

Se construyeron las imágenes backend/frontend mediante el `compose.yaml` real con proyecto, puertos y bind mount temporales. El frontend standalone abrió catálogo, Designer, Preview y Viewer a través de `/backend-api`. La persistencia se comprobó con `docker compose down` y `up -d` sin borrar el bind mount.

No fue necesario modificar Dockerfile ni Compose: el template editable vive en la SQLite persistente del backend y el paquete Designer ya forma parte de `node_modules`.

## 10. Comandos ejecutados

```text
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
docker compose up --build -d
docker compose down
docker compose up -d
curl GET/PUT /api/reports/.../template
Chromium/Playwright headless para Designer, Preview y Viewer
```

Resultados antes del cierre:

```text
11 archivos de test
88 tests passed
eslint: 0 errores
tsc --noEmit: correcto
next build: correcto
git diff --check: correcto
```

## 11. Pruebas manuales realizadas

- catálogo administrativo renderizado con datos reales del backend aislado;
- navegación catálogo -> Designer;
- carga visual del Designer y del diccionario de seis tablas;
- carga de versión 2 después de recrear contenedores;
- Save del toolbar: PUT `200`, confirmación visible y versión 3;
- recreación posterior: versión 3 persistida;
- selectores A/B con dos listas controladas en la SQLite aislada;
- Preview: POST genérico `200` y reporte renderizado;
- Viewer: template activo versión 3 y dataset controlado renderizados;
- estado sin dos listas: edición disponible y Preview explicado como no disponible.

## 12. Limitaciones y licencia

La validación se hizo sin `NEXT_PUBLIC_STIMULSOFT_LICENSE_KEY`, por lo que Designer y Viewer mostraron la marca Trial esperada. Reports.JS funciona íntegramente en navegador: una licencia configurada en `NEXT_PUBLIC_STIMULSOFT_LICENSE_KEY` es pública para el visitante por definición. No se agregó ni expuso una clave.

La UI de terceros se validó en Chromium headless; no se agregó una suite E2E permanente ni se verificaron todos los navegadores. El Designer es un bundle grande y solo se descarga al abrir su ruta.

## 13. Deuda futura

- autenticación y autorización específica para el PUT de templates;
- control optimista `If-Match` para ediciones concurrentes;
- endpoint/acción de restauración de versiones, cuando exista en backend;
- adaptadores de parámetros y Preview para nuevos códigos de reporte;
- E2E permanente para interacciones visuales del Designer.

No se implementó restauración porque Backend #10 no ofrece ese endpoint.

## 14. Confirmación de no SQL arbitrario

El frontend nunca recibe ni envía SQL. Preview usa únicamente el código constante `PRICE_LIST_COMPARISON` y dos IDs numéricos. Antes de Designer/Viewer/Preview se eliminan las bases/conexiones persistidas en el `.mrt`; además, la UI bloquea creación/modificación de conexiones, datasource y columnas. No existe acceso frontend a SQLite, filesystem del backend, handlers dinámicos ni rutas proporcionadas por el usuario.

## 15. Confirmación de control de versiones

No se creó commit, push ni pull request. Todos los cambios permanecen en el working tree local para revisión del usuario.
