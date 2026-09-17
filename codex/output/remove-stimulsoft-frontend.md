# Retirar Stimulsoft y consolidar preview + Excel — Frontend #15

Estado final: **COMPLETO**. La experiencia oficial de reportes es
Report Builder → vista previa web → Descargar Excel. No queda código, ruta,
endpoint, asset, variable de entorno ni copy de Stimulsoft en el producto.

---

## 1. Recon inicial

Búsqueda ejecutada sobre el repo completo (excluyendo `.git`, `node_modules`,
`codex/output`):

```bash
rg -n "stimulsoft|Stimulsoft|\.mrt|active_template_version|templateVersion|template_version|Designer|ReportViewer" .
```

**STIMULSOFT ACTUAL** — al iniciar, el árbol de trabajo ya contenía la mayor
parte del retiro aplicada pero sin verificar ni cerrar. Lo pendiente real era:
`node_modules` con el paquete huérfano, `.next` con validadores de rutas
borradas, copy visible con la palabra «templates», ausencia de regresiones que
bloquearan la reintroducción, README sin documentar el flujo oficial, y cero
validación E2E contra Backend #14.

**CONSUMIDORES** — catálogo, runtime genérico, builder y proxy `/backend-api/*`.

**CONTRATO BACKEND #14** — verificado directamente en `../Arefil_backend`
(commit `22a3113 refactor(reports): remove Stimulsoft backend integration`):

```text
GET    /api/reports
POST   /api/reports
GET    /api/reports/{code}
PATCH  /api/reports/{code}
POST   /api/reports/{code}/data
POST   /api/reports/{code}/preview
POST   /api/reports/{code}/export/csv
POST   /api/reports/{code}/export/xlsx
GET    /api/reports/{code}/parameters/{parameter_name}/options
POST   /api/reports/price-list-comparison/data
GET    /api/report-builder/fields
GET    /api/reports/{code}/builder
PUT    /api/reports/{code}/builder
POST   /api/reports/{code}/builder/preview
```

No existe `GET/PUT /api/reports/{code}/template`. El backend solo conserva
aserciones negativas (`test_stimulsoft_template_endpoints_are_not_registered`) y
una migración de archivo (`e8f5c3d2a901_archive_stimulsoft_templates`) que
renombra `report_templates` a `legacy_report_templates`.

**PIEZAS NUEVAS A PRESERVAR** — Report Builder completo, runtime repetible,
`parameter_groups`, `products_by_price_list`, selects dependientes, preview web,
XLSX, CSV.

**PIEZAS A ELIMINAR** — dependencia npm, Viewer, Designer, dataset adapters,
`.mrt`, template API, `active_template_version`, licencia/env, rutas obsoletas.

**RIESGOS** — romper #13/#14 al limpiar; dejar llamadas fantasma que produzcan
404; dejar copy visible con vocabulario retirado.

**PLAN** — verificar contrato real, cerrar residuos, blindar con regresiones,
validar todo contra Backend #14 en Compose.

---

## 2. Branch

```text
dev
```

```text
249addc feat(reports): add repeatable report runtime and XLSX generation flow   ← Frontend #14
d596ec4 feat(reports): add visual Excel report builder                          ← Frontend #13
c520507 feat(reports): add generic report runtime
dd1f6aa feat(reports): add report manager and SQL configuration
cc99b68 feat(reports): add Stimulsoft report designer
```

Confirmado en la rama: Report Builder visual, `parameter_groups`, runtime
repetible, `products_by_price_list`, preview web, XLSX, COTIZACION.

No se hizo checkout, merge, rebase ni cherry-pick.

---

## 3. Contrato Backend #14

Ver §1. El frontend consume exactamente ese contrato; `src/lib/api/reports.ts`
expone `createReport`, `updateReport`, `getAdminReport`, `previewReport`,
`executeReport`, `getReportParameterOptions`, `downloadReportData`,
`getReportFieldCatalog`, `getReportBuilder`, `saveReportBuilder`,
`previewReportBuilder`. Ninguna función de template.

---

## 4. Dependencias removidas

```diff
-    "stimulsoft-reports-js-react": "^2026.3.2",
```

`package.json` y `package-lock.json` actualizados. `node_modules` conservaba el
paquete como extraneous; se corrigió con `npm prune`:

```text
$ npm ls stimulsoft-reports-js-react     (antes)
└── stimulsoft-reports-js-react@2026.3.2 extraneous

$ npm prune
$ npm ls stimulsoft-reports-js-react     (después)
└── (empty)
```

