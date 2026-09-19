# Módulo de reportes — comparación de listas de precios (Frontend #8)

Fecha: 2026-08-24 (America/Mexico_City)

Repositorios:

- Frontend: `f407ff6` más los cambios locales de esta implementación (sin commit).
- Backend: `52b73db`, **sin modificaciones**. Solo se consumió su contrato.
- Backend relacionado: `Alejandro120603/Arefil_backend#9`.

Estado final: **LISTO PARA FRONTEND #9 — STIMULSOFT VIEWER**.

---

## 1. Arquitectura implementada

El reporte se resuelve con el split browser/server que ya usa el proyecto, sin
introducir un patrón nuevo:

```text
/donaldson/reports (Server Component)
  └── listAllPriceLists()            → serverApiClient → API_INTERNAL_URL
        └── <PriceListComparison priceLists={...}>   ("use client")
              └── getPriceListComparison()  → browserApiClient → /backend-api/*
                    └── POST /reports/price-list-comparison/data
```

- El catálogo de listas se carga **en el servidor**, así el selector ya viene
  poblado en el primer render y no hay un estado de carga extra al entrar.
- La comparación se dispara **desde el navegador**, contra el proxy same-origin
  `/backend-api/*`. El navegador nunca resuelve `http://backend:8000`.
- Toda la lógica de presentación pura (mapeo de estados, filtros, paginación,
  formato de nulls, validación A/B) vive en `src/lib/reports/comparison.ts`,
  fuera de React, para poder probarla en el entorno `node` de Vitest que ya usa
  el repo (no hay React Testing Library instalado y no se agregó).

## 2. Rutas

| Ruta | Tipo | Archivo |
|---|---|---|
| `/donaldson/reports` | Server Component dinámico (ƒ) | `src/app/donaldson/reports/page.tsx` |
| `/donaldson/reports` (loading) | Skeleton | `src/app/donaldson/reports/loading.tsx` |

No se modificó ninguna ruta existente. `next build` sigue listando las 11
rutas anteriores más `/donaldson/reports`.

## 3. Navegación

`src/components/layout/nav-items.ts`: se agregó una entrada al final de la
sección **Donaldson**.

```text
Donaldson
  Importar lista      /donaldson/import
  Listas de precios   /donaldson/price-lists
  Productos           /donaldson/products
  Cancelados          /donaldson/cancelados
  Reportes            /donaldson/reports      ← nueva (icono FileChartColumn)
```

El resaltado de activo, el drawer móvil y los breadcrumbs funcionan sin cambios
porque ambos derivan de `NAV_SECTIONS` y del pathname.

## 4. API client

`src/lib/api/reports.ts` (nuevo):

- `PRICE_LIST_COMPARISON_PATH = "/reports/price-list-comparison/data"`.
- `getPriceListComparison(request, options?)` usa `browserApiClient.apiPostJson`,
  el cliente compartido que ya existía. **No se agregó ningún `fetch()` ad-hoc.**
- `SamePriceListError` / `SAME_PRICE_LIST_MESSAGE`: última línea de defensa que
  rechaza A == B **sin tocar la red**. La UI ya bloquea ese caso antes.

`src/lib/api/price-lists.ts`: se agregó `listAllPriceLists()`, que recorre las
páginas del endpoint existente `GET /price-lists` con `page_size=100` (el máximo
del backend, `schemas/pagination.py::MAX_PAGE_SIZE`) hasta un tope de 20 páginas.
Sin ese recorrido, un catálogo con más de 100 listas mostraría un selector
truncado en silencio.

`src/lib/api/reports.ts` **no** se reexporta desde `src/lib/api/index.ts`: ese
barrel lo importan Server Components, y `browser-client` arrastra `client-only`.
Es el mismo criterio que ya siguen `imports.ts` y `admin.ts`.

### Corrección en el manejo de errores

