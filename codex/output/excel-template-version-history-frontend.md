# Historial y restauración de plantilla XLSX — frontend #32

## Alcance

Agrega un historial de versiones de la plantilla Excel, consultable y restaurable, a `ReportExcelTemplateCard` (la
administración del reporte, `/administracion/reportes/[code]`) y al editor visual (`/administracion/reportes/[code]/plantilla`,
#29/#30/#31). Consume `GET/POST .../excel-template/versions[...]` (Backend #31, ya presente en `Arefil_backend` local,
rama `reportes`). No se creó PR ni se hizo commit todavía; se construyó sobre `feat/visual-template-inspector`.

## Integración

Un solo componente reutilizable, `ReportExcelTemplateVersionHistory` (`src/components/reports/report-excel-template-version-history.tsx`),
es a la vez el botón `[ Historial de versiones ]` y el panel — un `Sheet` lateral (`ui/sheet.tsx`, ya presente en el
workspace) en vez de una ruta o de llenar la pantalla principal, coherente con `alert-dialog.tsx`/`sheet.tsx` que ya
usa el resto del panel de administración.

Cada consumidor decide dos cosas que le son propias:

- **`disabledReason`** — cuándo restaurar es inseguro *ahí*. Solo el editor visual tiene un concepto de "mappings sin
  guardar" (`isDirty` de #30); la tarjeta no lo tiene y nunca pasa esta prop.
- **`onRestored`** — qué refrescar tras un restore exitoso. La tarjeta aplica la metadata que ya trae la respuesta
  (igual que hace `upload()`, sin una petición extra); el editor llama a su propio `handleReload` (el mismo que ya
  usaba para el conflicto `409` de #30), que vuelve a pedir inspección + builder.

## Piezas nuevas

- `src/types/api.ts`: `ExcelTemplateRestoreRequest` (`base_version`/`base_checksum`, ambos nulos solo cuando no hay
  plantilla activa que proteger). La lista y la respuesta de restore reutilizan los tipos `ReportExcelTemplate` /
  `ReportExcelTemplateUpload` ya existentes — el backend responde exactamente esa forma.
- `src/lib/api/reports.ts`: `listReportExcelTemplateVersions`, `downloadReportExcelTemplateVersion`,
  `restoreReportExcelTemplateVersion`.
- `src/components/reports/report-excel-template-validation-panel.tsx` (nuevo, extraído de
  `report-excel-template-card.tsx`): el panel de diagnóstico estructurado (`Compatibilidad: ...`, placeholders,
  filas repetibles, listas de errores/advertencias por celda) ahora es reusable — lo necesitan tanto el upload (#23,
  sin cambios de comportamiento) como el restore de una versión incompatible (#32). La frase específica de cada flujo
  ("vuelve a subir el archivo" vs. "esta versión no fue activada") vive en cada llamador, no en el panel compartido.
- `src/components/reports/report-excel-template-version-history.tsx`: el componente descrito arriba.

## Comportamiento

- **Listado**: más reciente primero (el backend ya ordena por versión descendente); cada fila muestra versión,
  badge `Activa` cuando aplica, nombre de archivo, fecha/hora, tamaño y un checksum abreviado (8 caracteres,
  monoespaciado, con el checksum completo en `title`) — diagnóstico técnico secundario, no protagonista. Backend no
  expone origen (`upload`/`visual_mapping`/`restore`); no se inventó esa etiqueta.
- **Descargar**: cada versión, activa o no, tiene su botón `Descargar`; usa el nombre que trae `Content-Disposition`
  del propio endpoint de versión (mismo mecanismo que la descarga de la plantilla activa) — nada se reconstruye en
  frontend salvo el nombre de reserva si el header faltara.
- **Restaurar**: solo aparece en versiones no activas. Confirmación explícita en un `AlertDialog` con el texto exacto
  de la issue ("Se creará una nueva versión activa basada en la vN. La versión actual no se eliminará."). El
  `base_version`/`base_checksum` que se envían son los de la versión activa **tal como la trae la última carga del
  historial** — nunca un estado adelantado localmente.
- **Concurrencia (`409`)**: mensaje exacto de la issue ("La plantilla cambió desde que cargaste el historial...") y
  un botón `Actualizar lista` explícito; nunca reintenta sobrescribiendo solo.
- **Versión incompatible (`422` estructurado)**: reutiliza `ReportExcelTemplateValidationPanel` para mostrar los
  errores por celda tal cual los manda el backend, más "Esta versión no fue activada; la plantilla actual sigue
  intacta." — nunca un error genérico para este caso.
- **Error genérico de backend**: `ErrorAlert` con el mensaje del backend, sin cerrar el diálogo de confirmación (el
  usuario puede reintentar sin repetir la selección).
- **Editor con mappings sin guardar**: cada botón `Restaurar esta versión` queda deshabilitado y el panel muestra el
  mensaje exacto de la issue ("Guarda o descarta tus cambios antes de restaurar otra versión.") en vez de bloquear
  todo el panel — el historial y las descargas siguen disponibles.
- **Historial vacío / sin plantilla activa**: el botón del historial no depende de que exista una plantilla activa
  (un reporte puede tener plantillas históricas aunque la activa se haya eliminado); un historial sin versiones
  muestra un mensaje explicativo en vez de una lista vacía silenciosa.
- **Restore exitoso**: refresca la lista del propio panel, aplica la nueva metadata en el host (tarjeta o editor) y
  muestra un aviso con ambas versiones ("Se restauró la vN como nueva vM activa.") — nunca dice que la versión
  histórica "se reactivó".

## Validación del 17 de septiembre de 2026

- `npm test`: 33 archivos, 321 tests pasan (308 previos de #29/#30/#31 + 13 nuevos: 11 de
  `ReportExcelTemplateVersionHistory` y 2 de integración del historial dentro del editor visual). Los 12 tests
  existentes de `ReportExcelTemplateCard` siguen pasando sin cambios tras extraer el panel de validación.
- `npm run lint`: pasa.
- `npx tsc --noEmit` en el workspace completo: mismos nueve errores preexistentes y ajenos ya documentados por
  #29/#30/#31 (cinco `loading.tsx` con skeletons inexistentes, `isActive` no exportado en `sidebar.tsx`,
  `deleteReport` inexistente en `admin-report-row.tsx`, variantes `success`/`warning` de `Badge` en
  `status-badge.tsx`). Ningún archivo tocado por esta issue aparece en la lista.
- `npm run build` en el workspace completo: falla por los mismos cinco imports de skeletons inexistentes que
  #29/#30/#31 ya reportaron sin resolver (trabajo ajeno, sin commitear, fuera del alcance de esta issue). No se
  modificaron esos archivos. Como en #30/#31, no fue posible aislar una build limpia de esta feature en esta sesión
  (misma limitación del entorno con un `node_modules` fuera del árbol del proyecto al copiar a un directorio
  temporal).
- `git diff --check`: pasa.
- No se ejecutó contra el backend real ni en navegador en esta sesión; la superficie de red se validó solo con los
  mocks de `vitest`.

## Pendientes para aceptación completa

Los mismos bloqueos que #29/#30/#31 documentaron (build/typecheck del workspace por archivos ajenos, la plantilla
real Bonatti fuera de los límites del inspector) siguen sin resolverse — no son de esta issue. Falta validar contra
un backend real en navegador, y decidir rama/commit/PR de todo el trabajo acumulado en `feat/visual-template-inspector`.