Se liberaron **28 MB** de `node_modules`.

---

## 5. Archivos Stimulsoft removidos

```text
src/components/reports/stimulsoft-report-viewer.tsx
src/components/reports/stimulsoft-report-designer.tsx
src/components/reports/report-designer-workspace.tsx
src/components/reports/report-designer-workspace.test.tsx
src/components/reports/generic-report-viewer.tsx
src/components/reports/generic-report-viewer.test.tsx
src/components/reports/price-list-comparison-report.tsx
src/components/donaldson/price-list-comparison.tsx
src/lib/reports/stimulsoft-runtime.ts
src/lib/reports/stimulsoft-runtime.test.ts
src/lib/reports/stimulsoft-dataset.ts
src/lib/reports/stimulsoft-dataset.test.ts
src/lib/reports/stimulsoft-designer-events.ts
src/lib/reports/stimulsoft-designer-events.test.ts
src/lib/reports/report-dataset.ts
src/lib/reports/report-dataset.test.ts
src/lib/reports/comparison-handoff.ts
src/lib/reports/comparison-handoff.test.ts
scripts/build-price-list-comparison-mrt.mjs
public/reports/price-list-comparison.mrt
```

No se conservó ningún wrapper vacío por compatibilidad.

---

## 6. Rutas removidas

```text
/administracion/reportes/[code]/designer
/donaldson/reports/price-list-comparison/view
```

Ambas solo servían a Stimulsoft, por lo que se eliminaron sin redirección. El
build confirma el árbol final de rutas:

```text
/  ·  /administracion/reportes  ·  /administracion/reportes/[code]
/administracion/reportes/nuevo  ·  /administracion/respaldos
/api/health  ·  /backend-api/[...path]
/donaldson/cancelados  ·  /donaldson/import
/donaldson/price-lists  ·  /donaldson/price-lists/[id]
/donaldson/products  ·  /donaldson/products/[id]
/donaldson/reports  ·  /donaldson/reports/[code]
```

Sin enlaces rotos: el catálogo apunta solo a `/donaldson/reports/[code]` y
`/administracion/reportes/[code]`.

---

## 7. API template removida

Eliminadas `getReportTemplate()`, `saveReportTemplate()`, los DTOs de template,
los tipos de respuesta, la lógica de versión y el manejo de ETag del `.mrt`.
Ningún consumidor quedó huérfano. Verificado en runtime contra el backend real:

```text
GET  /api/reports/COTIZACION/template          → 404
PUT  /api/reports/COTIZACION/template          → 404
GET  /backend-api/reports/COTIZACION/template  → 404   (vía proxy)
```

El frontend nunca emite esas peticiones (§26).

---

## 8. `active_template_version` removido

Eliminado del contrato TypeScript, de las cards, del catálogo, del listado
administrativo, de las condiciones y de los tests. `ReportDefinition` queda:

```ts
code, name, description, category, enabled, data_source_type,
parameters, parameter_groups, created_at, updated_at
```

No se dejó un campo opcional para esconder el problema. El backend tampoco lo
expone (`assert "active_template_version" not in body`).

---

## 9. Env / licencia removida

`NEXT_PUBLIC_STIMULSOFT_LICENSE_KEY` y `STIMULSOFT_LICENSE_KEY` eliminadas de
`.env.example`, `.env.docker.example`, `Dockerfile`, `compose.yaml`,
`next.config.ts` y README. No quedan variables muertas y no se reveló ningún
valor real. `.env.example` final:

```env
NEXT_PUBLIC_API_URL=/backend-api
API_INTERNAL_URL=http://127.0.0.1:8000/api
```

---

## 10. MRT removidos

```text
public/reports/price-list-comparison.mrt      (asset)
scripts/build-price-list-comparison-mrt.mjs   (generador)
```

Se auditaron `public/`, `scripts/`, fixtures y tests. No quedan `.mrt` en el
repo ni en la imagen Docker. No se tocaron fixtures no relacionados.

---

## 11. Catálogo final

`/donaldson/reports` muestra exactamente dos acciones por reporte:

```text
Generar      → /donaldson/reports/[code]
Configurar   → /administracion/reportes/[code]
```

Un reporte deshabilitado deja `Generar` en estado disabled pero conserva
`Configurar`, con la nota «Este reporte está deshabilitado; puedes configurarlo,
pero no ejecutarlo.»