`getErrorMessage()` devuelve `error.message` para cualquier `Error`, así que un
backend caído llegaba a la pantalla como **`fetch failed`** (comportamiento
preexistente en toda la app, verificado en el navegador). Se agregó
`getUserErrorMessage(error, fallback)` en `src/lib/api/errors.ts`: respeta el
texto que escribió el backend (`ApiError`) y colapsa cualquier fallo de
transporte al mensaje legible. Solo lo usan las dos rutas nuevas; ninguna
pantalla existente cambió de comportamiento.

## 5. Tipos

En `src/types/api.ts`, espejo exacto de `backend/app/schemas/reports.py`:

```ts
ComparisonStatus = "INCREASED" | "DECREASED" | "UNCHANGED" | "NEW" | "REMOVED"
PriceListComparisonRequest
ComparisonReportMetadata   // code: "PRICE_LIST_COMPARISON", generated_at
ComparisonSupplier         // id, code, name
ComparisonPriceList        // id, effective_date, currency, source_filename
PriceListComparisonSummary // + average_percentage_change: DecimalString | null
PriceListComparisonItem
PriceListComparisonResponse
```

Los `Decimal` del backend siguen tipados como `DecimalString` (string), como
manda el comentario de cabecera del archivo. **No se ensancharon a `number`.**

`PriceListComparisonResponse` es la unidad completa que Frontend #9 podrá pasar
tal cual a Stimulsoft: incluye metadata del reporte, proveedor, ambas listas,
summary e items, sin que la UI lo mutile ni lo recalcule.

## 6. Componentes reutilizados

| Componente | Uso |
|---|---|
| `Breadcrumbs` | Cabecera de la página |
| `ErrorAlert` | Error de carga del catálogo y error de comparación |
| `HeaderStat` | Las 7 tarjetas del summary |
| `Card` / `CardContent` / `CardHeader` / `CardTitle` | Contenedores |
| `Badge` | Base del badge de estado |
| `Button` | Comparar, intercambiar, filtros, paginación |
| `Label` | Etiquetas de los selects |
| `Table*` | Tabla de detalle (ya trae su contenedor `overflow-x-auto`) |
| `ListPageSkeleton` | `loading.tsx` |
| `formatDate`, `formatCurrency`, `formatSignedCurrency`, `formatSignedPercentage`, `parseDecimal` | Todo el formato monetario y de fechas |

**No se concatenó `$` a mano en ningún lugar.**

## 7. Componentes nuevos

| Archivo | Rol |
|---|---|
| `src/components/donaldson/price-list-comparison.tsx` | Cliente: selección A/B, disparo, filtros, paginación |
| `src/components/donaldson/comparison-summary.tsx` | Las 7 métricas del summary |
| `src/components/donaldson/comparison-table.tsx` | Tabla de detalle |
| `src/components/donaldson/comparison-status-badge.tsx` | Badge de estado con icono + texto |
| `src/lib/reports/comparison.ts` | Lógica pura: labels, filtros, paginación, formato de nulls, validación |

### Sobre `PriceChangeIndicator`

Se evaluó y **no** se reutilizó: fusiona diferencia y porcentaje en un solo
elemento y renderiza `"Sin comparación"` cuando no hay delta. La issue exige
columnas separadas de `Diferencia` y `%`, y `—` como placeholder. Forzarlo
habría roto ambos requisitos. Lo que sí se conservó es su semántica de color
(sube = esmeralda, baja = destructivo) para que el reporte no se contradiga con
el histórico de precios.

### Selects nativos

Se usó `<select>` nativo con las mismas clases que los filtros de
`/donaldson/price-lists` y `/donaldson/products`, en lugar del `Select` de
Base UI. Motivo: es el patrón vigente en el repo para filtros de formulario, y
en móvil el picker nativo del sistema es mejor que un popup custom.

## 8. Filtros

Seis chips sobre el dataset ya recibido:

```text
Todos (n) · Aumentaron (n) · Disminuyeron (n) · Sin cambio (n) · Nuevos (n) · Retirados (n)
```

- Los conteos salen del **summary del backend**, no de un `filter().length`.
- El chip activo lleva `aria-pressed` y variante visual distinta.
- Cambiar de filtro resetea la página a 1.

### Decisión: filtrado client-side

