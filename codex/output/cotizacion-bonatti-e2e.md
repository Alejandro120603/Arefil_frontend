# COTIZACION · plantilla BONATTI end-to-end (issue #27)

Rama `feat/report-data-sources`. Fecha de la corrida: 2026-09-01.
Runtime usado: backend `Arefil_backend` (FastAPI + SQLite `backend/data/arefil.db`)
en `127.0.0.1:8010` y frontend `next dev` en `127.0.0.1:3010` apuntando a ese backend.

## 1. Recon del COTIZACION real (antes de tocar nada)

Leído directamente de `report_definitions` y sus tablas hijas, no de suposiciones.

| Elemento | Valor real encontrado |
| --- | --- |
| `report_definitions.id` | 3, código `COTIZACION`, categoría `Ventas` |
| Fuente de datos | `report_data_sources` id 5 · `QUOTATION_ROWS` · `executor_type=HANDLER` · `handler_key=repeatable_rows` · `capabilities=["REPEATABLE_ROWS"]` |
| Contrato de la fuente (`input_schema`) | un solo parámetro: `price_list_id` (integer/select, requerido, `options_source=price_lists`) |
| Parámetros escalares previos | únicamente `price_list_id` |
| Grupo repetible | `items` · resolver `products_by_price_list` · contexto `price_list_id` · `min_items=1`, `max_items=1000` |
| Subcampos del grupo | `product_id` (integer/select), `quantity` (integer/number, requerido, default 1, `minimum=0` exclusivo), `discount` (decimal/number, opcional, default `"0"`, 0–100) |
| Columnas | ver tabla abajo |
| Summaries (`report_excel_layouts.totals_configuration`) | formato legado `[{column_key, operation}]`: `subtotal`, `discount_amount`, `tax`, `total`, todos `SUM` |
| Plantilla XLSX | **no había ninguna** (`report_excel_templates` vacío para el reporte) |
| `filename_template` | `null` |

Columnas guardadas (`report_columns`, orden real):

| key | label | tipo | origen | formato | visible |
| --- | --- | --- | --- | --- | --- |
| `sku` | SKU | FIELD | `product.part_number` | text | sí |
| `description` | Descripción | FIELD | `product.description` | text | sí |
| `quantity` | Cantidad | PARAMETER | `items.quantity` | number | sí |
| `discount_pct` | Descuento % | PARAMETER | `items.discount` | number | **no** |
| `price` | Precio | FIELD | `price_list_item.unit_price` | currency | sí |
| `subtotal` | Subtotal | FORMULA | `price * quantity` | currency | sí |
| `discount_amount` | Descuento | FORMULA | `ROUND(subtotal * discount_pct / 100, 2)` | currency | sí |
| `net` | Neto | FORMULA | `subtotal - discount_amount` | currency | **no** |
| `tax` | IVA | FORMULA | `ROUND(net * 0.16, 2)` | currency | sí |
| `total` | Total | FORMULA | `net + tax` | currency | sí |

Conclusiones del recon que cambiaron el plan:

- el descuento **no** se llama `discount` en las filas: el operador captura
  `items.discount` (porcentaje) y la fila expone `discount_amount` (importe);
  `discount_pct` y `net` son columnas ocultas y por lo tanto **no** existen como
  `{{rows.*}}` (el backend solo publica columnas visibles);
- no hay `grand_total`: el total se llama `total`;
- el IVA se calcula **por renglón** sobre el neto y el summary lo suma; no es
  `subtotal * 0.16` global;
- la base de datos estaba dos migraciones atrás (`b5c9d2e4f6a1`). Se corrió
  `alembic upgrade head` para incorporar `c8a1e6f4b902` (snapshots de ejecución)
  y `d9f2a6b4c801` (`filename_template`), que son dependencias de esta issue.
  Se guardó respaldo del archivo antes de migrar.

## 2. Configuración final aplicada

Solo se agregaron parámetros escalares y el patrón de nombre. **Columnas,
fórmulas, summaries y el grupo repetible quedaron intactos**: el contrato ya
cubría cantidad y descuento por producto.

Reproducible con:

