# Arefil Frontend — Visual Recon

Fecha del recon: 2026-09-03  
Alcance: inspección estática y técnica de los tres árboles de trabajo locales; sin implementar, instalar dependencias, cambiar ramas, ejecutar migraciones ni modificar código de producto.

## 1. Executive summary

Arefil no necesita una sustitución de arquitectura ni un “theme” espectacular. Ya tiene la parte difícil: rutas útiles, Server Components para listados, estados de error, carga, tablas, un flujo de importación con máquina de estados, un runtime genérico de reportes y un constructor de reportes considerablemente maduro. El problema visual es que casi todas esas capacidades se presentan con la misma gramática: título, texto gris, una o varias cards blancas con borde y bloques separados por `gap-6`. Eso hace que funciones importantes y secundarias pesen casi lo mismo, produce páginas verticalmente largas y da una apariencia de panel aún sin terminar.

Decisión principal: mantener la estructura funcional de `Arefil_frontend`, no copiar un prototipo completo. La combinación recomendada es:

- navegación, rutas, modelos de datos y lógica de Arefil;
- superficies neutras, sombras extremadamente suaves, soporte conceptual de tema y composición responsive inspirados en `prototipo2`;
- disciplina de formulario, validación visible y algunas microinteracciones inspiradas en `prototipo1`;
- primitives de la instalación actual de shadcn/ui (`base-nova` sobre Base UI), evitando traer primitives Radix antiguas de los prototipos;
- un lenguaje B2B propio: denso, sobrio, con una sola tonalidad de marca y color reservado para significado.

Hallazgos que determinan el plan:

1. `Arefil_frontend` está en Next.js 16.3.0, React 19.2.8, Tailwind 4.3.3 instalado y shadcn 4.16.2 con estilo `base-nova`. Es una base más actual que `prototipo2` y no debe degradarse para copiarlo.
2. No existen Tremor, una librería de charts, una librería de tablas, React Hook Form, Zod directo, Sonner ni un proveedor de tema. El gráfico de histórico es SVG propio y las tablas son el primitive `Table` de shadcn.
3. Ya existen diez primitives shadcn/locales útiles: Alert, Badge, Button, Card, Input, Label, Select, Separator, Skeleton y Table. Sin embargo, la aplicación sigue usando numerosos `<select>` y checkboxes nativos; el `Select` existente apenas se aprovecha.
4. No existe header de escritorio. El shell es sidebar fija + contenido. Faltan contexto persistente, acciones a nivel de página y una regla de ancho adaptable al tipo de pantalla.
5. Los listados de precios y productos ya deberían seguir siendo tablas. Convertirlos a cards reduciría densidad y comparabilidad.
6. El mayor problema de composición está en `/administracion/reportes/[code]`: definición, parámetros, columnas, totales, formato, preview y plantilla Excel forman una secuencia extensa de cards y subcards. Requiere navegación interna/tabs y edición progresiva, no un modal gigante.
7. El flujo de importación actual cubre seleccionar, analizar, previsualizar, confirmar y resultado. No cubre selección de hoja ni progreso porcentual porque el contrato de `src/lib/api/imports.ts` y `ImportPreviewResponse` no expone esos datos. La UI no debe fingir esas etapas hasta que el backend las soporte.
8. `prototipo1` es principalmente una landing y autenticación; además, su estado local más reciente contiene una migración Odoo/QWeb no versionada. Sus cards bento, mapa, orbits y efectos WebGL son marketing, no piezas de backoffice.
9. `prototipo2` también es una landing. Aporta más a la dirección visual —neutralidad, dark mode, containers y profundidad suave— pero menos código directamente reutilizable por estar en Next 14/React 18, usar Framer Motion y no usar el stack shadcn/Base UI de Arefil.
10. La primera mejora de alto impacto no es animación: es un shell consistente, `PageHeader`, toolbars integradas, mejores estados vacíos, tablas más legibles y jerarquía clara entre acción primaria, secundaria y destructiva.

### Estado de ramas y árboles inspeccionados

| Repositorio | Estado inspeccionado | Observación |
| --- | --- | --- |
| `Arefil_frontend` | rama `feat/report-data-sources`, commit `7e6eb07`, alineada con `origin/feat/report-data-sources` | Es la rama local con trabajo de reportes más reciente. Se preservaron cuatro archivos modificados sin commit y artefactos no rastreados bajo `codex/`. |
| `prototipo1` | rama `main`, commit `aa048ae`, alineada con `origin/main` | Hay cambios locales en `.gitignore` y `package.json`, más `gruponyx_website/`, `scripts/` y `tools/` no rastreados. La migración Odoo es visualmente equivalente al legado Next y se consideró como la variante local más reciente. |
| `prototipo2` | directorio sin `.git` | No es posible validar rama, commit ni remoto. Se analizó el árbol local tal como está; `README.md`/`package.json` fueron actualizados el 2026-08-27 y el resto muestra timestamps anteriores. |

## 2. Stack actual

### Arefil_frontend

Evidencia principal: `Arefil_frontend/package.json`, `Arefil_frontend/components.json`, `Arefil_frontend/src/app/globals.css`, `Arefil_frontend/src/app/layout.tsx`.

| Área | Estado actual | Evidencia / decisión |
| --- | --- | --- |
| Next.js | 16.3.0 exacto | `package.json`; App Router bajo `src/app/`. |
| React / React DOM | 19.2.8 | `package.json`. |
| TypeScript | 5.9.3 instalado, `^5` declarado | No hay JavaScript de aplicación. |
| Tailwind | 4.3.3 instalado; configuración CSS-first | `@import "tailwindcss"` y `@theme inline` en `src/app/globals.css`; no hay `tailwind.config.*`, lo cual es normal para esta configuración. |
| shadcn/ui | CLI 4.16.2, estilo `base-nova`, RSC, variables CSS | `components.json`; primitives basados en `@base-ui/react` 1.7.0. |
| Tremor | No presente | No aparece en dependencias ni imports. |
| Iconos | `lucide-react` 1.31.0 | Uso consistente en shell, estados, reportes e importación. |
| Charts | Sin librería | `src/components/donaldson/price-history-chart.tsx` dibuja una línea SVG de 640×160. |
| Tablas | Sin motor de tabla | `src/components/ui/table.tsx` es solo markup/estilo; filtrado, orden y paginación se resuelven por página/backend o localmente en la comparación. |
| Formularios | Estado React/manual, formularios HTML GET y reducer | No hay React Hook Form. Reportes usan múltiples estados y validadores propios. |
| Validación | Funciones propias + contrato backend | No hay Zod como dependencia directa. No conviene depender de una copia transitiva. |
| Animación | `tw-animate-css`, transiciones Tailwind, `animate-spin` y `animate-pulse` | No hay Motion/Framer Motion. Es apropiado conservar esta sobriedad. |
| Theme | Tokens light y `.dark` definidos, pero sin provider ni toggle | `src/app/globals.css` tiene paleta dark; `src/app/layout.tsx` nunca aplica `.dark`. El dark mode está preparado pero inactivo. |
| Toasts | No presentes | Feedback persistente se muestra inline con Alert o texto. |
| Excel | Sin librería cliente | Archivos y documentos se generan/validan en backend; el navegador descarga blobs. Es correcto. |

### Prototipo1

Evidencia: `prototipo1/package.json`, `prototipo1/components.json`, `prototipo1/app/globals.css`, `prototipo1/README.md`.

- Next 16.3.3 y React 19.2.8 en el legado Next; Tailwind 4.3.3 instalado.
- shadcn estilo `new-york`, pero los primitives son del stack Radix (`@radix-ui/react-*`), no Base UI.
- Motion 12.43.0 (`motion/react`), Three 0.173.0, React Three Fiber 9.7.0 y `dotted-map` para efectos decorativos.
- Tabler Icons 3.46.0 y Lucide 0.475.0: dos familias de iconos.
- React Hook Form 7.86.0 + Zod 3.25.76 + resolvers 3.10.0 en login/signup.
- No tiene sidebar, dashboard real, tablas de negocio, filtros de aplicación ni componentes de reportes/importación.
- El árbol local `gruponyx_website/` replica la landing como Odoo 18/QWeb, CSS compilado y JavaScript vanilla. Es evidencia visual, pero no código reutilizable en Arefil.

### Prototipo2

Evidencia: `prototipo2/package.json`, `prototipo2/app/globals.css`, `prototipo2/context/providers.tsx`.

- Next 14.2.35 y React 18; no hay `node_modules`, por lo que se reportan versiones declaradas.
- Tailwind 4.1.7, Framer Motion 11.3.29, `cobe` 0.6.3, `next-themes` 0.3.0 y `next-view-transitions` 0.3.0.
- Tabler, Lucide y React Icons: tres familias de iconos.
- Define sombras `shadow-input` y `shadow-derek`, dark mode y un `ThemeProvider`.
- No tiene shadcn configurado, tablas, dashboard funcional ni formularios con validación real.

## 3. Arquitectura actual del frontend

### Shell y navegación

`src/app/layout.tsx` carga Geist/Geist Mono y envuelve todas las rutas en `AppShell`. `src/components/layout/app-shell.tsx` solo compone un `Sidebar` y un `<main className="flex-1 overflow-y-auto p-4 md:p-8">`.

`src/components/layout/sidebar.tsx` ofrece:

- escritorio: sidebar fija de 256 px, altura completa, con secciones y enlace activo;
- móvil: barra superior de 56 px, overlay y panel deslizable desde la izquierda;
- cierre con Escape y al navegar;
- transición de 200 ms;
- sin colapso en escritorio, sin footer de cuenta/contexto, sin tooltips y sin header contextual.

La estructura de navegación está bien desacoplada en `src/components/layout/nav-items.ts`: Dashboard; Donaldson (Importar lista, Listas de precios, Productos, Cancelados, Reportes); Administración (Respaldos, Reportes). Debe conservarse, aunque conviene diferenciar mejor operación de configuración para evitar los dos enlaces “Reportes” visualmente ambiguos.

