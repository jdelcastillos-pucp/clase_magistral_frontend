// demo_hallazgos.js — ARCHIVO DE DEMO (rama demo/hallazgos).
//
// Introduce hallazgos DELIBERADOS para la clase de DevSecOps: sirve para mostrar
// cómo el pipeline (Semgrep + SonarCloud) los detecta y BLOQUEA el PR.
// NO ES CÓDIGO REAL. No se importa en la app. Cada problema está marcado con
// `// DEMO-HALLAZGO`. El detalle (regla esperada y fix) está en HALLAZGOS.md.

/* ===========================================================================
 * SEGURIDAD (esperado: Semgrep, bloqueante)
 * =========================================================================== */

// DEMO-HALLAZGO #2: API key hardcodeada. Valor FALSO (no es una credencial
// real). Fix: leerla de una variable de entorno / secret, nunca en el código.
const apiKey = "a1b2c3d4e5f6071829a3b4c5d6e7f8091a2b3c4d"; // NO real (demo)

// DEMO-HALLAZGO #1: XSS en DOM — se lee la entrada del usuario y se asigna a
// innerHTML SIN sanear (fuente location.hash -> sink innerHTML). Fix: textContent.
export function renderSearchTerm() {
  const term = document.getElementById("search-input").value;
  const box = document.getElementById("results-banner");
  box.innerHTML = "Resultados para: " + term + location.hash;
  return [box, apiKey];
}

/* ===========================================================================
 * CALIDAD (esperado: SonarCloud)
 * =========================================================================== */

// DEMO-HALLAZGO #3: código duplicado — formatCourseA y formatCourseB son
// idénticos. Fix: extraer una sola función reutilizable.
function formatCourseA(course) {
  const code = course.id.trim().toUpperCase();
  const name = course.name ? course.name : "Sin nombre";
  const credits = course.credits != null ? course.credits : 0;
  const tipo = course.type === "obligatorio" ? "OBL" : "ELE";
  return code + " - " + name + " (" + credits + " cr) [" + tipo + "]";
}

function formatCourseB(course) {
  const code = course.id.trim().toUpperCase();
  const name = course.name ? course.name : "Sin nombre";
  const credits = course.credits != null ? course.credits : 0;
  const tipo = course.type === "obligatorio" ? "OBL" : "ELE";
  return code + " - " + name + " (" + credits + " cr) [" + tipo + "]";
}

// DEMO-HALLAZGO #4: variables sin usar + números mágicos.
// Fix: eliminar variables muertas y extraer constantes con nombre.
export function computePrice(credits) {
  const unusedVar = 42; // DEMO-HALLAZGO: variable sin usar
  const tarifaBorrador = "pendiente"; // DEMO-HALLAZGO: variable sin usar
  // DEMO-HALLAZGO: números mágicos (350 = precio por crédito, 1.18 = IGV)
  return credits * 350 * 1.18;
}

// DEMO-HALLAZGO #5: complejidad ciclomática alta (muchos if/else anidados).
// Fix: usar una tabla/lookup o dividir en funciones pequeñas.
export function classifyCourse(c) {
  if (!c) return "invalido";
  if (c.type === "obligatorio") {
    if (c.cycle === 5) return c.credits > 4 ? "obl-5-pesado" : "obl-5-ligero";
    else if (c.cycle === 6) return c.credits > 4 ? "obl-6-pesado" : "obl-6-ligero";
    else if (c.cycle === 7) return c.credits > 4 ? "obl-7-pesado" : "obl-7-ligero";
    else if (c.cycle === 8) return c.credits > 4 ? "obl-8-pesado" : "obl-8-ligero";
    else if (c.cycle === 9) return c.credits > 4 ? "obl-9-pesado" : "obl-9-ligero";
    else if (c.cycle === 10) return c.credits > 4 ? "obl-10-pesado" : "obl-10-ligero";
    else return "obl-otro";
  } else if (c.type === "electivo") {
    if (c.credits > 4) return "ele-pesado";
    else if (c.credits > 2) return "ele-medio";
    else if (c.credits > 0) return "ele-ligero";
    else return "ele-cero";
  } else if (c.type === "externo") {
    return "externo";
  } else {
    return "desconocido";
  }
}

// Referencia los formatters duplicados para que no se reporten como "no usados"
// (el hallazgo que queremos mostrar es la DUPLICACIÓN, no el unused).
export const _demoFormatters = [formatCourseA, formatCourseB];