```bash
python codex/scripts/configure_cotizacion.py --api http://127.0.0.1:8000/api \
    --template codex/output/cotizacion-bonatti/COTIZACION_BONATTI_v1.xlsx
```

Parámetros escalares resultantes (`display_order`):

| # | name | label | tipo / control | requerido |
| --- | --- | --- | --- | --- |
| 0 | `price_list_id` | Lista de precios | integer / select (`price_lists`) | sí (contrato de la fuente) |
| 1 | `customer_name` | Cliente | string / text | sí |
| 2 | `customer_rfc` | RFC | string / text | no |
| 3 | `attention_to` | Atención a | string / text | no |
| 4 | `customer_email` | Email | string / text | no |
| 5 | `requisition` | Requisición / referencia | string / text | no |
| 6 | `quotation_date` | Fecha de cotización | date / date | sí |

`filename_template`: `{{parameters.customer_name}} {{parameters.requisition}}`

Plantilla activa: `COTIZACION_BONATTI_v1.xlsx`, versión 1,
checksum `f92b0f84b5c6e3f254bc5db917fa15d6ed44fa80a13614cda0bbb45a4761844c`,
validación del backend: `valid=true`, 17 placeholders, 1 fila repetible, 0 errores.

## 3. Mapa de placeholders de la plantilla

Hoja `Hoja1` (la segunda hoja, `Hoja2`, sigue vacía y sin placeholders).

| Celda | Contenido | Resuelve a |
| --- | --- | --- |
| `E12` (merge `E12:G12`) | `Ciudad Madero, Tamps., a {{parameters.quotation_date}}` | fecha ISO del parámetro |
| `B13` (merge `B13:D13`) | `Cliente: {{parameters.customer_name}}` | razón social |
| `E13` (merge `E13:G13`, línea nueva) | `RFC: {{parameters.customer_rfc}}` | RFC, vacío si no se captura |
| `B14` (merge `B14:D14`) | `Email: {{parameters.customer_email}}` | correo |
| `B15` (merge `B15:D15`) | `Atencion: {{parameters.attention_to}}` | contacto |
| `C16` (merge `C16:E16`) | `{{parameters.requisition}}` | requisición / referencia |
| `A19` | `{{rows.row_number}}` | numeración nativa del renderer (columna “Item.”) |
| `B19` | `{{rows.quantity}}` | cantidad capturada |
| `C19` | `{{rows.sku}}` | número de parte |
| `D19` | `{{rows.description}}` | descripción |
| `E19` | `{{rows.discount_amount}}` | importe de descuento del renglón |
| `F19` | `{{rows.price}}` | precio unitario |
| `G19` | `{{rows.subtotal}}` | importe del renglón (precio × cantidad) |
| `F20`/`G20` | `SUBTOTAL` / `{{summary.subtotal}}` | suma de importes |
| `F21`/`G21` | `DESCUENTO` / `{{summary.discount_amount}}` | suma de descuentos |
| `F22`/`G22` | `IVA` / `{{summary.tax}}` | suma del IVA por renglón |
| `F23`/`G23` | `TOTAL` / `{{summary.total}}` | neto + IVA |

La fila 19 es la única fila repetible; el renderer la clona una vez por producto
y desplaza el bloque de totales, las condiciones comerciales y la firma.

Decisión de diseño que conviene revisar con ventas: la columna `E` del documento
original era **“T/E”** (tiempo de entrega), un dato que el contrato del reporte no
expone. Se reutilizó esa columna para el **descuento por partida**, que sí es
requisito de la issue. El tiempo de entrega sigue existiendo como texto fijo en
las condiciones comerciales (“ESPECIFICADA EN CADA PARTIDA”). Si ventas lo quiere
por renglón, hay que agregarlo como subcampo del grupo `items` y como columna.

Placeholders disponibles y **no** usados: `{{report.code}}`, `{{report.name}}`,
`{{report.description}}`, `{{report.category}}`, `{{report.template_version}}`,
`{{parameters.price_list_id}}`, `{{rows.tax}}`, `{{rows.total}}`.

## 4. Documento maestro: qué se conservó y qué no

