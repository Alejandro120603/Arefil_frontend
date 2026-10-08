# Arefil — Frontend

Panel de administración de Arefil. Next.js (App Router) + TypeScript estricto +
Tailwind CSS + shadcn/ui, consumiendo el backend FastAPI de `Arefil_backend`.

## Requisitos

Para desarrollo local:

- Node.js 20.9+ y npm
- Python 3.11+ (para el backend hermano)

Para Docker portable no se instalan dependencias Node/Python en el host. Solo
se necesitan Git, Docker Engine con `docker compose` y ambos repos clonados
como hermanos:

```text
~/projects/
  Arefil_frontend/   (este repo)
  Arefil_backend/
    .venv/           (solo necesario para desarrollo local)
    backend/
      data/          (SQLite, uploads y backups persistentes)
```

## Instalación

```bash
npm install
cp .env.example .env.local
```

`.env.local` no se versiona (ver `.gitignore`). El navegador usa por default el
proxy same-origin de Next.js y el servidor se conecta directamente al backend
local:

```env
NEXT_PUBLIC_API_URL=/backend-api
API_INTERNAL_URL=http://127.0.0.1:8000/api
```

Para el backend, sigue `Arefil_backend/backend/README.md` (o usa `make setup_panel`,
ver abajo), que en resumen es:

```bash
cd ../Arefil_backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

## Desarrollo local

### Iniciar

El comando principal levanta backend + frontend juntos desde la raíz de este
repo:

```bash
make compose_up
```

Esto:

1. Valida que `Arefil_backend` y su entorno virtual existan (falla con mensaje
   accionable si no).
2. Valida que los puertos `8000` y `3001` estén libres, sin detener al proceso
   que los ocupa si existe.
3. Instala dependencias de frontend si `node_modules` no existe.
4. Corre `alembic upgrade head` sobre el backend.
5. Corre el seed idempotente de Donaldson (`python -m app.db.seed`).
6. Levanta FastAPI con `--reload` en `:8000`.
7. Levanta Next.js dev en `:3001`.
8. Muestra los logs de ambos procesos en la misma terminal.
9. `Ctrl+C` detiene los grupos de procesos completos; si uno de los servicios
   muere, el script cierra el otro (ver `scripts/compose_up.sh`).

La metadata de la instancia se guarda con permisos privados bajo
`${XDG_RUNTIME_DIR:-/tmp}`. No se escribe dentro del repositorio y se valida
contra PID, tiempo de inicio y comando antes de enviar señales.

Variables configurables (todas con default razonable):

```bash
make compose_up BACKEND_DIR=../Arefil_backend/backend BACKEND_PORT=8000 FRONTEND_PORT=3001
```

### Detener

```bash
make compose_down
```

Primero detiene la instancia conocida por su metadata. Después revisa
exclusivamente los listeners de `8000` y `3001`. Si Docker publica uno de esos
puertos, detiene solo el container que tiene ese binding; para un proceso
convencional envía `SIGTERM`, espera y usa `SIGKILL` únicamente si hace falta.
El comando es idempotente y no usa kills globales.

### Puertos

```text
Frontend: 127.0.0.1:3001
Backend:  127.0.0.1:8000
```

### `make setup_panel`

Preparación inicial: crea el `.venv` del backend si falta, instala sus
dependencias (`pip install -r requirements.txt`) e instala las del frontend
(`npm install`).

```bash
make setup_panel
```

## URLs

- Frontend: <http://localhost:3001>
- Backend: <http://localhost:8000>
- Swagger / OpenAPI: <http://localhost:8000/docs>

## Estructura

```text
src/
  app/                  # rutas (App Router): dashboard, donaldson/*, administracion/*
  components/
    layout/              # sidebar, shell de la app
    ui/                  # componentes shadcn/ui + EmptyState
  lib/
    api/                 # cliente HTTP centralizado (JSON, multipart, blobs, errores FastAPI)
    format/               # helpers de formato (Decimal-como-string, fechas)
  types/
    api.ts                # contrato TypeScript espejo de app/schemas del backend
