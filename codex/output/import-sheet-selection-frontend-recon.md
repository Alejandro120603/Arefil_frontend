# Recon: selección de hoja de Excel en el importador Donaldson

Alcance: solo reconocimiento y diseño. No se modificó código funcional, no se hizo commit/push/PR.

Archivos inspeccionados (código real, no supuestos):

- `src/app/donaldson/import/page.tsx`
- `src/components/donaldson/import-dropzone.tsx`
- `src/components/donaldson/selected-file-card.tsx`
- `src/components/donaldson/import-preview-summary.tsx`
- `src/components/donaldson/import-issues-panel.tsx`
- `src/components/donaldson/import-products-sample-table.tsx`
- `src/components/donaldson/import-result.tsx`
- `src/lib/api/imports.ts`
- `src/lib/api/client.ts`, `src/lib/api/browser-client.ts`, `src/lib/api/server-client.ts`
- `src/lib/api/errors.ts`
- `src/types/api.ts`
- `src/app/backend-api/[...path]/route.ts` y `route.test.ts`
- `src/lib/api/client.test.ts`, `src/lib/api/api-context.test.ts`
- `src/components/ui/*` (select, label, button, card, alert, etc.)
- `vitest.config.mts`, `package.json`

---

## 1. Estado actual

El importador Donaldson es una única página cliente (`"use client"`) con estado local vía `useReducer`. No hay backend Next (server actions), todo pasa por `fetch` desde el navegador hacia `/backend-api/*`, que es un proxy transparente (`route.ts`) hacia `API_INTERNAL_URL`.

No existe hoy ningún concepto de "hoja de Excel" en el frontend: ni en tipos (`src/types/api.ts`), ni en el cliente API (`src/lib/api/imports.ts`), ni en la UI. El backend recibe el archivo completo y decide internamente qué procesar.

`getImportJob()` (`src/lib/api/imports.ts:11`, `GET /imports/{id}`) está definido pero **no se usa en ningún lugar** del código ni de los tests — es la única pista de un endpoint de detalle de `ImportJob` que hoy no participa en el flujo de UI.

No existen tests de componentes/UI para este flujo (ver sección 10 y 12): solo hay tests de lógica pura sobre el cliente HTTP y el proxy.

---

## 2. Flujo actual

```text
1. Usuario entra a /donaldson/import
2. ImportDropzone: selecciona/arrastra un .xlsx
   - validación cliente: solo extensión ".xlsx" (import-dropzone.tsx:10-12)
   - dispatch SELECT_FILE -> phase "selected"
3. Se muestra SelectedFileCard + botón "Analizar archivo"
4. handleAnalyze(file) -> dispatch ANALYZE_START (phase "uploading")
   -> previewDonaldsonImport(file)
      = POST /backend-api/imports/donaldson/preview
        (multipart FormData, campo "file")
   -> respuesta ImportPreviewResponse
   -> dispatch ANALYZE_SUCCESS
      phase = "preview-ready" si summary.errors === 0
      phase = "preview-with-errors" si summary.errors > 0
5. Se renderizan: ImportPreviewSummary, ImportProductsSampleTable, ImportIssuesPanel
6. Botón "Confirmar importación" habilitado solo si preview.summary.errors === 0
   -> handleConfirm() -> dispatch CONFIRM_START (phase "confirming")
      -> confirmImport(preview.import_id) = POST /imports/{id}/confirm
      -> dispatch CONFIRM_SUCCESS -> phase "success", vuelve a initialState + result
7. ImportResult: muestra stats de creación + link a /donaldson/price-lists/{id}
   + botón "Importar otra lista" (dispatch RESET)
```

Errores en cualquier punto (`ANALYZE_ERROR` / `CONFIRM_ERROR`) van a `phase: "error"` y se muestran en un `<Alert variant="destructive">`, sin perder el archivo seleccionado (el archivo sigue en `state.file`, se puede reintentar "Analizar archivo").

**Duplicados**: `previewDonaldsonImport` puede fallar con 409; `getDuplicateImportDetail()` (`imports.ts:30`) detecta el shape `{ message, existing_import_id }` y la página muestra una referencia al `ImportJob` existente, aclarando en un comentario (`imports.ts:19-24`) que el backend no expone cómo resolver ese `ImportJob` a una `PriceList`, así que **no se debe** convertir eso en un link navegable.

**Cambiar archivo**: `SelectedFileCard.onChangeFile` dispatcha `CLEAR_FILE`, que resetea a `initialState` completo (`page.tsx:62-63`) — no queda estado residual hoy. Este es el comportamiento a preservar cuando se añada selección de hoja.

---

## 3. Máquina de estados actual

Fuente de verdad: `type Phase` en `page.tsx:19-27`.

