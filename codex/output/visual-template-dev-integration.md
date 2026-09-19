# Visual Template Builder — integración frontend a `dev`

Fecha: 2026-09-19 · Repo: `Arefil_frontend` · Sin push, sin PR, sin merge a `main`.

## 1. Estado inicial

| Ref | SHA |
|---|---|
| branch de trabajo | `feat/visual-template-inspector` (`e4dc0283fe850bd99095176cb1dd42a7c605314d`) |
| `dev` (local) | `2d8f1b68edaa158b43bb68a3fb3605006e51cf5d` (2 commits sobre `origin/dev`) |
| `origin/dev` | `074570d59de3a4910806a4b8579e549615bc0b8d` |
| `main` = `origin/main` | `f407ff636fe6e0ad5690ce8baa17206c985232e2` |
| `reportes` (local, desactualizado) | `c520507fd9c840ef0ef26d4c8b8dfe2cd71f0832` |
| `origin/reportes` | `7b934adce09e50c6a68ce6bce85070f7a7451696` |

- `dev` local (`2d8f1b6`, commits `4ea5c49` y `2d8f1b6` sólo locales) es **ancestro de `origin/reportes`** y de la
  rama feature. Diferencia `origin/dev..dev` = 2; `dev..origin/dev` = 0.
- `origin/reportes..feat/visual-template-inspector` = 15 commits: 14 del batch + `0491f22` (ajeno).
- `git fetch --all --prune` sólo eliminó `origin/feat/report-data-sources`.

**Hallazgo clave:** `dev` no contenía la base del report builder (9 commits + merge PR #28 de `origin/reportes`: configurador de
cotización, flujo XLSX, filenames dinámicos). El batch VTB depende de ella (`report-excel-template-card`,
`api/reports.ts`, `types/api.ts`…), así que entra como **prerequisito** ya publicado, no como trabajo ajeno.

## 2. Estrategia

1. `git worktree add <scratch>/fe-dev dev` (workspace original intacto).
2. `git merge --ff-only origin/reportes` (dev = `7b934ad`; contiene sus 2 commits locales, ya presentes en `reportes`).
3. `git cherry-pick` ordenado de los 14 commits del batch, **saltando `0491f22`**. Sin conflictos, sin merge commit
   nuevo, sin squash.

Verificación de no-fuga: `git diff dev feat/visual-template-inspector` = **exactamente** los 3 archivos de `0491f22`
(`page-skeletons.tsx`, `sidebar.tsx`, `badge.tsx`); el resto del árbol es idéntico. `git cherry`/patch-id: los 14
commits son equivalentes a los originales.

## 3. Commits incluidos (SHA original → SHA en `dev`)

| Original | En dev | Mensaje |
|---|---|---|
| `a0b4c88` → `a771524` | feat(reports): add visual template inspector and cell mapper |
| `01bedcb` → `daf1e97` | docs(reports): add visual template inspector/mapper delivery notes |
| `704d5d8` → `2e36554` | feat(reports): add rendered-document preview to the visual template editor |
| `b8d01e4` → `370fb35` | docs(reports): add visual template preview delivery notes |
| `adba970` → `409d406` | feat(reports): add Excel template version history and restore |
| `a3180e5` → `7819d10` | docs(reports): add version history delivery notes |
| `a7b2556` → `be5f1e6` | feat(reports): add guided wizard for report creation/configuration |
| `b8ed597` → `97e0be8` | docs(reports): add report creation wizard delivery notes |
| `7dee4c5` → `15357ad` | fix(reports): include template history dialog dependencies |
| `8a836e0` → `e5eff75` | fix(reports): close wizard creation preview and history E2E blockers |
| `9c43a75` → `770f297` | fix(reports): refresh template metadata after mapper mutations |
| `1d6342a` → `5bd83b9` | fix(reports): stop duplicating rows.row_number in the mapper picker |
| `569a03a` → `b99e7ed` | fix(reports): keep subfield edits in the repeatable group editor |
| `e4dc028` → `798b09c` | docs(reports): add Visual Template Builder final E2E acceptance notes |

`569a03a` (fix `replaceGroup()` del editor de grupo repetible, necesario para el paso 3 del wizard) → `b99e7ed`;
`1d6342a` (fix `rows.row_number` duplicado) → `5bd83b9`. Los SHAs cambian sólo porque `0491f22` ya no está en la
cadena. Base prerequisito: `origin/reportes` (`7b934ad`) y sus commits (ver `git log --no-merges origin/dev..7b934ad`).

## 4. Commits excluidos

- **`0491f22` fix(workspace): restore loading and status component compatibility** — 100 % ajeno a VTB: alias en
  `page-skeletons.tsx` (los consumen sólo 5 `loading.tsx` sin commit), `export isActive` en `sidebar.tsx` (sólo lo usa
  `app-header.tsx` sin commit) y variants `success`/`warning` del `Badge` (ningún archivo trackeado los usa).
  `git grep` en el batch confirmó que ningún archivo VTB los referencia; lint/typecheck/build/tests pasan sin él.
- Ningún equivalente accidental entró (ver verificación de árbol en §2).

## 5. Conflictos

Ninguno. Ninguna dependencia técnica del batch hacia `0491f22`, por lo que no hizo falta commit de corrección.

