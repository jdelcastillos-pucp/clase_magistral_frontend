// config.js — ÚNICO punto para configurar el backend.
//
// BACKEND_URL es la Lambda Function URL del backend. En el despliegue (CD), el
// pipeline reemplaza el placeholder __BACKEND_URL__ por la URL real (variable de
// GitHub Actions BACKEND_URL) antes de subir a S3.
//
// Para desarrollo local puedes editar este valor a mano. Si queda con el
// placeholder, el frontend usará automáticamente el fallback local
// (src/courses.json) para "Ver malla completa".

export const BACKEND_URL = "__BACKEND_URL__";

/** true si BACKEND_URL aún no fue configurado (sigue siendo el placeholder). */
export function isBackendConfigured(url = BACKEND_URL) {
  return typeof url === "string" && url.length > 0 && !url.includes("__BACKEND_URL__");
}