Fuente: `BONATTI FILTROS LMR850205-048.xlsx` (cotización real ya llenada, no una
plantilla). Convertida con `codex/scripts/build_cotizacion_bonatti_template.py`.

Se conserva:

- anchos de columna (`A`–`K`, incluida la columna oculta `H`) y alturas de fila;
- fuentes Times New Roman/Calibri, negritas, subrayados y el relleno azul
  `FF9BC2E6` del encabezado de la tabla, más el banding de las partidas;
- formato de moneda `_-"$"* #,##0.00_-;…` en precio, importe, descuento y totales;
- todas las combinaciones seguras: `C1:G10` (zona del membrete), `E12:G12`,
  `B13:D13`, `B14:D14`, `B15:D15`, `C16:E16`, `C17:G17`, el bloque de totales y
  los bloques de condiciones comerciales y firma;
- los textos fijos: “Por medio de la presente…”, CONDICIONES COMERCIALES
  completas, nombre, puesto y móvil del representante;
- márgenes y orientación de la hoja.

**No se conserva: el membrete/logotipo.** En el archivo original la papelería de
Arefil no es una imagen normal sino una forma **VML heredada**
(`xl/drawings/vmlDrawing1.vml` → `xl/media/image1.jpeg`, 612×795 pt, es decir la
página completa). `openpyxl` no lee ni reescribe dibujos VML: cualquier plantilla
que pase por el renderer los pierde. Se probaron las dos salidas:

1. **sin membrete** (la que quedó activa): el cuerpo de la cotización se ve
   completo y correcto;
2. **con membrete re-anclado** como imagen DrawingML normal en `A1`
   (`--with-letterhead`): Excel y LibreOffice dibujan las imágenes *encima* de
   las celdas, así que la hoja se convierte en la papelería opaca y **el texto de
   la cotización desaparece**. Se verificó exportando a PDF con LibreOffice.

No se inventó un diseño alternativo (recortes, marcas de agua). **Lo que falta
para cerrar el punto 8 de la issue es un archivo que hoy no existe**: un XLSX
BONATTI cuyo membrete sea una imagen normal acotada a la banda del encabezado
(filas 1–10, el merge `C1:G10`), o bien la confirmación de ventas de que las
cotizaciones se imprimen sobre papelería preimpresa y el membrete digital no hace
falta. En cuanto exista, basta volver a correr el script de construcción: la
imagen anclada dentro del encabezado sí sobrevive a `openpyxl` y el renderer ya
sabe desplazar imágenes al expandir renglones (`_shift_anchored_objects`).

Otras limitaciones de fidelidad, todas heredadas del archivo original:

- `xl/printerSettings1.bin` y `calcChain.xml` se pierden al guardar con openpyxl
  (irrelevantes: el primero es la impresora del autor, el segundo es caché de
  fórmulas y la plantilla ya no lleva fórmulas);
- el original no tiene ajuste “fit to width”, así que la columna `G` (Precio
  Total) cae fuera de la primera página al imprimir. Se comprobó que ocurre
  **igual en el archivo original**, antes de cualquier conversión;
- la fecha se inserta como texto ISO (`2026-06-26`) porque el backend normaliza
  los parámetros `date` a cadena. Para verla como “26 de Junio del 2025” haría
  falta un cambio de contrato en el backend (entregar un `date` real), fuera del
  alcance de esta issue.

## 5. Pruebas de aceptación

`codex/scripts/verify_cotizacion_flow.py` corre el flujo completo contra el
backend real: preview → `execution_id` → documento → apertura del XLSX. Log
íntegro en `codex/output/cotizacion-bonatti/verificacion-e2e.log` (todo OK).

