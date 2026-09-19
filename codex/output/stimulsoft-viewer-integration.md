# Stimulsoft Viewer + `price-list-comparison.mrt` (Frontend #9)

Fecha: 2026-08-24 (America/Mexico_City)

Repositorios:

- Frontend: `9bca4a0` más los cambios locales de esta implementación (sin commit).
- Backend: `52b73db`, **sin modificaciones**. Solo se consumió su contrato.

Estado final: **LISTO PARA BACKEND #10 — REPORT REGISTRY + TEMPLATE STORAGE**.

---

## 1. Versión de Stimulsoft

```text
Stimulsoft Reports.JS  2026.3.2   (build 2026.08.11)
```

Es la versión estable más reciente publicada en npm al momento de la
implementación (`npm view stimulsoft-reports-js-react version` → `2026.3.2`,
publicada 2026-08-14).

## 2. Paquetes instalados

Se instaló **un solo paquete**:

```text
stimulsoft-reports-js-react@2026.3.2
```

| Aspecto | Detalle |
|---|---|
| Motivo | Es el paquete oficial de Stimulsoft para React: expone los componentes `<Viewer>` y `<Designer>` ya envueltos en React, sobre el mismo motor que `stimulsoft-reports-js`. Los samples oficiales de React lo usan como única dependencia. |
| Licencia npm | `Closed Source` (propietaria, ver §15) |
| Dependencia | `react@^19` — ya presente en el proyecto (`react@19.2.8`) |
| Tamaño en disco | 28 MB (incluye el bundle del Designer, que **no** se importa) |

No se instaló `stimulsoft-reports-js` por separado: el paquete de React ya
incluye el motor completo (`stimulsoft.reports.engine.mjs` y compañía), así que
tenerlo dos veces solo duplicaría 14 MB de JavaScript.

No se instaló ningún wrapper comunitario ni ninguna librería alternativa de
reporting.

`package.json` y `package-lock.json` quedaron actualizados con esa única
dependencia nueva.

## 3. Documentación oficial consultada

| Fuente | Uso |
|---|---|
| <https://www.npmjs.com/package/stimulsoft-reports-js-react> | Paquete y versión estable |
| <https://github.com/stimulsoft/Samples-Reports.JS-for-React> (rama `main`) | API real del componente: `import { Viewer, Stimulsoft } from 'stimulsoft-reports-js-react/viewer'` |
| `Samples-.../Data Connection and Registration/Registering Data from Code.tsx` | `report.loadFile` + `dictionary.databases.clear()` + `regData(name, alias, dataSet)` |
| `Samples-.../Working with Designer and Viewer Settings and Events/Customizing the Viewer.tsx` | `new Stimulsoft.Viewer.StiViewerOptions()` y sus secciones `appearance` / `toolbar` / `exports` |
| `Samples-.../Working with Reports and Advanced Features/How to Activate the Product.tsx` | `Stimulsoft.Base.StiLicense.key = '...'` / `loadFromFile('stimulsoft.key')` |
| `Samples-.../Printing and Exporting/Exporting a Report to PDF.tsx` | `renderAsync2()` + `exportDocumentAsync2(StiExportFormat.Pdf)` |
| <https://www.stimulsoft.com/en/samples/reports-js/javascript/registering-a-json-data-for-the-report-template> | Registro de JSON vía `Stimulsoft.System.Data.DataSet` + `readJson` |
| <https://www.stimulsoft.com/en/documentation/online/programming-manual/introduction_trial_limitations.htm> | Limitaciones del modo trial |
| `node_modules/stimulsoft-reports-js-react/stimulsoft.reports.d.ts` | Firmas exactas de `StiReport`, `DataSet`, `StiViewerOptions`, `StiLicense` |

Además, el propio `.d.ts` del paquete se usó para verificar que **cada**
propiedad usada existe (`appearance.scrollbarsMode`, `toolbar.showDesignButton`,
`exports.showExportToDocument`, etc.). No se inventó ninguna API.

## 4. Arquitectura client/server

```text
/donaldson/reports                                    (Server Component, sin cambios)
  └── <PriceListComparison>                           ("use client", Frontend #8)
        ├── Comparar  → getPriceListComparison()      → /backend-api/* → Backend #9
        └── Ver reporte → storeComparisonHandoff()    → sessionStorage
                        → router.push(/…/view?a=&b=)

/donaldson/reports/price-list-comparison/view         (Server Component)
  └── parseViewerSelection(searchParams)              (server, puro)
        └── <PriceListComparisonReport selection>     ("use client")
              ├── readComparisonHandoff() ?? getPriceListComparison()
              ├── fetch('/reports/price-list-comparison.mrt')
              ├── toArefilReportData()
              └── dynamic(() => import('…/stimulsoft-report-viewer'), { ssr:false })
                    └── <StimulsoftReportViewer>      ("use client", único módulo
                          que importa Stimulsoft)
```

La página del viewer **sigue siendo Server Component**: solo parsea `?a=&b=` y
renderiza el componente cliente. No se convirtió nada más de `/donaldson/reports`
a cliente, y no se tocó el módulo existente de comparación salvo para agregar el
botón `Ver reporte`.

