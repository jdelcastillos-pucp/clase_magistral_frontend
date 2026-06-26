// api.js — Acceso al backend con fallback local.
//
// Capa fina sobre fetch(). La lógica pura (transformación a vis-network) vive en
// graph.js; aquí solo se obtienen datos.

import { BACKEND_URL, isBackendConfigured } from "../config.js";
import { coursesToGraph } from "./graph.js";

/** Construye la URL de consulta al backend. */
function buildUrl(base, search) {
  const url = new URL(base);
  if (search) url.searchParams.set("search", search);
  return url.toString();
}

async function getJson(url) {
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Backend respondió ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Busca un subgrafo en el backend por texto (código o nombre).
 * @param {string} text
 * @returns {Promise<{nodes:Array,edges:Array}>}
 */
export async function fetchSearch(text) {
  if (!isBackendConfigured()) {
    throw new Error("BACKEND_URL no configurado. Edita src/config.js o usa 'Ver malla completa'.");
  }
  return getJson(buildUrl(BACKEND_URL, text));
}

/**
 * Trae la malla completa desde el backend.
 * @returns {Promise<{nodes:Array,edges:Array}>}
 */
export async function fetchFull() {
  if (!isBackendConfigured()) {
    throw new Error("BACKEND_URL no configurado");
  }
  return getJson(buildUrl(BACKEND_URL, ""));
}

/**
 * Carga la malla completa desde la copia local empaquetada (fallback offline).
 * @returns {Promise<{nodes:Array,edges:Array}>}
 */
export async function fetchLocalFull() {
  const data = await getJson(new URL("../courses.json", import.meta.url).toString());
  return coursesToGraph(data.courses ?? data);
}

/**
 * "Ver malla completa" robusta para demo en vivo: intenta el backend y, si falla
 * o no está configurado, cae a la copia local. Devuelve también el origen usado.
 * @returns {Promise<{graph:{nodes:Array,edges:Array}, source:'backend'|'local'}>}
 */
export async function fetchFullWithFallback() {
  if (isBackendConfigured()) {
    try {
      return { graph: await fetchFull(), source: "backend" };
    } catch (err) {
      console.warn("Backend no disponible, usando copia local:", err.message);
    }
  }
  return { graph: await fetchLocalFull(), source: "local" };
}
