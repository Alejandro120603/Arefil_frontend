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

`.env.local` no se versiona (ver `.gitignore`); define ahí la URL del backend:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api
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
en páginas). `apiGet`/`apiPostJson`/`apiUpload`/`apiDownloadBlob` en
`client.ts` manejan JSON, multipart y descargas blob; `errors.ts` normaliza
`detail` de FastAPI (string, objeto o arreglo de errores de validación) a un
mensaje legible vía `ApiError`.

Los campos `Decimal` del backend (p. ej. `unit_price`, `unit_weight_kg`)
llegan como **string** en el JSON y así se tipan en `src/types/api.ts`
(`DecimalString = string`) — nunca se convierten silenciosamente a `number`;
usa `src/lib/format/decimal.ts` para parsearlos al momento de mostrarlos.

## Validación

```bash
npm run lint
npm run typecheck
npm run build
make run_panel
```