## 5. Client boundary

`src/components/reports/stimulsoft-report-viewer.tsx` es el **único** archivo del
repo que importa Stimulsoft:

```ts
import { Stimulsoft, Viewer } from "stimulsoft-reports-js-react/viewer";
```

Se importa desde `price-list-comparison-report.tsx` con:

```ts
const StimulsoftReportViewer = dynamic(
  () => import("@/components/reports/stimulsoft-report-viewer"),
  { ssr: false, loading: () => <ViewerPlaceholder … /> },
);
```

Razones concretas:

1. `StiViewer.renderHtml(node)` escribe toolbar y canvas directamente en el DOM y
   lee `window` / `document`; no hay nada que prerenderizar.
2. El subárbol que importa `.../viewer` arrastra **15.4 MB** de JavaScript
   (engine + chart + export + xlsx + maps + viewer). Con `ssr: false` ese chunk
   nunca entra al render del servidor ni al bundle inicial de la ruta: se
   descarga solo al abrir el viewer.

Verificado en el build de producción:

```text
.next/static/chunks/0ua3xpt7rs9re.js   15.4 MB   (chunk exclusivo del viewer)
.next/static/chunks/08ttfj81-47mu.js    224 KB
```

Y en el waterfall real del navegador ese chunk se pide **después** de que el
dataset está listo, no en el load de la página.

`next/dynamic` con `ssr: false` solo es válido dentro de un Client Component
(`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`); por eso el
`dynamic()` vive en `price-list-comparison-report.tsx` (que es `"use client"`) y
no en `page.tsx`.

## 6. Ubicación del `.mrt`

```text
public/reports/price-list-comparison.mrt      41,203 bytes
```

Servido como asset estático en `/reports/price-list-comparison.mrt`, misma URL en
`next dev`, en `next build && next start` y dentro de Docker. El browser lo pide
same-origin; nunca toca `backend:8000`.

El template **se genera** con un script versionado y **se commitea**:

```bash
node scripts/build-price-list-comparison-mrt.mjs
```

El `.mrt` se construye con la API oficial del motor (`StiReport`,
`StiReportTitleBand`, `StiHeaderBand`, `StiDataBand`, `StiPageFooterBand`,
`StiText`) y se guarda con `report.saveToJsonString()`. Es un `.mrt` en formato
JSON — legible y diffeable en code review, a diferencia del XML `StiSerializer`.
El script es la fuente revisable; el archivo generado es el artefacto que
consume el viewer.

Motivo de generarlo en vez de escribirlo a mano: el esquema del `.mrt` lo define
el motor (numeración de refs, serialización de `Border`/`Brush`/`Font`,
`ClientRectangle`, `NameInSource`, …). Generarlo garantiza que carga; escribirlo
a mano garantiza rondas de depuración.

**No** se guardó ningún template en SQLite ni se implementó backend de
templates.

## 7. Estructura del datasource

`Stimulsoft.System.Data.DataSet.readJson()` convierte cada clave de primer nivel
en una `DataTable`. La respuesta de Backend #9 trae seis secciones, cinco de
ellas objetos singulares, así que el wrapper técnico mínimo es envolverlas en
arreglos de un elemento:

```ts
interface ArefilReportData {
  report:   [ArefilReportMetaRow];      // 1 fila
  supplier: [ComparisonSupplier];       // 1 fila
  list_a:   [ArefilReportListRow];      // 1 fila
  list_b:   [ArefilReportListRow];      // 1 fila
  summary:  [ArefilReportSummaryRow];   // 1 fila
  items:    ArefilReportItemRow[];      // N filas
}
```

Nombres, anidamiento y valores se conservan tal cual. Registro:

```ts
const dataSet = new Stimulsoft.System.Data.DataSet("ArefilReportData");
dataSet.readJson(JSON.stringify(data));
report.regData("ArefilReportData", "ArefilReportData", dataSet);
```

El template declara los seis `DataSources` con `NameInSource =
ArefilReportData.<tabla>`, así que las expresiones del reporte son
`{items.part_number}`, `{summary.total_products}`, `{supplier.name}`, etc.

Un test recorre el `.mrt` commiteado y verifica que sus `DataSources` y sus
columnas coinciden exactamente con `AREFIL_REPORT_BINDINGS` (§18), de modo que
renombrar un campo del adapter no pueda pasar como “columna en blanco” en el PDF.

## 8. Mapping JSON

`src/lib/reports/stimulsoft-dataset.ts` — `toArefilReportData(comparison)`.

**No recalcula nada.** Copia los valores de Backend #9 y agrega campos
`*_display` ya formateados con los mismos helpers que usa la tabla HTML de
Frontend #8 (`formatComparisonRow`, `formatCurrency`, `formatSignedCurrency`,
`formatSignedPercentage`, `COMPARISON_STATUS_LABELS`), para que el PDF y la
pantalla no puedan discrepar.

