# AREFIL: entrega para el despliegue en Debian

Preparado el 2026-10-18 desde Omarchy (`thinkpad-daniel`). **No se conectó al servidor, no se desplegó y no se tocó Docker, la base real ni Cloudflare.** Este documento no contiene secretos.

Versión en el repositorio de `codex/output/AREFIL_DEBIAN_DEPLOY_HANDOFF.md` (la copia local de Omarchy tiene además los SHA finales de `main` y el manifiesto `AREFIL_RELEASE_MANIFEST.md`). Desde el servidor: `git show origin/main:deploy/DEBIAN_DEPLOY_HANDOFF.md`.

---

## A. Versiones

| Componente | Rama | SHA |
|---|---|---|
| Backend | `main` | merge de promoción de `dev` en `main` (contiene `db7ee86`); comprobar con `git merge-base --is-ancestor db7ee86 origin/main` |
| Backend | `dev` | `db7ee86448b508b6a5f71371207bfdf4f5796f5f` |
| Frontend | `main` | merge de promoción de `dev` en `main` (contiene `342c660` y este documento); comprobar con `git merge-base --is-ancestor 342c660 origin/main` |
| Frontend | `dev` | `342c66089ccdf4408bb781a59466ff0a428d4e19` (+ commit de este documento) |

**Fecha del release:** 2026-10-18.

**Migración Alembic final (head):** `5e1a7c3b9d42` (`letterhead_catalog`).

**PR integrados en este release:**
- Backend:
  - #52 `fix/excel-sin-membrete-x1-x2-x3` → `feat/letterheads-excel-v1`, merge `abb898a`;
  - #53 `feat/letterheads-excel-v1` → `dev`;
  - PR de promoción `dev` → `main`.
- Frontend:
  - #50 `feat/letterheads-excel-v1` → `dev`;
  - PR de promoción `dev` → `main`.
- Ya contenidos en las ramas `feat`:
  - backend #41–#46, #48, #49 y #51;
  - frontend #43, #44, #48 y #49.

**Lo que llega por primera vez a producción** (la base estaba en `d9f2a6b4c801` según la auditoría del 2026-10-09):
- autenticación con usuarios y sesiones;
- el borde Cloudflare;
- el guard de base nueva;
- el CLI de respaldo;
- el seed no destructivo;
- el worker de limpieza;
- Excel V1 con los cinco membretes.

## B. Repositorios en el servidor

Rutas documentadas: `~/projects/Arefil_backend` y `~/projects/Arefil_frontend`. **Compruébalas antes de seguir.** Según la auditoría del 2026-10-09:
- el frontend estaba en `main@03d4b69` con `compose.yaml` **modificado sin commit** y un `stash@{0}` anterior;
- el backend estaba en `main@efa155b`, limpio.

```bash
cd ~/projects
for r in Arefil_backend Arefil_frontend; do
  echo "== $r"; git -C $r status --short --branch; git -C $r stash list; git -C $r log --oneline -1
done
```

- **Si hay cambios locales**, no los descartes. Guárdalos con nombre y regístralos:
  ```bash
  TS=$(date +%Y%m%d-%H%M%S)
  git -C Arefil_frontend stash push -m "pre-release-$TS deployed local changes" -- compose.yaml   # solo lo que muestre status
  git -C Arefil_frontend diff stash@{0}^ stash@{0} > ~/arefil-deploy/$TS/frontend-local.diff  # evidencia
  ```
- **Actualiza sin forzar.** Si `--ff-only` falla, **detente** y revisa: nunca `reset --hard`, `clean` ni `push --force`.
  ```bash
  for r in Arefil_backend Arefil_frontend; do
    git -C $r fetch origin
    git -C $r switch main
    git -C $r merge --ff-only origin/main
  done
  git -C Arefil_backend rev-parse HEAD    # = el SHA de `origin/main` del backend (contiene `db7ee86`)
  git -C Arefil_frontend rev-parse HEAD   # = el SHA de `origin/main` del frontend (contiene `342c660`)
  ```
- Los archivos sin seguimiento en el servidor (por ejemplo `backend/data/`, ignorado) **no deben** añadirse a Git.

## C. Docker