| # de la issue | Escenario | Resultado |
| --- | --- | --- |
| 1 | 1 producto sin descuento | OK · SUBTOTAL 59.00, DESCUENTO 0.00, IVA 9.44, TOTAL 68.44 |
| 2 | 1 producto con descuento | OK · totales del XLSX iguales al preview |
| 3 | 5 productos con descuentos 0/5/12.5/33.33/100 % | OK · SUBTOTAL 599.75, DESCUENTO 160.18, IVA 70.33, TOTAL 509.90 |
| 4 | 20 productos | OK · la hoja crece a 56 filas, totales en `F39:G42`, firma y condiciones desplazadas |
| 5 | Cambiar la cantidad invalida la ejecución | OK · el preview devuelve otro `execution_id`; en la UI cualquier edición borra la ejecución (`invalidateExecution`) y esconde el botón de descarga |
| 6 | Cambiar el precio en BD después del preview | OK · se subió el precio del producto 9 de 59.00 a 559.00; el documento del `execution_id` aprobado siguió mostrando 59.00 y **byte a byte idéntico** al descargado antes del cambio; un preview nuevo sí mostró 559.00. Precio restaurado. |
| 7 | Subtotal, descuento, IVA y total coinciden con el preview | OK · comparación celda por celda en los 4 escenarios |
| 8 | Logo, estilos, merges y formatos | Parcial · estilos, merges, banding y formatos de moneda OK; **logo no**, ver §4 |
| 9 | Nombre dinámico | OK · `Content-Disposition: attachment; filename="Bonatti_Mexico_SA_de_CV_LMR-850205-CONSTITUCIONES-048.xlsx"`. `sanitize_filename` convierte espacios en `_`; el ejemplo de la issue (`BONATTI FILTROS LMR850205-048.xlsx`) no puede llevar espacios con el contrato actual (Backend #26). |
| 10 | La plantilla maestra no se modifica | OK · sigue en versión 1 con el mismo checksum después de generar los 24 documentos de la corrida |

Extra: `execution_id` inexistente → 404 con mensaje en español.

### Validación en la UI real

- `/donaldson/reports/COTIZACION`: los siete parámetros se renderizan con su
  control correcto (select de lista, textos, `input[type=date]`), la búsqueda de
  productos resuelve contra la lista seleccionada, y la vista previa muestra los
  parámetros como chips (`Cliente`, `RFC`, `Atención a`, `Email`, `Requisición`,
  `Fecha`) junto a la tabla y los cuatro totales.
- `/administracion/reportes/COTIZACION`: “Nombre del archivo” muestra el patrón
  guardado y ofrece los 9 placeholders admitidos; “Plantilla Excel” aparece como
  **Configurada · v1** con 23 campos disponibles para la plantilla.

## 6. Cambios de código

Dos correcciones reales encontradas al recorrer el flujo (no se tocó la
arquitectura del renderer, del snapshot ni del builder):

1. `src/lib/reports/report-excel-template.ts` — el catálogo “Campos disponibles
   para la plantilla” omitía `{{rows.row_number}}` y `{{report.template_version}}`,
   que el backend sí acepta (`excel_template_validation.py::_allowed_keys` y
   `excel_renderer.py`). Un administrador no podía descubrir desde la UI el
   numerador nativo que esta misma issue exige usar.
2. `src/components/reports/report-definition-form.tsx` — mientras el catálogo de
   fuentes estaba cargando, la pantalla de configuración mostraba la alerta roja
   “Fuente no seleccionable” sobre un reporte perfectamente válido, porque la
   ausencia en una lista todavía `null` se leía como fuente faltante.

Ambas con prueba de regresión en sus suites.

## 7. Herramientas dejadas en el repo

- `codex/scripts/build_cotizacion_bonatti_template.py` — convierte el XLSX real
  en plantilla maestra (con `--with-letterhead` para reproducir el experimento
  del membrete).
- `codex/scripts/configure_cotizacion.py` — aplica parámetros, `filename_template`
  y sube la plantilla vía API.
- `codex/scripts/verify_cotizacion_flow.py` — corrida de aceptación end-to-end.
- `codex/output/cotizacion-bonatti/COTIZACION_BONATTI_v1.xlsx` — la plantilla
  maestra activa.
- `codex/output/cotizacion-bonatti/verificacion-e2e.log` — log de la corrida.

## 8. Validaciones

| Comando | Resultado |
| --- | --- |
| `npm test` | 23 archivos, 214 pruebas, todas pasan |
| `npm run lint` | sin hallazgos |
| `npm run typecheck` | sin errores |
| `npm run build` | build de producción correcto |
| `pytest` (Arefil_backend) | 237 pruebas, todas pasan |