### Breadcrumbs, contenido y containers

`src/components/layout/breadcrumbs.tsx` es accesible y funcional, pero cada página lo incluye manualmente. No hay un `PageHeader` compartido ni un container contextual. Todas las páginas repiten `text-2xl font-semibold tracking-tight` y `text-sm text-muted-foreground`. Las pantallas de tabla usan todo el ancho; los formularios también, aunque no deberían.

La regla correcta no es imponer un `max-w-*` global:

- listados y previews tabulares deben ser fluidos;
- formularios y texto explicativo deben limitar línea/ancho;
- dashboard puede tener un ancho máximo amplio, no de landing;
- report builder necesita una composición especial, posiblemente dos paneles.

### Primitives y superficies

`src/components/ui/card.tsx` usa `rounded-xl`, fondo `bg-card`, padding de 16 px y `ring-1 ring-foreground/10`, sin sombra. `Button` e `Input` tienen alturas compactas de 32 px, radios de 10 px aproximados y focus ring de 3 px. Esa densidad es buena para B2B; el acabado se siente plano porque el canvas, cards y controles comparten tonos muy próximos y no hay niveles de superficie.

### Estados y feedback

- Loading: `src/components/layout/page-skeletons.tsx` ofrece esqueletos de dashboard, lista y detalle. Varias rutas tienen `loading.tsx`, pero importación, reporte individual, creación/configuración de reporte y respaldos carecen de skeleton específico.
- Errores: `src/components/donaldson/error-alert.tsx` reutiliza `Alert`; `src/app/error.tsx` es un boundary global con icono y botón Reintentar. Su texto menciona volver al dashboard, pero no renderiza ese enlace.
- Vacíos: se implementan como Card con una sola línea centrada y `py-16`; no hay título, icono, explicación ni acción contextual.
- Notificaciones: no hay Sonner/toast. Los éxitos de guardado/descarga usan Alerts inline; esto alarga formularios y puede desplazar contenido.
- Modales/drawers: no hay Dialog, AlertDialog, Sheet ni Drawer. La confirmación al cambiar fuente usa `globalThis.confirm`; la eliminación de plantilla despliega controles inline.

## 4. Inventario visual de Arefil

### Inventario transversal

| Patrón | Implementación | Evaluación |
| --- | --- | --- |
| KPI compacto | `src/components/donaldson/header-stat.tsx` | Buena abstracción y densidad; demasiado neutra y siempre idéntica. Debe evolucionar a `StatCard` con icono opcional, tono semántico, delta/nota y tamaño, sin convertirse en card decorativa. |
| Cards | `src/components/ui/card.tsx` | Coherentes, pero su uso indiscriminado aplana la jerarquía y causa “cards dentro de cards” en reportes. |
| Tablas | `src/components/ui/table.tsx` + tablas por página | Correctas para el dominio; faltan encabezado de tabla, resultados, sticky header, acciones compactas, densidad configurable y estados vacíos dentro de la misma superficie. |
| Filtros | formularios GET en páginas, cards separadas | Preservan URLs y Server Components, lo cual es excelente. Visualmente deberían ser una toolbar conectada a la tabla. |
| Paginación | `src/components/donaldson/pagination-controls.tsx` | Sencilla y robusta, pero solo anterior/siguiente; puede normalizarse sin forzar un motor cliente. |
| Dropzone | `src/components/donaldson/import-dropzone.tsx` | Accesible por teclado, valida `.xlsx` y maneja drag state. Es uno de los componentes más reutilizables de Arefil. |
| Badges | `comparison-status-badge.tsx`, `status-change-badge.tsx` | Los de comparación tienen icono + texto y son el mejor patrón semántico existente. Los estados genéricos aún muestran strings crudos. |
| Charts | `price-history-chart.tsx` | Ligero y suficiente para una tendencia simple; carece de ejes, grid, tooltip visible y representación temporal real. No justifica una librería hasta que haya más gráficas. |
| Formularios complejos | `src/components/reports/*editor.tsx` | Funcionalidad rica, pero listas de bloques `rounded-xl border p-4` generan mucha altura y repetición visual. |
| Búsqueda asíncrona | `src/components/reports/report-product-search.tsx` | Implementa popup propio con búsqueda de servidor. Conceptualmente es un Combobox y debería adoptar Popover/Command para teclado, foco y consistencia. |

### Inventario por ruta

| Ruta | Componentes y jerarquía actuales | Qué funciona | Diagnóstico visual y decisión |
| --- | --- | --- | --- |
| `/` | `Breadcrumbs` no aplica; título + descripción; cuatro `Card`; datos de health, proveedor, productos y última lista | Resumen inmediato y carga paralela tolerante a errores | Se siente como una fila de placeholders. Backend merece un status compacto, no una cuarta KPI equivalente. Falta acción primaria “Importar lista”, actividad reciente y señales de tendencia. Mantener cards, enriquecer jerarquía. |
| `/donaldson/import` | Breadcrumbs → título → `ImportDropzone` → `SelectedFileCard`/Analizar → Alerts → `ImportPreviewSummary` → muestra → issues → Confirmar → `ImportResult` | Reducer de fases, prevención de doble envío, preview antes de confirmar, errores bloqueantes | Flujo correcto pero no se ve como proceso. El botón queda separado de la selección y la preview se convierte en una larga pila. Introducir stepper de estado, action footer y resumen de validación. No mostrar “seleccionar hoja” sin contrato backend. |
| `/donaldson/price-lists` | Breadcrumbs → header → Card de filtros → error/vacío → Card con Table + paginación | Tabla es la representación correcta; filtros por URL; buen truncado de archivo | Demasiadas superficies separadas y acción “Importar” ausente del header. Integrar toolbar, título de dataset, conteo y tabla en una sola superficie. |
| `/donaldson/price-lists/[id]` | Breadcrumbs → header → 6 `HeaderStat` → Card Descargas → Card filtros → Card tabla | Resumen útil, descarga y tabla detallada de alta densidad | Tres cards funcionales consecutivas agregan altura. Llevar descargas al PageHeader/Dropdown; usar tabs enlazables Items/Cambios; conservar tabla. |
| `/donaldson/products` | Breadcrumbs → header → Card filtros → Card tabla | La tabla permite comparar campos y enlaza detalle | No convertir a cards. Unificar toolbar + tabla; hacer la fila/número de parte la acción principal y mover “Ver detalle” a affordance discreta. |
| `/donaldson/products/[id]` | Breadcrumbs → header → 4 stats → timestamp suelto → Card chart → Card histórico | Buen vínculo entre producto, tendencia e histórico; SVG ligero | Identidad y metadata están fragmentadas. Crear cabecera de entidad; destacar último precio/delta; chart y tabla pueden convivir en tabs o sección única. |
| `/donaldson/cancelados` | Breadcrumbs → header → selector de lista → 4 stats → Card tabla | Tabla y badge semántico son adecuados; default a lista reciente | Selector nativo de ancho fijo no escala a muchos archivos. Usar Combobox; enlazar como tab desde detalle de lista; mantener una sola tabla. |
| `/donaldson/reports` | Breadcrumbs → header con `+ Nuevo reporte` → `ReportCatalogCards` | Reportes habilitados, acciones Generar/Configurar claras | Cards de dos columnas funcionan con pocos reportes, pero no escalan ni facilitan escaneo. Usar lista/tabular compacta con descripción en primera columna, categoría y acciones; reservar cards solo para favoritos si algún día existe ese concepto. |
| `/donaldson/reports/[code]` | Header → Card parámetros → preview → Card descargas | Runtime genérico, invalida ejecuciones obsoletas y conserva consistencia snapshot/descarga | Tras generar, parámetros siguen ocupando gran espacio. En escritorio conviene sidebar/panel de parámetros sticky y preview amplio; en móvil, parámetros colapsables. Descargas deben vincularse a la ejecución, no parecer otra etapa independiente. |
| `/administracion/reportes` | Header + Nuevo → Card con tabla | La tabla ya es la decisión correcta para administración | Falta búsqueda/filtro, fuente de datos, menú de acciones y diferenciación “Abrir”/“Configurar”. Eliminar no puede habilitarse: no existe API frontend/backend visible para borrar reportes. |
| `/administracion/reportes/nuevo` | Header → `ReportDefinitionForm` con Definición, Fuente, Parámetros y Nombre de archivo | El formulario explica contratos y valida | Mucho texto y todas las secciones abiertas. Mantener página dedicada; usar pasos/secciones, progress de completitud y footer de acciones sticky. No usar Sheet para todo el alta. |
| `/administracion/reportes/[code]` | Header → `ReportDefinitionForm` → `ReportBuilderWorkspace` (grupos, columnas, totales, Excel, save, preview) → `ReportExcelTemplateCard` | Cobertura funcional extraordinaria y responsabilidades separadas en código | Es el principal cuello visual: demasiadas cards/subcards, acciones Save separadas y scroll muy largo. Reorganizar en tabs de ruta/estado y sheets para editar elementos; una barra sticky debe mostrar cambios sin guardar. |
| `/administracion/respaldos` | Header → Card con párrafo + `BackupDownloadCard` | Acción simple, feedback de éxito/error | La card contiene demasiado texto corrido para una sola acción. Convertir explicación en lista breve/Alert informativo y destacar formato, alcance y acción. |

## 5. Recon de prototipo1

`prototipo1` es una landing de Aceternity/Shape AI con login/signup y blog, no un prototipo de la aplicación Arefil. Su estado local más reciente es una migración a Odoo bajo `gruponyx_website/`; `README.md` declara que los archivos Next son legado visual. Para Arefil, el código React es más legible como referencia, mientras que QWeb demuestra que muchos efectos pudieron reducirse a CSS/JavaScript sin dependencias pesadas.