- **Compose oficial:** `Arefil_frontend/compose.yaml` + `compose.cloudflare.yaml`, activados con `COMPOSE_FILE=compose.yaml:compose.cloudflare.yaml` en `Arefil_frontend/.env`. Proyecto fijo `name: arefil`.
- **Servicios AREFIL:**

  | Servicio | Imagen (build) | Healthcheck | Puertos |
  |---|---|---|---|
  | `backend` | `../Arefil_backend/Dockerfile` (python:3.12-slim, usuario `app` con UID/GID de `AREFIL_UID`/`AREFIL_GID`) | `GET http://127.0.0.1:8000/api/health` cada 30 s, arranque 15 s | ninguno en el host (`expose 8000`, red `internal`) |
  | `report-execution-cleanup` | misma imagen; `python -m app.cli.report_executions worker` | PID 1 vivo (`os.kill(1,0)`) | ninguno |
  | `frontend` | `Arefil_frontend/Dockerfile` (node:22-alpine, usuario `node`) | `GET http://127.0.0.1:3000/api/health` | **`127.0.0.1:${FRONTEND_PORT:-3001}:3000`**, solo loopback |
  | `caddy` | — | — | **no se inicia** con Cloudflare (perfil `caddy`) |

- **Nuevo frente a lo que había el 2026-10-09:**
  - el worker `report-execution-cleanup`;
  - la red `internal` (`172.31.240.0/24`, sin salida) y la red `edge`;
  - el frontend con IP fija `172.31.240.10`;
  - los contenedores antiguos `arefil-backend-1` y `arefil-frontend-1` (compose antiguo, red `arefil_default`) **se reemplazan**.
- **Persistencia:** bind mount `${BACKEND_DATA_DIR}` → `/app/data`, con `create_host_path: false`. Contiene `arefil.db`, `uploads/` y `backups/`.
  - Ruta real documentada: `/home/daniel12/projects/Arefil_backend/backend/data`.
  - No uses volúmenes Docker para la base.
- **Cloudflare Tunnel:**
  - `cloudflared.service` en el host, túnel gestionado desde el dashboard;
  - regla `arefil.nyxserverlab.com → http://127.0.0.1:3001`;
  - el mismo túnel sirve `cecoc.*` (→ `localhost:3010`), `dadesk.*` (→ `localhost:3100`) y `cecobot.*` (→ `127.0.0.1:8000`): **no se tocan**.
- **No asumas que el servidor coincide con el repositorio.** Antes de construir:
  ```bash
  cd ~/projects/Arefil_frontend
  systemctl is-active cloudflared
  curl -s http://127.0.0.1:20241/config | python3 -c 'import json,sys;[print(r.get("hostname"),r["service"]) for r in json.load(sys.stdin)["config"]["ingress"]]'
  docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'      # identifica qué es AREFIL
  docker compose config --services                                        # backend, frontend, report-execution-cleanup (sin caddy)
  docker compose config | grep -nE 'source:|published|host_ip|AREFIL_ALLOW_NEW_DATABASE|CORS_ORIGINS|TRUSTED_ORIGINS'
  make test_deploy_config
  make docker_preflight      # imprime ruta de datos y puertos efectivos; aborta si arefil.db falta
  df -h ~/projects /var/lib/docker
  ```
  - `docker compose config` muestra la configuración **efectiva**. No la pegues en reportes sin revisarla, aunque AREFIL no usa secretos.
- **Orden del despliegue** (detalle en `Arefil_backend` `codex/output/AREFIL_CLOUDFLARE_PRODUCTION_READINESS.md` §13):
  0. Cloudflare: «Always Use HTTPS» y, si hace falta, Access temporal (§I).
  1. Comprobaciones y puntos de retorno: etiquetar las imágenes actuales como `rollback-$TS` y copiar `.env`, `compose.yaml` y los SHA a `~/arefil-deploy/$TS/`.
  2. Actualizar los repositorios (§B).
  3. Escribir `.env` (§D) y ejecutar `docker compose config`, `make test_deploy_config` y `make docker_preflight`.
  4. `AREFIL_UID=$(id -u) AREFIL_GID=$(id -g) docker compose build`. Sin downtime: los contenedores actuales siguen corriendo.
  5. Ventana: `docker stop arefil-frontend-1 arefil-backend-1` y luego respaldo (§E).
  6. Ensayo de la migración sobre una copia del respaldo con la imagen nueva y `--network none` (§E).
  7. `make docker_up` (`up --detach --build --wait`). Espera a ver los tres servicios `healthy`.
  8. Verificación (§I), primer ADMIN (§E), membretes (§F) y plantillas (§G).
- **Prohibido en la actualización ordinaria:** `docker compose down -v`, `docker system prune`, `docker image prune`, `docker rm` de contenedores ajenos y borrar las imágenes `rollback-*`.
- `docker network rm arefil_default` es solo para la limpieza, 24–48 h después.

