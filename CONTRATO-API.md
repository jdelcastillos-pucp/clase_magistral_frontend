# Contrato API — Frontend ↔ Backend (malla curricular PUCP)

> Documento de validación entre `clase_magistral_frontend` (este repo) y
> `clase_magistral_backend` (Lambda detrás de API Gateway HTTP API).
> Demo educativa para clase de DevSecOps. **Sin credenciales reales.**

El objetivo es que ambos equipos validen la **misma** forma de request/response.
Si el backend cambia algo, actualizar este archivo en el mismo PR.

---

## 1. Endpoint

| | |
|---|---|
| Método | `GET` |
| URL | **API Gateway (HTTP API)** → Lambda proxy → en el frontend es `BACKEND_URL` en `src/config.js` |
| Query param | `search` (opcional) |
| Auth | Ninguna (demo) |

```
GET <BACKEND_URL>/?search=<texto>
GET <BACKEND_URL>/                  # sin search → malla completa
```

---

## 2. CORS (bloqueante para el frontend)

El sitio se sirve desde S3 (otro origen), así que el navegador exige CORS.
La Lambda **debe** responder en TODA respuesta (incluido error):

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: *
Access-Control-Allow-Methods: GET,OPTIONS
```

- ✅ Confirmado en `src/lambda.js`: `CORS_HEADERS` se aplica en éxito **y** en
  el `catch` que retorna `500` (alineado, ver §9). Cubierto por test
  `handler returns 500 WITH CORS headers`.
- Como es `GET` simple sin headers personalizados, **no** debería dispararse
  preflight `OPTIONS`. Aun así el backend ya emite `Access-Control-Allow-Methods:
  GET,OPTIONS`, así que un preflight tampoco rompería.

---

## 3. Respuesta — envoltura

| | |
|---|---|
| HTTP status (éxito) | `200` |
| `Content-Type` | `application/json` |
| Body | objeto `{ "nodes": [...], "edges": [...] }` |

El body **siempre** es un objeto con las claves `nodes` y `edges` (arrays,
posiblemente vacíos). El frontend nunca recibe un array “pelado” en la raíz.

---

## 4. Esquema de `nodes`

Cada nodo es un curso:

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | Código del curso. **Identificador único** y estable. Ej: `"1INF33"`, `"INF238"` |
| `name` | string | Nombre legible. Puede tener tildes/ñ y `&`/comillas |
| `credits` | number | Puede ser decimal (`3.5`) o `0.0` (ej. inglés) |
| `cycle` | number \| `null` | Ciclo 5–10 para obligatorios; **`null`** para electivos |
| `type` | string | `"obligatorio"` \| `"electivo"` |

> ⚠️ **El frontend NO asume `prerequisites` dentro del nodo.** El README del
> backend lista solo `id, name, credits, cycle, type`. Los prerrequisitos para
> el panel lateral se **derivan de `edges`** (ver §6). Si el backend SÍ incluye
> `prerequisites` en el nodo, lo usaremos como bonus, pero no es requerido.

Valores permitidos:
- `type` ∈ `{ "obligatorio", "electivo" }`
- `cycle` ∈ `{ 5,6,7,8,9,10, null }`

---

## 5. Esquema de `edges`

Cada arista es una relación de prerrequisito:

| Campo | Tipo | Notas |
|---|---|---|
| `from` | string | `id` del curso **prerrequisito** (origen) |
| `to` | string | `id` del curso que **exige** ese prerrequisito (destino) |
| `type` | string | Tipo de requisito (ver abajo) |

Dirección: **`from` = prerrequisito → `to` = curso que lo necesita.**
Ejemplo: `1INF30 (Programación 3)` exige `1INF25 (Programación 2)` aprobado
⇒ `{ "from": "1INF25", "to": "1INF30", "type": "aprobado" }`.

`edge.type` ∈ `{ "aprobado", "simultaneo", "nota08", "especial" }`
(según `metadata.tiposRequisito` de `courses.json`).

Mapeo de estilo en el frontend (vis-network):

| `edge.type` | Estilo de arista |
|---|---|
| `aprobado` | línea **sólida** |
| `simultaneo` | línea **punteada** (dashes) |
| `nota08` | otro estilo (color/patrón distinto) |
| `especial` | otro estilo (color/patrón distinto) |

> Si el backend emite un `type` fuera de ese conjunto, el frontend usa un estilo
> por defecto y no rompe — pero repórtenlo para alinear el enum.

---

## 6. Semántica de `search`

| Caso | Comportamiento esperado del backend |
|---|---|
| **sin** `search` (o vacío) | Devuelve el **grafo completo** (los 88 cursos + todas las aristas) |
| **con** `search` | Devuelve un **subgrafo**: cursos que coinciden + sus **prerrequisitos directos** + sus **dependientes directos** (1 nivel en cada dirección) |
| coincidencia por | código (`id`) **y** nombre (`name`) |

**Confirmado contra `src/lambda.js` (función `normalize` + `findMatchingCourseIds`):**

- [x] **Case-insensitive** — ✅ `normalize()` hace `trim().toLocaleLowerCase()`. `"redes"` ≡ `"REDES"`.
- [ ] **Accent-insensitive** — ❌ **NO implementado.** `normalize()` no quita tildes, así que
      `"informatica"` **no** trae `"informática"`. Deseable, no bloqueante; pendiente si se quiere.
- [x] **Substring** — ✅ usa `.includes()` sobre `id` y `name`. `"programaci"` trae Programación 2 y 3.
- [x] **Sin coincidencias ⇒ `200` + `{nodes:[],edges:[]}`** — ✅ `buildSearchGraph` retorna grafo vacío,
      `handler` siempre responde `200`. Nunca 404.

---

## 7. Prerrequisitos externos (caso borde importante)

`courses.json` declara `metadata.prerequisitosExternos`:
`["1FIS06", "1FIS07", "1MAT09", "INF134", "INF144"]`.

Estos códigos aparecen como `from` en aristas (ej. `1INF27` exige `INF144`)
pero **no son cursos de la malla** (no están en `courses`).

**Resuelto contra `src/lambda.js` (`buildNodes` filtra solo cursos presentes en `courses`):**

- [x] **Estrategia acordada: el backend emite el edge SIN crear el nodo.** Verificado con
      `GET /?search=1INF33`: el edge `{from:"INF144", to:"1INF33", type:"especial"}` aparece,
      pero `INF144` **no** está en `nodes` (no es un curso de la malla).
- El backend **no** inventa nodos para los 5 prereqs externos
  (`1FIS06, 1FIS07, 1MAT09, INF134, INF144`); solo los referencia como `edge.from`.

> Por eso el frontend **debe** ser defensivo: si un `edge.from`/`edge.to` apunta a un `id`
> que no está en `nodes`, crea un nodo “stub” (estilo neutro, marcado como externo) para no
> romper el render. Esta es la única estrategia acordada.

---

## 8. Ejemplo trabajado (datos reales)

`GET /?search=1INF33` → curso **Base de Datos** (ciclo 5).
Prereq directo: `INF144` (especial, externo).
Dependientes directos (cursos que exigen `1INF33`): `1INF28` (simultaneo),
`1INF30` (nota08), `1INF40` (aprobado).

Respuesta esperada (forma; el orden de los arrays no importa):

```json
{
  "nodes": [
    { "id": "1INF33", "name": "Base de Datos", "credits": 3.5, "cycle": 5, "type": "obligatorio" },
    { "id": "1INF28", "name": "Fundamentos de Sistemas de Información", "credits": 3.5, "cycle": 5, "type": "obligatorio" },
    { "id": "1INF30", "name": "Programación 3", "credits": 5.0, "cycle": 6, "type": "obligatorio" },
    { "id": "1INF40", "name": "Tecnologías de Información para los Negocios", "credits": 3.5, "cycle": 8, "type": "obligatorio" }
  ],
  "edges": [
    { "from": "INF144",  "to": "1INF33", "type": "especial" },
    { "from": "1INF33", "to": "1INF28", "type": "simultaneo" },
    { "from": "1INF33", "to": "1INF30", "type": "nota08" },
    { "from": "1INF33", "to": "1INF40", "type": "aprobado" }
  ]
}
```

> Nota: si el backend decide incluir un nodo para `INF144` (prereq externo),
> aparecerá también en `nodes`. Ver §7.

Sin coincidencias:

```json
{ "nodes": [], "edges": [] }
```

---

## 9. Errores

| Situación | Esperado | Estado en backend |
|---|---|---|
| Método ≠ GET | `405` (o ignorado); frontend solo usa GET | **Ignorado**: el handler no inspecciona el método y responde `200` con el grafo. Aceptado por el contrato. |
| Excepción interna | `500` con header CORS presente; body `{ "error": "..." }` | ✅ **Alineado**: `try/catch` retorna `500` + `CORS_HEADERS` + `{error}`. |
| Búsqueda sin resultados | **NO** es error: `200` + `{nodes:[],edges:[]}` | ✅ Confirmado. |

El frontend muestra un mensaje de error y, para “Ver malla completa”, **cae a una
copia local** de `courses.json` empaquetada en `/src` (robustez en demo en vivo,
porque las credenciales del Learner Lab vencen cada 4 h y la Lambda puede fallar).

---

## 10. Checklist de validación (correr contra la Lambda real)

Reemplazar `$URL` por el endpoint del API Gateway (output `backend_url`).

```bash
URL="https://XXXX.lambda-url.us-east-1.on.aws"