No se muestra `Ver en Viewer`, `Diseñar`, `Plantilla`, `MRT` ni
`Versión de plantilla`. Verificado en navegador contra el stack real.

---

## 12. Runtime final

`/donaldson/reports/[code]` usa `GenericReportRuntime`, el runtime de
Frontend #14, sin ninguna rama Stimulsoft. Soporta parámetros escalares,
`parameter_groups` con `items[]`, selects dependientes
(`products_by_price_list`), preview, totales, XLSX y CSV.

El runtime es genérico: no contiene `if (code === "COTIZACION")`. La única
especialización por código es la precarga de `price_list_a_id` / `price_list_b_id`
desde query params para el enlace profundo A/B, que ya existía.

---

## 13. Builder final

`/administracion/reportes/[code]` es el único diseñador. Verificado en navegador
que carga Definición, Fuente de datos, Parámetros, Grupos repetibles, Columnas,
Fórmulas, Layout Excel y Vista previa. No existe una segunda acción «Diseñar».

---

## 14. PRICE_LIST_COMPARISON

Flujo validado extremo a extremo contra Backend #14, sin template:

```text
Reportes → Comparación de listas de precios → Lista A / Lista B
        → Generar → Preview web → XLSX
```

Preview (listas 3 vs 4, vía `POST /backend-api/reports/PRICE_LIST_COMPARISON/data`):

```text
total_products 6,200   increased 1,973   decreased 2,007
unchanged 2,008        new 200           removed 12
average_percentage_change +0.36%
```

Las cinco clasificaciones están presentes en el detalle:

```text
INCREASED 1973 · DECREASED 2007 · UNCHANGED 2008 · NEW 200 · REMOVED 12
```

Summary y detail se conservan íntegros. La vista previa web renderiza los tiles
de resumen, los filtros por estado (Todos / Aumentaron / Disminuyeron /
Sin cambio / Nuevos / Retirados) y la tabla con delta con signo, porcentaje y
badge de estado.

---

## 15. COTIZACION

Flujo validado en navegador contra el stack real:

```text
Reportes → Cotización → Lista de precios
        → 3 renglones (Producto | Cantidad | Descuento)
        → Generar → Preview → Total → Descargar Excel
```

Entrada: lista `small_a.xlsx`; `P-INC ×10 @5%`, `P-DEC ×3 @0%`, `P-CLS ×7 @12.5%`.

Preview:

```text
SKU     Descripción              Cant  Precio    Subtotal   Descuento   IVA       Total
P-INC   Filtro de aire primario    10  $100.00   $1,000.00  $50.00      $152.00   $1,102.00
P-DEC   Filtro de combustible       3  $200.00   $600.00    $0.00       $96.00    $696.00
P-CLS   Filtro de aceite            7  $500.00   $3,500.00  $437.50     $490.00   $3,552.50
Totales                                          $5,100.00  $487.50     $738.00   $5,350.50
```

Las columnas ocultas del builder (`discount_pct`, `net`) no aparecen ni en el
preview ni en el export: el backend las excluye y el frontend las respeta.

Los selects dependientes funcionan: al elegir la lista de precios, el campo
Producto de cada renglón se puebla vía
`GET /reports/COTIZACION/parameters/items.product_id/options?price_list_id=…`.

También se verificó el mapeo de errores estructurados: enviar `discount` como
número JSON en vez de string devuelve `422` con
`loc: ["items", 2, "discount"]`, que el runtime coloca en el renglón y campo
afectados. El frontend serializa decimales como string, sin convertirlos a
float.

---

## 16. Preview web

El visor oficial es HTML/React. `ReportRuntimePreview` despacha según la forma
del payload del backend:

```text
builder preview  → ReportBuilderPreviewTable
comparación A/B  → PriceListComparisonPreview
SQL genérico     → ReportPreviewTable
desconocido      → ErrorAlert (no se inventa un render)
```

Consume `columns`, `rows` y `totals` tal como llegan y respeta labels, orden,
`visible` y `format_type`. **No recalcula fórmulas ni reconstruye totales.**

---

## 17. XLSX

Botón principal **Descargar Excel** (variante `default`, primero en el grupo).
El frontend envía el payload, recibe el blob y respeta `Content-Disposition`.
No se usa SheetJS ni ninguna librería de Excel en el navegador.

