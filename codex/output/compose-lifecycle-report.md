# Reporte de lifecycle local de AREFIL

Fecha: 2026-09-19  
Repositorio orquestador: `Arefil_frontend`  
Branch implementada y publicada: `dev`

## Recon

El flujo anterior estaba formado por el target `make run_panel` y
`scripts/run_panel.sh`. El `Makefile` localizaba el backend por default en
`../Arefil_backend/backend`, su venv en `../Arefil_backend/.venv` y el Python en
`.venv/bin/python`. Validaba `app/main.py`, el ejecutable del venv y los imports
de FastAPI, Uvicorn y Alembic; si faltaba `node_modules`, ejecutaba `npm install`.

`run_panel.sh` resolvía paths absolutos y ejecutaba, desde `backend/`:

1. `python -m alembic upgrade head`;
2. `python -m app.db.seed`, que converge el proveedor Donaldson y el registro
   de reportes de forma idempotente;
3. `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`;
4. `next dev --port 3001`.

El script instalaba traps para `SIGINT`, `SIGTERM` y `EXIT`, usaba `wait -n`
para detectar el primer servicio que terminara y cerraba el otro. Si frontend
moría primero, cerraba el PID principal del backend; si backend moría primero,
cerraba el PID principal del frontend. En ambos casos propagaba el exit code
del primer proceso. El problema era que señalizaba únicamente esos dos PID, no
los árboles creados por el reloader de Uvicorn o por Next.js. Tampoco hacía
preflight de puertos, no conservaba metadata segura y no tenía un comando
idempotente para liberar `8000/3001`.

El backend fue inspeccionado en `dev` y confirmó la estructura `backend/app`,
`backend/migrations`, `backend/alembic.ini`, `backend/requirements.txt`,
`app.main:app`, el seed y los mismos comandos documentados. No fue necesario
modificarlo. Sus tres archivos untracked ajenos se preservaron sin cambios. La
validación real usó un worktree backend limpio y detached de `dev`, para que la
migración untracked de otra feature no se aplicara a la base local original.

También se revisaron `Makefile`, ambos scripts existentes, `package.json`,
`compose.yaml`, Dockerfiles frontend/backend, `.env.example`,
`.env.docker.example`, ambos README, requisitos, puertos y suites existentes.

## Implementación

Archivos del commit funcional:

- `.env.example`: el override local ahora referencia `make compose_up`.
- `Makefile`: agrega `compose_up`, `compose_down` y `test_lifecycle`; conserva
  sin cambios funcionales `docker_up`, `docker_down`, `docker_logs`,
  `docker_ps` y `docker_rebuild`.
- `README.md`: documenta desarrollo local y Docker como flujos separados.
- `scripts/compose_common.sh`: inspección de puertos, PID/proceso, validación de
  identidad y resolución de containers Docker.
- `scripts/compose_up.sh`: migración, seed, preflight, sesiones independientes,
  supervisión y cleanup.
- `scripts/compose_down.sh`: apagado por metadata y liberación dirigida de los
  dos listeners.
- `tests/compose_lifecycle_test.sh`: cobertura aislada del lifecycle.
- `scripts/run_panel.sh`: eliminado; no quedaron referencias oficiales ni una
  dependencia real que justificara un alias legacy.

`compose_up` valida backend, venv, imports Python, Next.js, Node, `setsid` y una
herramienta de inspección de puertos. Antes de migrar o arrancar verifica que
ambos puertos estén libres. Si encuentra un conflicto muestra el puerto, los
datos visibles del PID/proceso y/o el container Docker y aborta sin señalizarlo.

Backend y frontend arrancan mediante `setsid`, cada uno en una sesión y grupo
de procesos propios. El supervisor guarda PID y tiempo de inicio de los líderes,
espera al primero que termina y señaliza el grupo completo del otro. `SIGINT`,
`SIGTERM` y `EXIT` convergen en el mismo cleanup: `SIGTERM`, espera acotada y
`SIGKILL` al grupo solamente si hace falta. Next se ejecuta con telemetría
deshabilitada para evitar procesos detached de flush al apagar desarrollo.

La metadata se guarda fuera de Git en:

```text
${XDG_RUNTIME_DIR:-/tmp}/arefil-compose-<uid>-<hash-del-checkout>/instance
```

El directorio usa modo `0700` y el archivo se crea con umask privado. Antes de
señalizar, `compose_down` valida propietario, checkout, PID, tiempo de inicio y
marker de comando. Una metadata stale nunca autoriza una señal sobre un PID
reutilizado.

Después del apagado conocido, `compose_down` revisa por separado `8000` y
`3001`. Para Docker correlaciona el binding real mediante `docker ps` y
`docker port`, resuelve el nombre con `docker inspect` y ejecuta únicamente
`docker stop <container>`. Nunca mata `docker-proxy`. Para listeners
convencionales identifica sus PID exactos, informa comando, envía `SIGTERM`,
espera cinco segundos y aplica `SIGKILL` solo al listener que continúa ocupando
el puerto. No existen `pkill`, `killall` ni kills globales.

## Docker

Los conceptos quedan separados:

```text
make compose_up / make compose_down = desarrollo local con venv + Next dev
make docker_up  / make docker_down  = stack Docker Compose
```

`compose_up` no invoca Docker Compose. `docker_up/down` y los targets auxiliares
existentes se conservaron. La única interacción Docker de `compose_down` ocurre
cuando un container publica exactamente uno de los dos puertos reservados y es
necesario liberarlo.

## Validaciones

1. Puertos libres: `make compose_up` aplicó todas las migraciones desde una DB
   limpia, ejecutó el seed y levantó ambos servicios. Respondieron HTTP 200
   `GET /api/health`, `GET /docs` y `GET /`; health devolvió
   `{"status":"ok"}`. Ctrl+C produjo exit 130 y eliminó grupos, metadata y
   listeners.
2. AREFIL activo + `make compose_down`: identificó al supervisor conocido,
   cerró Uvicorn reloader/worker y Next parent/server, y liberó ambos puertos.
3. Sin servicios: tres ejecuciones consecutivas terminaron con exit 0 e
   informaron que ambos puertos ya estaban libres.
4. Docker: un container temporal `arefil-compose-lifecycle-test`, basado en la
   imagen local `nginx:1.30.4-alpine`, publicó `127.0.0.1:8000`. Se identificó
   por nombre, se detuvo únicamente ese container y se eliminó por `--rm`.
5. Listener normal: `python3 -m http.server 3001` fue identificado por PID y
   comando, recibió `SIGTERM` y liberó `3001`.
6. Listener que ignoraba SIGTERM: se esperó el margen configurado, se aplicó
   `SIGKILL` a ese PID exacto y `3001` quedó libre.
7. Puerto ocupado al iniciar: el container real
   `cecoc-chatbot-backend-1` fue identificado en `8000`; `compose_up` abortó y
   confirmó que el container seguía ejecutándose. Después `compose_down` lo
   detuvo explícitamente para dejar el puerto final libre, sin afectar sus
   containers vecinos.
8. Falla de un servicio: una primera ejecución de prueba provocó un error de
   Next por un symlink externo de `node_modules` propio del worktree. El
   supervisor detectó que frontend terminó primero y cerró correctamente todo
   Uvicorn; no quedaron listeners ni metadata. Las dependencias se instalaron
   de forma local en el worktree y la prueba exitosa se repitió.
9. Repetición: `down -> up -> down -> up -> down` completó dos ciclos de
   arranque HTTP-ready y apagado sin procesos ni puertos huérfanos.
10. Estado final: `ss -H -ltnp 'sport = :8000 or sport = :3001'` no devolvió
    listeners; tampoco quedaron procesos asociados a los worktrees de prueba.

La suite `make test_lifecycle` cubrió puerto libre, idempotencia, cleanup de
listener convencional, Docker con CLI aislado, backend inexistente, venv
inexistente y conflicto de puerto sin matar al ocupante. Bash `-n`,
`git diff --check` y ShellCheck con severidad warning también pasaron.

## Tests

Frontend, ejecutado desde el worktree limpio de `dev` más el cambio:

```text
npm run lint       PASS
npm run typecheck  PASS
npm test           PASS — 35 archivos, 357 tests
npm run build      PASS — Next.js 16.3.0, 13 páginas estáticas generadas
make test_lifecycle PASS
```