### Qué aporta

- `components/features.tsx`: cards KPI de cuatro columnas con borde, fondo muy suave, acento superior y hover. La anatomía KPI es útil; `CanvasRevealEffect`, la cuadrícula decorativa y el naranja saturado no lo son.
- `components/features2.tsx`: bento responsive `lg:grid-cols-5`, cards de spans 3/2, capas suaves y una card que simula dashboard. Es buen estudio de composición; sus mapas, orbits, barras falsas, imágenes y Motion están totalmente acoplados a marketing.
- `components/features3.tsx`: `SectionWrapper`, `ContentBox` y cards con contenido interactivo. Muestra jerarquía de superficie, pero también el problema que debemos evitar: card dentro de card, sombras complejas y alturas fijas de 320 px.
- `app/(auth)/login/page.tsx` y `components/ui/form.tsx`: es el patrón técnico más relevante. React Hook Form + Zod + mensajes ligados a campo es más robusto que errores agregados al principio. Reutilizable como arquitectura, no como copia directa por el stack Radix y el panel de marketing/mapa.
- `components/navbar.tsx`: buen manejo de móvil, Escape visual y hover pill animado, pero es una navbar flotante que cambia de ancho con scroll; no resuelve navegación de backoffice.
- `components/faq.tsx`: demuestra apertura/cierre suave, pero Accordion de shadcn ofrece mejor accesibilidad con mucho menos código.
- `components/button.tsx`: hover de elevación `-translate-y-0.5` y estados con profundidad. Solo conviene rescatar una microinteracción más discreta; no sus gradientes y sombras.
- `gruponyx_website/static/src/scss/website.scss`: prueba que entrada, reveal y hover pueden implementarse con CSS. Esto respalda no introducir Motion en Arefil para transiciones de 100–180 ms.

### Qué no aporta

No existen sidebar, header contextual, DataTable, filtros, command menu, dialogs, sheets, drawers, tooltips, timeline, activity feed, estados vacíos de producto, skeletons de aplicación, charts de datos reales ni reportes. Los elementos con esos nombres visuales dentro de Features son ilustraciones, no componentes funcionales.

## 6. Recon de prototipo2

`prototipo2` es otra landing Aceternity, visualmente más neutral y con dark mode. Es más moderna en efectos —beam collisions, Framer Motion, globo WebGL, view transitions— pero no más avanzada como aplicación empresarial.

### Qué aporta

- `components/container.tsx`: un container simple `max-w-7xl mx-auto px-4 md:px-10 xl:px-4`. Es la única pieza casi portable, aunque Arefil necesita variantes fluid/form, no un límite único.
- `app/globals.css`: sombras multicapa muy suaves (`shadow-derek`, `shadow-input`) y tokens de tema. La idea de profundidad controlada es reutilizable; no conviene copiar strings de sombra sin convertirlos a tokens de Arefil.
- `context/providers.tsx` + `components/mode-toggle.tsx`: referencia completa de tema por clase. Requiere `next-themes`; el toggle contiene un `console.log` y no debe copiarse literalmente.
- `components/features.tsx`: bento de cards con jerarquía más sobria que prototipo1, soporte dark y títulos compactos. El contenedor de card puede inspirar niveles de superficie para dashboard, pero está definido localmente, envuelto en Motion y mezclado con ilustraciones/globo.
- `components/navbar.tsx`: hover pill y respuesta móvil; de nuevo, es navegación de landing, no sidebar de producto.
- `components/login.tsx`: split layout responsive y buen uso de tonos neutrales, pero no valida y contiene un `<form>` anidado dentro de otro `<form>`, por lo que no es reutilizable técnicamente.
- `components/button.tsx`: microelevación de hover y contraste light/dark. Las sombras y botones pill son demasiado de marketing para el backoffice.

### Comparación de modernidad con prototipo1

Prototipo2 se ve más coherente por su paleta neutral, dark mode y tipografía menos exuberante. Prototipo1 tiene mejor base de formularios y una gama mayor de composiciones. Prototipo2 es más dinámico en Motion/WebGL, pero esa dinamicidad es precisamente lo menos transferible a Arefil. En experiencia de tablas y formularios de negocio, Arefil ya supera a ambos.

## 7. Comparativa de los tres

| Área | Arefil actual | Prototipo1 | Prototipo2 | Recomendación |
| --- | --- | --- | --- | --- |
| Sidebar | Sí, fija 256 px y drawer móvil manual | No | No | Conservar estructura de Arefil; compactar/colapsar y sumar header contextual. |
| Header | No hay en escritorio | Navbar flotante con Motion | Navbar flotante con Motion y tema | Diseñar uno propio B2B; no reutilizar navbars de landing. |
| Navegación | Agrupada por dominio, estados activos | Anchors marketing | Anchors marketing | Mantener IA de Arefil; renombrar/diferenciar Reportes operativos vs administración. |
| Dashboard | 4 cards estáticas | Mock dashboard decorativo | Imagen externa de dashboard | Evolucionar Arefil; usar tratamiento de superficie de p2, no mocks. |
| KPI cards | `HeaderStat` y cards dashboard | Cards porcentuales con acento | No KPI real | Base Arefil + acento superior opcional inspirado en p1 + sombras suaves p2. |
| Cards | shadcn ring, sobrias, repetidas | Gradientes, fondos, bento, sombras | Neutrales, dark, sombras suaves | Mantener primitive Arefil y crear variantes semánticas; p2 solo como referencia visual. |
| Tablas | Muchas tablas de datos reales | Ninguna | Ninguna | Arefil es la única base válida. Mejorar wrapper, toolbar y densidad. |
| Formularios | Manuales, muy extensos | RHF/Zod y primitives Radix | HTML sin validación; form anidado | Tomar arquitectura de p1 si se migra gradualmente; renderizar con Base UI/shadcn actual. |
| Filtros | GET/URL, cards independientes | No | No | Conservar semántica server-driven; convertir presentación a toolbar. |
| Importación | Dropzone, preview, issues, resultado | No | No | Reutilizar solo Arefil; diseñar stepper alrededor. |
| Productos | Tabla + detalle + histórico | No | No | Tabla, no cards; Sheet solo como quick preview opcional. |
| Páginas de detalle | Stats + cards + tablas | Marketing sections | Marketing sections | Cabecera de entidad + tabs + acciones de header; p2 inspira superficie. |
| Reportes | Catálogo, runtime, builder y Excel | No | No | Arefil es la base; reorganizar, no copiar prototipos. |
| Estados vacíos | Texto centrado en card | No aplicables | No aplicables | Nuevo `EmptyState` compartido con acción contextual. |
| Modales | Ninguno; confirm inline/browser | Ninguno funcional | Ninguno funcional | shadcn Dialog/AlertDialog. |
| Drawers | Sidebar móvil manual | Menú móvil absoluto | Menú móvil absoluto | shadcn Sheet para navegación/filtros/edición lateral; Drawer no es necesario inicialmente. |
| Feedback visual | Alerts, spinners y skeletons | Motion abundante | Motion/beam/globe abundante | Sonner + estados inline críticos; transiciones CSS discretas. |
| Loading | Skeletons genéricos por tipo | Entradas Motion, no loading real | Entradas Motion, no loading real | Mantener y especializar skeletons de Arefil. |
| Responsive | Grids y overflow de tabla; sidebar móvil | Muy trabajado para landing | Muy trabajado para landing/dark | Adoptar disciplina de breakpoints, no estructuras de marketing. |
| Animaciones | Mínimas | Motion + Three + orbits | Framer Motion + WebGL + beams | CSS 100–180 ms; nada ambiental/infinito. |
| Densidad | Buena en controles/tablas, baja en shell/cards | Baja, gran espacio vertical | Baja, secciones de 25rem/min-screen | Preservar densidad Arefil y mejorar jerarquía, no aumentar tamaño. |
| Iconos | Lucide único | Lucide + Tabler | Lucide + Tabler + React Icons | Mantener solo Lucide. |
| Tema | Tokens dark sin activación | Solo claro de facto | `next-themes` completo | Lanzar primero visual light coherente; dark como fase opcional. |

## 8. Componentes reutilizables de prototipo1

Clasificación: **A** casi directo; **B** con adaptación; **C** solo inspiración; **D** no recomendable.