Backend #9 ya demostró que 5,000 productos viajan en ~1.58 MiB en una sola
respuesta; en esta validación 6,200 productos dieron **2.08 MiB en 0.394 s**.
Con el dataset completo ya en memoria, pedirle al backend un subconjunto por
estado costaría un round-trip para reproducir un `Array.prototype.filter` que el
navegador puede hacer en microsegundos. Medido en el navegador, alternar
filtros sobre 6,200 filas es instantáneo.

**No se creó ningún endpoint paginado nuevo en el backend.**

Si el catálogo creciera a un orden de magnitud mayor, el punto de corte natural
sería paginar en el servidor — pero eso implica un cambio de contrato y queda
fuera de esta issue.

## 9. Paginación / estrategia de performance

Se implementó la opción preferida por la issue: **paginación client-side simple**
sobre el dataset ya recibido.

- Tamaños: **50** (default) y **100** filas por página.
- Solo se montan en el DOM las filas de la página actual (verificado: 50 `<tr>`
  con 6,200 productos cargados).
- `paginateItems()` **clampa** la página en lugar de confiar en ella, así que
  aplicar un filtro más estricto o reducir el tamaño de página nunca deja la
  tabla en un rango vacío fuera de rango.
- El paginador respeta el filtro activo (`1–12 de 12` con "Retirados", `1–100 de
  200` con "Nuevos", etc.).

**No se agregó ninguna librería de virtualización.** No hizo falta: con 50–100
filas montadas la UI responde igual que con 7.

## 10. Manejo de nulls

Todo se concentra en `formatComparisonRow()`, que es código puro y está cubierto
por pruebas:

| Caso | Precio A | Precio B | Diferencia | % |
|---|---|---|---|---|
| `NEW` | `—` | valor | `—` | `—` |
| `REMOVED` | valor | `—` | `—` | `—` |
| `price_a == 0` | `$0.00` | valor | valor | `—` |
| `item_number` / `description` / `classification` nulos | `—` | | | |

Las utilidades `formatSignedCurrency` / `formatSignedPercentage` ya devuelven
`null` para entrada nula o no finita, así que `null`, `undefined`, `NaN`,
`Infinity` y `$null` son **inalcanzables por construcción**. Verificado además
en el navegador: 1,112 filas renderizadas del dataset grande escaneadas con
`/null|undefined|NaN|Infinity/`, **0 coincidencias**.

Nota: una fila `UNCHANGED` muestra `+$0.00` / `+0.00%` porque el backend sí
envía un delta real de cero y `formatSignedCurrency` usa `signDisplay: "always"`,
igual que en el histórico de precios. Es un cero verdadero, no un sustituto de
"sin dato", y el badge "Sin cambio" lo desambigua.

## 11. Mapping de estados

| Backend | Etiqueta fila | Etiqueta plural (summary/filtro) | Icono | Tono |
|---|---|---|---|---|
| `INCREASED` | Aumentó | Aumentaron | `TrendingUp` | esmeralda |
| `DECREASED` | Disminuyó | Disminuyeron | `TrendingDown` | destructivo |
| `UNCHANGED` | Sin cambio | Sin cambio | `Minus` | secundario |
| `NEW` | Nuevo | Nuevos | `Plus` | primario |
| `REMOVED` | Retirado | Retirados | `CircleMinus` | contorno/muted |

Accesibilidad: **el color nunca es el único portador de significado**. Cada badge
lleva icono + texto en español, y sobrevive a escala de grises y a lectores de
pantalla. Los iconos van con `aria-hidden`, el texto es el contenido real.

## 12. Pruebas realizadas

`npm test` → **41 pruebas, 7 archivos, todas en verde** (34 preexistentes + 7
nuevos casos agrupados en 3 archivos nuevos).

`src/lib/reports/comparison.test.ts` (20 casos):
mapeo de los cinco estados y sus etiquetas · orden de filtros · filtrado por cada
estado · filtrado sin coincidencias · slicing y rango 1-based de la paginación ·
clamp de página fuera de rango · dataset vacío · bloqueo A == B · selección
incompleta · selección válida · etiquetas de lista · precios de filas
comparadas · `NEW` sin precio A · `REMOVED` sin precio B · porcentaje nulo con
precio A cero · barrido anti-`null/NaN/Infinity` · transición de clasificación ·
tonos de variación.

