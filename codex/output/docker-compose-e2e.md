# Docker Compose E2E — issue #7

Fecha: 2026-08-20 (America/Mexico_City)

Repositorios validados:

- Frontend: `c5ff12b` más los cambios locales de esta implementación.
- Backend: `2d482fd`, sin cambios locales.
- Layout: `Arefil_frontend/` y `Arefil_backend/` como repos hermanos.

## Resultado

La integración portable pasó. Compose construyó y levantó FastAPI y Next.js,
esperó los healthchecks, expuso los puertos configurables, ejecutó el flujo
Donaldson completo a través del origen del frontend y conservó DB, uploads y
backups después de eliminar imágenes y recrear contenedores.

La prueba no tocó los datos reales de `Arefil_backend/backend/data`: usó el
bind mount aislado `/tmp/arefil-issue7-e2e.BqRwhA`.

## Arquitectura validada

- `frontend` se construye desde este repo y escucha en `3000` dentro del
  contenedor.
- `backend` se construye desde `../Arefil_backend` y escucha en `8000` dentro
  del contenedor.
- El frontend espera a que el backend esté healthy antes de arrancar.
- Server Components y el proxy usan `http://backend:8000/api` en la red privada.
- El browser usa `/backend-api`; el hostname `backend` no aparece en los assets
  estáticos.
- `/app/data` es un bind mount al directorio persistente del host. No se usan
  volúmenes anónimos ni un target destructivo de reset.
- Ambos procesos corren como usuarios no-root; los archivos de prueba quedaron
  con UID/GID `1000:1000`, iguales al usuario del host usado en la prueba.

## Validación funcional

El workbook XLSX se generó dentro del contenedor backend con datos sintéticos:

- 2 productos (`P-1`, `P-2`).
- 1 cancelado y 1 non-catalog.
- 1 reemplazo.
- Fecha efectiva `2025-10-20`, moneda `MXN`.
- SHA-256 original:
  `058a8be68cfcfe09fa3158696032604ce24de8fd37cb774ed3b60ef2af82c97c`.

Todas las llamadas de negocio siguientes atravesaron
`http://localhost:3000/backend-api`:

1. `POST /imports/donaldson/preview` respondió `201`, `PREVIEWED`, 2 productos,
   0 warnings y 0 errores.
2. `POST /imports/1/confirm` creó `price_list_id=1`, 2 productos, 2 precios,
   1 cancelado, 1 non-catalog y 1 reemplazo.
3. Catálogo y detalle devolvieron 1 lista, 2 items y 2 cambios de estado.
4. La búsqueda encontró `Filter One` como `product_id=1`.
5. El histórico devolvió 1 entrada con precio `199.99`.
6. Las páginas `/`, listas, detalle, productos, histórico, cancelados y respaldos
   respondieron HTTP 200.
7. Los exports XLSX y CSV se descargaron correctamente. El CSV contenía las dos
   filas y el XLSX era un ZIP/OpenXML válido.
8. La descarga del archivo fuente tuvo el mismo SHA-256 que el XLSX subido.
9. El backup descargado y el archivo guardado en `backups/` tuvieron SHA-256
   `d653dd578db8e40d12d4aa99fef0bf6a41f2690690d292242893e6ef9540f4a0`;
   `PRAGMA integrity_check` devolvió `ok`.

Healthchecks observados:

- `GET :3000/api/health` → `{"status":"ok"}`.
- `GET :3000/backend-api/health` → `{"status":"ok"}`.
- Backend y frontend aparecieron como `healthy` en `docker compose ps`.

## Recreación y persistencia

Antes de recrear:

- Backend container ID:
  `14788d3549eaebbc7207ca024eaac5cea55d85b109bc4ed814f17ac2d41c75a9`.
- Frontend container ID:
  `0df568d450380a78480a85bf92d1ac3489edef25f421287acfb101034409447d`.

Se ejecutó `make docker_down`, se verificó que el bind mount seguía teniendo
`arefil.db`, el upload y el backup, y se eliminaron ambas imágenes construidas.
Después, `make docker_up` reconstruyó imágenes y creó contenedores nuevos:

- Backend container ID:
  `17960c6b4b7521eab916a573ef01558423afb5ace31274d0d16011c6bec49131`.
- Frontend container ID:
  `bf059044cc6e5a2de993909b585d7331dadd86be1acbad89a5bee7a11edbf49c`.

Después de la recreación continuaron disponibles `price_list_id=1`, los 2
items, los 2 cambios de estado, el histórico con precio `199.99`, el source con
el mismo hash y el backup con el mismo hash. Un segundo `make docker_down`
volvió a dejar intactos los tres archivos persistentes.

## Portabilidad desde copias limpias

Se copiaron ambos repos a `/tmp/arefil-issue7-clean.PFdoWI/` preservando solo
archivos versionables; la copia no contenía `.git`, `node_modules`, `.next`,
`.venv` ni `__pycache__`.

Desde esa copia se ejecutaron `make docker_preflight` y `make docker_up` con
proyecto `arefil-issue7-clean`, frontend `3100` y backend `8100`. Docker hizo el
build de producción, ambos servicios quedaron healthy y respondieron:

- `GET :3100/api/health` → OK.
- `GET :3100/backend-api/health` → OK.
- `GET :8100/api/health` → OK.
- `GET :3100/` → HTTP 200.

El build no creó dependencias Node/Python en el host de la copia. Esto valida
la ejecución sin instalaciones locales aparte de Docker/Compose.

## Calidad y compatibilidad

- Frontend: 3 archivos de Vitest, 10 tests; lint, typecheck, build y
  `git diff --check` pasaron.
- Backend: 95 tests pasaron; Alembic `current` y `heads` coincidieron en
  `fa59ceac2a5d (head)`; el repo quedó limpio.
- `make run_panel` no fue modificado y sigue disponible para desarrollo local.
- Los logs de la recreación no contenían `traceback`, `uncaught`, `fatal` ni
  marcadores `error:`.

## LAN y límites de la prueba

Compose publicó ambos puertos en `0.0.0.0` y `[::]`. El frontend respondió HTTP
200 usando la interfaz no-loopback del host (`172.24.62.16:3000`). No había una
segunda laptop física disponible en este entorno, por lo que firewall,
aislamiento Wi-Fi y routing de una red doméstica real quedan como verificación
manual. La documentación explica usar `http://IP-DEL-SERVIDOR:3000` y no
modifica el firewall.

## Limpieza

Los proyectos Compose de validación fueron detenidos sin `down -v` y las
imágenes temporales se eliminaron. Los directorios de prueba se retiraron de
`/tmp` mediante la papelera del sistema, por lo que aún son recuperables. No se
creó commit, push ni pull request.