```text
idle                 -> sin archivo
selected             -> archivo elegido, aún no analizado
uploading            -> POST /imports/donaldson/preview en curso
preview-ready        -> preview OK, summary.errors === 0
preview-with-errors  -> preview OK, summary.errors > 0 (confirmar deshabilitado)
confirming           -> POST /imports/{id}/confirm en curso
success              -> confirmación OK
error                -> analyze o confirm fallaron (error.context distingue cuál)
```

Transiciones relevantes:
- `SELECT_FILE` siempre resetea a `initialState` + el nuevo archivo (evita estado sucio de un análisis previo).
- `CLEAR_FILE` y `RESET` vuelven a `initialState`.
- No hay transición intermedia entre "selected" y "uploading" para inspeccionar el workbook.

### Evolución mínima propuesta

No hace falta reinventar la máquina; basta con **insertar una fase opcional entre "selected" y "uploading"**, y diferenciar "análisis en curso" en dos micro-fases si el contrato lo requiere (ver sección 4). Propuesta mínima, evaluada contra el flujo real:

```text
idle
selected              (sin cambio)
inspecting            (NUEVO, opcional según Opción elegida en §4)
sheet-selection       (NUEVO, solo si el workbook tiene 2+ hojas)
uploading             (sin cambio semántico: ahora es "analizando la hoja elegida")
preview-ready
preview-with-errors
confirming
success
error
```

Justificación de nombres:
- No renombrar `uploading`/`preview-ready`/etc.: son consumidos únicamente dentro de `page.tsx`, no hay contrato externo que romper, y minimizar el diff reduce riesgo.
- `sheet-selection` es un estado real y visible (bloquea "Analizar" hasta elegir), merece su propia fase en vez de una bandera booleana colgada de `selected`.
- Si se adopta la Opción C (recomendada, ver §4), `inspecting` puede ni existir como fase separada: la detección de hojas ocurre como parte de la misma llamada que hoy dispara `uploading`, y la respuesta simplemente bifurca hacia `sheet-selection` o `preview-ready`. Se detalla en §4/§6.

Regla de invalidación: **cualquier cambio de hoja elegida o de archivo debe destruir el preview anterior** (nunca mostrar un preview calculado con otra hoja). Esto ya es gratis si se sigue el patrón de `SELECT_FILE`/`CLEAR_FILE`: cualquier acción de "cambiar selección" debe volver a un estado sin `preview`.

---

## 4. Cuándo debe hacerse la inspección

### Contrato actual

Hoy solo existe `POST /imports/donaldson/preview` (multipart, campo `file`) devolviendo directamente `ImportPreviewResponse` con `import_id`. No hay endpoint de inspección, y no hay evidencia en el frontend de que el backend persista el archivo original de forma reutilizable por múltiples llamadas (no hay un `upload_id`, `file_token` ni similar en ningún tipo actual).

### Opción A — upload → inspect → preview (dos llamadas separadas)

```text
POST /imports/donaldson/inspect  (sube el archivo, devuelve {filename, sheets[]})
POST /imports/donaldson/preview  (sube el archivo OTRA VEZ + sheet_name)
```

Problema: si el backend no cachea el archivo entre ambas llamadas (no hay evidencia de que lo haga), esto implica **subir el Excel dos veces** — coste real en archivos grandes y, peor, riesgo de time-of-check/time-of-use: el usuario podría, entre la inspección y el preview, seleccionar un archivo distinto en su disco con el mismo nombre. También duplica la superficie de validación de duplicados (409): ¿el `/inspect` también debe detectar duplicados, o solo `/preview`? Si solo preview, un archivo duplicado se descubre tarde, después de ya haber mostrado el selector de hoja.

### Opción B — preview inicial → backend pide selección → preview de nuevo

```text
POST /imports/donaldson/preview (sin sheet_name)
  -> si 1 hoja: procede normal, responde ImportPreviewResponse tal cual hoy
  -> si 2+ hojas: responde algo tipo 409/422 "sheet selection required" + sheets[]
POST /imports/donaldson/preview (con sheet_name) -> ImportPreviewResponse
```

Esto **también sube el archivo dos veces** en el caso multi-hoja (una vez para descubrir hojas, otra para analizar la elegida), con el mismo problema de TOCTOU si no se fuerza al usuario a reutilizar el mismo `File` object ya en memoria del navegador (que sí es factible en el frontend: el `File` sigue en `state.file`, no hace falta volver a pedirlo al usuario). Es decir, el doble-upload es del mismo blob en memoria, no un re-select del usuario — mitiga el riesgo de "archivo distinto" pero no el de ancho de banda/latencia duplicada.

Diferencia clave con A: **un solo endpoint**, un solo contrato de respuesta ya conocido por el frontend (`ImportPreviewResponse`), extendido con un caso de "falta elegir hoja". Reutiliza el pipeline de duplicados/errores que ya existe hoy en `/preview` sin definir un endpoint paralelo con sus propias reglas.

