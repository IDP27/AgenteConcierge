import { describe, expect, it } from "vitest";
import { toButtonLabel } from "./button-label.js";

describe("toButtonLabel", () => {
  it("mantém títulos que já cabem em 20 chars", () => {
    expect(toButtonLabel("Café da manhã")).toBe("Café da manhã");
  });

  it("corta na fronteira de palavra, não no meio dela", () => {
    // Antes: "Massagem relaxante n" (cortado no meio de "no").
    expect(toButtonLabel("Massagem relaxante no Spa Mar Azul")).toBe("Massagem relaxante…");
  });

  it("descarta conjunção pendurada no fim", () => {
    // Antes: "Cesta de frutas e es"; sem o descarte sairia "Cesta de frutas e…".
    expect(toButtonLabel("Cesta de frutas e espumante no quarto")).toBe("Cesta de frutas…");
  });

  it("respeita o limite de 20 caracteres em todos os casos", () => {
    const titulos = [
      "Massagem relaxante no Spa Mar Azul",
      "Cesta de frutas e espumante no quarto",
      "Jantar romântico pé na areia",
      "Passeio de escuna com mergulho e almoço a bordo",
    ];
    for (const t of titulos) expect(toButtonLabel(t).length).toBeLessThanOrEqual(20);
  });

  it("palavra única gigante: corta com reticência (não há fronteira)", () => {
    expect(toButtonLabel("Superhipermegaexperiencia")).toBe("Superhipermegaexper…");
  });

  it("normaliza espaços extras", () => {
    expect(toButtonLabel("  Spa   completo  ")).toBe("Spa completo");
  });
});