| Clase | Ruta / componente | Qué hace y dependencias | Acoplamiento y decisión |
| --- | --- | --- | --- |
| B | `prototipo1/components/ui/form.tsx` — `Form`, `FormField`, `FormMessage` | Integra React Hook Form, Radix Label/Slot y contexto de errores | Bajo al dominio, alto al stack Radix/RHF. Reutilizar arquitectura de error accesible si se adopta RHF; generar una versión compatible con shadcn/Base UI actual, no copiar. |
| B | `prototipo1/app/(auth)/login/page.tsx` — formulario validado | Zod, resolvers, RHF, Input, PasswordInput, Switch | El formulario es separable; toda la mitad de marketing/mapa es específica. Solo patrón para formularios complejos, no pantalla. |
| B | `prototipo1/hooks/use-media-query.tsx` — hook responsive | React + `matchMedia` | Técnicamente portable. Solo introducir si una interacción requiere JS; no reemplazar responsive CSS. |
| C | `prototipo1/components/features.tsx` — cards métricas | Motion, CanvasRevealEffect, CSS grid | Tomar anatomía de KPI y acento de 2 px; eliminar canvas, grid decorativo, blur y hover grande. |
| C | `prototipo1/components/features2.tsx` — bento/Card/DashboardCard | Motion, Next Image, dotted-map, Tabler, assets | `Card` es privada y fuertemente acoplada. Inspirar composición dashboard 3/2 y capas de superficie, no copiar. |
| C | `prototipo1/components/features3.tsx` — SectionWrapper/ContentBox | Motion y estado local | Útil para observar jerarquía, pero evitar alturas fijas, rotaciones y nesting. |
| C | `prototipo1/components/button.tsx` — botón marketing | `cn`, elemento polimórfico, gradientes/sombras | Solo microelevación/active feedback; Arefil ya tiene mejor primitive accesible. |
| C | `prototipo1/components/faq.tsx` — accordion animado | Motion/AnimatePresence, estado manual | El concepto puede usarse en ayuda avanzada; implementar con shadcn Accordion. |
| C | `prototipo1/components/navbar.tsx` — nav responsive | Motion, Tabler, scroll listeners | Tomar el hover indicator y la claridad móvil como referencia; no el layout flotante. |
| D | `prototipo1/components/ui/button.tsx`, `input.tsx`, `label.tsx`, `checkbox.tsx`, `switch.tsx` | shadcn antiguo/Radix | Duplicarían y mezclarían la base Base UI actual. |
| D | `prototipo1/components/ui/canvas-reveal-effect.tsx` | Three + React Three Fiber + shaders | Coste alto, puramente decorativo, no pertinente a B2B. |
| D | `prototipo1/components/hero.tsx`, `pricing.tsx`, `testimonials.tsx`, `cta.tsx`, `logos-cloud.tsx` | Marketing, grandes gradientes, orbits, cards de precio | No corresponden al producto. |
| D | `prototipo1/components/features2.tsx` — MapView/Chart/LogoOrbit | Datos simulados, Motion, dotted-map y múltiples iconos | No son visualizaciones de datos reutilizables. |
| D | `prototipo1/components/blog/*` | Content Collections, Image, date-fns, fuzzy-search | Sin caso de uso actual en Arefil. |
| D | `prototipo1/gruponyx_website/views/**` y `static/src/**` | QWeb/Odoo, CSS compilado y JS vanilla | Es la versión desplegable de la misma landing, pero incompatible con Next/React. Solo confirma conceptos visuales. |

No hay un componente A de interfaz que convenga copiar hoy. El hook responsive es casi portable, pero tampoco es necesario para la primera fase.

## 9. Componentes reutilizables de prototipo2

| Clase | Ruta / componente | Qué hace y dependencias | Acoplamiento y decisión |
| --- | --- | --- | --- |
| A técnico / B de producto | `prototipo2/components/container.tsx` — `Container` | Wrapper simple con `cn` y `max-w-7xl` | El código funcionaría, pero un ancho único dañaría tablas. Adaptarlo a `PageContainer` con variantes `fluid`, `wide` y `form`. |
| B | `prototipo2/context/providers.tsx` — `ThemeProvider` | Wrapper de `next-themes` | Poco acoplado, pero añade dependencia y decisión de producto. Útil solo en fase opcional de dark mode. |
| C | `prototipo2/app/globals.css` — `shadow-derek`, `shadow-input` | Tokens CSS | Tomar la idea de elevación sutil; recalibrar a tokens OKLCH y reducir capas. |
| C | `prototipo2/components/features.tsx` — `Card` bento | Framer Motion, Image, cobe | El lenguaje neutral/dark aporta más que p1. Reconstruir como variantes del Card actual, sin Motion ni ilustraciones. |
| C | `prototipo2/components/navbar.tsx` — hover pill/mobile | Framer Motion, next-themes, Cal embed, Tabler | Solo inspiración para indicador activo; el resto es marketing y servicios externos. |
| C | `prototipo2/components/mode-toggle.tsx` | next-themes + Lucide | Patrón conocido; tiene `console.log` y depende de provider. Generar/adaptar cuando dark mode sea requisito. |
| C | `prototipo2/components/login.tsx` — split layout | Framer Motion, Image, Tabler | Inspiración para una futura autenticación sobria. No copiar: formulario anidado, sin validación ni handlers reales. |
| D | `prototipo2/components/button.tsx` | next-view-transitions, sombras, pills | Arefil ya tiene un Button más compatible y accesible. |
| D | `prototipo2/components/hero.tsx` — beams/collisions | Framer Motion, timers, medición DOM, imágenes externas | Movimiento continuo, coste alto y estética de landing. |
| D | `prototipo2/components/features.tsx` — Globe/SkeletonOne | cobe/WebGL, Motion | Decoración sin datos de negocio. |
| D | `prototipo2/components/pricing.tsx`, `cta.tsx`, `footer.tsx` | Marketing, React Icons, Cal embed | Sin relación con Arefil y agrega otra iconografía. |

## 10. Revisión shadcn/ui

“Ya existe” significa que hay un archivo local en `src/components/ui/`, no que el paquete CLI pueda generarlo. “Patrón propio” indica una implementación funcional que no es el primitive shadcn homónimo.

| Componente | Ya existe | Utilidad en Arefil | Dónde usarlo | Prioridad |
| --- | --- | --- | --- | --- |
| Card | Sí | Base de superficies, KPIs, paneles y formularios | Todo el producto; crear variantes y reducir nesting | Alta |
| Badge | Sí | Estados, categorías, filtros activos, novedades | Listas, cancelados, reportes, importación | Alta |
| Button | Sí | Jerarquía de acciones ya centralizada | Todas las páginas | Alta |
| Input | Sí | Filtros y formularios | Listas, productos, report builder | Alta |
| Select | Sí, poco usado | Sustituye select nativo corto y mejora consistencia | page size, sort, tipos y formatos | Alta |
| Combobox | No | Selección buscable para listas/productos/fuentes grandes | Cancelados, parámetros de reportes, selección de producto | Alta |
| Command | No | Motor accesible para Combobox; command palette global solo después | Combobox y posible búsqueda global | Alta para Combobox; Media global |
| Popover | No | Contenedor de Combobox, filtros y ayudas breves | Toolbars y reportes | Alta |
| DropdownMenu | No | Reduce columnas/ruido de acciones secundarias | Filas de listas y reportes, descargas | Alta |
| Tooltip | No | Etiquetas de icon buttons y sidebar colapsada | Shell, acciones de tabla/editor | Alta |
| Tabs | No | Divide detalle relacionado y configuración extensa | Lista detalle; producto; report builder | Alta |
| Accordion | No | Ayuda o secciones avanzadas no críticas | Reportes/plantilla; detalles técnicos | Media |
| Dialog | No | Edición corta o decisiones con contexto | Confirmaciones no destructivas, parámetros simples | Media |
| AlertDialog | No | Confirmación destructiva accesible | Eliminar plantilla y, si existe API, reporte | Alta |
| Sheet | No | Edición lateral larga sin abandonar tabla; filtros móvil | Columnas/parámetros, quick preview, navegación móvil | Alta |
| Drawer | No | Alternativa táctil inferior | No introducir junto con Sheet inicialmente | No necesario |
| Table | Sí | Núcleo del dominio | Productos, listas, históricos, previews | Alta |
| DataTable patterns | Parcial, sin abstracción | Toolbar, encabezado sticky, estados, acciones y server pagination | Todos los listados | Alta |
| Pagination | Patrón propio `PaginationControls` | Mantener server pagination y normalizar UI | Listas, productos, históricos | Media |
| Breadcrumb | Patrón propio `Breadcrumbs` | Ya resuelve navegación; integrar en PageHeader | Todas las rutas secundarias | Media |
| Separator | Sí, casi sin uso | Agrupa sin añadir cards | Toolbars, sidebars, paneles de detalle | Media |
| ScrollArea | No | Scroll consistente en sidebar, issues y paneles | Sidebar, errores import, sheets | Media |
| Skeleton | Sí | Loading estable sin layout shift | Todas las familias de página | Alta |
| Progress | No | Comunica pasos/estado; porcentaje solo con datos reales | Importación y uploads de plantilla | Alta |
| Alert | Sí | Mensajes bloqueantes y persistentes | Errores, warnings de import/reportes | Alta |
| Sonner / Toast | No | Éxitos y errores no bloqueantes sin mover layout | Guardados, descargas, copiado de placeholders | Alta |
| Calendar | No | Base para rangos de fecha, pero más compleja que input nativo | Históricos/reportes con rangos futuros | Baja |
| DatePicker | No | Útil si aparecen rangos o presets; el filtro actual de fecha única no lo exige | Listas/reportes | Media-baja |
| HoverCard | No | Quick context sin navegación, pero baja accesibilidad táctil | Preview opcional de producto/lista | Baja |
| Collapsible | No | Reduce altura de opciones avanzadas manteniendo contexto | Report builder y parámetros generados | Alta |
| ContextMenu | No | Poca discoverability y mala equivalencia móvil | Evitar; usar DropdownMenu visible | No necesario |
| Resizable Panels | No | Puede mejorar builder + preview en escritorio | Configuración de reportes, fase posterior | Baja |

Conjunto inicial recomendado: `DropdownMenu`, `Tooltip`, `Tabs`, `AlertDialog`, `Sheet`, `Popover`, `Command`, `Progress`, `Collapsible`, `ScrollArea` y `Sonner`. No deben instalarse todos en una sola fase: primero shell/tablas/feedback; después reportes e importación.

## 11. Design system actual

Sí existe un design system técnico inicial, pero aún no un sistema de producto completo. Los primitives, variables y tipografía son coherentes; faltan reglas de composición, semántica y densidad por contexto.

### Lo que ya está normalizado

- Fuente: Geist para interfaz y Geist Mono para códigos, definida en `src/app/layout.tsx`.
- Color: tokens OKLCH shadcn en `src/app/globals.css`, con equivalentes dark.
- Radio base: `--radius: 0.625rem`; la escala se deriva hasta `--radius-4xl`.
- Controles: Button/Input de 32 px por defecto, focus ring consistente y estados disabled/invalid.
- Cards: padding 16 px (`--spacing(4)`), 12 px en `size="sm"`, borde por ring y radio XL.
- Tablas: texto de 14 px, celdas de 8 px, encabezado de 40 px y hover de fila.
- Iconos: Lucide, normalmente 16 px.
- Ritmo de página: `gap-6` y padding 16/32 px aparecen de forma consistente.

