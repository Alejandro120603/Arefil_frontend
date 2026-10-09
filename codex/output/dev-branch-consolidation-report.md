# Consolidación de branches en `dev` — 2026-09-19

Regla respetada: **`main` no fue tocada** (sin merge, commit, push, rebase, delete, cambio de default branch ni protecciones). Flujo único: `feature/fix -> dev`.

## Backend (`Arefil_backend`)

- **Branch inicial:** `reportes` (local, 2 commits por delante de `origin/reportes`).
- **Branches locales encontradas:** `dev`, `reportes`, `feat/report-data-sources`, `main`.
- **Branches remotas encontradas:** `origin/dev`, `origin/reportes`, `origin/main` (`origin/HEAD -> origin/main`). `origin/feat/report-data-sources` ya estaba eliminada en remoto (`gone`).
- **Excluida de la operación:** `main`.
- **Branches con commits exclusivos respecto a `dev`:** **ninguna** (`git log dev..<branch>` = 0 en `reportes`, `origin/reportes` y `feat/report-data-sources`). Los 2 commits locales de `reportes` (`40f4c76`, `c9ac7e9`) ya estaban en `dev`.
- **Branches mergeadas / commits integrados:** ninguna necesaria; `dev` ya contenía todo. No hubo merges.
- **Conflictos:** ninguno.
- **SHA final de `dev`:** `fc87347e827817b936dc432094af433b6a58bfff` (== `origin/dev`; no había nada nuevo que publicar).
- **Tests:** `pytest` sobre un worktree limpio de `dev` con BD SQLite temporal → **328 passed**.
- **Validaciones:**
  - `alembic heads` → un único head (`d9f2a6b4c801`); `alembic upgrade head` desde cero → OK.
  - `python -m compileall app` e `import app.main` → OK.
  - `alembic check` **falla por drift preexistente** (tablas `legacy_*` y tipos Enum vs. VARCHAR). Ya está en `dev` tal cual; no lo causó la consolidación y no se corrigió (fuera de alcance).
  - No hay Makefile, ruff ni mypy configurados. No se levantó Uvicorn.
- **Branches locales finales:** `dev`, `main`.
- **Branches remotas finales:** `origin/dev`, `origin/main` (+ `origin/HEAD -> origin/main`).

## Frontend (`Arefil_frontend`)

- **Branch inicial:** `feat/visual-template-inspector`.
- **Branches locales encontradas:** `dev`, `feat/visual-template-inspector`, `feat/report-data-sources`, `reportes`, `main`.
- **Branches remotas encontradas:** `origin/dev`, `origin/reportes`, `origin/main` (`origin/HEAD -> origin/main`). `origin/feat/report-data-sources` ya estaba `gone`.
- **Excluida de la operación:** `main`.
- **Branches con commits exclusivos respecto a `dev`:**
  - `feat/visual-template-inspector`: 15 commits por delante en SHA. Con `git cherry`, **14 eran patch-equivalentes a commits ya presentes en `dev`** (inspector/mapper, preview, historial de versiones, wizard, fixes E2E, docs; en `dev` con otros SHAs). **1 commit sí era exclusivo**: `0491f22 fix(workspace): restore loading and status component compatibility` (toca `page-skeletons.tsx` — alias de skeletons —, `sidebar.tsx` — exporta `isActive` — y `badge.tsx` — variantes `success`/`warning`).
  - `reportes`, `origin/reportes`, `feat/report-data-sources`: 0 commits exclusivos.
- **Merge realizado:** `git merge --no-ff feat/visual-template-inspector` en `dev` → `2ef8820`. Diff neto: 3 archivos, +11/−1. Tras el merge, `git log dev..feat/visual-template-inspector` = 0.
- **`feat/visual-template-inspector`:** su trabajo quedó **completamente incorporado en `dev`** (14 commits ya presentes + `0491f22` mergeado), publicada en `origin/dev` y luego borrada (backup: tag `backup/pre-consolidation-20260919-frontend-feat-visual-template-inspector` → `e4dc028`).
- **Conflictos:** ninguno (`git merge-tree` limpio previo y merge automático `ort`).
- **SHA final de `dev`:** `2ef882032c115ae5cbfd03059a6c402ed3f4430e` (== `origin/dev`, push `3600a49..2ef8820`, fast-forward, sin force).
- **Tests:** `vitest run` en worktree limpio de `dev` → **35 archivos, 357 tests pasando**.
- **Validaciones (worktree limpio de `dev`):** `npm run lint` → sin errores; `npm run build` → OK (todas las rutas compiladas); `npm run typecheck` → sin errores (tras `build`, que genera los tipos globales `LayoutProps`). No hay Makefile.
- **Branches locales finales:** `dev`, `main`.
- **Branches remotas finales:** `origin/dev`, `origin/main` (+ `origin/HEAD -> origin/main`).

## Protección contra pérdida

- **Trabajo sin commit (NO tocado, sigue en el working tree como untracked):**
  - Frontend: 33 entradas (feature de eliminar reportes/listas de precios y rediseño de layout: `src/components/layout/app-header.tsx`, `page-container.tsx`, `page-header.tsx`, `sidebar-provider.tsx`, `src/components/shared/`, `src/components/donaldson/price-list-*`, `src/lib/api/price-list-actions*`, varios `loading.tsx`, componentes `ui/*`, `codex/output/*`, `codex/scripts/`).
  - Backend: `backend/app/db/models/report_deletion_marker.py`, `backend/app/services/catalog/price_lists.py`, `backend/migrations/versions/ab3d5e7f9012_preserve_report_deletions.py`.
  - Respaldos tar.gz de esos archivos: `~/arefil-backups/frontend-untracked-20260919.tgz` y `~/arefil-backups/backend-untracked-20260919.tgz`.
  - Observación: ese WIP frontend está incompleto por sí solo: `tsc` en el working tree falla con `admin-report-row.tsx: 'deleteReport' no exportado de '@/lib/api/reports'`. Es trabajo en curso, no consecuencia de los merges. Por eso se validó sobre worktrees limpios.