| Tabla | Campos originales | Campos de presentación agregados |
|---|---|---|
| `report` | `code`, `generated_at` | `generated_at_display` |
| `supplier` | `id`, `code`, `name` | — |
| `list_a` / `list_b` | `id`, `effective_date`, `currency`, `source_filename` | `effective_date_display` |
| `summary` | los 7 del contrato | `average_percentage_change_display` |
| `items` | los 15 del contrato | `description_display`, `price_a_display`, `price_b_display`, `absolute_change_display`, `percentage_change_display`, `classification_display`, `status_label` |

Estados: `INCREASED → Aumentó`, `DECREASED → Disminuyó`, `UNCHANGED → Sin cambio`,
`NEW → Nuevo`, `REMOVED → Retirado` (los mismos labels de Frontend #8, no una
copia nueva).

Moneda: `list_b.currency` (el backend rechaza pares con monedas distintas),
formato `Intl.NumberFormat("es-MX", { style: "currency", currency })` → `$100.00`,
2 decimales. Porcentaje: `signDisplay: "always"`, 2 decimales → `+10.00%`,
`-4.76%`.

### Cambio colateral en `src/lib/format/decimal.ts`

Los helpers construían un `Intl.NumberFormat` nuevo en **cada** llamada. Con 50
filas visibles no se nota; con 6,200 filas × 4 campos formateados son ~25,000
construcciones (~0.55 s medidos). Se agregó un cache de formatters por juego de
opciones. Los formatters son inmutables y la clave incluye todas las opciones, así
que **la salida no cambia** — los 77 tests siguen pasando, incluidos los de
Frontend #8.

## 9. Diseño del reporte

A4 vertical, unidad centímetros, márgenes 1 cm (área útil 19 cm).

**ReportTitleBand** (6.5 cm)

```text
AREFIL                                            (Arial 20 bold)
Comparación de listas de precios                  (Arial 12 bold)
Proveedor: {supplier.name}          Moneda: {list_b.currency}
Lista A: {list_a.effective_date_display} · {list_a.source_filename}
Lista B: {list_b.effective_date_display} · {list_b.source_filename}
Generado: {report.generated_at_display}
────────────────────────────────────────────────────────────────
Resumen
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│  Total   │Aumentaron│Disminuye-│   Sin    │  Nuevos  │Retirados │  Prom.   │
│productos │          │   ron    │  cambio  │          │          │variación │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│{summary. │{summary. │{summary. │{summary. │{summary. │{summary. │{summary. │
│total_pro-│increased}│decreased}│unchanged}│   new}   │ removed} │avg…_disp}│
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
Detalle por producto
```

**HeaderBand** (0.65 cm, `printOnAllPages = true`) + **DataBand** sobre `items`
(0.6 cm por fila):

| Columna | Ancho | Alineación | Campo |
|---|---|---|---|
| Part Number | 2.6 cm | izq. | `{items.part_number}` |
| Descripción | 6.0 cm | izq. (wordWrap) | `{items.description_display}` |
| Precio A | 2.2 cm | der. | `{items.price_a_display}` |
| Precio B | 2.2 cm | der. | `{items.price_b_display}` |
| Diferencia | 2.2 cm | der. | `{items.absolute_change_display}` |
| % | 1.8 cm | centro | `{items.percentage_change_display}` |
| Estado | 2.0 cm | izq. | `{items.status_label}` |

Suma exacta: 19.00 cm.

La columna `%` va centrada, no alineada a la derecha: es la última columna
numérica antes de `Estado` (alineada a la izquierda), y con alineación derecha
`+5.00%` quedaba pegado a la línea de `Estado` — se leía `+5.00%Aumentó`.

Se dejaron fuera `Item Number`, `Classification A` y `Classification B` (opcionales
en la issue): con las 7 columnas obligatorias el ancho ya está exactamente
consumido y agregarlas sacrificaría la legibilidad de `Descripción`. El adapter
**sí** lleva esos campos en el dataset (`item_number`, `classification_a`,
`classification_b`, `classification_display`), listos para una variante futura.

**PageFooterBand** (0.8 cm): `AREFIL · Comparación de listas de precios` a la
izquierda y `Página {PageNumber} de {TotalPageCount}` a la derecha.

El `.mrt` **no hace aritmética**: un test verifica que no aparece ninguna función
de agregación (`{Sum(...)}`, `{Count(...)}`, `{Avg(...)}`, …). Los únicos
"cálculos" son `{PageNumber}` y `{TotalPageCount}`, que son paginación, no datos.

## 10. Manejo de nulls

Todo valor ausente se convierte en `—` **en el adapter**, nunca en el `.mrt`:

| Caso | Precio A | Precio B | Diferencia | % | Estado |
|---|---|---|---|---|---|
| `NEW` (`price_a = null`) | `—` | `$75.50` | `—` | `—` | Nuevo |
| `REMOVED` (`price_b = null`) | `$400.00` | `—` | `—` | `—` | Retirado |
| `price_a = 0` (backend no divide entre cero) | `$0.00` | `$25.00` | `+$25.00` | `—` | Aumentó |
| `description = null` | — | — | — | — | `—` en la columna Descripción |
| `average_percentage_change = null` | — | — | — | — | `—` en el tile Prom. variación |

Nunca se sustituye por `$0` / `0%`: eso afirmaría que el precio se mantuvo, cuando
lo que ocurre es que no hay nada que comparar.