## D. Variables de entorno (`Arefil_frontend/.env`, sin secretos)

AREFIL **no usa secretos de aplicación**: las sesiones son opacas y se guardan en la base, y las contraseñas usan Argon2id. El token de Cloudflare está en `/etc/cloudflared/token` (`root:600`) y **no forma parte** de AREFIL.

| Variable | ¿Obligatoria en producción? | Default si falta | Valor esperado |
|---|---|---|---|
| `COMPOSE_FILE` | **Sí** | solo `compose.yaml`: arrancaría Caddy en 80/443 | `compose.yaml:compose.cloudflare.yaml` |
| `AREFIL_PUBLIC_ORIGIN` | **Sí** (Compose falla sin ella con Cloudflare) | — | `https://arefil.nyxserverlab.com` |
| `BACKEND_DATA_DIR` | **Sí** (explícita) | `../Arefil_backend/backend/data` | la ruta **real** de `arefil.db`; el preflight la imprime |
| `AREFIL_ALLOW_NEW_DATABASE` | Sí | `false` | `false`. **Nunca `true`** sobre una instalación existente |
| `FRONTEND_PORT` | Sí | `3001` | igual que la regla del túnel (`3001`) |
| `COMPOSE_PROJECT_NAME` | No | `arefil` (`name:`) | `arefil` |
| `AREFIL_UID` / `AREFIL_GID` | No (el Makefile usa `id -u/-g`) | `1000` | dueño de `BACKEND_DATA_DIR` |
| `AREFIL_INTERNAL_SUBNET` / `AREFIL_FRONTEND_INTERNAL_IP` | No | `172.31.240.0/24` / `172.31.240.10` | cámbialas juntas solo si chocan con otras redes |
| `SESSION_TTL_HOURS` | No | `12` | `12` |
| `LOG_LEVEL` | No | `INFO` | `INFO` |
| `REPORT_EXECUTION_CLEANUP_ENABLED` | No | `true` | `true` |
| `REPORT_EXECUTION_CLEANUP_INTERVAL_SECONDS` / `_BATCH_SIZE` / `_MAX_RECORDS` | No | `3600` / `500` / `5000` | defaults |
| `AREFIL_HOSTNAME`, `AREFIL_TLS`, `HTTPS_PORT`, `HTTP_PORT` | No (solo el borde Caddy) | — | no definir |
| `CORS_ORIGINS`, `BACKEND_PORT` (en `.env`) | **Obsoletas** | — | quitarlas (no se leen) |

**Las deriva Compose y no van en `.env`:**
- **Backend:**
  - `APP_ENV=production`;
  - `SESSION_COOKIE_SECURE=true`: si fuera `false`, el arranque abortaría;
  - `CORS_ORIGINS=TRUSTED_ORIGINS=["$AREFIL_PUBLIC_ORIGIN"]`;
  - `TRUSTED_PROXIES=["172.31.240.10/32"]`;
  - `DATABASE_URL=sqlite:////app/data/arefil.db`.
- **Frontend:**
  - `API_INTERNAL_URL=http://backend:8000/api`;
  - `CLIENT_IP_HEADER=cf-connecting-ip`;
  - `TRUST_PROXY_FORWARDED_FOR=false`;
  - `PUBLIC_ORIGIN`;
  - build-arg `NEXT_PUBLIC_API_URL=/backend-api`.
- **No cambies `SESSION_COOKIE_NAME`:** el frontend usa `arefil_session` fijo.

## E. Base de datos

- **Migraciones pendientes** si la base sigue en `d9f2a6b4c801`:

  `d9f2a6b4c801 → 1f7c2d9a6b40 → 6b2d4f8a1c30 → 9e3c5a7b1d24 (users, user_sessions) → 4d8b2e6f9a13 → 5e1a7c3b9d42 (letterhead_catalog)`

  - El entrypoint ejecuta `python -m app.db.guard`, luego `alembic upgrade head` y después `python -m app.db.seed` en **cada** arranque del backend.
  - **No arranques el backend nuevo** hasta tener el respaldo verificado.
  - Comprueba la revisión real con: `sqlite3 "file:$DATA/arefil.db?mode=ro" "select version_num from alembic_version"`.