### Lo que debe normalizarse

| Área | Estado actual | Regla recomendada |
| --- | --- | --- |
| Border radius | Token base bueno, pero abundan `rounded-lg`, `rounded-xl`, pills y radios hard-coded en componentes de negocio | Controles 8–10 px; cards 12 px; overlays 12–16 px; badges pill. Evitar radios de landing. |
| Spacing | Grid de facto de 4 px; páginas siempre `gap-6`; reportes llegan a `gap-8` y nesting | Base 4 px. Page sections 24 px; header→contenido 20–24; card padding 16/20; tablas compactas 8–12. Definir `density="compact|default"`. |
| Ancho máximo | Ninguno; todo usa el ancho disponible | `PageContainer` con `fluid` para tablas/report builder, `wide` para dashboard/detalles y `form` para altas. Nunca un max-width único. |
| Tipografía | H1 repetido 24 px; H2 de editores 18 px; CardTitle 16 px; descripciones sin límite de línea | H1 24/30 semibold; H2 18/26 semibold; H3/Card 14–16/22 medium; body 14; helper 12. Limitar descripciones a ~72 caracteres visuales. |
| Color de marca | Primario neutral/negro; charts monocromos | Mantener base neutral y elegir un solo acento frío (cobalto/azul petróleo, sujeto a marca). Semánticos fijos: emerald éxito, amber warning, red destructivo, blue informativo. |
| Backgrounds | Canvas y cards blancos; sidebar casi blanco | Canvas neutral muy tenue, cards blancas, sidebar con superficie diferenciada. Un nivel elevado para popovers/sheets; no glassmorphism. |
| Borders/sombras | Ring de card, casi sin profundidad | Borde/ring como principal; sombra 0–1 muy sutil solo en cards elevadas, sticky bars y overlays. Inspiración p2, con menos capas. |
| Hover/active | Button y table correctos; cards casi estáticas | Hover solo cuando la superficie es interactiva. Active visible y `focus-visible` siempre. Transición 120–180 ms, respetar `prefers-reduced-motion`. |
| Badges | Variants shadcn + clases ad hoc | Crear mapa semántico central: active/success, pending/warning, failed/destructive, neutral/info. Nunca depender solo del color. |
| Botones | Primitive sólido; algunas filas usan botón outline textual grande | Una acción primaria por contexto; secundarias outline/ghost; acciones de fila en DropdownMenu; destructivas nunca como acción dominante salvo confirmación. |
| Inputs | Primitive consistente, pero selects/checkboxes/textarea nativos | Adoptar Select/Checkbox/Switch/Textarea actuales de shadcn de forma gradual. Misma altura, error y helper. |
| Tablas | Base correcta; cards añaden padding a todos lados | Crear `DataTableShell`: toolbar, title/count, viewport sin padding horizontal innecesario, sticky header, footer/paginación. Números tabulares y alineados. |
| Iconos | Lucide único, pero tamaño a veces explícito y a veces heredado | 16 px en controles, 20 px en títulos/estados, 24 px en empty state. Stroke consistente; no mezclar Tabler/React Icons. |

Dirección cromática propuesta, sin fijar aún valores: canvas gris frío casi blanco; cards blancas; texto “ink”; sidebar grafito o navy muy oscuro opcional; acción primaria azul/cobalto; charts con una escala de azul más semánticos. El naranja de prototipo1 no tiene fundamento de marca en el repositorio y no debería adoptarse por inercia.

## 12. Problemas visuales actuales

### Problemas de mayor impacto

1. **Ausencia de jerarquía de shell.** El contenido comienza inmediatamente después de la sidebar. Breadcrumb, título y acciones son elementos sueltos repetidos en cada página.
2. **Todas las cards parecen igual de importantes.** Health, descargas, filtros, formularios, tablas y mensajes comparten el mismo tratamiento.
3. **Separación excesiva en listados.** Filtros y tabla viven en cards distintas, generando dos bordes y dos paddings para una sola tarea.
4. **Estados vacíos débiles.** Una frase centrada en un bloque de 128 px no explica el siguiente paso ni ofrece acción.
5. **Acciones ruidosas.** “Ver detalle”, “Configurar”, descargas y acciones de editor ocupan botones completos repetidos. Falta jerarquía primaria/secundaria/overflow.
6. **Controles inconsistentes.** Existe `src/components/ui/select.tsx`, pero al menos 26 ubicaciones/patrones usan selects o checkboxes nativos; también hay textarea nativo con clases duplicadas.
7. **Report builder vertical y cognitivo.** El usuario ve simultáneamente definición, fuente, parámetros, renglones, columnas, totales, formato, preview y plantilla. El contenido explicativo compite con controles.
8. **Importación sin narrativa visual.** Las fases existen en el reducer, pero no se muestran como estados de un proceso.
9. **Dashboard sin orientación operacional.** Informa estado, pero no responde “qué cambió” o “qué hago ahora”.
10. **Responsive parcial.** Hay overflow horizontal y grids adaptables, pero widths fijos (`w-96`, `w-64`, `w-56`) y toolbars flex pueden producir composición irregular en móvil.

### Exceso de espacio

- Empty states con `py-16` y solo una línea.
- Cards separadas para filtros, descargas y tabla en detalle de lista.
- Secuencia de cards con `gap-6` en el report builder.
- Hero/dropzone inicial de importación con `py-16` está bien como primer estado, pero debe compactarse tras elegir archivo.

### Exceso de texto

- Descripción de respaldos en un solo párrafo.
- Explicaciones de cada bloque del report builder, repetidas junto a controles autoexplicativos.
- Mensajes técnicos de plantilla Excel y runtime visibles permanentemente. Parte debe vivir en ayuda contextual, Collapsible o Tooltip; los riesgos importantes sí deben permanecer.

### Aspectos que ya funcionan y no deben “arreglarse” de más

- Alturas compactas de controles y tablas.
- Server-side filtering/pagination por query string.
- Badges con icono + texto en comparación.
- Feedback inline para errores bloqueantes.
- SVG de histórico mientras solo exista una gráfica simple.
- Separación lógica entre Report Builder y plantilla Excel.

## 13. Dirección visual recomendada

### Principio rector

**“Operations workspace”: una herramienta de trabajo, no un escaparate.** La belleza debe venir de proporción, ritmo, legibilidad, profundidad leve y respuesta inmediata, no de decoración.

### Shell recomendado

- Sidebar de 232–248 px, colapsable a 64–72 px en escritorio. Conservar secciones actuales y Lucide; Tooltip al colapsar.
- Diferenciar “Operación Donaldson” de “Configuración” con títulos y separación, no con color excesivo.
- Header contextual sticky de 52–56 px dentro del área de contenido: breadcrumbs discretos a la izquierda; acciones/estado a la derecha. El título de página queda debajo en `PageHeader` cuando requiera descripción.
- Fondo de aplicación ligeramente teñido; superficies de contenido blancas. Sidebar puede ser clara diferenciada o grafito oscuro, pero no glass.
- Contenido variable por tipo: full-width para tablas; ancho limitado para formularios; split view para runtime/builder.

### Gramática de página

1. Breadcrumb pequeño.
2. `PageHeader`: eyebrow/contexto opcional, H1, descripción corta, acción primaria, overflow secundario.
3. Métricas solo si ayudan a decidir.
4. Toolbar pegada a su dataset.
5. Contenido primario (tabla/form/preview).
6. Feedback dentro del contexto que lo produjo.

### Movimiento

- 120–180 ms para hover, abrir/cerrar, cambio de tab y sidebar.
- Skeleton durante fetch y spinner dentro de la acción iniciadora.
- Sin entrada animada de toda página, parallax, orbits, beam collisions ni loops.
- Respetar `prefers-reduced-motion`.

### Acciones

- Primaria: importar, generar, crear o guardar; una por pantalla/sección.
- Secundaria: exportar, volver, limpiar; outline/ghost.
- Terciaria: row actions dentro de `DropdownMenu` con trigger visible.
- Destructiva: en menú secundario y confirmada por `AlertDialog`, nunca por `window.confirm`.

## 14. Propuesta por página

### Dashboard (`src/app/page.tsx`)

**Mantener:** cuatro fuentes de datos independientes y degradación por card; enlaces/rutas existentes; `Card`, `Badge` y formato actual.

**Cambiar:** `PageHeader` con CTA “Importar lista”; transformar Backend en indicador de estado compacto en header; usar tres KPI principales (productos, última vigencia, cambios de estado) con iconos discretos; añadir una card amplia “Última lista importada” con metadata y acciones; una sección “Accesos rápidos” solo si no duplica la sidebar.

**Traer de prototipo1:** anatomía de métrica y acento superior de `components/features.tsx`, sin canvas/fondo grid.  
**Traer de prototipo2:** profundidad leve de `app/globals.css` y relación 3/2 del bento de `components/features.tsx`, sin Motion.  
**shadcn:** Card, Badge, Tooltip, Skeleton, DropdownMenu opcional.  
**Decisión:** no añadir charts hasta tener una serie real de importaciones/cambios; un chart ficticio empeoraría el dashboard.

### Importación (`src/app/donaldson/import/page.tsx`)

**Mantener:** reducer, `ImportDropzone`, `SelectedFileCard`, preview, issues, confirmación y resultado.  
**Cambiar:** stepper de cuatro estados visibles: Archivo → Validación → Confirmación → Resultado; card única de flujo con header/footer de acción; compactar dropzone al elegir archivo; resumen con tres niveles (datos detectados, cambios, incidencias); warnings colapsables y errores visibles; footer sticky local con Confirmar.  
**Traer de prototipos:** ninguno como código; solo hover/focus sutil de p1.  
**shadcn:** Progress, Alert, Badge, Collapsible, ScrollArea, Table, Sonner para éxito no bloqueante.  
**Decisión:** no mostrar selección de hoja ni porcentaje real mientras el contrato no los exponga.