Un test recorre todos los campos `*_display` y `status_label` del dataset y falla
si alguno contiene `NaN`, `Infinity`, `null` o `undefined`.

El estado nunca depende del color: la columna **Estado** lleva el texto completo
(`Aumentó` / `Disminuyó` / `Sin cambio` / `Nuevo` / `Retirado`), y el signo va
explícito en `Diferencia` y `%`.

## 11. Export PDF — real

Ejecutado desde el viewer corriendo en Docker (`Save → Adobe PDF → OK`):

```text
~/Downloads/Comparación de listas de precios.pdf     15,051 bytes
Creator:  Stimulsoft Reports.JS 2026.3.2 from 2026.08.11
Producer: Stimulsoft Reports
Title:    PriceListComparison
Subject:  Comparación de listas de precios
```

`pdftotext -layout` sobre el archivo descargado (dataset chico, 7 productos):

```text
AREFIL
Comparación de listas de precios
Proveedor: Donaldson S.A. de C.V.                              Moneda: MXN
Lista A: 20 oct 2025 · small_a.xlsx
Lista B: 15 ene 2026 · small_b.xlsx
Generado: 24 ago 2026, 10:22 a.m.

Resumen
 Total productos   Aumentaron   Disminuyeron  Sin cambio   Nuevos  Retirados  Prom. variación
       7               3             1            1          1        1          -2.50%
Detalle por producto
Part Number   Descripción                 Precio A    Precio B  Diferencia       %  Estado
P-CLS         Filtro de aceite             $500.00     $525.00     +$25.00  +5.00%  Aumentó
P-DEC         Filtro de combustible        $200.00     $150.00     -$50.00 -25.00%  Disminuyó
P-GONE        Filtro descontinuado         $400.00           —           —       —  Retirado
P-INC         Filtro de aire primario      $100.00     $110.00     +$10.00 +10.00%  Aumentó
P-NEW         Filtro de cabina nuevo             —      $75.50           —       —  Nuevo
P-SAME        Filtro hidraulico            $300.00     $300.00      +$0.00  +0.00%  Sin cambio
P-ZERO        Kit de sellos promocional      $0.00      $25.00     +$25.00       —  Aumentó

AREFIL · Comparación de listas de precios                             Página 1 de 1
```

Validado: archivo generado ✅, abre ✅, tabla presente ✅, precios correctos ✅,
nulls correctos ✅.

Con la versión final del template (columna `%` centrada) se volvió a exportar y
se verificó el blob producido por el exportador antes de que Chrome lo guardara:

```text
type: application/pdf   size: 15,069 bytes   magic: %PDF-1.7
```

(Chrome bloqueó la descarga automática número 4 del mismo origen — comportamiento
del navegador, no del viewer; ver §22.)

## 12. Export Excel — real

Mismo flujo (`Save → Microsoft Excel → OK`):

```text
~/Downloads/Comparación de listas de precios.xlsx    16,938 bytes
```

Abierto con `zipfile` (16 entradas, OOXML válido). `xl/sharedStrings.xml`:

```text
AREFIL | Comparación de listas de precios | Proveedor: Donaldson S.A. de C.V. |
Moneda: MXN | Lista A: 20 oct 2025 · small_a.xlsx | Lista B: 15 ene 2026 ·
small_b.xlsx | Generado: 24 ago 2026, 10:22 a.m. | Resumen | Total productos |
Aumentaron | Disminuyeron | Sin cambio | Nuevos | Retirados | Prom. variación |
7 | 3 | 1 | -2.50% | Detalle por producto | Part Number | Descripción | Precio A |
Precio B | Diferencia | % | Estado | P-CLS | Filtro de aceite | $500.00 |
$525.00 | +$25.00 | +5.00% | Aumentó | … | P-GONE | Filtro descontinuado |
$400.00 | — | Retirado | … | P-NEW | Filtro de cabina nuevo | $75.50 | Nuevo | …
```

(`sharedStrings` deduplica: los valores repetidos aparecen una sola vez.)

Con el template final se verificó el blob del exportador:

```text
type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
size: 16,917 bytes   magic: 50 4b 03 04  (PK, ZIP/OOXML)
```

El menú `Save` ofrece además PowerPoint, HTML, Text, RTF, Word, OpenDocument
Writer/Calc, Data e Image. No se habilitaron ni deshabilitaron individualmente;
solo se apagó `showExportToDocument` (el formato propietario `.mdc`), que no
aporta nada al usuario final.

## 13. Impresión

`Print` ofrece tres opciones: **PDF**, **Preview** y **Print**.

`Print → PDF` fue ejecutado y se instrumentó la página para observar el
mecanismo sin abrir el diálogo nativo (que bloquea toda la automatización del
navegador). Resultado registrado:

```text
["iframe-created", "iframe.print", "iframe.print", "iframe.print"]
```

Es decir: el viewer genera el PDF, lo monta en un `<iframe>` same-origin y llama
`iframe.contentWindow.print()`. Toda la cadena hasta el diálogo de impresión del
navegador funciona; el diálogo en sí es del sistema operativo y quedó fuera del
alcance de la automatización **a propósito**.