Se abrió y parseó cada XLSX generado; no se afirmó equivalencia por status 200.

**PRICE_LIST_COMPARISON** — `content-disposition: attachment;
filename="price-list-comparison.xlsx"`, hojas `Items` + `Summary`:

```text
filas de datos en XLSX : 6,200
items en preview       : 6,200
mismatches celda a celda: 0
mismatches de summary   : ninguno
```

**COTIZACION** — `filename="cotizacion.xlsx"`, hoja `Cotización` con título,
`Generado:`, parámetros, fila de encabezado en la fila 4 y fila `Totales`:

```text
encabezado == labels del preview, en el mismo orden : sí
filas de datos == preview (normalizado numéricamente): sí
fila de totales == totals del preview               : sí
gran total  preview 5350.50  ·  xlsx 5350.5
columnas ocultas ausentes en ambos                  : sí
```

---

## 18. CSV

Se conserva como acción secundaria (variante `outline`, después de Excel),
etiquetada **Descargar CSV**. El endpoint `POST /reports/{code}/export/csv`
sigue vigente en Backend #14, así que eliminarlo habría roto funcionalidad sin
necesidad.

---

## 19. Bundle

```text
dependencia removida     stimulsoft-reports-js-react@2026.3.2
node_modules liberado    28 MB
.next/static (build)     1.3 MB en 25 chunks JS
```

Confirmado por búsqueda y por inspección de la imagen: ninguna ruta carga ya un
chunk de Stimulsoft, y `grep -ril "stimulsoft" .next` dentro del contenedor no
devuelve nada. Como referencia histórica, el entregable de Frontend #11 medía el
chunk lazy de Stimulsoft en 15.41 MB decoded / 5.65 MB transfer: esa carga
desapareció por completo de la ruta de ejecución.

---

## 20. Tests

```text
Test Files  18 passed (18)
Tests      135 passed (135)
```

No se borraron tests sin reemplazar cobertura. Se añadió
`src/lib/reports/retired-report-surface.test.ts` (6 casos) que blinda el retiro:

- el stack retirado no aparece en `src/`;
- no aparece en configuración ni documentación (`package.json`,
  `package-lock.json`, `next.config.ts`, `Dockerfile`, `compose.yaml`,
  `.env.example`, `.env.docker.example`, `README.md`);
- no hay dependencia declarada del proveedor retirado;
- no se publica ningún asset `.mrt`;
- no existen rutas `designer` ni `reports/**/view`;
- `src/lib/api/reports.ts` no expone ningún accesor de template;
- el vocabulario retirado (`template`, `plantilla`, `MRT`, `Diseñar/Diseñador`,
  `Visor`) no aparece en la UI que se envía al usuario.

El guard se verificó **no vacío**: al añadir temporalmente
`// active_template_version probe` a `src/types/api.ts`, el test falló con
`src/types/api.ts matches /active_template_version/`; el archivo se restauró.

Cobertura funcional ya existente y preservada: catálogo sin Diseñar, Generar,
Configurar, runtime escalar, runtime repetible, selects dependientes, preview de
comparación, builder load/save/preview, errores de API, filename de descarga,
CSV, y el proxy `/backend-api/*`.

---

## 21. Lint

```bash
npm run lint    # exit 0, sin findings
```

---

## 22. Typecheck

```bash
npm run typecheck   # exit 0
```

La primera corrida falló con cuatro `TS2307` en `.next/types/validator.ts` y
`.next/dev/types/validator.ts`, que aún referenciaban las páginas `designer` y
`price-list-comparison/view` eliminadas. Son artefactos generados: se resolvió
con `rm -rf .next && npm run build`, que los regenera. No se tocó código fuente
para esto.

---

## 23. Build

```bash
npm run build   # exit 0, TypeScript OK, 13 páginas estáticas generadas
```

El árbol de rutas resultante es el de §6: sin `designer`, sin `view`.

---

## 24. Compose

Se detectó un stack previo del usuario ocupando 3000/8000. **No se detuvo ni se
modificó.** El E2E corrió en paralelo, aislado:

```text
COMPOSE_PROJECT_NAME=arefil-fe15-e2e
FRONTEND_PORT=3100   BACKEND_PORT=8100
BACKEND_DATA_DIR=<scratchpad>/e2e-data
```

Para tener datos realistas se tomó un snapshot consistente de la base de
desarrollo con `sqlite3 .backup` hacia el directorio aislado (copia de solo
lectura; la base del usuario no se modificó).

