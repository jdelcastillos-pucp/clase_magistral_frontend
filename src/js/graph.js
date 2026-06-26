// graph.js — Lógica PURA de transformación de datos.
//
// Sin DOM, sin fetch, sin dependencias del navegador ni de vis-network.
// Todo lo que vive aquí es determinista y testeable con Vitest en Node.
//
// Dos transformaciones:
//   1. coursesToGraph(courses)  -> { nodes, edges }   (para el fallback local)
//   2. toVisData({ nodes, edges }) -> { nodes, edges } con estilos vis-network
//
// El contrato del backend (CONTRATO-API.md) dice que la Lambda ya devuelve
// { nodes, edges }; el fallback local parte de courses.json crudo, por eso
// coursesToGraph existe.

// ---------------------------------------------------------------------------
// Constantes de estilo (exportadas para que los tests puedan afirmarlas).
// ---------------------------------------------------------------------------

/** Tipos de curso conocidos. */
export const COURSE_TYPES = Object.freeze({
  OBLIGATORIO: "obligatorio",
  ELECTIVO: "electivo",
});

/** Tipos de prerrequisito conocidos (enum del backend). */
export const EDGE_TYPES = Object.freeze({
  APROBADO: "aprobado",
  SIMULTANEO: "simultaneo",
  NOTA08: "nota08",
  ESPECIAL: "especial",
});

/** Color de nodo según `type`. Los stub (prereqs externos) usan EXTERNO. */
export const NODE_COLORS = Object.freeze({
  obligatorio: { background: "#cfe3ff", border: "#2b6cb0" },
  electivo: { background: "#dcf5e3", border: "#2f855a" },
  externo: { background: "#eeeeee", border: "#999999" },
});

/**
 * Estilo de arista según el `type` del prerrequisito.
 * - aprobado  -> línea sólida
 * - simultaneo -> línea punteada
 * - nota08 -> patrón distinto (color ámbar)
 * - especial -> patrón distinto (color violeta)
 * `dashes`: false = sólida, true = punteada, [a,b] = patrón custom.
 */
export const EDGE_STYLES = Object.freeze({
  aprobado: { dashes: false, color: "#2b6cb0", label: "aprobado" },
  simultaneo: { dashes: true, color: "#dd6b20", label: "simultáneo" },
  nota08: { dashes: [4, 4], color: "#b7791f", label: "nota ≥ 08" },
  especial: { dashes: [2, 6], color: "#805ad5", label: "especial" },
});

/** Estilo por defecto para un edge.type desconocido (defensivo). */
export const DEFAULT_EDGE_STYLE = Object.freeze({
  dashes: [1, 3],
  color: "#a0aec0",
  label: "prerrequisito",
});

/** Nivel asignado a electivos (cycle === null) en el layout jerárquico. */
export const ELECTIVE_LEVEL = 11;

/**
 * Nivel asignado a prerrequisitos EXTERNOS (cursos previos a ciclo 5 que no son
 * de la malla, p.ej. INF144). Se ponen a la izquierda de ciclo 5.
 */
export const EXTERNAL_LEVEL = 4;

// ---------------------------------------------------------------------------
// 1. courses crudos -> grafo neutro { nodes, edges }
// ---------------------------------------------------------------------------

/**
 * Convierte el array `courses` (forma de data/courses.json) en un grafo neutro
 * { nodes, edges } equivalente a lo que devuelve el backend.
 *
 * - nodes: { id, name, credits, cycle, type } (sin prerequisites, como el backend).
 * - edges: { from: prereq, to: curso, type } — una arista por cada prerequisito.
 *
 * Robusto ante entradas raras: ignora cursos sin `id`, normaliza prerequisites
 * faltantes a [].
 *
 * @param {Array<object>} courses
 * @returns {{ nodes: Array<object>, edges: Array<object> }}
 */
export function coursesToGraph(courses) {
  const list = Array.isArray(courses) ? courses : [];

  const nodes = list
    .filter((c) => c && c.id != null)
    .map((c) => ({
      id: c.id,
      name: c.name ?? c.id,
      credits: typeof c.credits === "number" ? c.credits : 0,
      cycle: c.cycle ?? null,
      type: c.type ?? COURSE_TYPES.ELECTIVO,
    }));

  const edges = [];
  for (const c of list) {
    if (!c || c.id == null) continue;
    const prereqs = Array.isArray(c.prerequisites) ? c.prerequisites : [];
    for (const p of prereqs) {
      if (!p || p.course == null) continue;
      edges.push({ from: p.course, to: c.id, type: p.type ?? null });
    }
  }

  return { nodes, edges };
}

/**
 * Filtra un grafo neutro para dejar SOLO cursos obligatorios (quita electivos).
 *
 * - Conserva los nodos con `type === "obligatorio"`.
 * - Conserva las aristas cuyo destino (`to`) es obligatorio y cuyo origen
 *   (`from`) es obligatorio o un prerrequisito externo (ausente del grafo).
 *   Así no se pierden las dependencias hacia prereqs externos (INF144, etc.),
 *   que luego `toVisData` materializa como nodos stub.
 *
 * @param {{nodes?: Array<object>, edges?: Array<object>}} graph
 * @returns {{nodes: Array<object>, edges: Array<object>}}
 */