Limitación observada: después de imprimir, Stimulsoft deja `document.title` con
el nombre del reporte (`Comparación de listas de precios`) en lugar de
`Reporte de comparación | Arefil`. Es cosmético — Stimulsoft usa el título del
documento como nombre del trabajo de impresión — y se corrige navegando a otra
ruta.

## 14. Dataset grande y performance

Dataset de aceptación de Frontend #8: **6,200 productos**, respuesta de
**2,084,965 bytes (1.99 MiB)**.

Medido en el navegador (Docker, build de producción):

| Fase | Tiempo |
|---|---|
| `POST /backend-api/reports/price-list-comparison/data` | 522 ms (1.99 MiB) |
| `GET /reports/price-list-comparison.mrt` | 95 ms (41 KB) |
| Chunk de Stimulsoft (15.4 MB) | 106 ms desde caché HTTP |
| `sessionStorage.setItem` del handoff (2,085,014 chars) | 23 ms, sin exceder cuota |
| Efecto → viewer montado | ~1.4 s |

Medido sobre el mismo motor V8 en Node (aislando el costo de la librería):

| Operación | Tiempo |
|---|---|
| `report.load(mrt)` | 50 ms |
| `dataSet.readJson(3.5 MB)` | 63 ms |
| `report.regData(...)` | < 1 ms |
| `report.renderAsync2()` → **145 páginas** | 1,000 ms |
| Heap después del render | 174 MB |
| `toArefilReportData(6,200 items)` | 40 ms |

Resultado en pantalla: el viewer abre el reporte de **145 páginas**, la toolbar
reporta `of 145`, el scroll responde, y saltar a la página 145 (escribiendo el
número en el control de página) renderiza correctamente los productos `NEW`
finales (`NEWBIG-00181 … NEWBIG-00199`, con `—` en Precio A, Diferencia y %).

No hay errores en consola aparte de los avisos de trial. **No se optimizó nada
prematuramente** ni se tocó la arquitectura del backend: Stimulsoft no presentó
ningún problema real con miles de filas.

> Nota metodológica: las mediciones "wall clock" desde `navigationStart` no son
> representativas en este entorno. La pestaña se maneja por automatización y
> queda con `document.visibilityState === "hidden"`, y Chrome estrangula la
> hidratación de una pestaña en segundo plano — el arranque del efecto se
> observó a los ~35 s. Por eso las cifras de arriba son *por fase* (deltas
> medidos con `PerformanceResourceTiming`) y las de motor se tomaron en Node, no
> el total de reloj.

## 15. Licencia

**Cómo funciona.** Reports.JS renderiza en el navegador; no hay componente
servidor. La clave se asigna a un estático del bundle antes de crear el primer
reporte:

```ts
Stimulsoft.Base.StiLicense.key = process.env.NEXT_PUBLIC_STIMULSOFT_LICENSE_KEY;
```

**Sobre `NEXT_PUBLIC_*`.** Se analizó y la conclusión es que **la clave tiene que
llegar al browser por arquitectura del producto**: es el código del navegador el
que la valida. Cualquier mecanismo (`NEXT_PUBLIC_*`, un endpoint que la sirva,
`StiLicense.loadFromFile('stimulsoft.key')` desde `public/`) termina con la clave
descargada por cada visitante y legible en devtools. Usar una variable
server-only y pasarla como prop no cambiaría nada: seguiría viajando en el
payload de RSC.

Por eso se eligió `NEXT_PUBLIC_STIMULSOFT_LICENSE_KEY`, que **dice explícitamente
que es pública**, en vez de un `STIMULSOFT_LICENSE_KEY` que sugeriría una
protección que no existe. Implicaciones documentadas en `.env.example`.

**Configuración.** Como es `NEXT_PUBLIC_*`, se embebe en tiempo de build:

- `.env.example` y `.env.docker.example`: variable vacía + explicación.
- `Dockerfile`: `ARG NEXT_PUBLIC_STIMULSOFT_LICENSE_KEY=` → `ENV` en la etapa
  builder, igual que `NEXT_PUBLIC_API_URL`.
- `compose.yaml`: se pasa como build arg (`${NEXT_PUBLIC_STIMULSOFT_LICENSE_KEY:-}`),
  vacío por defecto.

**No se versionó ninguna clave.** El repo no contiene ni una clave real ni un
`stimulsoft.key`. Los `.env*` reales siguen ignorados por `.gitignore`.

**Comportamiento en desarrollo / trial.** Sin clave, el producto corre en modo
trial: **completamente funcional** (render, PDF, Excel, impresión — todo lo
validado en §11–§13 se hizo en trial), con estas marcas visibles:

- marca de agua diagonal `Trial` en cada página del reporte;
- texto `STIMULSOFT` tenue en el pie de cada página;
- warning en consola: `You are using a trial version of the Stimulsoft product!`;
- según la documentación oficial, el periodo de evaluación es limitado en tiempo.

Es decir: la integración es correcta hoy y la única diferencia al activar la
licencia será que desaparecen esas marcas.

## 16. Docker