`src/lib/api/reports.test.ts` (7 casos):
POST al path correcto vía `/backend-api` · body `{price_list_a_id,
price_list_b_id}` · aserción explícita de que la URL del navegador **no**
contiene `backend:8000` · rechazo de A == B sin tocar la red · respuesta vacía
como éxito · 422 de listas incompatibles · 404 de lista inexistente · backend
inalcanzable · `getUserErrorMessage`.

`src/lib/api/price-lists.test.ts` (3 casos):
`page_size=100` · recorrido completo de páginas · tope anti-bucle.

`src/components/layout/nav-items.test.ts` (1 caso):
Reportes presente en Donaldson sin perder las rutas existentes.

No se probaron detalles visuales triviales (clases de Tailwind, textos de
cabecera de tabla).

## 13. Validación con Backend #9

Se validó contra el backend real levantado con `make run_panel`, con datos
generados desde el propio fixture builder del backend
(`tests/donaldson_fixtures.py`) e importados por el flujo real
(`POST /imports/donaldson/preview` + `/confirm`) **a través del proxy
`/backend-api/*`**:

| Lista | Vigencia | Filas | Archivo |
|---|---|---|---|
| A pequeña | 20/10/2025 | 6 | `small_a.xlsx` |
| B pequeña | 15/01/2026 | 6 | `small_b.xlsx` |
| A grande | 01/03/2026 | 6,000 | `large_a.xlsx` |
| B grande | 01/06/2026 | 6,188 | `large_b.xlsx` |

### Verificación fila por fila (par pequeño)

Contrastado a mano contra los workbooks originales:

| Parte | Precio A | Precio B | Diferencia | % | Estado | ✓ |
|---|---|---|---|---|---|---|
| P-INC | $100.00 | $110.00 | +$10.00 | +10.00% | Aumentó | ✓ |
| P-DEC | $200.00 | $150.00 | -$50.00 | -25.00% | Disminuyó | ✓ |
| P-SAME | $300.00 | $300.00 | +$0.00 | +0.00% | Sin cambio | ✓ |
| P-ZERO | $0.00 | $25.00 | +$25.00 | `—` | Aumentó | ✓ |
| P-GONE | $400.00 | `—` | `—` | `—` | Retirado | ✓ |
| P-NEW | `—` | $75.50 | `—` | `—` | Nuevo | ✓ |
| P-CLS | $500.00 | $525.00 | +$25.00 | +5.00% | Aumentó (clasif. `A → B`) | ✓ |

Summary en pantalla = summary del backend: total 7, aumentaron 3, disminuyeron 1,
sin cambio 1, nuevos 1, retirados 1, promedio **-2.50%**. El promedio se
comprobó a mano: `(5.00 - 25.00 + 10.00 + 0.00) / 4 = -2.50` (P-ZERO queda fuera
porque su porcentaje es nulo). La UI **no** recalcula nada.

### Prueba de inversión A/B

Con el botón *Intercambiar* y una segunda comparación, el dataset se invirtió
coherentemente: P-CLS pasó a `-$25.00 / -4.76%` (25/525) y P-GONE pasó de
`Retirado` a `Nuevo`. Confirma que la UI no está interpretando al revés el
contrato ni cacheando el sentido de la comparación.

### Dataset grande

| Métrica | Valor |
|---|---|
| Productos | 6,200 |
| Payload | 2.08 MiB |
| Tiempo de respuesta vía proxy | 0.394 s |
| Comparar → tabla pintada (navegador) | ~1.1 s |
| Filas montadas en el DOM | 50 |
| Páginas | 124 (a 50/pág.), 62 (a 100/pág.) |
| Summary | 1,973 / 2,007 / 2,008 / 200 / 12 · promedio +0.36% |

Summary idéntico al del endpoint. Filtros, cambio de tamaño de página y
navegación entre páginas verificados sobre este dataset.