### Opción C — igual que B pero explícita en el shape de respuesta, sin código de error especial (recomendada)

En vez de señalizar "selección requerida" con un status code no-2xx (409/422), que en este backend ya está semánticamente ocupado por duplicados y validación de columnas respectivamente, el endpoint de preview responde **200 OK con una unión discriminada**:

```text
POST /imports/donaldson/preview (sin sheet_name, o con sheet_name)
  -> 200 { requires_sheet_selection: true, filename, sheets: string[] }
  -> 200 { requires_sheet_selection: false, ...ImportPreviewResponse actual }
```

Esto es una variante de B, pero evita mezclar "necesito más input del usuario" (flujo normal) con "algo salió mal" (error HTTP). Es más simple de tipar en el frontend con un discriminated union de TypeScript y más fácil de testear (no hay que simular códigos de estado HTTP no estándar para un caso que no es un error).

### Recomendación

**Opción C** (variante 200/discriminada de B). Motivos, revisando el impacto real en este código:

1. **No sube el archivo dos veces desde el usuario**: el mismo `File` en `state.file` se reenvía en la segunda llamada (si hace falta), sin pedir al usuario que vuelva a seleccionarlo. El "doble envío" es interno (mismo blob, dos requests HTTP), aceptable y ya es como se comporta hoy un reintento de "Analizar archivo" tras un error.
2. **Un solo endpoint, un solo lugar de validación de duplicados**: el chequeo de 409 (`existing_import_id`) sigue viviendo exclusivamente en `/imports/donaldson/preview`, sin duplicar esa lógica en un endpoint `/inspect` separado. Con Opción A habría que decidir en qué llamada se detecta el duplicado, y probablemente en las dos.
3. **No hay `ImportJob` antes de tiempo**: hoy `import_id` nace junto con el `ImportPreviewResponse` completo (`types/api.ts:119-120`). Si `/inspect` creara un `ImportJob` solo para listar hojas, habría que decidir qué pasa con ese job si el usuario cambia de archivo sin analizar — otro job huérfano en estado `UPLOADED`. Con Opción C, mientras `requires_sheet_selection: true`, **no hace falta que exista un `ImportJob` real todavía**; se puede posponer su creación al momento en que ya se conoce la hoja definitiva. Esto es responsabilidad del backend, pero es la señal que el frontend necesita para no tener que "limpiar" jobs a medias.
4. **Encaja con la máquina de estados mínima**: `sheet-selection` es simplemente lo que se pinta cuando `previewDonaldsonImport()` devuelve `requires_sheet_selection: true`, sin necesitar una fase `inspecting` separada ni un segundo cliente API.
5. **Caso de 1 sola hoja queda transparente**: la llamada única a preview (sin `sheet_name`, o el backend la infiere) devuelve directamente el resultado de siempre — cero pasos extra, que es el requisito explícito del ticket.

Si el equipo de backend prefiere no mezclar shapes en el mismo endpoint por razones propias (ej. límites de OpenAPI/documentación), la alternativa aceptable es Opción B con status 422 reutilizando el mecanismo de error ya existente (`detail` object con `message` + `sheets`), ya que `ApiError`/`getErrorMessage` ya sabe extraer `detail.message` de un objeto (`errors.ts:37-39`) — pero entonces el frontend tendría que tratar ese 422 como un caso especial "no es un error real", lo cual ensucia el manejo de errores actual (`ANALYZE_ERROR` asume que todo lo que no es 200 es un fallo mostrable en rojo). Por eso se prefiere 200 con discriminante explícito.

---

## 5. Compatibilidad — qué NO debe tocarse

No deben modificarse (más allá de lo estrictamente necesario para enviar `sheet_name` y leer el nuevo discriminante):

- `ImportPreviewSummary`, `ImportProductsSampleTable`, `ImportIssuesPanel`, `ImportResult` — consumen `ImportPreviewResponse`/`ImportConfirmResult` tal cual existen hoy; no cambian de forma.
- `confirmImport()` (`imports.ts:15`) y el flujo de confirmación completo — no depende de la hoja, solo de `import_id`.
- El manejo de duplicados (`getDuplicateImportDetail`) y de errores genéricos (`ApiError`, `getErrorMessage`) — se reutilizan tal cual.
- El proxy `/backend-api/[...path]/route.ts` — es agnóstico al payload, no necesita cambios (multipart sigue siendo multipart, solo se añade un campo de texto `sheet_name` al `FormData`).
- Docker / `make run_panel` — no hay nada en el flujo de importación que dependa de configuración de contenedor; el cambio es puramente de UI + contrato HTTP existente.
- `ImportDropzone` — la validación de extensión `.xlsx` y drag&drop no cambian.
- Navegación a `/donaldson/price-lists/[id]` desde `ImportResult` — no se toca.