- **Guard:** el backend no arranca si `arefil.db` falta, está vacía o no tiene `alembic_version`, salvo con `AREFIL_ALLOW_NEW_DATABASE=true`. Si el preflight o el guard fallan, **la ruta está mal**: no crees una base nueva.
- **Respaldo** con el stack detenido (ninguna escritura):
  ```bash
  D=~/arefil-deploy/$TS; mkdir -p "$D"; chmod 700 "$D"
  docker compose run --rm --no-deps -v "$D":/offsite backend python -m app.cli.backup create --output-dir /offsite
  docker compose run --rm --no-deps -v "$D":/offsite backend python -m app.cli.backup verify /offsite/$(cd "$D"; ls arefil_backup_*.db | tail -1)
  sha256sum "$D"/arefil_backup_*.db | tee "$D/SHA256SUMS"
  ```
  - Usa `sqlite3.backup()` y deja **un solo archivo**.
  - La verificación restaura en una copia aislada y ejecuta `integrity_check`, `foreign_key_check`, las tablas esperadas y la revisión Alembic.
  - **Nunca** `cp arefil.db` con el backend corriendo.
  - Copia además `uploads/` (`cp -a "$DATA/uploads" "$D/"`) y el respaldo a otra máquina por un canal seguro.
- **Ensayo obligatorio de restauración y migración** sobre una copia:
  ```bash
  mkdir -p "$D/rehearsal" && cp "$D"/arefil_backup_*.db "$D/rehearsal/arefil.db"
  docker run --rm --network none -e 'CORS_ORIGINS=["https://arefil.nyxserverlab.com"]' -e SESSION_COOKIE_SECURE=true \
    -v "$D/rehearsal":/app/data arefil-backend \
    sh -c 'python -m alembic upgrade head && python -m app.db.seed && python -m alembic current && python -m app.cli.backup verify /app/data/arefil.db'
  ```
  Esperado: las revisiones pendientes, `5e1a7c3b9d42 (head)` y verificación OK. **Ensayado en Omarchy** sobre una base temporal:
  - `d9f2a6b4c801 → head` OK;
  - `downgrade 4d8b2e6f9a13` con el catálogo vacío OK, y `upgrade` otra vez OK;
  - con membretes cargados, el downgrade **se niega** («contiene 5 membretes…»), que es lo esperado.
- **Seed:**
  - En instalaciones existentes **no reescribe** reportes (`79cd20e`) y respeta las marcas de borrado.
  - Puede **añadir** lo que falte: proveedor `FLEETGUARD` y los reportes `PRUEBA_COTIZACION` y `PRUEBA_DESCUENTO` con su plantilla BONATTI, si no existen.
  - No crea usuarios ni membretes.
- **Primer ADMIN** (la base anterior no tiene usuarios). La contraseña se pide con `getpass` dos veces, nunca como argumento:
  ```bash
  docker compose exec backend python -m app.cli.users list
  docker compose exec backend python -m app.cli.users create --username <admin> --role ADMIN
  ```

## F. Membretes (archivos privados: NO están en Git)

La importación inicial espera estos cinco archivos, con el nombre exacto, en un directorio que el contenedor pueda leer (`app/services/letterheads/initial.py`):

| Slug | Nombre visible | Archivo esperado | Tamaño | SHA-256 conocido |
|---|---|---|---|---|
| `asistente-ventas` | Asistente de ventas | `Membratada AsistenteVentas.xlsx` | 1 133 174 B | `771abde0dfa88fc460a9e282064c9578d06c8df89fd831a2c3e3c74b4144f0e6` |
| `asistente-ventas-2` | Asistente de ventas 2 | `Membratada AsistenteVentas2.xlsx` | 1 135 700 B | `3394c9a5769007691b5a088ea8c2bdf8d01913e5c73c0ecb3b1928a4106e6bbf` |
| `ivan-vazquez` | Iván Vázquez | `Membratada IvanVazquez.xlsx` | 1 127 846 B | `cca4472354add69341680dbf6bbde55c16038283b3d7826e5514adc29b2a05f8` |
| `olivia-banda` | Olivia Banda | `Membratada OliviaBanda.xlsx` | 1 128 879 B | `f4cddb3d20b07312ab6f2fa071535cbab671cca1185253f82891babea3a0e0fc` |
| `victor-vazquez` | Víctor Vázquez | `Membratada VictorVazquez.xlsx` | 1 130 336 B | `6b8096dca81c42f04e4cb18b83a446c7ed44cef350ec5a5ce6999138d7de3560` |

- **Origen de los hashes:**
  - `Arefil_backend` `codex/output/letterhead-spike/source-inventory.json`, versionado;
  - las copias de trabajo en Omarchy (scratchpad temporal de la sesión, `lh-src/`) dieron `sha256sum -c` OK el 2026-10-18.