- **Tags de recuperación locales (no publicados):** `backup/pre-consolidation-20260919-<repo>-<branch>` para cada branch borrada, además de `...-origin-dev` y `...-origin-reportes`. Ninguno sobre `main`.
- Sin `reset --hard`, `clean`, force-push ni descarte de cambios.
- Nota: en backend, `git branch -d reportes` se negó (estaba 2 commits por delante de `origin/reportes`); tras confirmar `git log dev..reportes` = 0 y que existía el tag de respaldo, se usó `-D`.
- Solo se publicó `dev` (frontend). Se borró en remoto únicamente `origin/reportes` en ambos repos.

## Verificación previa al borrado

```
### frontend — verificación previa al borrado
$ git log dev..feat/report-data-sources  -> 0 commits; merge-base --is-ancestor: YES
$ git log dev..feat/visual-template-inspector  -> 0 commits; merge-base --is-ancestor: YES
$ git log dev..reportes  -> 0 commits; merge-base --is-ancestor: YES
$ git log dev..origin/reportes  -> 0 commits; merge-base --is-ancestor: YES
$ git branch --merged dev
* dev
  feat/visual-template-inspector
  feat/report-data-sources
  reportes
  main
$ git branch -r --merged dev
  origin/dev
  origin/reportes

### backend — verificación previa al borrado
$ git log dev..feat/report-data-sources  -> 0 commits; merge-base --is-ancestor: YES
$ git log dev..reportes  -> 0 commits; merge-base --is-ancestor: YES
$ git log dev..origin/reportes  -> 0 commits; merge-base --is-ancestor: YES
$ git branch --merged dev
* dev
  reportes
  feat/report-data-sources
  main
$ git branch -r --merged dev
  origin/dev
  origin/reportes
```

## Verificación final — Frontend
```
$ git status --short
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
$ git branch
* dev
  main
$ git branch -r
  origin/dev
  origin/HEAD -> origin/main
  origin/main
$ git log --oneline --decorate -15 dev
2ef8820 (HEAD -> dev, origin/dev) Merge branch 'feat/visual-template-inspector' into dev
3600a49 (tag: backup/pre-consolidation-20260919-frontend-origin-dev) docs(reports): add report builder main integration notes
6cd3623 docs(reports): add Visual Template Builder dev integration notes
798b09c docs(reports): add Visual Template Builder final E2E acceptance notes
b99e7ed fix(reports): keep subfield edits in the repeatable group editor
5bd83b9 fix(reports): stop duplicating rows.row_number in the mapper picker
770f297 fix(reports): refresh template metadata after mapper mutations
e5eff75 fix(reports): close wizard creation preview and history E2E blockers
15357ad fix(reports): include template history dialog dependencies
97e0be8 docs(reports): add report creation wizard delivery notes
be5f1e6 feat(reports): add guided wizard for report creation/configuration
7819d10 docs(reports): add version history delivery notes
409d406 feat(reports): add Excel template version history and restore
370fb35 docs(reports): add visual template preview delivery notes
2e36554 feat(reports): add rendered-document preview to the visual template editor
```

## Verificación final — Backend
```
$ git status --short
?? backend/app/db/models/report_deletion_marker.py
?? backend/app/services/catalog/price_lists.py
?? backend/migrations/versions/ab3d5e7f9012_preserve_report_deletions.py
$ git branch
* dev
  main
$ git branch -r
  origin/dev
  origin/HEAD -> origin/main
  origin/main
$ git log --oneline --decorate -15 dev
fc87347 (HEAD -> dev, tag: backup/pre-consolidation-20260919-backend-origin-dev, origin/dev) docs(reports): add report builder main integration notes
f4d176e docs(reports): add Visual Template Builder dev integration notes
c9ac7e9 (tag: backup/pre-consolidation-20260919-backend-reportes) test(reports): cover disabled builder preview snapshots
40f4c76 feat(reports): integrate visual XLSX inspector mappings preview and history
893d9df (tag: backup/pre-consolidation-20260919-backend-origin-reportes) Merge pull request #27 from Alejandro120603/feat/report-data-sources
8a3f8a3 (tag: backup/pre-consolidation-20260919-backend-feat-report-data-sources) feat(reports): support dynamic XLSX filenames
129305e feat(reports): add immutable execution snapshots
e7f211c feat(reports): validate XLSX templates before activation
feac21d feat(reports): add native XLSX row numbering
ba957c3 feat(reports): replace Stimulsoft with XLSX report templates
0ac5138 feat(reports): add document templates and Stimulsoft exports
9d33dc7 feat(reports): complete dynamic quotation engine
474d178 actualizacion de reportes
4c3ab27 prueba
22a3113 refactor(reports): remove Stimulsoft backend integration
```

## Confirmación final

`Arefil_backend -> todo el desarrollo consolidado en dev`

`Arefil_frontend -> todo el desarrollo consolidado en dev`

`main -> NO MODIFICADA` (Arefil_backend)

`main -> NO MODIFICADA` (Arefil_frontend)