Sí cambia necesariamente: `page.tsx` (la máquina de estados y el render condicional), `imports.ts` (firma de `previewDonaldsonImport`), `types/api.ts` (nuevo tipo de respuesta), y `SelectedFileCard` posiblemente necesita un pequeño ajuste de copy/label si se reutiliza también para "cambiar de hoja" (ver §7).

---

## 6. Tipos y contrato API necesarios

### Tipos nuevos propuestos (`src/types/api.ts`)

En lugar de introducir un tipo `WorkbookInspection` separado con su propio endpoint (que implicaría Opción A), se propone integrar la señal de "selección requerida" **dentro de la respuesta de preview**, como discriminated union:

```ts
export interface SheetSelectionRequired {
  requires_sheet_selection: true;
  filename: string;
  sheets: string[];
}

export interface ImportPreviewReady extends ImportPreviewResponse {
  requires_sheet_selection: false;
}

export type ImportPreviewOutcome = SheetSelectionRequired | ImportPreviewReady;
```

Notas:
- `ImportPreviewResponse` (tipo actual) queda intacto; `ImportPreviewReady` solo le añade el discriminante literal `false`. Esto minimiza el blast radius sobre los componentes de preview que ya reciben `ImportPreviewResponse` como prop (siguen recibiendo exactamente ese shape).
- Si el backend prefiere no anidar y usar un campo `status`/`kind` en vez de un booleano, el frontend debe adaptarse a esa convención — pero el patrón de discriminated union es lo mínimo necesario para tipar correctamente en TS sin `as` casts.
- No se necesita un tipo `WorkbookInspection` independiente si se adopta la Opción C, porque no hay un endpoint de inspección separado que devuelva eso de forma aislada.

### Cambios en `src/lib/api/imports.ts`

```ts
export function previewDonaldsonImport(
  file: File,
  sheetName?: string,
): Promise<ImportPreviewOutcome> {
  const formData = new FormData();
  formData.append("file", file);
  if (sheetName) formData.append("sheet_name", sheetName);
  return browserApiClient.apiUpload<ImportPreviewOutcome>("/imports/donaldson/preview", formData);
}
```

- Firma retrocompatible: `sheetName` opcional, así que la llamada para el caso "1 hoja" (o "aún no sé cuántas hojas hay") no cambia en el call site salvo por el tipo de retorno.
- El caso de error "hoja inválida" (§7) se sigue resolviendo con el mecanismo de `ApiError` existente si el backend lo modela como 422/409 — no requiere un tipo nuevo, solo que el `detail.message` sea legible (ya soportado por `formatDetail` en `errors.ts:37-39`).

---

## 7. Validaciones frontend

| Caso | Comportamiento propuesto |
|---|---|
| `sheets` con 1 elemento (o `requires_sheet_selection: false` directo) | No mostrar selector. Se pasa directo a preview-ready/with-errors, igual que hoy. |
| `sheets` con 2+ elementos | Nueva fase `sheet-selection`: lista de opciones (una por hoja), ninguna preseleccionada, botón "Analizar hoja" deshabilitado hasta elegir una. |
| `sheets` vacío / workbook corrupto | El backend debería devolver un error normal (422/400) en la misma llamada de preview; se muestra con el `Alert` de error ya existente (`state.error`, contexto `"analyze"`), sin inventar un tercer tipo de error en el frontend. |
| Usuario selecciona otra hoja en el selector | El `import_id` de un preview anterior (si existía) queda descartado: se debe limpiar `preview` del estado antes de re-analizar, para que nunca se muestre un preview de una hoja distinta a la seleccionada. En la práctica, como todavía no hay `preview` en la fase `sheet-selection` (por Opción C, el preview real llega después de elegir hoja), esto es automático: no hay nada que invalidar porque el preview aún no existía. |
| Usuario cambia el archivo (`Cambiar archivo`) | Reset completo: igual que `CLEAR_FILE` hoy — se pierde `sheets` elegidas, hoja seleccionada, y cualquier preview. Ya es el comportamiento de `CLEAR_FILE` (`page.tsx:62-63`), solo hay que asegurarse de que el nuevo campo de estado (`selectedSheet`) se limpie también, lo cual es gratis si se guarda dentro del mismo objeto de estado reseteado por `initialState`. |
| Backend rechaza la hoja elegida (ej. "Cancelados" no tiene encabezados válidos) | **Viable con la Opción C**: como no se ha creado un `ImportJob` "real" todavía en la fase de selección (ver §4 punto 3), el error de "hoja inválida" es simplemente un error de la llamada de preview con `sheet_name="Cancelados"`. El frontend debe: (a) mantener el archivo y la lista de `sheets` ya conocida, (b) volver a la fase `sheet-selection` en vez de a `error` genérico o a `idle`, permitiendo elegir otra hoja sin re-subir el archivo ni perder el listado de hojas. Esto requiere un pequeño ajuste al reducer: un error de preview mientras había `sheets` conocidas debe volver a `sheet-selection` con un mensaje de error inline, no a la fase `error` de pantalla completa que hoy se usa para fallos de red/servidor genéricos. |

