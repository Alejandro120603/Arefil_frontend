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

## `make run_panel`

Comando principal: levanta backend + frontend juntos desde la raíz de este repo.

```bash
make run_panel
```

Esto:

1. Valida que `Arefil_backend` y su entorno virtual existan (falla con mensaje
   accionable si no).
2. Instala dependencias de frontend si `node_modules` no existe.
3. Corre `alembic upgrade head` sobre el backend.
4. Corre el seed idempotente de Donaldson (`python -m app.db.seed`).
5. Levanta FastAPI con `--reload` en `:8000`.
6. Levanta Next.js dev en `:3000`.
7. Muestra los logs de ambos procesos en la misma terminal.
8. `Ctrl+C` detiene ambos limpiamente; si uno de los dos procesos muere, el
   script detiene el otro y termina con código de error. No quedan procesos
   `uvicorn`/`node` huérfanos (ver `scripts/run_panel.sh`).

Variables configurables (todas con default razonable):

```bash
make run_panel BACKEND_DIR=../Arefil_backend/backend BACKEND_PORT=8000 FRONTEND_PORT=3000
```

### `make setup_panel`

Preparación inicial: crea el `.venv` del backend si falta, instala sus
dependencias (`pip install -r requirements.txt`) e instala las del frontend
(`npm install`).

```bash
make setup_panel
```

## URLs

- Frontend: <http://localhost:3000>
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

Los campos `Decimal` del backend (p. ej. `unit_price`, `unit_weight_kg`)
llegan como **string** en el JSON y así se tipan en `src/types/api.ts`
(`DecimalString = string`) — nunca se convierten silenciosamente a `number`;
usa `src/lib/format/decimal.ts` para parsearlos al momento de mostrarlos.

## Docker

Docker Compose es la forma portable oficial y una alternativa a
`make run_panel`; no reemplaza el desarrollo local. Desde este repositorio:

```bash
make docker_up
```

El preflight valida Docker, el daemon, Compose, ambos Dockerfiles, el repo
hermano y que el directorio persistente sea escribible. Después construye ambas
imágenes, arranca FastAPI, espera su healthcheck y finalmente arranca Next.js.
No usa `node_modules`, `.next` ni `.venv` del host.

Comandos operativos:

```bash
make docker_ps       # estado y health
make docker_logs     # logs de ambos servicios; Ctrl+C solo deja de seguirlos
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

### Configuración y puertos

Los defaults son:

- Frontend: <http://localhost:3000>
- Backend: <http://localhost:8000>
- Swagger: <http://localhost:8000/docs>

Se pueden cambiar los puertos publicados sin alterar los puertos internos:

```bash
make docker_up FRONTEND_PORT=3100 BACKEND_PORT=8100
```

Los Make targets construyen el backend con el UID/GID del usuario actual para
que el proceso no-root pueda escribir el bind mount. Para usar Compose
directamente:

```bash
AREFIL_UID="$(id -u)" AREFIL_GID="$(id -g)" \
  docker compose up --detach --build --wait
```

`.env.docker.example` documenta overrides opcionales. Puede copiarse a `.env`
y ajustarse sin versionar secretos:

```bash
cp .env.docker.example .env
```

`BACKEND_DATA_DIR` permite apuntar a otro directorio persistente explícito; el
default siempre es el `backend/data/` real del repo hermano.

### Browser, red interna y LAN

Next.js usa `API_INTERNAL_URL=http://backend:8000/api` dentro de la red Compose.
El navegador usa `/backend-api` sobre el mismo origen del frontend, por lo que
nunca intenta resolver `backend` ni requiere una IP pública horneada en la
imagen.

Desde otra laptop en la misma LAN abre:

```text
http://IP-DE-LAPTOP-SERVIDOR:3000
```

No uses `localhost` en la laptop cliente: apuntaría a esa laptop, no al servidor.
Compose publica 3000 y 8000 en las interfaces del host; permitir tráfico en el
firewall/red local es responsabilidad del operador. Los scripts no modifican
reglas de firewall.

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
| `HOSTNAME` | runtime | `0.0.0.0` | Bind del servidor standalone. |
| `PORT` | runtime | `3000` | Puerto del servidor standalone. |

El default `/backend-api` permite reutilizar la misma imagen al cambiar de IP o
acceder desde otra laptop. Si se necesita que el navegador consulte FastAPI de
forma directa fuera de Compose, la URL pública puede sobrescribirse durante
el build:

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://192.168.1.20:8000/api \
  -t arefil-frontend .
```

Ese modo exige reconstruir la imagen si cambia la dirección y configurar CORS
en FastAPI. `NEXT_PUBLIC_*` nunca debe contener secretos.

El healthcheck consulta `GET /api/health` en el propio frontend. Es liveness del
proceso Next.js, no readiness del backend; la conectividad end-to-end puede
comprobarse con `GET /backend-api/health`.

## Validación

```bash
npm run lint
npm test
npm run typecheck
npm run build
make run_panel
```