```text
backend   running healthy   {"status":"ok"}
frontend  running healthy   {"status":"ok"}
```

---

## 25. E2E

Ejecutado en navegador real contra Backend #14 (§14, §15). Cubre catálogo,
builder, runtime escalar, runtime repetible, selects dependientes, preview y
exportación, con los XLSX abiertos y comparados celda a celda.

---

## 26. Verificación de red

Traza del navegador durante catálogo → builder → runtime → preview. Todas las
llamadas al backend fueron:

```text
GET  /backend-api/reports/COTIZACION/builder
GET  /backend-api/report-builder/fields
GET  /backend-api/reports/COTIZACION/parameters/price_list_id/options
GET  /backend-api/reports/PRICE_LIST_COMPARISON/parameters/price_list_a_id/options
GET  /backend-api/reports/PRICE_LIST_COMPARISON/parameters/price_list_b_id/options
POST /backend-api/reports/PRICE_LIST_COMPARISON/data
```

```text
peticiones a /template, .mrt o assets del proveedor : NINGUNA
chunks del proveedor cargados                        : NINGUNO
```

La ruta de descarga (`POST /backend-api/reports/{code}/export/xlsx`) se ejercitó
por separado a través del mismo proxy y devolvió `200` con el
`Content-Disposition` correcto; es exactamente la petición que emite el botón.

---

## 27. Docker

`docker compose build` reconstruyó ambas imágenes. Auditoría dentro de la imagen
frontend final (`arefil_frontend-frontend:latest`, standalone Next.js):

```text
archivos *stimul* o *.mrt        : ninguno
variables de entorno de licencia : ninguna
paquete en node_modules          : ninguno
"stimulsoft" en .next            : ninguna coincidencia
```

---

## 28. Persistencia

Se recrearon los contenedores (`docker compose down` + `up -d`) sobre el mismo
bind de datos:

```text
antes    reports: PRICE_LIST_COMPARISON, COTIZACION, RODUCT_QUOTATION
         COTIZACION: 10 columnas · 1 grupo · 4 totales
después  reports: PRICE_LIST_COMPARISON, COTIZACION, RODUCT_QUOTATION
         COTIZACION: 10 columnas · 1 grupo · 4 totales
         campos del grupo: product_id, quantity, discount
         fórmulas: price * quantity
                   ROUND(subtotal * discount_pct / 100, 2)
                   subtotal - discount_amount
                   ROUND(net * 0.16, 2)
                   net + tax
```

Definiciones, parámetros, grupos, columnas, fórmulas y layout persisten. El
retiro de Stimulsoft en el frontend no afectó la base de datos.

---

## 29. Regresiones

No se reescribió `ReportBuilderWorkspace`, `ReportColumnEditor`,
`ReportFormulaInput`, `ReportExcelLayoutEditor`, `ReportBuilderPreviewTable`, el
runtime repetible, los parameter groups, los selects dependientes, el preview
web ni las descargas. `SQL_QUERY` y `HANDLER` siguen renderizándose con metadata
genérica; no se introdujeron ramas por código de reporte.

Dos cambios de comportamiento, ambos deliberados:

1. **Copy**: el botón de exportación dice **Descargar Excel** en vez de
   «Descargar XLSX» (§22 fija ese lenguaje). El valor de formato sigue siendo
   `xlsx`; se actualizaron las 7 aserciones de test correspondientes.
2. **Copy**: el texto de ayuda del código de reporte decía «El código es
   inmutable porque forma parte de URLs y templates.» Ahora dice «…forma parte
   de las URLs del reporte.» Era la última mención visible al vocabulario
   retirado; el guard de §20 impide que vuelva.

---

## 30. Búsqueda final de residuos

```bash
rg -n --hidden -g '!.git' -g '!node_modules' -g '!.next' \
  "stimulsoft|Stimulsoft|STIMULSOFT|\.mrt|active_template_version|NEXT_PUBLIC_STIMULSOFT" .
```

Coincidencias restantes, todas legítimas:

- `codex/output/*.md` — entregables históricos de Frontend #9…#14. §25 permite
  explícitamente no reescribir entregables previos.
- `src/lib/reports/retired-report-surface.test.ts` — el guard describe en
  comentarios y regex justamente lo que no debe existir, y se excluye a sí mismo
  del escaneo.

**Cero referencias en código activo, configuración o README.**

---