---

## 8. Tests

### Estado actual de testing (hallazgo relevante para el diseño)

- `vitest.config.mts` usa `environment: "node"` (no `jsdom`).
- No hay `@testing-library/react` ni `jsdom` en `devDependencies`.
- Los tests existentes (`client.test.ts`, `api-context.test.ts`, `route.test.ts`) son **tests de lógica pura**: mockean `fetch` y verifican funciones (`buildApiUrl`, `createApiClient`, el proxy `route.ts`), nunca renderizan un componente React.
- **No existe hoy ningún test para `page.tsx` ni para ningún componente de `src/components/donaldson/`.**

Esto es un bloqueo parcial (ver §12): para tests de comportamiento de UI (radio buttons, botón deshabilitado, etc.) haría falta añadir `jsdom` + `@testing-library/react` al proyecto, lo cual es una decisión de infraestructura de testing, no parte de esta feature. La alternativa que no requiere esa dependencia nueva es extraer la lógica de la máquina de estados (el `reducer` y las funciones de derivación de hojas) a funciones puras testeables sin renderizar React, siguiendo exactamente el patrón que ya usa el resto del repo.

### Propuesta de tests (nivel lógica pura, sin nueva infraestructura)

| Archivo | Tipo | Mocks | Verifica |
|---|---|---|---|
| `src/lib/api/imports.test.ts` (nuevo) | unit, `apiUpload` mockeado vía `vi.stubGlobal("fetch", ...)` como en `client.test.ts` | `fetch` global | `previewDonaldsonImport(file)` sin `sheetName` no agrega `sheet_name` al FormData; con `sheetName` sí lo agrega con el valor correcto; el retorno tipado incluye `requires_sheet_selection`. |
| `src/app/donaldson/import/page.reducer.test.ts` (nuevo, requiere extraer `reducer`/`initialState`/`Action` a un módulo separado, p.ej. `page.reducer.ts`, importado tanto por `page.tsx` como por el test) | unit puro | ninguno | 1 hoja → una acción de tipo `ANALYZE_SUCCESS` con `requires_sheet_selection:false` va directo a `preview-ready`/`preview-with-errors`, nunca pasa por `sheet-selection`. |
| (mismo archivo) | unit puro | ninguno | 2+ hojas → `ANALYZE_SUCCESS` con `requires_sheet_selection:true` transiciona a `sheet-selection` guardando `sheets` en el estado. |
| (mismo archivo) | unit puro | ninguno | Estando en `sheet-selection` sin hoja elegida, no existe una acción válida de "confirmar selección" (o el reducer la ignora) — equivalente a "selección requerida antes de analizar". |
| (mismo archivo) | unit puro | ninguno | Elegir una hoja y disparar el re-análisis produce una llamada con `sheet_name` igual al nombre elegido (se verifica indirectamente: el `Action` de re-análisis lleva el nombre de hoja seleccionado en el reducer, y por separado un test de integración de `handleAnalyze`/`imports.test.ts` verifica que ese valor llega al `FormData`). |
| (mismo archivo) | unit puro | ninguno | `CLEAR_FILE`/cambiar archivo desde cualquier fase (incluida `sheet-selection`) vuelve a `initialState` completo — `sheets`/hoja elegida no sobreviven. |
| (mismo archivo) | unit puro | ninguno | Un error de preview mientras `sheets` ya eran conocidas (hoja inválida) vuelve a `sheet-selection` con mensaje de error, no a la fase `error` genérica; el archivo y `sheets` se conservan en el estado. |
| (mismo archivo) | unit puro | ninguno | Un `ANALYZE_SUCCESS`/`ANALYZE_ERROR` con preview ya existente (regresión) sigue funcionando exactamente igual que hoy — reutilizar los casos ya implícitos en el reducer actual (`preview-ready` vs `preview-with-errors` según `summary.errors`). |
| (mismo archivo) | unit puro | ninguno | `CONFIRM_SUCCESS`/`CONFIRM_ERROR` sin cambios de comportamiento (regresión del flujo de confirmación actual). |

Si en el futuro se decide invertir en tests de UI reales (render + click), sería necesario:
1. Añadir `jsdom` y `@testing-library/react` a `devDependencies`.
2. Configurar `environment: "jsdom"` (posiblemente vía `environmentMatchGlobs` para no afectar los tests de node existentes).
3. Solo entonces escribir tests tipo "no muestra selector con 1 hoja" / "muestra selector con 2 hojas" a nivel componente. Esto es una decisión de alcance mayor que esta feature — se señala como opcional, no bloqueante, porque la cobertura de comportamiento se puede lograr igual extrayendo el reducer.