### Recorrido de los 15 pasos obligatorios

1–4 ✓ abrir `/donaldson/reports`, seleccionar A, seleccionar B, Comparar.
5–10 ✓ total, aumentos, disminuciones, sin cambio, nuevos, retirados.
11–12 ✓ diferencia monetaria y porcentaje contrastados contra los originales.
13 ✓ los seis filtros, cada uno con el conteo y las filas correctas.
14–15 ✓ cambio de listas (pequeñas → grandes) y nueva comparación **sin recargar
la aplicación**.

### Estados de error verificados en el navegador

| Escenario | Resultado |
|---|---|
| A == B | `Comparar` deshabilitado + *"Selecciona dos listas distintas."* — no sale request |
| Selección incompleta | `Comparar` deshabilitado + *"Selecciona dos listas de precios para comenzar."* |
| 404 real del backend (id inexistente) | `ErrorAlert`: *"La lista de precios B #999 no existe."* |
| Backend caído (payload 502 real del proxy) | `ErrorAlert`: *"No se pudo comunicar con el backend."* |
| Backend caído al cargar la página | `ErrorAlert`: *"No se pudo comunicar con el backend. Verifica que el servicio esté disponible e intenta de nuevo."* |
| Catálogo vacío (BD limpia real) | *"No hay listas disponibles para comparar."* |

Ningún mensaje expone stack traces ni payloads crudos. Consola del navegador:
sin errores ni advertencias de hidratación.

### Responsive

- A 411 px: los selects se apilan (`flex-direction: column`), el sidebar pasa a
  su modo drawer `fixed`, `main` usa el padding móvil.
- Con la columna de contenido reducida a 390 px, la tabla de 9 columnas hace
  scroll **dentro de su propio contenedor** (`scrollWidth 861` vs
  `clientWidth 294`, `overflow-x: auto`) y el documento **no** hace scroll
  horizontal.
- Summary: `grid-cols-2` en móvil → `sm:3` → `lg:4` → `xl:7`.

Limitación honesta: el gestor de ventanas de este entorno ignora las peticiones
de redimensionado del navegador, así que la verificación móvil se hizo por
media queries y estilos computados, no con una captura a 414 px reales.

## 14. Resultados de los comandos

```text
npm test        → 7 archivos, 41 pruebas, 0 fallos
npm run lint    → sin salida (limpio)
npm run typecheck → sin salida (limpio)
npm run build   → compilado OK; 12 rutas, incluida ƒ /donaldson/reports
git diff --check → sin salida (sin espacios en blanco al final ni conflictos)
```

## 15. Docker / proxy

- `make run_panel`: usado durante toda la validación funcional. Backend en
  `:8000`, frontend en `:3000`, imports y comparaciones a través de
  `/backend-api/*`.
- `make docker_up`: el stack de Compose se construyó y levantó con los cambios.
  `arefil-backend-1` y `arefil-frontend-1` quedaron **healthy**, y contra el
  stack containerizado se verificó:

  | Comprobación | Resultado |
  |---|---|
  | `GET /backend-api/price-lists` | 4 listas |
  | Comparación pequeña vía proxy | summary idéntico (7 / 3 / 1 / 1 / 1 / 1 · -2.50%) |
  | Comparación grande vía proxy | 2.08 MiB en **0.471 s** |
  | SSR de `/donaldson/reports` | el HTML ya trae el título del reporte y las opciones (`20 oct 2025 · DONALDSON · MXN`) |
  | `backend:8000` en el HTML servido | **0 ocurrencias** |
  | `backend:8000` en `/app/.next/static` | **0 archivos** |

  Después de la validación se ejecutó `make docker_down`; los datos persistentes
  del backend no se tocaron.
- `/backend-api/[...path]` **no se tocó**. Sigue reenviando POST con cuerpo JSON
  (el método ya estaba en `METHODS_WITH_BODY`).
- El split browser/server se respeta: `serverApiClient` → `API_INTERNAL_URL`
  (`http://backend:8000/api` en Compose), `browserApiClient` → `/backend-api`.