## 31. Archivos modificados / eliminados

Modificados:

```text
.env.docker.example
.env.example
Dockerfile
compose.yaml
next.config.ts
package.json
package-lock.json
README.md
src/app/administracion/reportes/page.tsx
src/app/backend-api/[...path]/route.test.ts
src/app/donaldson/reports/[code]/page.tsx
src/components/reports/generic-report-runtime.tsx
src/components/reports/generic-report-runtime.test.tsx
src/components/reports/report-builder-preview-table.tsx
src/components/reports/report-builder-workspace.tsx
src/components/reports/report-builder-workspace.test.tsx
src/components/reports/report-catalog-cards.tsx
src/components/reports/report-catalog-cards.test.tsx
src/components/reports/report-data-download-buttons.tsx
src/components/reports/report-data-download-buttons.test.tsx
src/components/reports/report-definition-form.tsx
src/components/reports/report-definition-form.test.tsx
src/lib/api/client.ts
src/lib/api/client.test.ts
src/lib/api/reports.ts
src/lib/api/reports.test.ts
src/lib/format/decimal.ts
src/lib/reports/comparison.ts
src/lib/reports/report-builder.test.ts
src/lib/reports/report-runtime.ts
src/types/api.ts
```

Nuevos:

```text
src/components/reports/price-list-comparison-preview.tsx
src/components/reports/report-runtime-preview.tsx
src/lib/reports/retired-report-surface.test.ts
codex/output/remove-stimulsoft-frontend.md
```

Eliminados: ver §5 y §6.

---

## 32. Comandos ejecutados

```bash
git status ; git branch --show-current ; git log --oneline -10
rg -n "stimulsoft|Stimulsoft|\.mrt|active_template_version|…" .
npm ls stimulsoft-reports-js-react
npm prune
npm run typecheck
npm run lint
npm test
npx vitest run src/lib/reports/retired-report-surface.test.ts
rm -rf .next && npm run build
git diff --check

docker compose build
docker compose up -d          # proyecto arefil-fe15-e2e, puertos 3100/8100
docker compose down && docker compose up -d      # persistencia
docker run --rm --entrypoint sh <imagen> -c 'find / -iname "*stimul*" -o -iname "*.mrt"; …'
sqlite3 ../Arefil_backend/backend/data/arefil.db ".backup <scratchpad>/arefil.db"

curl -X {GET,PUT} /api/reports/COTIZACION/template            # → 404
curl -X POST /backend-api/reports/PRICE_LIST_COMPARISON/data
curl -X POST /backend-api/reports/PRICE_LIST_COMPARISON/export/xlsx
curl -X POST /backend-api/reports/COTIZACION/data
curl -X POST /backend-api/reports/COTIZACION/export/xlsx
python3  # parseo de XLSX y comparación celda a celda contra el preview
```

---

## 33. Riesgos y deuda

- **Despliegue coordinado (esperado).** Frontend #15 es compatible únicamente
  con Backend #14. No se añadieron fallbacks del tipo «si `/template` da 404,
  ignorar»: la solución correcta es no llamar al endpoint, y así quedó. Ambos
  repos deben desplegarse juntos.
- **`node_modules` desincronizado.** El paquete quedó como `extraneous` hasta
  ejecutar `npm prune`. Cualquier entorno que haya instalado antes del retiro
  necesita `npm ci` o `npm prune`; una instalación limpia no se ve afectada.
- **Snapshot de datos para el E2E.** La validación usó una copia de la base de
  desarrollo en el scratchpad para tener listas y productos reales. Una base
  recién creada solo trae `PRICE_LIST_COMPARISON`; `COTIZACION` es un reporte
  que el usuario construye con el Report Builder, no un seed del backend.
- **`RODUCT_QUOTATION`.** La base de desarrollo contiene un reporte con ese
  código (aparente typo de `PRODUCT_QUOTATION`). Es dato del usuario, ajeno a
  esta issue; no se tocó.
- **Sin deuda de código muerto.** No quedaron wrappers vacíos, tipos deprecados
  sin consumidores ni `any` introducidos.

---

## 34. Confirmación

**No se realizó commit, push, merge, rebase, cherry-pick, PR ni modificación o
cierre de issues de GitHub.** No se ejecutó `git reset --hard` ni
`git clean -fd`. No se borraron datos del usuario: su stack en 3000/8000 siguió
corriendo intacto y su base de datos solo se leyó. No se modificó el backend.