---

## 9. Impacto archivo por archivo

| Archivo | Estado | Cambio propuesto | Motivo |
|---|---|---|---|
| `src/app/donaldson/import/page.tsx` | modificar | Añadir fase `sheet-selection`, nuevas acciones (`SHEETS_REQUIRED`, `SELECT_SHEET`, ajuste de `ANALYZE_ERROR` para volver a `sheet-selection` si aplica), render condicional del selector | Es donde vive la máquina de estados y la orquestación del flujo |
| `src/app/donaldson/import/page.reducer.ts` | nuevo | Extraer `Phase`, `ImportState`, `Action`, `reducer`, `initialState` de `page.tsx` a un módulo puro | Permite testear la lógica sin renderizar React (ver §8) |
| `src/lib/api/imports.ts` | modificar | `previewDonaldsonImport(file, sheetName?)`; tipo de retorno `ImportPreviewOutcome` | Necesario para enviar `sheet_name` y tipar la respuesta discriminada |
| `src/types/api.ts` | modificar | Añadir `SheetSelectionRequired`, `ImportPreviewReady`, `ImportPreviewOutcome` | Contrato nuevo mínimo (§6) |
| `src/components/donaldson/sheet-selector.tsx` | nuevo | Componente de selección única de hoja (radio-like) + botón "Analizar hoja" deshabilitado sin selección | UI pedida en el ticket, aislada como componente propio siguiendo el patrón existente (un componente por responsabilidad, como `ImportDropzone`/`SelectedFileCard`) |
| `src/components/ui/radio-group.tsx` | posible (nuevo) | Añadir vía `npx shadcn add radio-group` si se opta por radio buttons reales | Hoy no existe ningún componente de radio en `src/components/ui/` (solo `select.tsx`, que es un dropdown, no radios visibles); el mockup del ticket muestra radios explícitos |
| `src/components/donaldson/selected-file-card.tsx` | posible (modificar) | Ajuste menor de copy si se reutiliza el mismo botón "Cambiar archivo" también desde `sheet-selection` | Evita duplicar el componente de "archivo seleccionado + cambiar" |
| `src/components/donaldson/import-dropzone.tsx` | sin cambio | — | Selección de archivo no depende de hojas |
| `src/components/donaldson/import-preview-summary.tsx` | sin cambio | — | Consume `ImportPreviewResponse`, shape intacto |
| `src/components/donaldson/import-issues-panel.tsx` | sin cambio | — | Idem |
| `src/components/donaldson/import-products-sample-table.tsx` | sin cambio | — | Idem |
| `src/components/donaldson/import-result.tsx` | sin cambio | — | Confirmación no depende de hoja |
| `src/lib/api/errors.ts` | sin cambio | — | El manejo de `detail.message`/validación ya cubre el caso de "hoja inválida" como error normal |
| `src/lib/api/client.ts`, `browser-client.ts`, `server-client.ts` | sin cambio | — | Transporte genérico, agnóstico al payload |
| `src/app/backend-api/[...path]/route.ts` | sin cambio | — | Proxy agnóstico, ya soporta multipart |
| `src/lib/api/imports.test.ts` | nuevo | Ver §8 | Cobertura del nuevo parámetro `sheet_name` |
| `src/app/donaldson/import/page.reducer.test.ts` | nuevo | Ver §8 | Cobertura de la máquina de estados extendida |
| `vitest.config.mts` | sin cambio (a menos que se decida invertir en tests de UI, ver §8) | — | Los tests propuestos no requieren jsdom |

---

## 10. Riesgos

