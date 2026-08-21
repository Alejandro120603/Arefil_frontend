# Arefil — Frontend

Panel de administración de Arefil. Next.js (App Router) + TypeScript estricto +
Tailwind CSS + shadcn/ui, consumiendo el backend FastAPI de `Arefil_backend`.

## Requisitos

- Node.js 20.9+ y npm
- Python 3.11+ (para el backend hermano)
- El repositorio `Arefil_backend` clonado como repo hermano de este:

  ```text
  ~/projects/
    Arefil_frontend/   (este repo)
    Arefil_backend/
      .venv/            (entorno virtual del backend, ver más abajo)
      backend/          (código FastAPI, Alembic, requirements.txt)
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

La imagen de producción usa Node 22 Alpine, `npm ci`, el output standalone de
Next.js y un runner no-root. Docker es una segunda forma de ejecución; no
reemplaza `make run_panel`.

Construir el frontend:

```bash
docker build -t arefil-frontend .
```

Al ejecutarlo junto al contenedor del backend, ambos deben compartir una red y
el backend debe tener el alias `backend`:

```bash
docker run --rm \
  --name arefil-frontend \
  --network arefil \
  -p 3000:3000 \
  -e API_INTERNAL_URL=http://backend:8000/api \
  arefil-frontend
```

La creación de la red, el contenedor backend y su almacenamiento persistente se
integrará mediante Docker Compose en la siguiente fase. Mientras tanto, sigue
las instrucciones Docker de `../Arefil_backend/README.md`; nunca ejecutes el
backend sin montar almacenamiento persistente en `/app/data` si contiene datos
reales.

Variables de la imagen:

| Variable | Momento | Default | Uso |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | build | `/backend-api` | Destino visible al navegador; queda horneado en el bundle. |
| `API_INTERNAL_URL` | runtime | `http://127.0.0.1:8000/api` | Destino privado de Server Components y del proxy. |
| `HOSTNAME` | runtime | `0.0.0.0` | Bind del servidor standalone. |
| `PORT` | runtime | `3000` | Puerto del servidor standalone. |

El default `/backend-api` permite reutilizar la misma imagen al cambiar de IP o
acceder desde otra laptop. Si se necesita que el navegador consulte FastAPI de
forma directa, la URL pública puede sobrescribirse durante el build:

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