```bash
make docker_rebuild     # docker compose up --detach --build --force-recreate --wait
```

```text
arefil-frontend-1   Up (healthy)
arefil-backend-1    Up (healthy)
```

Verificado con el stack corriendo:

| Check | Resultado |
|---|---|
| `.mrt` dentro del contenedor | `/app/public/reports/price-list-comparison.mrt` — 41,203 bytes |
| `.mrt` por HTTP | `GET /reports/price-list-comparison.mrt` → `200`, 41,203 bytes |
| Assets de Stimulsoft | Todos desde `/_next/static/chunks/*` — **cero 404**, cero peticiones externas |
| CSS/temas de Stimulsoft | No hay CSS separado: el viewer inyecta sus estilos e íconos desde el propio JS (íconos como `data:image/...`), así que no hay nada más que servir |
| Comparación | `POST /backend-api/reports/price-list-comparison/data` → `200` |
| `backend:8000` desde el browser | **Nunca**. Todas las peticiones del waterfall son `localhost:3000` |
| Viewer | Renderiza dataset chico (1 página) y grande (145 páginas) |
| Export PDF / Excel | Ejecutados desde el contenedor |

## 17. Standalone

`next.config.ts` usa `output: "standalone"`. `.next/standalone` **no** incluye
`public/` (comportamiento normal de Next). El `Dockerfile` ya lo copiaba
explícitamente y esa línea es la que hace que el `.mrt` exista en runtime:

```dockerfile
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
```

No se asumió que “funciona en `next dev`” bastara: se verificó dentro del
contenedor con `ls` y con una petición HTTP real (§16).

## 18. Tests

