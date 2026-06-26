import { describe, it, expect } from "vitest";
import { isBackendConfigured } from "../src/config.js";

describe("isBackendConfigured", () => {
  it("es false con el placeholder sin reemplazar", () => {
    expect(isBackendConfigured("__BACKEND_URL__")).toBe(false);
  });

  it("es false con valores vacíos o no-URL", () => {
    expect(isBackendConfigured("")).toBe(false);
    expect(isBackendConfigured("no-soy-url")).toBe(false);
    expect(isBackendConfigured(null)).toBe(false);
    expect(isBackendConfigured(undefined)).toBe(false);
  });

  it("es true con una URL http(s) (como la que inyecta el CD)", () => {
    expect(isBackendConfigured("https://5uwyrwp6j8.execute-api.us-east-1.amazonaws.com")).toBe(true);
    expect(isBackendConfigured("http://localhost:3000")).toBe(true);
  });

  it("el valor por defecto del módulo (placeholder) NO está configurado", () => {
    // En el código fuente BACKEND_URL es el placeholder; el CD lo reemplaza.
    expect(isBackendConfigured()).toBe(false);
  });
});