### Listas de precios (`src/app/donaldson/price-lists/page.tsx`)

**Mantener:** tabla, filtros GET, paginación server-side y Badge.  
**Cambiar:** header con “Importar lista”; Card única con `DataTableToolbar` + tabla + footer; chips de filtros activos; nombre de archivo con Tooltip; fila clicable o link primario en vigencia; menú por fila para Detalle/Descargas/Cancelados.  
**Traer de prototipo2:** superficie neutral/sombra leve.  
**shadcn:** Select, DropdownMenu, Tooltip, Popover opcional, Pagination pattern.  
**Decisión:** tabla, no cards.

### Detalle de lista (`src/app/donaldson/price-lists/[id]/page.tsx`)

**Mantener:** seis métricas, descargas y tabla de items.  
**Cambiar:** cabecera de entidad con archivo, vigencia, estado y acciones; agrupar métricas en summary strip; mover descargas a botón principal + Dropdown; tabs enlazables “Items” y “Cambios de estado”; toolbar dentro de tabla.  
**shadcn:** Tabs, DropdownMenu, Tooltip, Select, Sheet opcional para quick view de producto.  
**Decisión:** el Sheet es complemento, no reemplazo de la página de producto.

### Productos (`src/app/donaldson/products/page.tsx`)

**Mantener:** representación tabular, búsqueda por URL y servidor.  
**Cambiar:** consolidar tres inputs en búsqueda principal + filtros secundarios en Popover/Sheet móvil; mostrar total; hacer número de parte un link; eliminar el botón “Ver detalle” repetido o convertirlo a icon/row action.  
**shadcn:** Input, Popover, Sheet, DropdownMenu, Tooltip.  
**Decisión:** DataTable server-driven; no cards, infinite scroll ni paginación cliente.

### Producto (`src/app/donaldson/products/[id]/page.tsx`)

**Mantener:** chart SVG, histórico, delta semántico y enlaces a lista.  
**Cambiar:** entity header con número de parte, descripción y metadata; destacar precio más reciente si el contrato lo permite a partir del histórico cargado; integrar chart y tabla bajo “Histórico”; usar `tabular-nums`; mover timestamps a bloque metadata.  
**shadcn:** Tabs solo si surge una segunda vista real; Tooltip para puntos/chart; Card.  
**Decisión:** no introducir Recharts solo para esta gráfica.

### Cancelados (`src/app/donaldson/cancelados/page.tsx`)

**Mantener:** tabla y `StatusChangeBadge`.  
**Cambiar:** Combobox buscable para lista; summary strip; toolbar; vacío accionable hacia Importar; integrar acceso desde detalle de lista.  
**shadcn:** Combobox (Popover + Command), Table, Badge, EmptyState propio.  
**Decisión:** no convertir estados a cards; la comparación de renglones es esencial.

### Catálogo operativo de reportes (`src/app/donaldson/reports/page.tsx`)

**Mantener:** nombre, descripción, categoría, Generar y Configurar.  
**Cambiar:** sustituir el grid de cards por lista tabular responsiva o “rows as cards” compactas: nombre/descripción, categoría, estado, fuente si el contrato la expone y acciones. Generar es primaria; Configurar y más acciones van al menú. Buscar/filtrar si crece el catálogo.  
**shadcn:** DropdownMenu, Badge, Tooltip, EmptyState.  
**Decisión:** cards solo son adecuadas con muy pocos reportes y contenido heterogéneo; para catálogo configurable la tabla escala mejor.

### Ejecución de reporte (`src/app/donaldson/reports/[code]/page.tsx`)

**Mantener:** página dedicada, snapshot de ejecución, preview HTML y descargas separadas por documento/datos.  
**Cambiar:** layout desktop de 320–380 px para parámetros sticky + preview flexible; tras generar, permitir colapsar parámetros y mostrar resumen; barra de acciones de ejecución con Regenerar/Descargar; en móvil todo apilado y Collapsible.  
**shadcn:** Collapsible, ScrollArea, Separator, Tabs opcionales para Preview/Descargas.  
**Decisión:** Sheet no debe alojar todo el runtime cuando existen renglones repetibles; la página dedicada es correcta.

### Administración de reportes (`src/app/administracion/reportes/page.tsx`)

**Mantener:** tabla y CTA Nuevo reporte.  
**Cambiar:** toolbar con búsqueda, estado y categoría; añadir fuente de datos si está en `ReportDefinition`; menú de fila con Configurar, Generar y futura eliminación. Estado habilitado debe ser badge semántico.  
**shadcn:** DropdownMenu, Select, AlertDialog futuro, Tooltip.  
**Decisión:** no mostrar Eliminar hasta que exista endpoint y reglas de integridad; hoy `src/lib/api/reports.ts` solo elimina plantillas Excel.

### Nuevo reporte (`src/app/administracion/reportes/nuevo/page.tsx`)

**Mantener:** página dedicada y lógica de `ReportDefinitionForm`.  
**Cambiar:** dividir visualmente en General → Fuente → Parámetros → Archivo; mostrar completitud, mantener una sola acción Crear sticky; llevar ayuda secundaria a tooltips/collapsibles.  
**Traer de prototipo1:** asociación campo-error de `components/ui/form.tsx`, no sus primitives.  
**shadcn:** Select, Checkbox/Switch, Collapsible, Tooltip, Sonner; RHF/Zod solo en migración posterior controlada.

### Configurar reporte (`src/app/administracion/reportes/[code]/page.tsx`)

**Mantener:** página dedicada, límites entre definition/builder/template y funciones de guardado actuales.  
**Cambiar:** tabs “General”, “Entradas”, “Columnas”, “Totales”, “Excel”, “Vista previa”; indicador dirty y save bar sticky por ámbito; listas resumidas de columnas/parámetros; Sheet para editar un elemento; Collapsible para avanzado; preview con ancho prioritario.  
**shadcn:** Tabs, Sheet, Collapsible, AlertDialog, DropdownMenu, Sonner; Resizable Panels solo después de validar el split view.  
**Decisión:** no meter todo en un Sheet/Dialog y no ocultar errores de otras tabs; la navegación debe marcar tabs con errores/cambios.

### Respaldos (`src/app/administracion/respaldos/page.tsx`)

**Mantener:** acción única y estados de descarga.  
**Cambiar:** card compacta con icono/beneficio, lista de contenido del backup, Alert informativo y CTA; usar toast para éxito y Alert inline para fallo.  
**shadcn:** Alert, Sonner, Tooltip.  
**Decisión:** no agregar gráficos/estadísticas sin datos de tamaño/fecha del backend.

### Loading, errores y vacíos

Crear familias visuales específicas: dashboard; tabla; detalle; importación; runtime; builder. `EmptyState` debe aceptar icono, título, descripción y acción. Corregir el boundary global para incluir enlace real al dashboard. Los skeletons deben imitar la estructura final y no ser filas genéricas de bloques cuando la página tenga tabs o panel lateral.

## 15. Propuesta específica para Reportes

### Modelo de experiencia recomendado

```text
Catálogo operativo (tabla/lista compacta)
  └─ Generar → página dedicada
       ├─ Parámetros / renglones (panel sticky)
       ├─ Vista previa (área principal)
       └─ Acciones de ejecución / descarga

Administración (tabla)
  ├─ Nuevo → wizard/página dedicada
  └─ Configurar → workspace por tabs
       ├─ General y fuente
       ├─ Entradas
       ├─ Columnas
       ├─ Totales
       ├─ Excel / plantilla
       └─ Vista previa
```

### Tabla, cards o mezcla

- **Catálogo operativo:** tabla/lista compacta. El objetivo es localizar y ejecutar; todos los registros comparten estructura. Una descripción de dos líneas puede convivir en la primera celda. En móvil cada row puede apilarse como card sin cambiar el modelo.
- **Administración:** tabla. Código, categoría, fuente, estado y acciones son comparables.
- **Cards:** solo para dashboard (“reportes recientes/favoritos”) o estado de plantilla, no para el catálogo completo.

### Acciones

- `+ Nuevo reporte`: primary en header de administración; en catálogo operativo puede estar como secundaria visible solo para usuarios autorizados cuando exista autorización.
- Generar: primary por reporte.
- Configurar/Editar: DropdownMenu o secondary action.
- Descargar: solo después de una ejecución válida; agrupar Documento Excel y Exportar datos con labels claros, conservando la distinción actual.
- Eliminar: DropdownMenu → AlertDialog; **bloqueado técnicamente hoy** por falta de función/endpoint visible para eliminar definición de reporte.

### Elección de contenedor por tarea

| Tarea | Componente | Justificación |
| --- | --- | --- |
| Confirmar eliminación | AlertDialog | Es breve, destructivo y debe atrapar foco. |
| Editar una columna/parámetro | Sheet | Hay varios campos; conserva lista y contexto. |
| Editar metadatos generales pequeños | Sheet o tab General | Sheet si nace desde tabla; tab si ya está dentro del workspace. |
| Configurar reporte completo | Página dedicada + Tabs | Demasiadas relaciones, preview y estados dirty para un overlay. |
| Capturar parámetros simples antes de generar | Panel en página; Dialog solo para reportes triviales | Los grupos repetibles hacen que un Dialog no escale. |
| Preview de documento/datos | Área principal de página | Necesita ancho, tabla y persistencia visual. |

### Riesgos específicos de UX