Backend, desde worktree limpio de `Arefil_backend/dev`:

```text
python -m pytest   PASS — 328 tests, 1 warning de deprecación externo
```

El `npm ci` del worktree informó 6 vulnerabilidades de dependencias ya
resueltas por el lockfile (2 moderate, 3 high, 1 critical); no se ejecutó un
`npm audit fix` porque habría ampliado el alcance y modificado dependencias.

## Puertos finales

```text
Backend AREFIL: 8000
Frontend AREFIL: 3001
```

Ambos quedaron libres al terminar las validaciones.

## Git

Commit funcional, hecho sobre `Arefil_frontend/dev` y publicado únicamente a
`origin/dev`:

```text
1a3369d252cbff62366d41e24bd759aaff13c4a3
feat(dev): standardize local lifecycle with compose commands
```

`git status --short --branch`, capturado inmediatamente después del push y
antes de crear este reporte:

```text
## dev...origin/dev
?? codex/output/arefil-frontend-visual-implementation.md
?? codex/output/arefil-frontend-visual-recon.md
?? codex/output/cotizacion-bonatti-e2e.md
?? codex/output/cotizacion-bonatti/
?? codex/output/delete-reports-price-lists.md
?? codex/output/dev-branch-consolidation-report.md
?? codex/scripts/
?? src/app/administracion/reportes/[code]/loading.tsx
?? src/app/administracion/reportes/nuevo/loading.tsx
?? src/app/administracion/respaldos/loading.tsx
?? src/app/donaldson/import/loading.tsx
?? src/app/donaldson/reports/[code]/loading.tsx
?? src/components/donaldson/delete-price-list-button.tsx
?? src/components/donaldson/import-stepper.tsx
?? src/components/donaldson/price-list-delete-dialog.tsx
?? src/components/donaldson/price-list-row.test.tsx
?? src/components/donaldson/price-list-row.tsx
?? src/components/layout/app-header.tsx
?? src/components/layout/page-container.tsx
?? src/components/layout/page-header.tsx
?? src/components/layout/sidebar-provider.tsx
?? src/components/reports/admin-report-row.test.tsx
?? src/components/reports/admin-report-row.tsx
?? src/components/reports/report-catalog-list.test.tsx
?? src/components/reports/report-catalog-list.tsx
?? src/components/shared/
?? src/components/ui/collapsible.tsx
?? src/components/ui/dropdown-menu.tsx
?? src/components/ui/progress.tsx
?? src/components/ui/sonner.tsx
?? src/components/ui/textarea.tsx
?? src/components/ui/tooltip.tsx
?? src/lib/api/price-list-actions.test.ts
?? src/lib/api/price-list-actions.ts
```

Todos esos archivos preexistían y quedaron fuera del commit. Este reporte,
creado después del push para incluir el SHA definitivo, también queda como
artefacto local solicitado y no altera el commit funcional.

`git log --oneline --decorate -10`:

```text
1a3369d (HEAD -> dev, origin/dev, codex/compose-lifecycle) feat(dev): standardize local lifecycle with compose commands
2ef8820 Merge branch 'feat/visual-template-inspector' into dev
3600a49 (tag: backup/pre-consolidation-20260919-frontend-origin-dev) docs(reports): add report builder main integration notes
6cd3623 docs(reports): add Visual Template Builder dev integration notes
798b09c docs(reports): add Visual Template Builder final E2E acceptance notes
b99e7ed fix(reports): keep subfield edits in the repeatable group editor
5bd83b9 fix(reports): stop duplicating rows.row_number in the mapper picker
770f297 fix(reports): refresh template metadata after mapper mutations
e5eff75 fix(reports): close wizard creation preview and history E2E blockers
15357ad fix(reports): include template history dialog dependencies
```

No se hizo checkout, merge, rebase, commit, push ni cambio de configuración
sobre `main`. El backend permaneció en `dev` y no recibió commits.

## Confirmación final

```text
AREFIL desarrollo local:
  make compose_up
  make compose_down

Frontend:
  http://127.0.0.1:3001

Backend:
  http://127.0.0.1:8000

main:
  NO MODIFICADA
```