# 1. Malla completa: debe traer ~88 nodos
curl -s "$URL/" | jq '{nodes: (.nodes|length), edges: (.edges|length)}'

# 2. Estructura de un nodo: solo id,name,credits,cycle,type
curl -s "$URL/" | jq '.nodes[0]'

# 3. Estructura de una arista: from,to,type
curl -s "$URL/" | jq '.edges[0]'

# 4. enum de edge.type
curl -s "$URL/" | jq '[.edges[].type] | unique'
# esperado ⊆ ["aprobado","especial","nota08","simultaneo"]

# 5. enum de node.type
curl -s "$URL/" | jq '[.nodes[].type] | unique'
# esperado: ["electivo","obligatorio"]

# 6. Búsqueda por código → subgrafo
curl -s "$URL/?search=1INF33" | jq '{nodes:[.nodes[].id], edges:[.edges[]|"\(.from)->\(.to) (\(.type))"]}'

# 7. Búsqueda por nombre (substring + case-insensitive)
curl -s "$URL/?search=programaci" | jq '[.nodes[].id]'

# 8. Sin resultados → 200 + arrays vacíos (NO 404)
curl -s -o /dev/null -w "%{http_code}\n" "$URL/?search=zzznoexiste"
curl -s "$URL/?search=zzznoexiste" | jq '.'

# 9. CORS presente
curl -s -D - -o /dev/null "$URL/" | grep -i access-control-allow-origin

# 10. Prereq externo: ¿aparece INF144 como nodo o solo como edge.from?
curl -s "$URL/?search=1INF27" | jq '{tieneNodoExterno: ([.nodes[].id] | index("INF144") != null), edges:[.edges[]|select(.from=="INF144")]}'
```

### Resumen de acuerdos (alineados el 2026-06-26 contra `src/lambda.js`)
- [x] Búsqueda case-insensitive + substring por `id` y `name` — ✅
- [ ] Búsqueda accent-insensitive — ❌ no implementado (deseable, no bloqueante)
- [x] Sin resultados ⇒ `200` con arrays vacíos — ✅
- [x] Estrategia única para prereqs externos: **edge sin nodo** (frontend crea stub) — ✅
- [x] `edge.type` limitado al enum de 4 valores — ✅ en datos; ⚠️ `buildEdges` tiene fallback
      `"prerequisite"` si un prereq llegara sin `type` (hoy no ocurre; el frontend debe aplicar
      estilo por defecto ante cualquier `type` desconocido)
- [x] CORS `*` en éxito **y** en error — ✅ (`CORS_HEADERS` + `try/catch`)