- **Los originales no se han localizado en Omarchy fuera de ese directorio temporal**, que puede borrarse al reiniciar.
- **Hay que transferir al servidor por un canal privado** (por ejemplo `scp` por Tailscale a un directorio `700` fuera de los repositorios). **No pasan por GitHub.**

**Comprobación e importación en el servidor:**
```bash
LH=~/arefil-private/letterheads            # chmod 700; fuera de los repositorios
cd "$LH" && sha256sum *.xlsx               # comparar con la tabla; abortar si alguno difiere
cd ~/projects/Arefil_frontend
docker compose run --rm --no-deps -v "$LH":/letterheads:ro backend \
  python -m app.cli.letterheads import-initial --source-dir /letterheads --dry-run
docker compose run --rm --no-deps -v "$LH":/letterheads:ro backend \
  python -m app.cli.letterheads import-initial --source-dir /letterheads --assign PRUEBA_COTIZACION --assign PRUEBA_DESCUENTO
docker compose exec backend python -m app.cli.letterheads list
docker compose exec backend python -m app.cli.letterheads verify
```
- La importación es **idempotente**.
- Si existe otro reporte de cotización en producción (por ejemplo `COTIZACION_PRODUCTOS`), añade `--assign` para él. También puede asignarse después en Administración › Membretes.
- **Validación posterior:**
  - Administración › Membretes muestra 5 membretes con la versión 1;
  - el selector «Presentación del documento» ofrece «Sin membrete» más los 5;
  - una descarga de prueba con membrete se abre y sus totales coinciden con la pantalla.

**Otros datos privados** que no están en Git y no deben subirse:
- `arefil.db` y sus respaldos;
- `uploads/`;
- listas de precios fuente (Donaldson y Fleetguard);
- el kit de QA de Windows (`~/Downloads/arefil-excel-v1-windows-final-f035d77/`, con precios reales);
- `Arefil_backend/backend/ejemplos/`.

## G. Plantillas BONATTI en instalaciones existentes (X1 Carta, X3 Arial)

- **X2** (totales con fórmula, totales fijos en legacy, ETag y cálculo automático) llega con el código: no requiere ninguna acción.
- **X1 y X3** dependen de la plantilla guardada en la base. El seed **no** reescribe las existentes.

Procedimiento completo: kit de Windows `plan-actualizacion/PLAN-ACTUALIZACION-PLANTILLAS.md`, con un inventario de solo lectura (`inventario_plantillas.py`) y el ensayo `ensayo.json`. Resumen:

1. **Inventario de solo lectura** sobre el **respaldo**, nunca sobre la base en uso: `python3 -I inventario_plantillas.py <respaldo.db> inventario.json`. Indica qué plantillas son BONATTI con papel ≠ Carta o con fuentes distintas de Arial.
2. **Después del despliegue**, genera la plantilla nueva con el código desplegado:
   - `build_quotation_template(with_discount=…, sheet_name=<hoja actual>)`;
   - súbela como ADMIN en **Administración › Reportes › <reporte> › Configurar › Excel › Reemplazar plantilla**;
   - resultado esperado: `valid: true`, 1 fila repetible y 0 errores.
3. **La versión anterior se conserva en el historial.** Los snapshots y las ejecuciones históricas siguen con su versión: sin Carta ni Arial, por diseño.
4. **Comprueba** con una cotización nueva sin membrete: `X-Report-Template-Version` = versión nueva, papel Carta, Arial y totales como fórmulas.
5. **Reversión:** Historial de versiones › Restaurar. La versión anterior vuelve como una versión nueva y no se pierde historial.
6. **Plantillas personalizadas** (no BONATTI): no se reemplazan; se revisan con su autor.
7. **No sustituyas archivos directamente en SQLite.**

## H. Rollback

**Puntos de retorno anteriores:**

| | Anterior conocido | Nuevo |
|---|---|---|
| Backend Git | `efa155b` (`main` desplegado el 2026-10-09) | merge de promoción de `dev` en `main` (contiene `db7ee86`); comprobar con `git merge-base --is-ancestor db7ee86 origin/main` |
| Frontend Git | `03d4b69` + `compose.yaml` local guardado en stash (`main` desplegado) | merge de promoción de `dev` en `main` (contiene `342c660` y este documento); comprobar con `git merge-base --is-ancestor 342c660 origin/main` |
| Imágenes | `arefil-backend:latest`/`arefil-frontend:latest` actuales; hay que etiquetarlas `rollback-$TS` antes del build. También existen `rollback-20260919-164005` | nuevas `latest` |
| Base | respaldo `$D/arefil_backup_*.db` en revisión `d9f2a6b4c801` | `5e1a7c3b9d42` |

