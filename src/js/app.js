// app.js — Orquestación de la UI (DOM + vis-network).
//
// Toda la lógica pura (transformaciones) está en graph.js; el acceso a datos en
// api.js. Aquí solo se conectan eventos, se renderiza el grafo y se pinta el
// panel lateral. `vis` se carga por CDN (window.vis) desde index.html.

import { fetchSearch, fetchFullWithFallback } from "./api.js";
import {
  toVisData,
  prerequisitesOf,
  keepOnlyObligatorios,
  EDGE_STYLES,
  EXTERNAL_LEVEL,
  ELECTIVE_LEVEL,
} from "./graph.js";

const els = {
  search: document.getElementById("search-input"),
  searchBtn: document.getElementById("search-btn"),
  fullBtn: document.getElementById("full-btn"),
  status: document.getElementById("status"),
  graph: document.getElementById("graph"),
  panel: document.getElementById("detail-panel"),
};

let network = null;
// Último grafo NEUTRO renderizado (para derivar prerequisitos en el panel).
let currentGraph = { nodes: [], edges: [] };

const VIS_OPTIONS = {
  layout: {
    hierarchical: {
      enabled: true,
      direction: "LR", // izquierda->derecha: cada ciclo es una columna (swimlane)
      sortMethod: "directed",
      levelSeparation: 260,
      nodeSpacing: 95,
      treeSpacing: 110,
    },
  },
  physics: false,
  interaction: { hover: true, tooltipDelay: 150 },
  nodes: { font: { size: 13 }, borderWidth: 1, margin: 8, widthConstraint: { maximum: 160 } },
  edges: { smooth: { type: "cubicBezier", forceDirection: "horizontal", roundness: 0.4 } },
};

/** Etiqueta de la swimlane según el nivel jerárquico. */
function laneLabel(level) {
  if (level === EXTERNAL_LEVEL) return "Prerreq.";
  if (level === ELECTIVE_LEVEL) return "Electivos";
  return `Ciclo ${level}`;
}

/**
 * Dibuja swimlanes verticales (una por ciclo) de fondo, con su etiqueta arriba.
 * Se llama en cada redraw (evento beforeDrawing), donde el contexto ya está en
 * coordenadas del grafo.
 */
function drawSwimlanes(ctx, net, levelById) {
  const ids = Object.keys(levelById);
  if (ids.length === 0) return;
  const positions = net.getPositions(ids);

  const xsByLevel = new Map();
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const id of ids) {
    const p = positions[id];
    if (!p) continue;
    const lvl = levelById[id];
    if (!xsByLevel.has(lvl)) xsByLevel.set(lvl, []);
    xsByLevel.get(lvl).push(p.x);
    yMin = Math.min(yMin, p.y);
    yMax = Math.max(yMax, p.y);
  }
  if (!Number.isFinite(yMin)) return;

  const lanes = [...xsByLevel.entries()]
    .map(([lvl, xs]) => ({ lvl: Number(lvl), x: xs.reduce((a, b) => a + b, 0) / xs.length }))
    .sort((a, b) => a.x - b.x);

  const fallbackHalf = 80;
  const top = yMin - 70;
  const bottom = yMax + 45;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "bold 15px system-ui, sans-serif";
  for (let i = 0; i < lanes.length; i++) {
    const cur = lanes[i];
    const prev = lanes[i - 1];
    const next = lanes[i + 1];
    const left = cur.x - (prev ? (cur.x - prev.x) / 2 : fallbackHalf);
    const right = cur.x + (next ? (next.x - cur.x) / 2 : fallbackHalf);

    ctx.fillStyle = i % 2 === 0 ? "rgba(43,108,176,0.06)" : "rgba(47,133,90,0.06)";
    ctx.fillRect(left, top, right - left, bottom - top);

    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.stroke();

    ctx.fillStyle = "#4a5568";
    ctx.fillText(laneLabel(cur.lvl), cur.x, top + 6);
  }
  ctx.restore();
}

function setStatus(msg, kind = "info") {
  els.status.textContent = msg;
  els.status.dataset.kind = kind;
}