- Tabs pueden esconder errores. Cada tab debe mostrar badge de error/dirty y el submit debe llevar a la primera tab inválida.
- Un Sheet por elemento exige preservar el estado actual del array y foco al cerrar.
- Hay dos guardados lógicos actuales: definición y builder. Una barra global no debe prometer atomicidad que el backend no ofrece.
- Plantilla y builder son independientes por diseño; la UI debe explicar dependencia de placeholders sin fusionarlos técnicamente.
- El preview usa snapshots; cualquier cambio de parámetros invalida la ejecución. La nueva UI debe conservar esa claridad.

## 16. Propuesta específica para Importación

### Flujo validado contra el código actual

| Paso visual | Soporte actual | Presentación recomendada |
| --- | --- | --- |
| 1. Subir archivo | Sí: `ImportDropzone` y `.xlsx` | Dropzone central; al seleccionar, card compacta con Cambiar y Analizar. |
| 2. Detectar hojas | No expuesto | No mostrar como paso completado. Requiere cambio de API/response. |
| 3. Seleccionar hoja | No expuesto | Futuro Combobox/Radio cards solo si backend devuelve hojas y acepta selección. |
| 4. Validar | Sí: `previewDonaldsonImport` | Step “Validando” con Progress indeterminado y estados; no porcentaje falso. |
| 5. Mostrar resumen | Sí: `ImportPreviewSummary`, sample, warnings/errors | Summary strip + tabla de muestra + panel de incidencias. |
| 6. Importar | Sí: `confirmImport` | CTA sticky “Confirmar importación”, disabled con razón si hay errores. |
| 7. Resultado | Sí: `ImportResult` | Success state con KPIs, “Ver lista importada” primaria e “Importar otra” secundaria. |

### Componentes reutilizables

- Reutilizar casi directamente desde Arefil: `ImportDropzone`, `SelectedFileCard`, `ImportPreviewSummary`, `ImportProductsSampleTable`, `ImportIssuesPanel`, `ImportResult`.
- De prototipo1/2: ninguno contiene importación, stepper, dropzone o tabla de errores real.
- shadcn: Progress, Collapsible, ScrollArea, Alert, Badge, Table y posiblemente Tabs solo si “Resumen/Errores/Muestra” se vuelve muy extenso.

### Detalle de incidencias

Hoy `errors` y `warnings` son `string[]`. Una “tabla de errores” con hoja/fila/columna requiere un contrato estructurado. Mientras no exista, usar listas legibles con búsqueda/copia opcional; no parsear strings en frontend. Si el backend añade `{sheet,row,column,field,message,severity}`, entonces sí conviene DataTable con filtros por severidad y exportación de errores.

## 17. Elementos que NO recomiendo reutilizar

1. **Hero sections** de `prototipo1/components/hero.tsx` y `prototipo2/components/hero.tsx`: consumen altura, centran copy marketing y desplazan tareas.
2. **Beam collisions/explosiones** de prototipo2: timers, medición DOM y animación infinita sin valor operacional.
3. **CanvasRevealEffect/Three** de prototipo1: añade Three/React Three Fiber/WebGL para un fondo casi oculto.
4. **Mapas, globos y orbits** de ambos prototipos: no representan proveedores, cobertura ni datos reales de Arefil.
5. **Navbars flotantes que encogen con scroll**: adecuadas para landing; inestables y poco densas para navegación diaria.
6. **Gradientes de texto y botones**: reducen sobriedad y hacen que todas las acciones parezcan promocionales.
7. **Sombras multicapa pesadas** de pricing/FAQ: degradan densidad, contraste y consistencia. Solo rescatar una elevación mínima como token.
8. **Cards dentro de cards con alturas fijas** de `features3.tsx` y pricing: Arefil ya sufre nesting en reportes.
9. **Rotaciones, escalas y hover que mueve contenido**: pueden causar reflow/percepción de inestabilidad. Si se usa elevación, máximo 1 px y solo en elemento clicable.
10. **Tres familias de iconos**: conservar Lucide; no sumar Tabler/React Icons.
11. **Primitives shadcn/Radix de prototipo1**: mezclarían dos implementaciones y convenciones con Base UI.
12. **Button de ambos prototipos**: menos completo que el actual y acoplado a marketing/view transitions.
13. **Login de prototipo2 como código**: contiene forms anidados, carece de validación real y depende de imágenes/testimonials externos.
14. **QWeb/Odoo de `gruponyx_website/`**: pertenece a otra plataforma y su CSS está compilado/scoped para Bootstrap/Odoo.
15. **Contenido decorativo remoto** (`assets.aceternity.com`, Unsplash, pravatar): crea dependencia externa y apariencia genérica.

## 18. Dependencias nuevas potenciales

No se recomienda cambiar dependencias en bloque. Cada alta debe responder a un patrón aprobado.

| Dependencia potencial | Motivo | Prioridad / decisión |
| --- | --- | --- |
| `sonner` | Toasts accesibles para guardar/descargar/copiar | Alta; normalmente introducida por el componente Sonner de shadcn. |
| Dependencia de Command generada por shadcn (frecuentemente `cmdk`) | Combobox accesible para catálogos grandes | Alta si el registry actual la requiere; validar contra shadcn 4/Base UI al implementar. |
| `react-hook-form`, `zod`, `@hookform/resolvers` | Formularios complejos con errores por campo | Media. Probar primero en Nuevo reporte; no migrar todo de una vez. Zod no es dependencia directa hoy. |
| `@tanstack/react-table` | Orden, columnas, selección y state complejo | Media-baja. No necesario para listados server-driven actuales; introducir solo si aparecen visibilidad/selección masiva. |
| `react-day-picker` + `date-fns` | DatePicker/rangos/presets | Baja hasta que existan rangos reales. |
| `recharts` | Gráficas con ejes/tooltips/series | Baja; el SVG actual basta. Reconsiderar con un dashboard histórico real. |
| `next-themes` | Activar dark mode por clase | Baja/optativa. Primero consolidar light y tokens. |
| `react-resizable-panels` | Split view builder/preview | Baja; validar primero layout CSS no redimensionable. |

No recomendadas: `motion`/`framer-motion`, Three, React Three Fiber, `cobe`, `dotted-map`, Tabler Icons, React Icons, Tremor y una librería de dropzone. No resuelven los problemas principales o duplican capacidades actuales.

## 19. Riesgos técnicos

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Copiar código de Next 14/React 18 a Next 16/React 19 | APIs y comportamiento incompatibles | No copiar p2; reconstruir patrones en Arefil y leer docs locales de Next 16 antes de implementar. |
| Mezclar Radix y Base UI | Focus, props, portal y estilos inconsistentes | Generar components con `components.json` actual; no copiar `prototipo1/components/ui`. |
| Convertir listados server-driven en DataTable cliente | Doble estado, datasets parciales y filtros inconsistentes | Mantener query params/backend como autoridad; abstraer presentación, no data fetching. |
| Tabs en Report Builder | Errores/dirty state ocultos | Badges por tab, navegación al primer error, confirmación antes de abandonar. |
| Unificar guardados visualmente | Definición y builder no son una transacción única | Mantener límites y textos de estado; no prometer “Guardar todo” sin soporte backend. |
| Sheets para editores | Estado complejo y pérdida de foco/cambios | Mantener state en padre; test de keyboard/focus y cancelación. |
| Acciones de eliminar reporte | API ausente | No renderizar acción funcional hasta definir endpoint, permisos y dependencias. |
| Stepper de importación demasiado literal | Backend no expone hojas/progreso | Derivar solo de `Phase`; marcar futuras etapas como requerimientos, no UI actual. |
| Dark mode prematuro | Duplica QA y puede revelar contrastes incorrectos | Diseñar tokens compatibles, lanzar light primero, activar después. |
| Sombra/decoración de prototipos | Pérdida de densidad y apariencia genérica | Usar tokens propios y revisión visual B2B. |
| Cambios en archivos locales sin commit | Riesgo de solapar trabajo actual de reportes | Implementar en fases pequeñas y revisar diff; preservar modificaciones existentes. |
| `prototipo2` sin Git | No hay procedencia ni versión verificable | Tratarlo solo como referencia visual, nunca como fuente confiable de código. |

El principal riesgo es reorganizar el Report Builder como si fuera solo una pantalla: concentra lógica de validación, múltiples guardados, estado dirty, preview y contratos del backend. Debe tratarse como un proyecto propio después de estabilizar primitives y shell.

## 20. Plan de implementación

### Fase 1 — Fundamentos visuales

- **Objetivo:** cerrar tokens, densidad y primitives compartidos antes de tocar páginas.
- **Archivos afectados:** `src/app/globals.css`, `src/components/ui/card.tsx`, `button.tsx`, `badge.tsx`, `input.tsx`, `table.tsx`; nuevos `PageHeader`, `PageContainer`, `EmptyState`, `StatCard` y `DataTableShell`.
- **Reutilizado:** primitives actuales; idea de profundidad de p2 y KPI de p1 solo como referencia.
- **Nuevo:** variants de superficie/densidad y semántica de status.
- **Dependencias:** ninguna obligatoria; Sonner puede quedar para fase 3.
- **Dificultad:** media. **Riesgo:** medio por alcance transversal.

### Fase 2 — Shell de aplicación

- **Objetivo:** sidebar compacta/colapsable, header contextual y responsive consistente.
- **Archivos:** `src/app/layout.tsx`, `src/components/layout/app-shell.tsx`, `sidebar.tsx`, `breadcrumbs.tsx`, `nav-items.ts`.
- **Reutilizado:** IA y active state de Arefil; hover pill solo como referencia.
- **Nuevo:** `app-header.tsx`, toggle/collapse y Sheet móvil.
- **Dependencias:** primitives shadcn Sheet, Tooltip, DropdownMenu según diseño.
- **Dificultad:** media. **Riesgo:** medio; afecta todas las rutas y foco móvil.

### Fase 3 — Feedback y patrones compartidos

