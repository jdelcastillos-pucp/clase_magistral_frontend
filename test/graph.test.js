import { describe, it, expect } from "vitest";
import {
  coursesToGraph,
  toVisData,
  prerequisitesOf,
  levelForCycle,
  edgeStyleFor,
  EDGE_STYLES,
  DEFAULT_EDGE_STYLE,
  NODE_COLORS,
  ELECTIVE_LEVEL,
} from "../src/js/graph.js";

// Subconjunto realista de courses.json (forma cruda del backend/data).
const SAMPLE_COURSES = [
  {
    id: "1INF33",
    name: "Base de Datos",
    credits: 3.5,
    cycle: 5,
    type: "obligatorio",
    prerequisites: [{ course: "INF144", type: "especial" }],
  },
  {
    id: "1INF30",
    name: "Programación 3",
    credits: 5.0,
    cycle: 6,
    type: "obligatorio",
    prerequisites: [
      { course: "1INF25", type: "aprobado" },
      { course: "1INF33", type: "nota08" },
    ],
  },
  {
    id: "1INF20",
    name: "Ciberseguridad",
    credits: 3.5,
    cycle: null,
    type: "electivo",
    prerequisites: [{ course: "1INF41", type: "aprobado" }],
  },
];

describe("coursesToGraph", () => {
  it("convierte courses crudos en nodos sin prerequisites", () => {
    const { nodes } = coursesToGraph(SAMPLE_COURSES);
    expect(nodes).toHaveLength(3);
    const bd = nodes.find((n) => n.id === "1INF33");
    expect(bd).toMatchObject({
      id: "1INF33",
      name: "Base de Datos",
      credits: 3.5,
      cycle: 5,
      type: "obligatorio",
    });
    expect(bd).not.toHaveProperty("prerequisites");
  });

  it("genera una arista from=prereq -> to=curso por cada prerequisito", () => {
    const { edges } = coursesToGraph(SAMPLE_COURSES);
    expect(edges).toContainEqual({ from: "INF144", to: "1INF33", type: "especial" });
    expect(edges).toContainEqual({ from: "1INF25", to: "1INF30", type: "aprobado" });
    expect(edges).toContainEqual({ from: "1INF33", to: "1INF30", type: "nota08" });
    expect(edges).toHaveLength(4);
  });

  it("es robusto ante entradas inválidas", () => {
    expect(coursesToGraph(null)).toEqual({ nodes: [], edges: [] });
    expect(coursesToGraph(undefined)).toEqual({ nodes: [], edges: [] });
    const { nodes } = coursesToGraph([{ name: "sin id" }, { id: "X" }]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe("X");
  });
});

describe("levelForCycle", () => {
  it("usa el ciclo numérico como nivel", () => {
    expect(levelForCycle(5)).toBe(5);
    expect(levelForCycle(10)).toBe(10);
  });
  it("manda electivos (cycle null) al nivel ELECTIVE_LEVEL", () => {
    expect(levelForCycle(null)).toBe(ELECTIVE_LEVEL);
    expect(levelForCycle(undefined)).toBe(ELECTIVE_LEVEL);
  });
});

describe("edgeStyleFor", () => {
  it("mapea cada tipo conocido a su estilo", () => {
    expect(edgeStyleFor("aprobado")).toBe(EDGE_STYLES.aprobado);
    expect(edgeStyleFor("simultaneo")).toBe(EDGE_STYLES.simultaneo);
    expect(edgeStyleFor("nota08")).toBe(EDGE_STYLES.nota08);
    expect(edgeStyleFor("especial")).toBe(EDGE_STYLES.especial);
  });
  it("aprobado es sólida y simultaneo es punteada", () => {
    expect(EDGE_STYLES.aprobado.dashes).toBe(false);
    expect(EDGE_STYLES.simultaneo.dashes).toBe(true);
  });
  it("usa el estilo por defecto ante tipos desconocidos", () => {
    expect(edgeStyleFor("inventado")).toBe(DEFAULT_EDGE_STYLE);
    expect(edgeStyleFor(null)).toBe(DEFAULT_EDGE_STYLE);
    expect(edgeStyleFor(undefined)).toBe(DEFAULT_EDGE_STYLE);
  });
});

describe("toVisData", () => {
  it("colorea nodos por type y asigna level por ciclo", () => {
    const graph = coursesToGraph(SAMPLE_COURSES);
    const { nodes } = toVisData(graph);
    const bd = nodes.find((n) => n.id === "1INF33");
    expect(bd.color).toEqual(NODE_COLORS.obligatorio);
    expect(bd.level).toBe(5);
    expect(bd.group).toBe("obligatorio");

    const ciber = nodes.find((n) => n.id === "1INF20");
    expect(ciber.color).toEqual(NODE_COLORS.electivo);
    expect(ciber.level).toBe(ELECTIVE_LEVEL);
  });

  it("aplica estilo de arista según edge.type", () => {
    const { edges } = toVisData({
      nodes: [{ id: "A" }, { id: "B" }],
      edges: [{ from: "A", to: "B", type: "simultaneo" }],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0].dashes).toBe(true);
    expect(edges[0].color).toEqual({ color: EDGE_STYLES.simultaneo.color });
    expect(edges[0].arrows).toBe("to");
    expect(edges[0].reqType).toBe("simultaneo");
  });

  it("crea nodos stub para prereqs externos ausentes de nodes", () => {
    // INF144 está como edge.from pero NO como nodo (prereq externo).
    const graph = coursesToGraph([SAMPLE_COURSES[0]]); // solo 1INF33
    expect(graph.nodes.map((n) => n.id)).toEqual(["1INF33"]);

    const { nodes } = toVisData(graph);
    const stub = nodes.find((n) => n.id === "INF144");
    expect(stub).toBeDefined();
    expect(stub.external).toBe(true);
    expect(stub.color).toEqual(NODE_COLORS.externo);
    expect(stub.group).toBe("externo");
  });

  it("no rompe ante edge.type desconocido", () => {
    const { edges } = toVisData({
      nodes: [{ id: "A" }, { id: "B" }],
      edges: [{ from: "A", to: "B", type: "raro" }],
    });
    expect(edges[0].color).toEqual({ color: DEFAULT_EDGE_STYLE.color });
  });

  it("ignora edges incompletos y nodos duplicados", () => {
    const { nodes, edges } = toVisData({
      nodes: [{ id: "A" }, { id: "A" }],
      edges: [{ from: "A" }, { to: "B" }, null],
    });
    expect(nodes.filter((n) => n.id === "A")).toHaveLength(1);
    expect(edges).toHaveLength(0);
  });

  it("es robusto ante grafo vacío o nulo", () => {
    expect(toVisData(null)).toEqual({ nodes: [], edges: [] });
    expect(toVisData({})).toEqual({ nodes: [], edges: [] });
  });
});

describe("prerequisitesOf", () => {
  it("deriva los prerrequisitos de un curso desde las aristas entrantes", () => {
    const graph = coursesToGraph(SAMPLE_COURSES);
    const prereqs = prerequisitesOf("1INF30", graph);
    expect(prereqs).toContainEqual({ course: "1INF25", type: "aprobado" });
    expect(prereqs).toContainEqual({ course: "1INF33", type: "nota08" });
    expect(prereqs).toHaveLength(2);
  });

  it("devuelve [] para cursos sin prerrequisitos", () => {
    const graph = coursesToGraph(SAMPLE_COURSES);
    expect(prerequisitesOf("INF144", graph)).toEqual([]);
  });
});