- Prueba automatizada que lo fija: `reports.test.ts` afirma que la URL emitida
  por el navegador **no** contiene `backend:8000`.

## 16. Deuda restante

1. **`+$0.00` / `+0.00%` en filas `UNCHANGED`.** Consecuencia de
   `signDisplay: "always"` en el helper compartido. Cambiarlo a `exceptZero`
   afectaría también a `PriceChangeIndicator`, así que se dejó consistente.
2. **Ordenamiento fijo.** Las filas llegan ordenadas por `part_number` desde el
   backend y no hay orden por columna en la UI. No lo pedía la issue.
3. **Sin búsqueda por número de parte** dentro del reporte. Con 6,200 filas y
   124 páginas puede volverse deseable; no estaba en el alcance.
4. **Sin exportación** (CSV/XLSX/PDF) del reporte. Corresponde a Frontend #9.
5. **`getErrorMessage` sigue devolviendo `fetch failed`** en las pantallas
   anteriores (dashboard, listas, productos, cancelados). Existe
   `getUserErrorMessage` para arreglarlo, pero migrar esas pantallas queda
   fuera del alcance de esta issue.
6. **`listAllPriceLists` topa en 20 páginas** (2,000 listas). Suficiente por
   varios órdenes de magnitud, pero es un límite explícito.
7. **Verificación móvil por media queries**, no por viewport real (ver arriba).

## 17. Stimulsoft — confirmación explícita

**Stimulsoft NO se implementó en esta issue.** Verificado:

- `package.json` no contiene `stimulsoft-reports-js`, `stimulsoft-viewer` ni
  `stimulsoft-designer`. No se instaló ninguna dependencia nueva: el
  `package.json` y el `package-lock.json` quedaron **sin cambios**.
- No existe ningún archivo `.mrt` en el repo.
- No hay Viewer, Designer, almacenamiento de templates, SQL libre ni tablas
  nuevas en el backend.

La arquitectura sí quedó preparada: `PriceListComparisonResponse` se recibe
completo, tipado y sin mutar, así que Frontend #9 puede alimentar a Stimulsoft
con exactamente el mismo objeto y el mismo `getPriceListComparison()`.

## 18. Confirmación de no commit / push / PR

- **No** se hizo `git commit`.
- **No** se hizo `git push`.
- **No** se creó ningún Pull Request.
- **No** se cerró ni modificó ninguna Issue en GitHub.
- **No** se modificó el backend (`../Arefil_backend` sigue en `52b73db`, con el
  árbol de trabajo limpio salvo la base de datos de prueba poblada por los
  imports de validación).

Todos los cambios están en el árbol de trabajo de `Arefil_frontend`, listos para
revisión.

## 19. Criterios de aceptación

| Criterio | Estado |
|---|---|
| Existe `/donaldson/reports` | ✅ |
| Existe navegación hacia Reportes | ✅ |
| Se pueden seleccionar Lista A y B | ✅ |
| No se puede comparar una lista consigo misma | ✅ (botón bloqueado + guard en el cliente) |
| Se consume `POST /api/reports/price-list-comparison/data` | ✅ vía `/backend-api/*` |
| Se muestran correctamente los cinco estados | ✅ |
| Summary coincide con backend | ✅ (valores tomados directo del summary) |
| Tabla muestra precios A/B, diferencia y porcentaje | ✅ |
| NEW y REMOVED manejan nulls correctamente | ✅ |
| Existen filtros por status | ✅ |
| Dataset de miles de productos sigue siendo usable | ✅ 6,200 productos, 50 filas montadas |
| No hay `NaN`, `Infinity` ni `null` visibles | ✅ verificado en 1,112 filas |
| API client existente se reutiliza | ✅ |
| Proxy `/backend-api/*` sigue funcionando | ✅ |
| Docker sigue funcionando | ✅ |
| tests pasan | ✅ 41/41 |
| lint pasa | ✅ |
| typecheck pasa | ✅ |
| build pasa | ✅ |
| Stimulsoft NO está instalado | ✅ |