## 6. Archivos unrelated preservados (sin commit, sin tocar)

`codex/output/{arefil-frontend-visual-implementation,arefil-frontend-visual-recon,cotizacion-bonatti-e2e,delete-reports-price-lists}.md`,
`codex/output/cotizacion-bonatti/`, `codex/scripts/`, 5 × `loading.tsx`, `src/components/donaldson/{delete-price-list-button,import-stepper,price-list-delete-dialog,price-list-row(+test)}.tsx`,
`src/components/layout/{app-header,page-container,page-header,sidebar-provider}.tsx`, `src/components/reports/{admin-report-row,report-catalog-list}(+test).tsx`,
`src/components/shared/`, `src/components/ui/{collapsible,dropdown-menu,progress,sonner,textarea,tooltip}.tsx`,
`src/lib/api/price-list-actions(+test).ts`. `git status` del workspace original idéntico al inicial. No se agregó `sonner`
a `package.json` (lo necesita sólo trabajo ajeno).

## 7. HEAD final de `dev`

Código integrado: `798b09cf7353f3d77ec10c3ee885a15fcd7349e8`. Encima, un commit de docs con este archivo
(validaciones hechas sobre `798b09c`).

## 8. `dev` vs `origin/dev`

`origin/dev..dev` = 26 commits (2 `fix(dev)` locales previos + 9 base + merge PR #28 + 14 VTB, + 1 docs), `dev..origin/dev` = 0
→ el push posterior es fast-forward. `git diff --check origin/reportes..dev` limpio (el diff completo vs `origin/dev`
marca un espacio final en `codex/output/REPORT_DATA_SOURCES_RUNTIME_FIX.md`, doc preexistente de la base).

## 9. Validaciones (worktree limpio, `npm ci`)

| Check | Resultado |
|---|---|
| Vitest | **357/357** tests, 35 archivos |
| `npm run lint` | limpio |
| `npm run typecheck` | limpio (*) |
| `npm run build` | OK, 18 rutas |
| `docker build .` | OK |
| `git diff --check` (rango VTB) | limpio |

(*) En árbol recién clonado `tsc --noEmit` falla con `Cannot find name 'LayoutProps'` en `src/app/layout.tsx` hasta que
Next genera sus tipos (`next build`/`next typegen`); tras el build pasa. Comportamiento de Next 16, preexistente,
no relacionado con el batch.

## 10. Smoke integrado dev + dev

Contenedores construidos desde ambos `dev` (backend :8210, frontend :3210, red/volumen/imágenes temporales ya
eliminados). Flujo completo a través del proxy `/backend-api` del frontend, 26/26 PASS: páginas SSR
`/administracion/reportes`, `/nuevo`, `/[code]/configurar?step=3`, `/[code]/plantilla` y runtime público responden 200;
crear/configurar reporte, subir plantilla sintética, inspeccionar, mapear `report.*`/`parameters.*`/`rows.*`/`summary.*`,
guardar mappings, snapshot de ejecución, render-preview, descarga con el mismo `execution_id`, historial, restore
(nueva versión activa) y habilitar reporte.
**Limitación honesta:** los clics del wizard en navegador no se repitieron; esa capa (wizard, mapper, preview, historial)
se cubre con los 357 tests y con el E2E de navegador previo (`visual-template-final-e2e.md`) sobre código idéntico salvo
`0491f22`.

## 11. `dev` vs `main`

- `main` es ancestro de `dev` → merge futuro **fast-forward**; 0 commits en `main` ausentes de `dev`.
- 34 commits en `dev` no en `main` (8 ya presentes en `origin/dev`, 2 `fix(dev)` de puertos, 9 base + merge PR #28 de
  `origin/reportes` y 14 del batch VTB); 125 archivos, +22 793/−28.
- `git merge-tree --write-tree main dev` → sin conflictos.
- Sensibles que cambian respecto de `main`: `package.json`, `package-lock.json`, `compose.yaml`, `Makefile`,
  `next.config.ts`, `scripts/run_panel.sh`, `.env.example`, `.env.docker.example` (vienen de la base y de los
  `fix(dev)` de puertos, no del batch VTB; el batch no toca `package*.json`).
- Migraciones: n/a (frontend).
- No hay trabajo ajeno a Reportes/VTB en `dev`.

## 12. Riesgos restantes

- El PR a `main` será grande (34 commits) y arrastra los 2 `fix(dev)` de puertos (`3001`, `BACKEND_PORT`).
- Mensajes poco descriptivos heredados de la base (`prueba`, `actualizacion reportes`, `final`).
- Cuando se integre el trabajo ajeno (borrado de reportes/listas) hará falta `deleteReport()` en `api/reports.ts`,
  `sonner` en `package.json` y, con `0491f22`, revisar conflictos menores.
- Sin verificación en navegador de la UI tras la integración (ver §10).

## 13. Próximo paso hacia `main`

Emparejar con backend (`dev` backend = base + VTB; mismos contratos `/api/admin/reports/{code}/excel-template/*`).
```
git fetch origin
git push origin dev                                    # (acción del usuario; fast-forward)
gh pr create --base main --head dev                    # o, sin PR: git switch main && git merge --ff-only dev
```