| Riesgo | Prioridad | Detalle |
|---|---|---|
| Confirmar con la hoja "equivocada" (usuario cambia de idea después de elegir) | Alto | Si el `import_id` usado en `confirmImport` no corresponde exactamente a la última hoja analizada, se importaría la hoja incorrecta. Mitigación: `state.preview` (con su `import_id`) solo debe existir tras un preview exitoso de la hoja actualmente seleccionada; cualquier cambio de hoja debe invalidar `preview` antes de permitir un nuevo análisis. |
| Estado inconsistente entre "hojas conocidas" y "preview" tras un error de hoja inválida | Alto | Si el reducer no distingue "error de preview con sheets conocidas" de "error genérico", se puede perder la lista de hojas y forzar un re-upload innecesario. Se aborda explícitamente en §7/§9. |
| Doble upload del mismo Excel (Opción B/C cuando hay 2+ hojas) | Medio | Con archivos grandes, dos requests HTTP del mismo blob implican latencia/ancho de banda duplicados. Aceptado como trade-off consciente (mismo blob en memoria, sin re-pedir el archivo al usuario); si se vuelve un problema real, requeriría que el backend soporte staging del archivo (fuera de alcance de esta fase). |
| Cambio de contrato incompatible con clientes/backend actuales | Medio | Si el backend cambia el shape de `/preview` sin el discriminante `requires_sheet_selection` (p. ej. usa un código HTTP no estándar), el frontend recomendado en §4 no aplica tal cual y hay que revisar el manejo de errores en `page.tsx`/`errors.ts`. |
| Importaciones duplicadas cuando el duplicado se detecta según archivo pero no según hoja | Medio | Si el backend detecta duplicados por archivo completo (hash) y no por combinación archivo+hoja, re-analizar una hoja distinta del mismo archivo podría marcarse como duplicado incorrectamente, o al revés, no detectar que ya se importó esa hoja antes. Es una decisión de backend a validar antes de implementar, no bloquea el diseño frontend pero sí el comportamiento esperado en `getDuplicateImportDetail`. |
| Regresión en el flujo de 1 sola hoja (fricción nueva no deseada) | Medio | Si el backend siempre exige `sheet_name` explícito (incluso con 1 hoja) en vez de inferirlo, el frontend tendría que hacer una llamada de "solo listar hojas" primero incluso en el caso simple, rompiendo el requisito de "cero pasos extra". Se debe confirmar con backend que el caso de 1 hoja no requiere `sheet_name` en la request. |
| Tamaño de archivo / archivos grandes | Bajo | No cambia respecto a hoy: sigue siendo un único `POST` multipart por intento de análisis; el único delta es un posible segundo POST si hay selección de hoja, ya cubierto como riesgo "Medio" arriba. |
| Falta de tests de UI reales (jsdom/testing-library) | Bajo | No bloquea la implementación de esta feature (se puede cubrir con tests de reducer puro), pero es deuda de testing preexistente en todo el árbol de componentes `donaldson/`, no introducida por este cambio. |

---

## 11. Recomendación de implementación

- **¿Dónde se detectan las hojas?** En el backend, como parte de la misma llamada `POST /imports/donaldson/preview` (Opción C, §4). El frontend nunca parsea el Excel.
- **¿Cuándo se pregunta al usuario?** Solo cuando la respuesta de esa llamada trae `requires_sheet_selection: true` (2+ hojas). Con 1 hoja, la misma llamada ya devuelve el preview completo — cero pasos extra, tal como pide el ticket.
- **¿Qué guarda el frontend?** En el estado de `page.tsx` (vía el reducer extraído): el `File` original (como ya hoy), la lista `sheets: string[]` recibida cuando aplica, y la hoja elegida por el usuario (`selectedSheet: string | null`). Nada de esto se persiste fuera de la sesión de la página — mismo modelo que hoy.
- **¿Qué manda al backend?** El mismo archivo (`FormData` con `file`) más, opcionalmente, `sheet_name` cuando el usuario ya eligió una. La primera llamada (antes de saber cuántas hojas hay) se hace sin `sheet_name`; si el backend responde pidiendo selección, la segunda llamada reenvía el mismo `File` en memoria junto con `sheet_name`.
- **¿Cómo continúa el preview actual?** Sin cambios de componentes: en cuanto la respuesta trae `requires_sheet_selection: false`, es literalmente el `ImportPreviewResponse` de siempre y se renderiza con `ImportPreviewSummary`/`ImportProductsSampleTable`/`ImportIssuesPanel` tal cual existen hoy.
- **¿Qué ocurre con 1 hoja?** El usuario nunca ve un selector; el botón "Analizar archivo" lleva directo a la fase de preview, igual que hoy.
- **¿Qué ocurre con 2+ hojas?** Tras pulsar "Analizar archivo", en vez de preview se muestra el nuevo componente de selección (`sheet-selector.tsx`) con las hojas listadas, ninguna preseleccionada, y un botón "Analizar hoja" deshabilitado hasta elegir una. Al elegir y confirmar, se repite la llamada de preview con `sheet_name`.
- **¿Qué pasa si la hoja elegida es inválida?** El frontend permanece en la fase de selección de hoja (no vuelve a `idle`, no pide re-subir el archivo), muestra el mensaje de error del backend inline, y dejar la lista de hojas disponible para que el usuario elija otra.

### Decisiones de esta fase que facilitan (sin añadir complejidad ahora) mejoras futuras

