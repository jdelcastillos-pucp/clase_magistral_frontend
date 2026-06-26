# clase_magistral_frontend

Visualizador estático de la **malla curricular de Ingeniería Informática PUCP**
como grafo de cursos y prerrequisitos. Demo educativa para una clase de
**DevSecOps**. **Sin credenciales reales.**

Sitio **estático sin build**: HTML + CSS + módulos ES nativos, con
[`vis-network`](https://visjs.github.io/vis-network/) cargado por CDN. Se
despliega tal cual a un bucket S3.

## Cómo funciona

- **Buscar** un curso (código o nombre) → llama al backend
  `GET <BACKEND_URL>/?search=<texto>` y pinta el subgrafo devuelto `{nodes, edges}`.
- **Ver malla completa** → llama al backend sin `search`; si el backend falla o
  no está configurado, **cae a la copia local** `src/courses.json` (robustez para
  la demo en vivo: las credenciales del Learner Lab vencen cada 4h).
- **Click en un nodo** → panel lateral con créditos, ciclo y prerrequisitos.
- Estilo del grafo:
  - Color de nodo por `type` (obligatorio / electivo) y columna por `cycle`.
  - Estilo de arista por `type` del prerrequisito: **sólida** = `aprobado`,
    **punteada** = `simultaneo`, otros patrones para `nota08` y `especial`.
  - Prerrequisitos externos (p.ej. `INF144`) que vienen como arista sin nodo se
    dibujan como nodo *stub* neutro.

El contrato exacto con el backend está en [CONTRATO-API.md](CONTRATO-API.md).

## Estructura

```
src/
├── index.html        # UI: búsqueda, botones, grafo, panel lateral, leyenda
├── styles.css
├── config.js         # BACKEND_URL (único punto de configuración)
├── courses.json      # copia local de la malla (fallback offline)
└── js/
    ├── graph.js      # LÓGICA PURA testeable (transformación a vis-network)
    ├── api.js        # fetch al backend + fallback local
    └── app.js        # wiring del DOM + vis-network
test/graph.test.js    # tests Vitest del módulo puro
```

## Configurar `BACKEND_URL`

`BACKEND_URL` vive **solo** en [src/config.js](src/config.js) como placeholder
`__BACKEND_URL__`.

- **En el despliegue (CD):** el pipeline reemplaza el placeholder con la variable
  de repo `BACKEND_URL` (el endpoint del API Gateway) antes del `s3 sync`.
- **En local:** edítalo a mano. Si lo dejas en el placeholder, "Ver malla
  completa" usa la copia local automáticamente.

## Desarrollo local

```bash
pnpm install
pnpm test           # Vitest (módulo puro graph.js)
pnpm coverage       # genera coverage/lcov.info para SonarCloud

# Servir el sitio (cualquier servidor estático; hace falta por los módulos ES):
pnpm dlx serve src  # o: python3 -m http.server -d src 8080
```

## CI/CD (GitHub Actions)

Dos workflows separados:

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — **CI, en PR a `main`**:
  1. **quality** — `pnpm coverage` + escaneo de **SonarCloud** (`SONAR_TOKEN`).
  2. **security** — **Semgrep** (`semgrep ci --config p/default --config p/javascript`),
     **bloqueante** (falla si hay findings) y sube los resultados a Semgrep AppSec
     Platform (`SEMGREP_APP_TOKEN`).
- [`.github/workflows/cd.yml`](.github/workflows/cd.yml) — **CD, en push a `main`**:
  revalida **quality** + **security** y, con `needs: [quality, security]`, el job
  **deploy** inyecta `BACKEND_URL` en `config.js` y hace
  `aws s3 sync ./src s3://$S3_BUCKET --delete`.

### Secrets y variables del repo (GitHub → Settings)

**Secrets** (Settings → Secrets and variables → Actions → *Secrets*):

| Secret | Para |
|---|---|
| `SONAR_TOKEN` | SonarCloud (job quality) |
| `SEMGREP_APP_TOKEN` | Semgrep (job security) |
| `AWS_ACCESS_KEY_ID` | AWS (Learner Lab, temporal) |
| `AWS_SECRET_ACCESS_KEY` | AWS (Learner Lab, temporal) |
| `AWS_SESSION_TOKEN` | AWS (Learner Lab, temporal) |

**Variables** (misma pantalla → *Variables*, no son secretas):

| Variable | Valor |
|---|---|
| `BACKEND_URL` | Endpoint del API Gateway (output `backend_url` de Terraform) |
| `S3_BUCKET` | Nombre del bucket (output `frontend_bucket` de Terraform) |

> Los tokens de Sonar/Semgrep están en `secrets.md` (raíz del workspace).
> **`secrets.md` está gitignoreado; no lo commitees y rota los tokens tras la
> clase.** Comandos `gh` listos en el README raíz / `CLAUDE.md`.

## Crear el bucket S3 (static website)

Lo crea **Terraform** (`../clase_magistral_infra`): bucket + website config +
política de **lectura pública**. Manual, si lo necesitas:

```bash
aws s3 mb s3://<BUCKET> --region us-east-1
aws s3 website s3://<BUCKET> --index-document index.html --error-document index.html
# Desactivar Block Public Access y aplicar policy de lectura pública (s3:GetObject /*)
```

El sitio queda en `http://<BUCKET>.s3-website-us-east-1.amazonaws.com`.

## Refrescar credenciales del Learner Lab (cada 4h)

Las credenciales temporales vencen cada 4 horas. Antes de un deploy, actualiza
los 3 secrets AWS en GitHub con los valores nuevos del panel del lab:

```bash
R=jdelcastillos-pucp/clase_magistral_frontend
gh secret set AWS_ACCESS_KEY_ID     -R $R --body "<nuevo>"
gh secret set AWS_SECRET_ACCESS_KEY -R $R --body "<nuevo>"
gh secret set AWS_SESSION_TOKEN     -R $R --body "<nuevo>"
```
