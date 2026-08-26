# Frontend #14 — Reportes con renglones repetibles

Fecha de validación: 2026-08-26. Implementado sobre `dev` e integrado contra
Backend #13 (`cda8d80`, rama `reportes`).

## Resultado

El runtime y el constructor genéricos ahora soportan un grupo repetible
configurado por metadata. El caso `COTIZACION` permite elegir una lista de
precios, capturar productos con cantidad y descuento, generar la tabla calculada
por el backend y descargar el mismo resultado en XLSX o CSV. No se agregó lógica
monetaria al navegador ni se usó Stimulsoft para esta vista tabular.

## Contrato consumido

- `ReportDefinition` y el builder incluyen `parameter_groups`.
- El frontend admite el único grupo que permite Backend #13, con
  `resolver_key`, `context_parameter`, `min_items`, `max_items`, orden y campos.
- Los selects dependientes consumen
  `GET /reports/{code}/parameters/{group}.{field}/options` con el contexto como
  query string; para cotización es `items.product_id?price_list_id=...`.
- Las columnas `PARAMETER` de un renglón persisten una ruta completa como
  `items.quantity`, aunque su `key` de columna puede ser `quantity`.
- Preview, ejecución y export reciben el mismo body plano, por ejemplo:

```json
{
  "price_list_id": 1,
  "items": [
    { "product_id": 1, "quantity": 2, "discount": "10" },
    { "product_id": 2, "quantity": 5, "discount": "0" }
  ]
}
```

Los decimales permanecen como texto hasta FastAPI/Pydantic para evitar una
conversión intermedia a punto flotante en el navegador.

## Runtime

`ReportRepeatableParameters` deriva toda la UI de la metadata. Conserva IDs de
fila estables, respeta defaults y orden, agrega/elimina renglones y bloquea el
alta al llegar al máximo. Renderiza `text`, `number`, `select`, `checkbox`,
`date` y `datetime`; una restricción 0..100 añade la indicación visual de
porcentaje.

Las opciones de producto se recargan al cambiar la lista de precios con
`AbortController`. El estado distingue carga, vacío y error. Una selección que
sigue siendo válida se conserva; una que ya no pertenece a la nueva lista se
limpia después de recibir las opciones nuevas.

La validación local cubre requeridos, tipos, enteros, mínimos/máximos inclusivos
y exclusivos, y cantidad mínima/máxima de renglones. Los errores 422 del backend
con ubicaciones como `items.0.product_id` se colocan en la celda correspondiente.

`GenericReportRuntime` ejecuta primero `POST /data`. Mantiene un snapshot
inmutable del payload exitoso y usa ese mismo snapshot para XLSX/CSV. Una edición
aborta solicitudes pendientes, invalida la vista previa y oculta las descargas
hasta regenerar. Una respuesta del builder se muestra con
`ReportBuilderPreviewTable`; los payloads legacy continúan usando
`GenericReportViewer` sin repetir `/data`.

## Constructor administrativo

El workspace incorpora un editor de grupo repetible para handlers
`repeatable_rows`. Permite configurar nombre, etiqueta, contexto, límites,
orden, obligatoriedad, defaults y restricciones numéricas, además del selector
de producto dependiente. Columnas y fórmulas pueden referenciar los subcampos del
grupo mediante rutas punteadas.

`PUT /reports/{code}/builder` persiste columnas, `parameter_groups` y layout
Excel en una sola operación. La validación frontend replica las reglas
estructurales de Backend #13; el backend conserva la autoridad final.

La creación de definiciones ofrece los handlers `price_list_comparison` y
`repeatable_rows`. El catálogo usa ahora `Generar` y `Configurar` como acciones
principales; la descarga aparece únicamente después de una generación exitosa,
con XLSX como acción primaria.

## Caso `COTIZACION`

Se creó y persistió en el Compose local el reporte genérico `COTIZACION` con:

- parámetro escalar `price_list_id`;
- grupo `items` de 1..1000 renglones;
- `product_id`, `quantity > 0` y `discount` entre 0 y 100;
- columnas SKU, descripción, cantidad, precio, subtotal, descuento, IVA y total;
- fórmulas y totales calculados exclusivamente por Backend #13;
- hoja Excel `Cotización`, encabezado congelado y sumas de subtotal, descuento,
  IVA y total.

La consulta dependiente para la lista 1 devolvió los productos esperados. Con el
payload de ejemplo, `/builder/preview` y `/data` fueron idénticos y produjeron:

| SKU | Cantidad | Precio | Subtotal | Descuento | IVA | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| P-INC | 2 | 100.00 | 200.00 | 20.00 | 28.80 | 208.80 |
| P-DEC | 5 | 200.00 | 1000.00 | 0.00 | 160.00 | 1160.00 |
| **Totales** |  |  | **1200.00** | **20.00** | **188.80** | **1368.80** |

El export real respondió `cotizacion.xlsx` con MIME OOXML. `openpyxl` abrió el
archivo en memoria y confirmó la hoja, `freeze_panes=A5`, dos filas de datos y
los mismos cuatro totales. La ruta frontend
`/donaldson/reports/COTIZACION`, el health proxy y el export por
`/backend-api/...` respondieron 200.

## Cobertura y verificación

La cobertura nueva incluye inicialización, orden y serialización; límites de
renglón y numéricos; opciones dependientes, cancelación lógica, vacío, error e
invalidación; errores inline del backend; snapshot exacto de export; dataset del
builder y fallback legacy; guardado del grupo en el builder; handler de creación
y acciones del catálogo.

- `npm test`: 24 archivos, 186 tests.
- `npm run lint`: sin errores.
- `npm run typecheck`: sin errores.
- `npm run build`: build de producción exitoso con Next.js 16.3.
- `git diff --check`: sin errores.
- `make docker_preflight && make docker_up`: backend y frontend healthy en 8000
  y 3000.

Antes de implementar componentes cliente y carga diferida se revisaron las guías
incluidas en `node_modules/next/dist/docs/` para Server/Client Components,
lazy-loading y manejo de errores, conforme a `AGENTS.md`.

## Alcance Git

No se creó commit, no se hizo push y no se abrió PR.