- Modelar `sheets` como `string[]` simple (no objetos con roles) mantiene la puerta abierta a que, en una fase futura, cada entrada de `sheets` se convierta en `{ name, role }` sin romper el discriminated union — solo se ampliaría el tipo, no se reemplazaría.
- No crear un `ImportJob` hasta tener una hoja definitiva (Opción C) evita tener que "limpiar" jobs huérfanos si en el futuro se permite cancelar la selección de hoja a medio camino, o si se añade soporte a múltiples proveedores con sus propios flujos de inspección.
- Extraer el reducer a un módulo separado (`page.reducer.ts`) no es solo para testear esta feature: dejar la máquina de estados en un archivo propio facilita agregar, más adelante, estados adicionales (p. ej. mapeo de columnas) sin que `page.tsx` crezca de forma descontrolada.

---

## 12. Acceptance criteria propuestos

1. Subir un `.xlsx` con una sola hoja: tras pulsar "Analizar archivo", el usuario ve el preview directamente, sin ningún paso ni pantalla de selección de hoja.
2. Subir un `.xlsx` con 2+ hojas: tras pulsar "Analizar archivo", el usuario ve una lista de las hojas detectadas (nombres exactos del workbook), ninguna preseleccionada.
3. El botón para continuar desde la selección de hoja permanece deshabilitado hasta que se elige exactamente una hoja.
4. Al elegir una hoja y confirmar, la request de preview enviada al backend incluye `sheet_name` igual al nombre exacto de la hoja elegida por el usuario.
5. El preview mostrado tras elegir hoja usa los mismos componentes y el mismo shape de datos (`ImportPreviewSummary`, `ImportProductsSampleTable`, `ImportIssuesPanel`) que el flujo actual de una sola hoja — sin diferencias visuales.
6. "Cambiar archivo" desde cualquier punto del flujo (incluida la pantalla de selección de hoja) resetea completamente el estado: no quedan hojas, selección ni preview residuales de un archivo anterior.
7. Si el backend rechaza la hoja elegida por no contener una lista de precios válida, el usuario permanece en la pantalla de selección de hoja (con el archivo y la lista de hojas intactos) y ve el mensaje de error del backend, pudiendo elegir otra hoja sin re-subir el archivo.
8. El flujo de confirmación (`Confirmar importación`) y su resultado (`ImportResult`, navegación a la lista de precios) no cambian de comportamiento respecto al estado actual, para ninguno de los dos casos (1 hoja o 2+ hojas).
9. El manejo de duplicados (409 con `existing_import_id`) sigue funcionando igual que hoy, independientemente de si el archivo tenía 1 o varias hojas.
10. No se introducen regresiones en `src/app/backend-api/[...path]/route.ts`, Docker, ni `make run_panel` — el cambio es exclusivamente de UI + contrato de datos ya proxied.

---

## Resumen ejecutivo

El importador Donaldson actual es una página cliente simple con una máquina de estados clara (`idle → selected → uploading → preview-ready/with-errors → confirming → success/error`) y un único endpoint de análisis (`POST /imports/donaldson/preview`) que hoy no tiene ningún concepto de "hoja de Excel". No existe endpoint de inspección, no existe tipo de hoja en `types/api.ts`, y no hay tests de UI para este flujo (solo tests de lógica de red/proxy).

La recomendación es **no crear un endpoint `/inspect` separado**: extender la respuesta de `POST /imports/donaldson/preview` con un discriminante `requires_sheet_selection` (Opción C), de forma que el caso de 1 sola hoja quede exactamente igual que hoy (cero pasos extra) y el caso de 2+ hojas simplemente muestre una nueva fase `sheet-selection` antes de repetir la misma llamada con `sheet_name`. Esto evita duplicar la lógica de detección de duplicados en dos endpoints, evita crear `ImportJob`s huérfanos, y permite que un rechazo de hoja inválida se recupere sin perder el archivo ni la lista de hojas ya conocida.

El cambio de frontend es acotado: `page.tsx` (máquina de estados, mejor extraída a un reducer testeable por separado), `imports.ts` (nuevo parámetro `sheet_name` opcional), `types/api.ts` (union discriminada nueva), y un componente nuevo de selección de hoja — reutilizando el resto de componentes de preview/confirmación/errores sin tocarlos. La única pieza de UI que falta en el kit de shadcn es un componente de radio button (`radio-group`), fácilmente instalable con `npx shadcn add radio-group` dado que `shadcn` ya es una dependencia del proyecto.

**Veredicto: `LISTO PARA IMPLEMENTAR SELECCIÓN DE HOJA`**, condicionado a un único punto de validación previa con backend (no bloqueante para diseñar, sí para codear): confirmar que el contrato de `/imports/donaldson/preview` puede extenderse con el discriminante `requires_sheet_selection` (o equivalente) sin exigir `sheet_name` en el caso de una sola hoja, y que la detección de duplicados sigue aplicándose de forma coherente por archivo+hoja. No hay ningún bloqueo del lado del frontend: la arquitectura actual (estado local por reducer, cliente API delgado, componentes de preview desacoplados del origen de los datos) soporta el cambio sin rediseño.