/** Renderiza un grafo neutro { nodes, edges } en el canvas de vis-network. */
function render(graph) {
  currentGraph = graph;
  const visData = toVisData(graph);
  const data = {
    nodes: new window.vis.DataSet(visData.nodes),
    edges: new window.vis.DataSet(visData.edges),
  };

  if (network) network.destroy();
  network = new window.vis.Network(els.graph, data, VIS_OPTIONS);

  // Swimlanes por ciclo: dibujadas de fondo en cada redraw.
  const levelById = {};
  for (const n of visData.nodes) levelById[n.id] = n.level;
  network.on("beforeDrawing", (ctx) => drawSwimlanes(ctx, network, levelById));

  network.on("click", (params) => {
    if (params.nodes.length > 0) {
      showDetail(params.nodes[0]);
    } else {
      clearDetail();
    }
  });
}

/** Pinta el panel lateral con el detalle del curso seleccionado. */
function showDetail(nodeId) {
  const node = currentGraph.nodes.find((n) => n.id === nodeId);
  const prereqs = prerequisitesOf(nodeId, currentGraph);

  // Construcción segura con textContent (sin innerHTML) para evitar XSS.
  els.panel.replaceChildren();

  const title = document.createElement("h2");
  title.textContent = node ? node.name ?? node.id : nodeId;
  els.panel.appendChild(title);

  const code = document.createElement("p");
  code.className = "detail-code";
  code.textContent = `Código: ${nodeId}`;
  els.panel.appendChild(code);

  if (node) {
    els.panel.appendChild(detailRow("Créditos", fmtCredits(node.credits)));
    els.panel.appendChild(detailRow("Ciclo", node.cycle == null ? "Electivo (sin ciclo fijo)" : String(node.cycle)));
    els.panel.appendChild(detailRow("Tipo", node.type ?? "—"));
  } else {
    els.panel.appendChild(detailRow("Nota", "Prerrequisito externo (no es curso de la malla)"));
  }

  const prereqTitle = document.createElement("h3");
  prereqTitle.textContent = "Prerrequisitos";
  els.panel.appendChild(prereqTitle);

  if (prereqs.length === 0) {
    const none = document.createElement("p");
    none.className = "muted";
    none.textContent = "Sin prerrequisitos.";
    els.panel.appendChild(none);
  } else {
    const ul = document.createElement("ul");
    for (const p of prereqs) {
      const li = document.createElement("li");
      const styleLabel = (EDGE_STYLES[p.type] && EDGE_STYLES[p.type].label) || p.type || "prerrequisito";
      li.textContent = `${p.course} — ${styleLabel}`;
      ul.appendChild(li);
    }
    els.panel.appendChild(ul);
  }

  els.panel.classList.add("open");
}

function detailRow(label, value) {
  const p = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  p.appendChild(strong);
  p.appendChild(document.createTextNode(value));
  return p;
}

function fmtCredits(c) {
  if (c == null) return "—";
  return Number.isInteger(c) ? String(c) : c.toFixed(1);
}

function clearDetail() {
  els.panel.replaceChildren();
  els.panel.classList.remove("open");
}

async function onSearch() {
  const text = els.search.value.trim();
  if (!text) {
    setStatus("Escribe un código o nombre de curso, o usa 'Ver malla completa'.", "warn");
    return;
  }
  setStatus(`Buscando "${text}"…`);
  try {
    const graph = await fetchSearch(text);
    if (!graph.nodes || graph.nodes.length === 0) {
      setStatus(`Sin resultados para "${text}".`, "warn");
      render({ nodes: [], edges: [] });
      return;
    }
    render(graph);
    setStatus(`${graph.nodes.length} curso(s) para "${text}".`, "ok");
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error");
  }
}

async function onFull() {
  setStatus("Cargando malla completa…");
  try {
    const { graph, source } = await fetchFullWithFallback();
    // Solo obligatorios: la malla completa con electivos es demasiado densa.
    const obligatorios = keepOnlyObligatorios(graph);
    render(obligatorios);
    const origin = source === "local" ? " (copia local)" : "";
    setStatus(`Malla completa (obligatorios): ${obligatorios.nodes.length} cursos${origin}.`, "ok");
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error");
  }
}

els.searchBtn.addEventListener("click", onSearch);
els.fullBtn.addEventListener("click", onFull);
els.search.addEventListener("keydown", (e) => {
  if (e.key === "Enter") onSearch();
});

setStatus("Listo. Busca un curso o muestra la malla completa.");