- **Objetivo:** estados vacíos, Alerts, toasts, skeletons y toolbars uniformes.
- **Archivos:** `src/components/layout/page-skeletons.tsx`, `src/app/error.tsx`, componentes de lista/importación.
- **Reutilizado:** ErrorAlert, Skeleton, PaginationControls.
- **Nuevo:** EmptyState, FilterToolbar, toast provider y skeletons por familia.
- **Dependencias:** `sonner`; ScrollArea/Collapsible si registry las requiere fuera de Base UI.
- **Dificultad:** baja-media. **Riesgo:** bajo.

### Fase 4 — Dashboard

- **Objetivo:** convertir la portada en centro operacional con acciones y jerarquía.
- **Archivos:** `src/app/page.tsx`, `src/app/loading.tsx`; `StatCard` compartida.
- **Reutilizado:** carga de datos actual, Badge/Card/HeaderStat evolucionado.
- **Nuevo:** latest-import panel y quick action composition.
- **Dependencias:** ninguna; no chart library.
- **Dificultad:** media. **Riesgo:** bajo si no cambia fetching.

### Fase 5 — Listas, productos y cancelados

- **Objetivo:** consolidar toolbar/tabla/paginación y mejorar detalles.
- **Archivos:** páginas de `price-lists`, `products`, `cancelados`; `pagination-controls.tsx`, badges, chart; sus loading routes.
- **Reutilizado:** tablas, query params, formatters y SVG.
- **Nuevo:** DataTableShell, row actions, tabs de detalle, Combobox para lista.
- **Dependencias:** DropdownMenu, Tooltip, Tabs, Popover/Command. TanStack no inicialmente.
- **Dificultad:** media-alta. **Riesgo:** medio por responsive y preservación de URLs.

### Fase 6 — Importación

- **Objetivo:** mostrar claramente el proceso sin cambiar su máquina de estados.
- **Archivos:** `src/app/donaldson/import/page.tsx` y todos los `src/components/donaldson/import-*.tsx`/`selected-file-card.tsx`.
- **Reutilizado:** todos los componentes funcionales actuales.
- **Nuevo:** stepper/status rail, footer de acción y empty/error presentations.
- **Dependencias:** Progress, Collapsible, ScrollArea; sin librería de dropzone.
- **Dificultad:** media. **Riesgo:** medio; no inferir hojas/porcentaje.

### Fase 7 — Catálogo y runtime de reportes

- **Objetivo:** alinear operación de reportes con tablas y detalles del resto de Arefil.
- **Archivos:** `src/app/donaldson/reports/**`, `report-catalog-cards.tsx`, `generic-report-runtime.tsx`, runtime parameters/preview/downloads.
- **Reutilizado:** runtime, snapshot, preview y descargas actuales.
- **Nuevo:** report list, panel sticky/collapsible y execution action bar.
- **Dependencias:** DropdownMenu, Collapsible, Tabs opcional.
- **Dificultad:** alta. **Riesgo:** alto por invalidación de ejecución y repeatable rows.

### Fase 8 — Administración y Report Builder

- **Objetivo:** reducir carga cognitiva de alta/configuración sin alterar contratos.
- **Archivos:** `src/app/administracion/reportes/**`, `report-definition-form.tsx`, `report-builder-workspace.tsx` y todos los editores/template components.
- **Reutilizado:** lógica y validadores existentes; patrón de errores por campo inspirado en p1.
- **Nuevo:** navegación por tabs, item summaries, editor Sheet, save bars y dirty/error indicators.
- **Dependencias:** Tabs, Sheet, AlertDialog, Collapsible, Sonner; RHF/Zod solo en experimento aislado.
- **Dificultad:** muy alta. **Riesgo:** muy alto; dividir en PRs por tab/ámbito.

### Fase 9 — Polish, responsive y accesibilidad

- **Objetivo:** validar teclado, foco, reduced motion, contraste, overflow y estados extremos.
- **Archivos:** transversales + tests de componentes/rutas.
- **Reutilizado:** Testing Library/Vitest actuales.
- **Nuevo:** pruebas de focus, navegación móvil, dirty state, vacíos y tablas estrechas.
- **Dependencias:** ninguna necesaria.
- **Dificultad:** media. **Riesgo:** bajo, con alto valor de calidad.

## 21. Orden sugerido de trabajo

1. Congelar decisiones de tokens, densidad y anatomía de página con 2–3 mockups de baja fidelidad.
2. Implementar primitives/patrones compartidos.
3. Rehacer shell y PageHeader.
4. Aplicar el sistema al Dashboard como prueba representativa.
5. Aplicarlo a Productos y Listas; de ahí extraer DataTableShell definitivo.
6. Integrar Cancelados y detalles/tabs.
7. Rediseñar Importación sobre la máquina de estados actual.
8. Rediseñar catálogo/runtime de Reportes.
9. Rediseñar Nuevo/Configurar reporte en entregas pequeñas.
10. Cerrar responsive, accesibilidad, skeletons, empty states y dark-mode decision.

Este orden reduce riesgo: el Report Builder usa casi todos los patrones anteriores y debe ser consumidor del sistema, no el lugar donde se invente.

## 22. Archivos/componentes que habría que tocar

Lista prevista, no cambios realizados.

### Fundamentos y shell

- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/components/layout/app-shell.tsx`
- `src/components/layout/sidebar.tsx`
- `src/components/layout/breadcrumbs.tsx`
- `src/components/layout/nav-items.ts`
- `src/components/layout/page-skeletons.tsx`
- Nuevos: `src/components/layout/app-header.tsx`, `page-header.tsx`, `page-container.tsx`
- Nuevos shared: `src/components/shared/empty-state.tsx`, `stat-card.tsx`, `filter-toolbar.tsx`, `data-table-shell.tsx`, `status-badge.tsx`

### Primitives UI existentes y potenciales

- Ajustar: `src/components/ui/card.tsx`, `button.tsx`, `badge.tsx`, `input.tsx`, `table.tsx`, `alert.tsx`, `skeleton.tsx`, `select.tsx`
- Generar cuando corresponda: `dropdown-menu.tsx`, `tooltip.tsx`, `tabs.tsx`, `popover.tsx`, `command.tsx`, `sheet.tsx`, `alert-dialog.tsx`, `progress.tsx`, `collapsible.tsx`, `scroll-area.tsx`, `sonner.tsx`, posiblemente `checkbox.tsx`, `switch.tsx`, `textarea.tsx`, `pagination.tsx`

### Páginas

- `src/app/page.tsx`, `src/app/loading.tsx`, `src/app/error.tsx`
- `src/app/donaldson/import/page.tsx`
- `src/app/donaldson/price-lists/page.tsx`
- `src/app/donaldson/price-lists/[id]/page.tsx`
- `src/app/donaldson/products/page.tsx`
- `src/app/donaldson/products/[id]/page.tsx`
- `src/app/donaldson/cancelados/page.tsx`
- `src/app/donaldson/reports/page.tsx`
- `src/app/donaldson/reports/[code]/page.tsx`
- `src/app/administracion/reportes/page.tsx`
- `src/app/administracion/reportes/nuevo/page.tsx`
- `src/app/administracion/reportes/[code]/page.tsx`
- `src/app/administracion/respaldos/page.tsx`
- Todos los `loading.tsx` asociados; añadir los que faltan.

### Componentes de dominio

- Donaldson: `header-stat.tsx`, `import-dropzone.tsx`, `selected-file-card.tsx`, `import-preview-summary.tsx`, `import-products-sample-table.tsx`, `import-issues-panel.tsx`, `import-result.tsx`, `pagination-controls.tsx`, `price-history-chart.tsx`, `download-buttons.tsx`, badges de status/comparison.
- Reportes: `report-catalog-cards.tsx` (probable sustitución por list/table), `generic-report-runtime.tsx`, `report-runtime-parameters.tsx`, `report-repeatable-parameters.tsx`, `report-product-search.tsx`, previews/downloads, `report-definition-form.tsx`, `report-builder-workspace.tsx`, `report-parameter-editor.tsx`, `report-parameter-group-editor.tsx`, `report-column-editor.tsx`, `report-summary-editor.tsx`, `report-excel-layout-editor.tsx`, `report-excel-template-card.tsx`, `report-filename-template-field.tsx`, `report-formula-input.tsx`.

### Contratos que solo se tocarían si el producto amplía funcionalidad

- `src/lib/api/imports.ts` y `src/types/api.ts`: detección/selección de hojas, progreso y errores estructurados.
- `src/lib/api/reports.ts`: eliminación de reporte, historial de ejecuciones u otras acciones aún inexistentes.
- Estos cambios quedan fuera del rediseño visual inicial porque cambiarían la lógica/contrato.

## 23. Conclusión

Arefil ya es funcionalmente más producto que cualquiera de los dos prototipos. El salto visual no vendrá de trasplantar un hero, un bento o Motion; vendrá de convertir la base existente en un sistema coherente de workspace empresarial.

`prototipo2` aporta más a la dirección estética por sus neutros, dark-aware surfaces y profundidad suave. `prototipo1` aporta más al patrón de formularios y a la idea de KPIs con una señal visual clara. Ninguno aporta sidebar, tablas, importación o reportes reutilizables. Por eso la decisión correcta es conservar Arefil como fuente de verdad y reconstruir solo conceptos seleccionados sobre shadcn/Base UI actual.

Los cinco patrones con mejor retorno son: `PageHeader` contextual; sidebar compacta con header; `DataTableShell` con toolbar; `StatCard` semántica; y estados de proceso/empty/loading consistentes. En shadcn, las primeras incorporaciones deben ser DropdownMenu, Tooltip, Tabs, Sheet/AlertDialog y Progress/Sonner según la fase.

La prioridad técnica y visual debe ser fundamentos → shell → patrones de datos → dashboard/listas → importación → reportes. El Report Builder queda deliberadamente después: es donde el nuevo sistema demostrará madurez, pero también donde una reestructuración precipitada puede romper más contexto y estado.
