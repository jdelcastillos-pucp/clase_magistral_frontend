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

/**
 * true si BACKEND_URL es una URL http(s) válida (configurada).
 * Detecta por forma de URL en vez de comparar con el literal del placeholder,
 * para que el reemplazo del CD (sed) no pueda romper esta verificación.
 */
export function isBackendConfigured(url = BACKEND_URL) {
  return typeof url === "string" && /^https?:\/\//.test(url);
}
