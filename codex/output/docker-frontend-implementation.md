# Implementación Docker del frontend

Implementación de GitHub #6 sobre `Alejandro120603/Arefil_frontend`, sin
modificar el backend hermano ni crear Docker Compose.

## Arquitectura final

```text
Browser
  -> /backend-api/* (same-origin, URL pública)
  -> Next.js :3000
       -> API_INTERNAL_URL (runtime, server-only)
       -> FastAPI :8000

Server Components
  -> API_INTERNAL_URL (runtime, server-only)
  -> FastAPI :8000
```

El navegador usa `/backend-api` por default. Dentro de la futura red Compose,
Next.js usa `http://backend:8000/api`; el hostname `backend` no se incorpora a
los assets cliente.

## Imagen

- Base: `node:22-alpine`; la validación final resolvió Node `v22.23.2`.
- Etapas: `deps`, `builder`, `runner`.
- Instalación reproducible: `npm ci` con `package-lock.json`.
- Build: Next.js 16.3.0 con `output: "standalone"`.
- Runtime: `node server.js`, `NODE_ENV=production`, `0.0.0.0:3000`.
- Usuario final: `node`, UID observado `1000`.
- Imagen final validada: `sha256:f8585fd39d659f29171b42aeda172ab361457ba169eec62badede5cadaa06b7b`, 82,032,269 bytes.

El runner contiene únicamente los módulos trazados por standalone. Se confirmó
que no contiene TypeScript, ESLint ni Vitest.

## Configuración browser/server

| Variable | Momento | Default | Destino |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | build | `/backend-api` | Navegador; queda horneada en el bundle. |
| `API_INTERNAL_URL` | runtime | `http://127.0.0.1:8000/api` | Server Components y proxy. |
| `HOSTNAME` | runtime | `0.0.0.0` | Bind standalone. |
| `PORT` | runtime | `3000` | Puerto standalone. |

`client.ts` conserva la lógica HTTP común mediante una fábrica. Los módulos
`browser-client.ts` y `server-client.ts`, marcados respectivamente como
`client-only` y `server-only`, inyectan destinos distintos sin detección por
`window`. Lecturas de Server Components y mutaciones/descargas del navegador
quedan en grafos de módulos separados.

El proxy catch-all conserva path, query, JSON, multipart, streams de respuesta,
status y headers como `Content-Disposition`. Solo reenvía headers de aplicación
permitidos; no reenvía `Origin` ni headers internos del proxy. Ante un error de
red registra un mensaje server-side y responde 502 sin revelar la URL interna.

## Healthcheck

`GET /api/health` devuelve `{"status":"ok"}` desde Next.js y se usa como
liveness del contenedor. No consulta FastAPI. `GET /backend-api/health` valida
por separado la comunicación end-to-end.

Durante la prueba se detuvo el backend:

- `/api/health`: HTTP 200.
- `/backend-api/health`: HTTP 502.
- Después de volver a iniciar FastAPI, `/backend-api/health`: HTTP 200.

## Archivos modificados

- Contenedor/configuración: `Dockerfile`, `.dockerignore`, `next.config.ts`,
  `.env.example`, `package.json` y `package-lock.json`.
- Frontera API: clientes browser/server, fábrica HTTP, módulos de dominio,
  proxy `/backend-api/[...path]` y liveness `/api/health`.
- UI: import de descargas separado y comentario de fallback de backup
  actualizado para same-origin.
- Pruebas: `vitest.config.mts`, fixture neutral para `server-only`/`client-only`
  y tres suites API/proxy.
- Documentación: `README.md` y este informe.

## Validación ejecutada

Calidad final:

```text
npm test
  3 archivos, 10 tests: OK

npm run lint
  OK

npm run typecheck
  OK

npm run build
  OK; standalone generado; /api/health y /backend-api/[...path] dinámicos

git diff --check
  OK
```

Los tests cubren:

- fallback local sin `API_INTERNAL_URL`;
- override interno `http://backend:8000/api`;
- destino público same-origin y override absoluto;
- query params y URLs relativas/absolutas;
- JSON, multipart, blobs y `Content-Disposition`;
- errores de validación FastAPI;
- filtrado de headers del proxy;
- respuesta 502 sanitizada.

## Docker y evidencia de requests

Se creó una copia temporal limpia usando únicamente archivos versionados o
versionables del worktree. Antes del build se confirmó que no contenía
`.env.local`, `node_modules` ni `.next`. Desde esa copia:

```text
docker build -t arefil-frontend:issue-6 <copia-limpia>
  OK; npm ci; build standalone; imagen final creada
```

La imagen se ejecutó junto a `arefil-backend:issue-8` en la red y volumen
aislados `arefil-issue6-net` y `arefil-issue6-data`:

```text
frontend Docker health: healthy
backend Docker health: healthy
GET /api/health: 200 {"status":"ok"}
GET /backend-api/health: 200 {"status":"ok"}
GET /: 200 y dashboard mostró Backend "Operativo"
POST multipart inválido por /backend-api: 422 del backend
GET backup SQLite por /backend-api: 200, 102400 bytes
Content-Disposition del backup: preservado
```

El POST multipart detectó inicialmente que reenviar todos los headers de Next
hacía fallar el `fetch` interno antes de llegar a FastAPI. Se corrigió con una
allowlist de headers end-to-end y la prueba real posterior obtuvo el 422
esperado desde el backend.

Dentro del runner se verificó:

```text
UID != 0
.env.local ausente
.git ausente
typescript/eslint/vitest ausentes
backend:8000 ausente de .next/static
API_INTERNAL_URL ausente de .next/static
CMD = ["node", "server.js"]
ExposedPorts = 3000/tcp
```

## Compatibilidad con `make run_panel`

Se ejecutó `make run_panel` con `DATABASE_URL`, `UPLOADS_DIR` y `BACKUPS_DIR`
apuntando a un directorio temporal y con:

```text
NEXT_PUBLIC_API_URL=/backend-api
API_INTERNAL_URL=http://127.0.0.1:8000/api
```

Resultados:

- migración y seed: OK;
- FastAPI `127.0.0.1:8000`: OK;
- Next dev `:3000`: OK;
- proxy local y dashboard `Operativo`: OK;
- `Ctrl+C`: ambos procesos terminaron; no quedaron listeners en 3000/8000.

El interrupt produjo el código esperado de Make 130. El trap exterior de la
prueba no eliminó el directorio temporal, por lo que se borró manualmente tras
confirmar su ruta exacta. No se tocó `Arefil_backend/backend/data`.

## Seguridad

- `.env` y variantes locales, `.git`, artefactos locales y `codex/` quedan
  fuera del contexto; solo se conserva el ejemplo versionable sin secretos.
- Ningún secreto se incorpora a la imagen; `NEXT_PUBLIC_*` se documenta como
  información pública.
- El runner es no-root y no contiene toolchain de desarrollo completo.
- El proxy solo puede construir destinos bajo `API_INTERNAL_URL`; no acepta un
  host arbitrario desde la request.
- No se añadió modo privileged, socket Docker ni servicio adicional.

## Riesgos y deuda

- El proxy materializa cuerpos de request en memoria antes del fetch interno.
  El límite actual del backend es 20 MB; si aumenta sustancialmente debe
  migrarse a streaming con manejo explícito de `duplex`.
- El healthcheck es liveness, no prueba integridad de DB ni readiness completa.
- `node:22-alpine` fija la línea LTS mayor, pero no un digest; builds futuros
  pueden incorporar parches compatibles de Node/Alpine.
- Docker Compose, persistencia final y acceso LAN completo pertenecen a #7.

## Publicación

No se realizó commit, push ni pull request. No se descartaron cambios locales.