- **Regla:** volver a la imagen anterior **no revierte las migraciones**. La imagen antigua solo conoce hasta `d9f2a6b4c801`, y su entrypoint, con la base en `5e1a7c3b9d42`, no arranca.
- **Procedimiento** (`AREFIL_CLOUDFLARE_PRODUCTION_READINESS.md` §14, actualizado):
  1. Detén **solo** AREFIL: `docker compose stop` (o `down` **sin** `-v`). Los datos están en el bind mount.
  2. Base, una de estas dos:
     - **A. Restaurar el respaldo.** Se pierde todo lo escrito después del despliegue (usuarios, sesiones, membretes, ejecuciones). **Antes evalúa esa pérdida**, y crea un respaldo del estado fallido con `app.cli.backup create`.
     - **B. Downgrade.** `5e1a7c3b9d42` **se niega** si ya se importaron membretes: solo sirve antes de importarlos. Más abajo, el downgrade elimina usuarios y sesiones.
  3. Aplicación anterior:
     - `git switch --detach <SHA anterior>`;
     - restaura el stash de `compose.yaml` y el `.env` guardado;
     - vuelve a etiquetar las `rollback-$TS` como `latest`;
     - `docker compose up -d --no-build`.
  4. Con la versión anterior vuelve el riesgo de una app **sin autenticación** (§I): activa Cloudflare Access antes de reabrir.
- **Plantillas:** se revierten sin redespliegue, con el historial de versiones (§G).

## I. Seguridad: comprobaciones obligatorias

**Riesgo vigente** (observado desde Omarchy el 2026-10-17/18, sin conectarse al servidor):
- `GET https://arefil.nyxserverlab.com/` → **200 sin pasar por login**: la instancia pública sigue siendo la imagen sin autenticación;
- `GET http://arefil.nyxserverlab.com/` → **200**: «Always Use HTTPS» está desactivado.

**Antes de abrir la versión nueva:**
1. En el dashboard de Cloudflare: activa **Always Use HTTPS**. Opcionalmente, una aplicación de **Cloudflare Access** sobre `arefil.nyxserverlab.com` hasta terminar los smoke tests. No toques otras reglas del túnel.
2. Comprobaciones posteriores (todas obligatorias):
   ```bash
   curl -s https://arefil.nyxserverlab.com/backend-api/health                                # {"status":"ok"}
   curl -sI https://arefil.nyxserverlab.com/ | grep -iE '^(HTTP|location|strict)'            # 307 -> /login + HSTS
   curl -sI http://arefil.nyxserverlab.com/login | grep -iE '^(HTTP|location)'                # redirección a https://
   curl -s -o /dev/null -w '%{http_code}\n' https://arefil.nyxserverlab.com/backend-api/suppliers        # 401
   curl -s -o /dev/null -w '%{http_code}\n' https://arefil.nyxserverlab.com/backend-api/admin/letterheads # 401
   docker compose port backend 8000 || echo "backend sin puerto en el host (correcto)"
   ss -ltnp | grep -E ':3001|:8000'          # 3001 solo en 127.0.0.1; ningún 0.0.0.0:3001
   ```
   - La cookie de login debe ser `arefil_session; HttpOnly; Secure; SameSite=lax; Path=/`.
   - Con un usuario `USER`, la API de administración debe dar **403**.
   - Una escritura con un `Origin` ajeno debe dar **403**.
   - `/docs` y `/openapi.json` deben dar **404**.
   - El directorio de datos no debe estar servido por ningún contenedor ni regla del túnel.
3. **Smoke tests:**
   - login y logout del ADMIN;
   - listas de precios;
   - plantillas;
   - catálogo de membretes;
   - una cotización y un descuento **controlados**, sin y con membrete, con SUBTOTAL, IVA y TOTAL;
   - el worker `healthy` y su log sin errores;
   - CECOC, DADESK y cecobot siguen respondiendo.
   - Las ejecuciones de prueba caducan solas por TTL (24 h) a través del worker.

## J. Excepción aceptada

La validación en **Microsoft Excel para Windows 2016, 2019 y 365 NO se ha realizado**. El responsable del proyecto la acepta como riesgo de este release. El kit para hacerla está en `~/Downloads/arefil-excel-v1-windows-final-f035d77/` (Omarchy).
