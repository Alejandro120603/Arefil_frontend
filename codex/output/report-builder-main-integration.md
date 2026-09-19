# Report Builder + Visual Template Builder — integración `dev` → `main` (frontend)

Fecha: 2026-09-19 · Repo: `Arefil_frontend`. Sin force push, sin deploy a producción. Backend se integró y validó primero (`Arefil_backend` PR #32 → `main@00d618f`).

## 1. Estado inicial
`dev` local `6cd3623` (validado), `origin/dev` `074570d` (desactualizado, 27 commits atrás), `origin/main` = `main` = `f407ff6`.
`git fetch --all --prune` antes de subir: sin cambios remotos; `main` ancestro de `dev`. Workspace original en `feat/visual-template-inspector` con 33 archivos sin commit (§13).

## 2. SHA `origin/dev`
Antes `074570d59de3a4910806a4b8579e549615bc0b8d` → después del push `6cd3623a9deb5a14dd2c5abfe7d6615a8d2b0e88` (fast-forward). Este documento va en un commit posterior de docs sobre `dev` (§11).

## 3. SHA `origin/main`
Antes `f407ff636fe6e0ad5690ce8baa17206c985232e2` → después `03d4b695fd151ff928fe6e6e5f11b4daf35a63a2`.

## 4–5. PR
https://github.com/Alejandro120603/Arefil_frontend/pull/34 — `feat: integrate report builder visual template workflow`.
Checks: GitGuardian pass; Greptile Review *pending* (externo/opcional, sin branch protection). Sin GitHub Actions.
PR: 35 commits, 126 archivos, +22 938/−28, `MERGEABLE`. `gh pr diff` no admite >20 000 líneas; la lista de archivos se verificó vía API (126) contra `git diff origin/main...dev`.

## 6. Estrategia de merge
`gh pr merge --merge` (merge commit `03d4b69`); árbol de `main` = árbol de `dev@6cd3623`. `dev` conservada.

## 7. Commits integrados / verificación explícita
Base Report Builder (8 commits ya en `origin/dev`, 2 `fix(dev)` de puertos, 9 de `origin/reportes` + merge PR #28) y Visual Template Builder #29–#33 (14 commits).
- `0491f22` **no** está (ni su contenido: sin `success`/`warning` en `Badge`, sin `export isActive`, sin alias en `page-skeletons`).
- `569a03a` (`replaceGroup`) → **`b99e7ed`** ✔; `1d6342a` (`rows.row_number`) → **`5bd83b9`** ✔.
- Sin `deleteReport` de borrado de reportes (solo `deleteReportExcelTemplate`, que es del builder), sin `sonner`, sin `src/components/shared`, `admin-report-row`, `price-list-actions`, layout/Donaldson ajenos (grep sobre archivos del PR vacío). Los dos `loading.tsx` del diff ya eran archivos trackeados de la base.
- **Cambios heredados que también pasan a `main`:** puerto frontend por defecto `3000` → **`3001`** (`compose.yaml`, `Makefile`, `.env.example`, `.env.docker.example`, con `CORS_ORIGINS` acordes); `-include .env.local` y `BACKEND_PORT` configurable (`Makefile`, `scripts/run_panel.sh`); cierre ordenado de procesos en `run_panel.sh`; `allowedDevOrigins` y redirects en `next.config.ts`; devDependencies `@testing-library/react`, `@testing-library/user-event`, `jsdom`; `package-lock.json`.

## 8. Validaciones pre-merge (worktree limpio de `dev`, `npm ci`)
Vitest **357/357** (35 archivos), lint OK, typecheck OK (tras `next build`), build OK, `docker build` OK, `git diff --check origin/reportes..dev` limpio.

## 9. Validaciones post-merge (worktree limpio de `origin/main@03d4b69`)
Vitest **357/357**, lint OK, build OK, typecheck OK, `docker build` OK. `git diff --check` sobre todo el diff vs `main` anterior marca un espacio final preexistente en `codex/output/REPORT_DATA_SOURCES_RUNTIME_FIX.md` (doc de la base); el rango del batch es limpio.

## 10. Estado final de `main`
`03d4b695fd151ff928fe6e6e5f11b4daf35a63a2`.

## 11. Estado final de `dev`
Conservada: `6cd3623` + commit de docs con este archivo. `main` no contiene este archivo hasta el próximo PR (para que `main` sea exactamente el código validado).

## 12. Smoke main + main
Imágenes Docker construidas desde `origin/main` de ambos repos (backend `00d618f`, frontend `03d4b69`) en red temporal, frontend :3210 → `API_INTERNAL_URL=http://backend:8000/api`. **26/26 pasos PASS por el proxy `/backend-api/*`**: `/administracion/reportes`, `/nuevo`, `/[code]/configurar?step=3`, `/[code]/plantilla` y runtime público responden 200; crear/configurar reporte, plantilla XLSX, inspector, mappings, guardar, ejecución, render-preview, descarga con el mismo `execution_id`, historial, restore, finalizar. Además ejecución desde runtime normal: `POST /reports/{code}/data` y `document/xlsx` sin `execution_id` → 200.
Revisión en navegador: el editor visual `/plantilla` renderizó la cuadrícula (v3 tras restore) y el diálogo *Historial de versiones* abrió listando v3/v2/v1; el renderer del navegador dejó de responder después, así que **no** se hicieron clics de mapeo/preview/restore en UI. Esa capa la cubren los 357 tests y el E2E de navegador previo. La app no tiene login (no hay pantalla de autenticación).

## 13. Archivos unrelated preservados (33, intactos)
`codex/output/{arefil-frontend-visual-implementation,arefil-frontend-visual-recon,cotizacion-bonatti-e2e,delete-reports-price-lists}.md`, `codex/output/cotizacion-bonatti/`, `codex/scripts/`, 5 × `loading.tsx`, componentes `donaldson/*` de borrado, `layout/{app-header,page-container,page-header,sidebar-provider}`, `reports/{admin-report-row,report-catalog-list}`, `components/shared/`, `ui/{collapsible,dropdown-menu,progress,sonner,textarea,tooltip}`, `lib/api/price-list-actions(+test)`.

## 14. Riesgos / deuda
- **Puerto por defecto del frontend cambia a 3001**: ajustar proxy/firewall/compose del servidor (o fijar `FRONTEND_PORT`) y `CORS_ORIGINS` del backend.
- Desplegar backend antes que frontend; respaldar la BD (migraciones).
- Sin verificación completa de clics en navegador tras el merge (ver §12).
- Sin CI automático; Greptile sin resultado.
- El trabajo pendiente de borrar reportes/listas necesitará `deleteReport()`, `sonner` en `package.json` y probablemente `0491f22` o equivalente.
- Mensajes heredados poco descriptivos (`prueba`, `final`).