`npm test` — **77/77** (eran 41 al terminar Frontend #8; +36 nuevos).

Nuevos archivos:

**`src/lib/reports/stimulsoft-dataset.test.ts`** — el adapter y el `.mrt`
commiteado:

- conserva las seis secciones del contrato y el orden de las claves;
- envuelve los singletons en tablas de una fila;
- copia proveedor, listas y summary **verbatim** (sin recalcular);
- formatea `$100.00` / `+$10.00` / `+10.00%` / `Aumentó`;
- `price_a = 0` → `%` es `—`, nunca `Infinity%` ni `0%`;
- `NEW` sin precio A, `REMOVED` sin precio B, ambos con deltas `—`;
- `description = null` → `—`;
- ningún campo `*_display` contiene `NaN` / `Infinity` / `null` / `undefined`;
- comparación vacía no rompe el adapter;
- el `.mrt` declara exactamente los `DataSources` y columnas que produce el
  adapter, con `NameInSource = ArefilReportData.<tabla>`;
- el `.mrt` viaja sin conexión de datos (`Dictionary.Databases` ausente);
- el `.mrt` enlaza las 7 columnas de detalle, los 7 tiles del summary y los
  campos del encabezado;
- el `.mrt` no contiene funciones de agregación.

**`src/lib/reports/comparison-handoff.test.ts`** — ruta, query params y handoff:

- `buildViewerHref(7, 9)` → `/donaldson/reports/price-list-comparison/view?a=7&b=9`
  (solo los ids en la URL, nunca el dataset);
- `parseViewerSelection` acepta un par válido y rechaza id faltante, no numérico,
  fraccionario, cero, negativo y `a === b`;
- round-trip del handoff bajo una sola clave;
- ignora una comparación cacheada de **otro** par de listas;
- devuelve `null` ante contenido corrupto o ajeno en vez de lanzar;
- reporta `false` si `setItem` excede la cuota, y degrada sin romper si
  `sessionStorage` no está disponible.

**Stimulsoft excluido de las pruebas unitarias, y por qué:** el viewer depende
fuertemente de `window` / `document` (`new StiViewerOptions()` ya falla en Node),
y el proyecto corre Vitest en entorno `node` sin React Testing Library. Montar
`<Viewer>` exigiría un mock enorme de un tercero — justo lo que la issue pide
evitar — y probaría el mock, no el viewer. Se cubre con la validación manual real
de §11–§14, §16 y §21. Sí se testea **nuestra capa** completa: adapter, mapping,
nulls, ruta y contrato del template.

## 19. Lint

`npm run lint` — sin errores ni warnings.

Nota: las reglas `react-hooks` v6 (React Compiler) obligaron a dos decisiones de
diseño que quedaron mejor que la versión inicial:

- el `StiReport` se construye en `useMemo` durante el render (es cómputo puro
  sobre props, sin DOM) en vez de en un `useEffect` + `setState`;
- el estado del viewer se **llavea** por el par `a:b` en lugar de resetearse al
  cambiar la selección, de modo que todos los `setState` ocurren dentro de
  callbacks asíncronos y un resultado obsoleto simplemente deja de coincidir con
  la llave.

## 20. Typecheck

`npm run typecheck` — sin errores.

`stimulsoft-reports-js-react/viewer` resuelve tipos correctamente con
`moduleResolution: "bundler"` (el paquete no declara `exports`, así que TS
resuelve el subpath `./viewer` a `viewer.d.ts`). No hizo falta ningún
`declare module` ni `@ts-expect-error`.

## 21. Build

`npm run build` — OK. 13 rutas, una nueva:

```text
Route (app)
├ ƒ /donaldson/reports
└ ƒ /donaldson/reports/price-list-comparison/view      ← nueva
```

`git diff --check` — OK.

Se verificó explícitamente que Stimulsoft **no rompe producción**: todas las
validaciones de export, impresión y dataset grande se hicieron sobre el build de
producción corriendo en Docker, no en `next dev`.

## 22. Limitaciones

1. **Marca de agua trial.** Sin licencia, cada página del reporte lleva `Trial` y
   `STIMULSOFT`, incluidos los PDF y Excel exportados. Es lo esperado (§15).
2. **15.4 MB de JavaScript.** El chunk del viewer es grande incluso sin el
   Designer. Está aislado tras `dynamic({ ssr:false })`, así que solo lo paga
   quien abre el reporte, y queda en caché del navegador. No hay forma de
   adelgazarlo sin dejar de importar el `Viewer` oficial.
3. **La licencia es pública por diseño de Reports.JS.** No es un defecto de esta
   implementación; se documentó en vez de simular protección (§15).
4. **`document.title` tras imprimir.** Stimulsoft lo reemplaza por el nombre del
   reporte y no lo restaura (§13).
5. **Chrome bloquea descargas automáticas repetidas.** Tras 3 exportaciones
   consecutivas desde el mismo origen, Chrome bloqueó la cuarta ("multiple
   automatic downloads"). Es una protección del navegador, no del viewer: el
   usuario la autoriza una vez desde la barra de direcciones. El blob del
   exportador se generó correctamente en todos los casos (§11, §12).
6. **Handoff por `sessionStorage`.** 1.99 MiB entra sin problema (23 ms), pero un
   dataset mucho mayor podría exceder la cuota. Está contemplado: la escritura
   devuelve `false` y el viewer vuelve a pedir la comparación a Backend #9 con
   los ids de la URL. Nunca se rompe, solo cuesta un round trip.
7. **Navegación de páginas de Stimulsoft.** En modo `Single Page` (el default) el
   scroll no avanza de página; hay que usar los controles de la toolbar. Es el
   comportamiento del viewer, no algo configurado aquí.
8. **Sin `Item Number` ni clasificaciones en el PDF.** Están en el dataset pero no
   en el layout (§9).
9. **Mediciones de reloj no representativas** por el throttling de pestaña oculta
   durante la automatización (§14).

## 23. Manejo de errores

| Caso | Comportamiento |
|---|---|
| `?a=` / `?b=` ausente, no numérico, cero, negativo o `a === b` | Card: *"El enlace del reporte no indica dos listas de precios válidas para comparar."* + botón **Ir a Reportes**. No se pide nada al backend. |
| Lista inexistente | `ErrorAlert`: *"No se pudo abrir el reporte / La lista de precios A #998 no existe."* — mensaje del backend, sin stack trace. **Verificado en el navegador.** |
| `.mrt` no carga (404 / red) | *"No se pudo cargar la plantilla del reporte. Verifica que el archivo price-list-comparison.mrt esté publicado."* (distinguido con un `TemplateError` propio, para no confundirlo con una falla del backend) |
| Stimulsoft falla al inicializar | `onError` del viewer → *"No fue posible inicializar el visor de reportes. Recarga la página e intenta de nuevo."* |
| Dataset vacío (0 productos) | El reporte se abre igual (el summary es válido) con un aviso arriba: *"Las listas seleccionadas no tienen productos para comparar; el reporte solo mostrará el resumen."* |
| Licencia inválida / no configurada | Modo trial, reporte funcional con marca de agua. Sin pantalla de error. |

Nunca hay pantalla en blanco: mientras se resuelve el dataset y se descarga el
chunk se muestra *"Generando el reporte…"* / *"Cargando visor de reportes…"*.
Ningún mensaje expone stack traces ni payloads crudos.

## 24. Responsive

El viewer es prioritariamente desktop, como pide la issue. Lo que sí se garantizó:

- el contenedor tiene altura definida (`h-[calc(100dvh-13rem)] min-h-[28rem]`) y
  `overflow-hidden`, con `[&>div]:h-full` sobre el `<div>` que renderiza el
  componente `Viewer`. Sin altura definida, el `height: 100%` interno de
  `StiViewer` colapsaba el canvas a una franja de ~44 px (medido y corregido);
- el viewer trae sus propias barras de scroll y funciona;
- la toolbar queda accesible;
- el layout de Arefil no se rompe: sidebar, breadcrumbs y encabezado intactos;
- **Volver a Reportes** siempre visible arriba a la derecha, además del
  breadcrumb `Reportes`.

No se intentó convertir el viewer en una tabla móvil nativa.

## 25. CSS y assets de Stimulsoft

No hizo falta importar ningún CSS: el viewer genera sus estilos e íconos desde su
propio JavaScript (los íconos viajan como `data:` URIs dentro del bundle). En el
waterfall de red no aparece ninguna hoja de estilo ni imagen externa de
Stimulsoft, y no hay ni un 404.

Consecuencia buscada: **Tailwind y los estilos de Arefil no se tocan**. Los
estilos de Stimulsoft viven dentro del subárbol del viewer; no se agregó ningún
`import "…css"` global ni se sobrescribió nada del design system. Verificado
visualmente en la toolbar, los dropdowns (`Save`, `Print`), los diálogos de
export, las fuentes y los íconos.

## 26. Designer — confirmación explícita

**El Designer NO fue implementado.** Verificado:

- `src/` solo importa `stimulsoft-reports-js-react/viewer` (que a su vez importa
  engine, chart, export, xlsx, maps y viewer — **no** `stimulsoft.designer.mjs`);
- en el chunk de producción de 15.4 MB, los símbolos exclusivos del Designer
  aparecen **0 veces**:

  ```text
  StiJsDesigner          designer.mjs=4  viewer.mjs=0  clientChunk=0
  stiDesignerMainPanel   designer.mjs=9  viewer.mjs=0  clientChunk=0
  StiDesignerOptions     designer.mjs=4  viewer.mjs=0  clientChunk=0
  ```

  (el bundle del Designer pesa 11 MB; si estuviera incluido el chunk rondaría los
  26 MB);
- además se apagó `toolbar.showDesignButton`, para que el viewer ni siquiera
  ofrezca la transición al Designer;
- no se implementó guardado de `.mrt` desde la UI, edición de templates, API de
  templates en el backend, `ReportDefinition`, `ReportTemplate`,
  `ReportParameter` ni Report Registry;
- no se guardó ningún template en SQLite, no se escribió SQL y no se crearon
  migraciones.

## 27. Confirmación de no commit / push / PR

- **No** se hizo `git commit`.
- **No** se hizo `git push`.
- **No** se creó ningún Pull Request.
- **No** se cerró ni modificó ninguna Issue en GitHub.
- **No** se modificó el backend: `../Arefil_backend` sigue en `52b73db` con el
  árbol de trabajo limpio (salvo la base de datos de prueba, poblada desde
  Frontend #8).

Archivos tocados en `Arefil_frontend` (todos sin commit):

```text
M  .env.docker.example
M  .env.example
M  Dockerfile
M  compose.yaml
M  package.json
M  package-lock.json
M  src/components/donaldson/price-list-comparison.tsx   (botón "Ver reporte")
M  src/lib/format/date.ts                               (formatDateTime)
M  src/lib/format/decimal.ts                            (cache de formatters)
?? public/reports/price-list-comparison.mrt
?? scripts/build-price-list-comparison-mrt.mjs
?? src/app/donaldson/reports/price-list-comparison/view/page.tsx
?? src/components/reports/price-list-comparison-report.tsx
?? src/components/reports/stimulsoft-report-viewer.tsx
?? src/lib/reports/comparison-handoff.ts
?? src/lib/reports/comparison-handoff.test.ts
?? src/lib/reports/stimulsoft-dataset.ts
?? src/lib/reports/stimulsoft-dataset.test.ts
?? codex/output/stimulsoft-viewer-integration.md
```

**No se modificó la lógica de comparación** (`src/lib/reports/comparison.ts` y
`src/lib/api/reports.ts` quedaron intactos), ni el contrato de Backend #9
(`src/types/api.ts` sin cambios).

## 28. Criterios de aceptación

| Criterio | Estado |
|---|---|
| Stimulsoft Reports.JS está integrado | ✅ `stimulsoft-reports-js-react@2026.3.2` |
| Viewer funciona dentro de Arefil | ✅ `/donaldson/reports/price-list-comparison/view` |
| Existe `price-list-comparison.mrt` | ✅ `public/reports/`, 41,203 bytes |
| Se reutiliza `PriceListComparisonResponse` | ✅ mismo objeto, mismo endpoint |
| No se recalcula lógica A vs B en frontend | ✅ adapter solo formatea; test anti-agregaciones en el `.mrt` |
| Summary se muestra correctamente | ✅ 7 tiles desde `summary.*` |
| Tabla de detalle se muestra correctamente | ✅ 7 columnas |
| NEW y REMOVED manejan null correctamente | ✅ `—`, verificado en PDF y en 6,200 filas |
| Precio A=0 no produce porcentaje inválido | ✅ `P-ZERO` → `%` = `—` |
| Dataset de miles de productos abre correctamente | ✅ 6,200 productos → 145 páginas |
| PDF fue realmente probado | ✅ archivo descargado + `pdftotext` |
| Excel fue realmente probado | ✅ archivo descargado + OOXML inspeccionado |
| Viewer funciona en build de producción | ✅ toda la validación se hizo sobre producción |
| Viewer funciona en Docker | ✅ ambos servicios healthy |
| `.mrt` existe en runtime standalone | ✅ verificado dentro del contenedor y por HTTP |
| No se expone `backend:8000` | ✅ waterfall 100% same-origin |
| tests pasan | ✅ 77/77 |
| lint pasa | ✅ |
| typecheck pasa | ✅ |
| build pasa | ✅ |
| Designer NO fue implementado | ✅ 0 símbolos del Designer en el bundle |
| No se versionaron secretos/licencias | ✅ solo variables vacías documentadas |