export function keepOnlyObligatorios(graph) {
  const inNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const inEdges = Array.isArray(graph?.edges) ? graph.edges : [];

  const nodes = inNodes.filter((n) => n && n.type === COURSE_TYPES.OBLIGATORIO);
  const keptIds = new Set(nodes.map((n) => n.id));
  const allIds = new Set(inNodes.filter((n) => n && n.id != null).map((n) => n.id));

  const edges = inEdges.filter((e) => {
    if (!e || e.from == null || e.to == null) return false;
    const toKept = keptIds.has(e.to); // el curso que exige el prereq es obligatorio
    const fromKeptOrExternal = keptIds.has(e.from) || !allIds.has(e.from);
    return toKept && fromKeptOrExternal;
  });

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// 2. grafo neutro -> datos con estilo para vis-network
// ---------------------------------------------------------------------------

/**
 * Resuelve el nivel jerárquico de un nodo a partir de su ciclo.
 * Electivos (cycle null/indefinido) van al nivel ELECTIVE_LEVEL.
 * @param {number|null|undefined} cycle
 * @returns {number}
 */
export function levelForCycle(cycle) {
  return typeof cycle === "number" && Number.isFinite(cycle)
    ? cycle
    : ELECTIVE_LEVEL;
}

/**
 * Devuelve el estilo de arista para un `type` dado (defensivo ante desconocidos).
 * @param {string|null|undefined} type
 * @returns {{dashes: boolean|number[], color: string, label: string}}
 */
export function edgeStyleFor(type) {
  return EDGE_STYLES[type] ?? DEFAULT_EDGE_STYLE;
}

/**
 * Transforma un grafo neutro { nodes, edges } en datos listos para vis-network.
 *
 * Reglas:
 * - Color de nodo por `type` (obligatorio/electivo); externos en gris.
 * - `group` = type y `level` = ciclo (electivos en ELECTIVE_LEVEL) para
 *   agrupar/columnar por ciclo en el layout jerárquico.
 * - Estilo de arista por `edge.type` (sólida/punteada/otros).
 * - DEFENSIVO: si un edge referencia un `id` ausente de `nodes` (prereq
 *   externo, p.ej. INF144), se crea un nodo "stub" neutro marcado `external`.
 * - DEFENSIVO: edge.type fuera del enum -> estilo por defecto, sin romper.
 *
 * Devuelve objetos planos (no vis.DataSet) para mantener la función pura; el
 * llamador los envuelve en vis.DataSet.
 *
 * @param {{nodes?: Array<object>, edges?: Array<object>}} graph
 * @returns {{nodes: Array<object>, edges: Array<object>}}
 */
export function toVisData(graph) {
  const inNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const inEdges = Array.isArray(graph?.edges) ? graph.edges : [];

  // Índice de nodos reales por id.
  const byId = new Map();
  const visNodes = [];

  for (const n of inNodes) {
    if (!n || n.id == null || byId.has(n.id)) continue;
    const node = buildVisNode(n, false);
    byId.set(n.id, node);
    visNodes.push(node);
  }

  const visEdges = [];
  let edgeSeq = 0;
  for (const e of inEdges) {
    if (!e || e.from == null || e.to == null) continue;

    // Crear stubs para extremos ausentes (prereqs externos).
    ensureStub(e.from, byId, visNodes);
    ensureStub(e.to, byId, visNodes);

    const style = edgeStyleFor(e.type);
    visEdges.push({
      id: `e${edgeSeq++}`,
      from: e.from,
      to: e.to,
      arrows: "to",
      dashes: style.dashes,
      color: { color: style.color },
      title: style.label,
      reqType: e.type ?? null,
    });
  }

  return { nodes: visNodes, edges: visEdges };
}

/**
 * Reúne los prerrequisitos (aristas entrantes) de un curso, para el panel lateral.
 * Devuelve [{ course, type }] donde `course` es el id del prerrequisito.
 * @param {string} courseId
 * @param {{edges?: Array<object>}} graph  grafo neutro (no el de vis)
 * @returns {Array<{course: string, type: string|null}>}
 */
export function prerequisitesOf(courseId, graph) {
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  return edges
    .filter((e) => e && e.to === courseId)
    .map((e) => ({ course: e.from, type: e.type ?? null }));
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function buildVisNode(n, isExternal) {
  const type = isExternal ? "externo" : n.type ?? COURSE_TYPES.ELECTIVO;
  const colorKey = NODE_COLORS[type] ? type : "externo";
  return {
    id: n.id,
    label: n.id,
    title: n.name ?? n.id,
    name: n.name ?? n.id,
    credits: typeof n.credits === "number" ? n.credits : null,
    cycle: n.cycle ?? null,
    type,
    external: Boolean(isExternal),
    group: colorKey,
    level: isExternal ? EXTERNAL_LEVEL : levelForCycle(n.cycle),
    color: NODE_COLORS[colorKey],
    shape: "box",
  };
}

function ensureStub(id, byId, visNodes) {
  if (id == null || byId.has(id)) return;
  const stub = buildVisNode({ id, name: id, credits: null, cycle: null }, true);
  byId.set(id, stub);
  visNodes.push(stub);
}