```

## Reportes

La experiencia oficial de reportes es **Report Builder → vista previa web →
Excel**. No hay diseñador de plantillas ni visor embebido: el backend es la
única autoridad sobre columnas, fórmulas, totales y el archivo generado.

Operación (`/donaldson/reports`), con dos acciones por reporte:

- **Generar** abre `/donaldson/reports/[code]`, captura los parámetros
  escalares y los renglones repetibles del reporte, ejecuta
  `POST /reports/{code}/data` y renderiza la vista previa en HTML.
- **Configurar** abre `/administracion/reportes/[code]`, donde vive el Report
  Builder (definición, parámetros, grupos repetibles, columnas, fórmulas,
  layout Excel y vista previa).

La vista previa es React: consume `columns`, `rows` y `totals` tal como los
devuelve el backend y respeta etiquetas, orden, visibilidad y `format_type`.
El frontend **no** recalcula fórmulas ni reconstruye totales.

La exportación principal es **Descargar Excel**: el frontend envía los mismos
parámetros de la vista previa, recibe el blob y respeta el nombre de
`Content-Disposition`. CSV se conserva como acción secundaria. No se usa
ninguna librería de Excel en el navegador.

El backend es la única autoridad del nombre de los XLSX y lo entrega mediante
`Content-Disposition` con la forma `<report-code>.xlsx`. Si esa cabecera falta,
el frontend utiliza el mismo nombre basado en el código como fallback defensivo;
no configura, valida ni renderiza patrones de filename.

Los reportes se configuran en la base de datos, no en el código: `SQL_QUERY` y
`HANDLER` (incluidos `PRICE_LIST_COMPARISON` y los renglones repetibles que dan
soporte a cotizaciones) se renderizan con el mismo runtime genérico.

## API client

`src/lib/api/` es el único punto de acceso al backend (nada de `fetch` suelto
en páginas). El cliente compartido de `client.ts` maneja JSON, multipart,
descargas blob y errores; `server-client.ts` configura el destino privado de
Server Components y `browser-client.ts` configura el destino público del
navegador. `errors.ts` normaliza `detail` de FastAPI (string, objeto o arreglo
de errores de validación) a un mensaje legible vía `ApiError`.

En el navegador, `/backend-api/*` se reenvía desde Next.js hacia
`API_INTERNAL_URL`. Por eso el hostname interno Docker `backend` nunca aparece
como destino del navegador y el flujo normal no requiere CORS ni una IP LAN
horneada en el bundle.

## Sesión

El panel exige sesión. `/login` pide usuario y contraseña y llama
`POST /backend-api/auth/login`; el backend responde con la cookie HttpOnly
`arefil_session`, que el proxy `/backend-api` devuelve tal cual al navegador.
El token nunca se guarda en JavaScript (`localStorage`, estado de React, etc.).
Los usuarios se crean en el backend con su CLI (`python -m app.cli.users`).

- `src/proxy.ts` sólo redirige a `/login` cuando falta la cookie; tenerla no
  prueba nada.
- `src/app/(app)/layout.tsx` valida la sesión con `GET /auth/me`
  (`src/lib/auth/server-session.ts`, reenviando la cookie) y redirige a
  `/login?next=…` si el backend ya no la acepta. `administracion/` exige
  además `reports:admin`.
- Un `401` en el navegador manda a `/login?next=<página actual>`; un `403`
  muestra el mensaje del backend sin cerrar la sesión.
- El proxy `/backend-api` rechaza escrituras (`POST/PUT/PATCH/DELETE`) de otro
  origen (`Origin`/`Sec-Fetch-Site`). Si el panel se publica bajo un origen
  distinto al `Host` que ve Next.js, agrégalo en `TRUSTED_ORIGINS` (lista
  separada por comas).

- La interfaz muestra sólo lo que los `permissions` de `/auth/me` permiten
  (`hasPermission`, nunca el nombre del rol): el menú (`navSectionsFor`),
  "Nuevo reporte"/"Configurar" (`reports:admin`), importar y eliminar listas
  (`catalog:write`) y respaldos (`system:backup`). Las páginas administrativas
  y `/donaldson/import` usan `RequirePermission` en su layout. La sesión sale
  del mismo `getCurrentUser()` del request (sin llamadas extra a `/auth/me`).

El backend sigue siendo la única autoridad: estas comprobaciones sólo guían la
navegación.

Los campos `Decimal` del backend (p. ej. `unit_price`, `unit_weight_kg`)
llegan como **string** en el JSON y así se tipan en `src/types/api.ts`
(`DecimalString = string`) — nunca se convierten silenciosamente a `number`;
usa `src/lib/format/decimal.ts` para parsearlos al momento de mostrarlos.

## Docker

El stack Docker es un flujo separado del desarrollo local. `compose_up` y
`compose_down` ejecutan los procesos del host; `docker_up` y `docker_down`
administran Docker Compose. Desde este repositorio:

```bash
make docker_up
make docker_down
```

El preflight valida Docker, el daemon, Compose, ambos Dockerfiles, el repo
hermano y que el directorio persistente sea escribible. Después construye ambas
imágenes, arranca FastAPI, espera su healthcheck, arranca Next.js y finalmente
Caddy (HTTPS). Ver "Despliegue HTTPS".
No usa `node_modules`, `.next` ni `.venv` del host.

Comandos operativos:

```bash
make docker_ps       # estado y health
make docker_logs     # logs de caddy, frontend, backend y cleanup; Ctrl+C sólo deja de seguirlos
make docker_rebuild  # reconstruye/recrea sin borrar datos
make docker_down     # detiene el stack sin borrar datos
```

`docker_down` nunca usa `down -v` y no existe un target de reset. Los datos
viven en el bind mount real:

```text
../Arefil_backend/backend/data/
├── arefil.db
├── arefil.db-wal / arefil.db-shm (cuando SQLite está activo)
├── uploads/       (Excel originales)
└── backups/       (snapshots SQLite)
```

No borres ese directorio, no uses `docker compose down -v` como hábito y no
copies una base SQLite/WAL activa. Para un respaldo consistente usa
`Administración > Respaldos` o `GET /api/admin/database/backup`.

### Despliegue HTTPS

Dos modos, nunca mezclados:

| Modo | Comando | URL | Sesión |
|---|---|---|---|
| Desarrollo | `make compose_up` (procesos del host) | `http://localhost:3001` | `APP_ENV=development`; `SESSION_COOKIE_SECURE=false` permitido |
| Despliegue interno | `make docker_up` (`compose.yaml`) | `https://<AREFIL_HOSTNAME>` | `APP_ENV=production`, `SESSION_COOKIE_SECURE=true` obligatorio |

Topología de `compose.yaml`:

```text
navegador ──HTTPS:443──▶ caddy ──edge──▶ frontend:3000 ──internal──▶ backend:8000
           (HTTP:80 → 308 a HTTPS)        (Next.js, /backend-api)      (FastAPI, sin puerto en el host)
                                                                        ▲
                                               report-execution-cleanup ┘
                                               (worker periódico, sin puertos)
```

- Sólo Caddy publica puertos (`HTTPS_PORT`/`HTTP_PORT`, 443/80 por defecto).
  Frontend y backend sólo hacen `expose`; el backend vive únicamente en la red
  `internal` (sin salida a internet) y el navegador sólo lo alcanza por
  `/backend-api`. `make test_deploy_config` verifica esto sobre
  `docker compose config`.
- Caddy termina TLS (`deploy/Caddyfile`) y añade
  `Strict-Transport-Security`. `AREFIL_TLS` elige el certificado:
  - `internal` (default): CA local de Caddy. Para que los navegadores
    confíen, exporta su raíz y distribúyela:
    `docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./arefil-root.crt`.
  - CA corporativa/interna: coloca `arefil.crt` (con la cadena) y `arefil.key`
    en `deploy/certs/` (ignorado por Git) y usa
    `AREFIL_TLS="/certs/arefil.crt /certs/arefil.key"`.
  - Let's Encrypt: `AREFIL_TLS=<correo>` si `AREFIL_HOSTNAME` resuelve
    públicamente y los puertos 80/443 son alcanzables.
- Nunca se versionan certificados, llaves ni contraseñas.
- Cookie de sesión: `arefil_session`, `HttpOnly`, `Secure`, `SameSite=Lax`,
  `Path=/`, sin `Domain`. Por HTTP plano el navegador no la guarda ni la envía;
  por eso el puerto 80 sólo redirige a HTTPS.
- Dirección del cliente (límite de login): Caddy sobrescribe
  `X-Forwarded-For` con la dirección que vio e ignora la que mande el cliente;
  el frontend la reenvía (`TRUST_PROXY_FORWARDED_FOR=true`) y el backend sólo
  la acepta desde la IP fija del frontend (`AREFIL_FRONTEND_INTERNAL_IP`, en
  `TRUSTED_PROXIES`).
- `Origin`: el proxy `/backend-api` rechaza escrituras de otro origen y no
  reenvía `Origin`; el backend además rechaza cualquier `Origin` fuera de
  `TRUSTED_ORIGINS` (= `AREFIL_PUBLIC_ORIGIN`).
- El backend en producción se niega a arrancar con `SESSION_COOKIE_SECURE=false`
  u orígenes no HTTPS, y no publica `/docs`, `/redoc` ni `/openapi.json`.

Configuración (`cp .env.docker.example .env` y ajusta):

```bash
AREFIL_HOSTNAME=arefil.example.internal
AREFIL_PUBLIC_ORIGIN=https://arefil.example.internal   # incluye :puerto si HTTPS_PORT != 443
AREFIL_TLS=internal
SESSION_TTL_HOURS=12
REPORT_EXECUTION_CLEANUP_ENABLED=true
REPORT_EXECUTION_CLEANUP_INTERVAL_SECONDS=3600
REPORT_EXECUTION_CLEANUP_BATCH_SIZE=500
REPORT_EXECUTION_CLEANUP_MAX_RECORDS=5000
```

`report-execution-cleanup` usa la misma imagen y bind mount que el backend,
espera su healthcheck y ejecuta exclusivamente
`python -m app.cli.report_executions worker`. No corre migraciones, seed ni
Uvicorn. Por default limpia al iniciar y cada hora, en lotes de 500 y con un
máximo de 5000 registros por ciclo. No publica puertos y sólo pertenece a la
red interna.

Operación:

```bash
docker compose logs --follow report-execution-cleanup
docker compose stop report-execution-cleanup       # detener automatización
docker compose start report-execution-cleanup      # reanudar
docker compose exec backend python -m app.cli.report_executions cleanup --dry-run
```

Para deshabilitarlo de forma declarativa fija
`REPORT_EXECUTION_CLEANUP_ENABLED=false` y recrea el servicio; permanecerá
inactivo hasta volver a habilitarlo. El TTL de snapshots no depende de la
frecuencia del worker y sigue controlado por el backend.

Primer administrador (contraseña pedida de forma interactiva, nunca como
argumento):

```bash
make docker_up
docker compose exec backend python -m app.cli.users create --username <usuario> --role ADMIN
docker compose exec backend python -m app.cli.users create --username <usuario> --role USER
```

Límite de confianza: quien tenga shell en el servidor Docker puede alcanzar el
backend por la IP de su contenedor y administrar usuarios con la CLI; el acceso
al servidor es parte del perímetro de administración. Desde la LAN sólo existen
los puertos de Caddy. El reparto del límite de login por cliente depende de que
Docker conserve la IP de origen (lo hace para clientes externos con la red
bridge por defecto; las conexiones desde el propio host aparecen como la
gateway de Docker).

`BACKEND_DATA_DIR` permite apuntar a otro directorio persistente explícito; el
default siempre es el `backend/data/` real del repo hermano. Desde otra máquina
de la LAN abre `https://<AREFIL_HOSTNAME>` (no `localhost`); abrir 443/80 en el
firewall es responsabilidad del operador.

### Mover Arefil a otra laptop

1. Genera un backup desde Arefil y ejecuta `make docker_down`.
2. Clona ambos repos como hermanos en la laptop nueva.
3. Copia completo `Arefil_backend/backend/data/` con el stack detenido. Incluye
   DB, WAL/SHM si existen, `uploads/` y `backups/`.
4. Asegura que el usuario nuevo sea propietario o pueda escribir el directorio.
5. Ejecuta `make docker_up` desde `Arefil_frontend`.
6. Comprueba catálogo, históricos, archivos fuente y backups antes de retirar
   la copia anterior.

Para restaurar únicamente un snapshot descargado, mantén el stack detenido,
conserva una copia de seguridad del directorio actual y coloca el snapshot como
`backend/data/arefil.db`; conserva también `uploads/` si deben funcionar las
descargas de archivos fuente.

SQLite en WAL debe permanecer en un filesystem local confiable; no uses NFS,
SMB o CIFS para `backend/data/`.

### Imagen frontend

La imagen usa Node 22 Alpine, `npm ci`, output standalone y un runner no-root.
Variables de la imagen:

| Variable | Momento | Default | Uso |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | build | `/backend-api` | Destino visible al navegador; queda horneado en el bundle. |
| `API_INTERNAL_URL` | runtime | `http://127.0.0.1:8000/api` | Destino privado de Server Components y del proxy. |
| `TRUSTED_ORIGINS` | runtime | vacío | Orígenes públicos adicionales aceptados para escrituras vía `/backend-api`. |
| `TRUST_PROXY_FORWARDED_FOR` | runtime | vacío | `true` sólo detrás de un proxy que sobrescribe `X-Forwarded-For`. |
| `HOSTNAME` | runtime | `0.0.0.0` | Bind del servidor standalone. |
| `PORT` | runtime | `3000` | Puerto del servidor standalone. |

El default `/backend-api` permite reutilizar la misma imagen al cambiar de IP o
nombre: el navegador nunca conoce una URL directa del backend.
`TRUST_PROXY_FORWARDED_FOR=true` sólo debe activarse cuando un proxy que
sobrescribe `X-Forwarded-For` (Caddy) es la única entrada.

El healthcheck consulta `GET /api/health` dentro del propio contenedor (no
necesita puertos publicados). Es liveness del proceso Next.js, no readiness del
backend; la conectividad end-to-end puede comprobarse con
`GET https://<AREFIL_HOSTNAME>/backend-api/health`.

## Validación

```bash
npm run lint
npm test
npm run typecheck
npm run build
make test_lifecycle
make test_deploy_config
make compose_up
make compose_down
```
