# HALLAZGOS — guion de la demo (rama `demo/hallazgos`)

Esta rama introduce **hallazgos deliberados** en un único archivo nuevo
[`src/js/demo_hallazgos.js`](src/js/demo_hallazgos.js) para ensayar el flujo
DevSecOps: abrir un PR → el pipeline (**Semgrep** + **SonarCloud**) los detecta
y **bloquea** el merge. Todo el código real de la app **no** se toca, así que el
"fix" de la demo es simplemente **eliminar ese archivo** (o cerrar el PR).

> Demo educativa. El secreto y la API key son **valores FALSOS**.

## Cómo correrlo

1. Abrir PR `demo/hallazgos` → `feat/init` (o `main`, según cuál sea tu rama
   limpia). El diff es solo `demo_hallazgos.js` + este archivo.
2. El job **security** (Semgrep) falla → bloquea.
3. El **quality gate** de SonarCloud falla por los code smells.
4. Para "arreglar": borrar `src/js/demo_hallazgos.js` y volver a pushear → verde.

## Resumen de hallazgos

| # | Archivo:línea | Categoría | Herramienta / Regla esperada | Fix correcto |
|---|---|---|---|---|
| 1 | `src/js/demo_hallazgos.js:21` | Seguridad (XSS DOM) | **Semgrep** `javascript.browser.xss.xss` | Usar `element.textContent` en vez de `innerHTML`; nunca concatenar entrada del usuario / `location.*` en HTML. |
| 2 | `src/js/demo_hallazgos.js:14` | Seguridad (secreto) | **Semgrep** `generic.secrets.security.detected-generic-api-key` | No hardcodear claves; leerlas de variables de entorno / GitHub Secrets. |
| 3 | `src/js/demo_hallazgos.js:31` y `:39` | Calidad (duplicación) | **SonarCloud** `javascript:S4144` (duplicated function) | Extraer una sola función `formatCourse` reutilizable. |
| 4a | `src/js/demo_hallazgos.js:50-51` | Calidad (vars sin usar) | **SonarCloud** `javascript:S1481` / `S1854` | Eliminar `unusedVar` y `tarifaBorrador`. |
| 4b | `src/js/demo_hallazgos.js:53` | Calidad (números mágicos) | **SonarCloud** `javascript:S109` | Extraer constantes con nombre (`PRECIO_POR_CREDITO`, `IGV`). |
| 5 | `src/js/demo_hallazgos.js:58` | Calidad (complejidad) | **SonarCloud** `javascript:S3776` (Cognitive Complexity 36 > 15) | Reemplazar los if/else anidados por una tabla/lookup o funciones pequeñas. |

> Bonus que SonarCloud también marca: `javascript:S7735` (condición negada
> innecesaria) en los `formatCourse`.

## Verificado localmente

- **Semgrep** (`semgrep scan --config p/default --error src/js/demo_hallazgos.js`):
  **2 findings (2 blocking)** → XSS (#1) y secreto (#2); `exit 1` (bloquea).
- **SonarLint** (en el IDE) marca #3, #4a, #4b y #5.

## Notas importantes sobre el pipeline actual

- El CI ahora corre **`semgrep ci`** (no `semgrep scan --config ...`), porque con
  `SEMGREP_APP_TOKEN` logueado **no se permite `--config`**: las reglas vienen del
  **policy de Semgrep AppSec Platform** (semgrep.dev) y los hallazgos se suben ahí.
  Las dos reglas de arriba (`xss.xss` y `detected-generic-api-key`) son de
  `p/default`, que está incluido en el policy por defecto. Si en tu org no
  estuvieran activas, agrégalas al *Rule board* en semgrep.dev (o incluye
  `p/default` / `p/secrets`).
- El secreto del enunciado original (`"demo-fake-key-NO-REAL-abc123"`) es de **baja
  entropía** y **no** dispara la regla de secretos; por eso aquí se usa un valor
  con forma de clave (40 hex). Buen punto para explicar en clase: los detectores de
  secretos se basan en entropía/forma, no en el nombre de la variable.
- `demo_hallazgos.js` no se importa en la app: existe solo para el escaneo. No
  afecta el funcionamiento del visor.
