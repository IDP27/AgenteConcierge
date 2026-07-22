import { describe, expect, it } from "vitest";
import { normalizePhone, phonesMatch } from "./identity.js";

describe("normalizePhone", () => {
  it("mantém só os dígitos", () => {
    expect(normalizePhone("+55 (71) 98231-3997")).toBe("5571982313997");
  });
});

describe("phonesMatch", () => {
  it("casa o mesmo número com formatações diferentes", () => {
    expect(phonesMatch("+55 71 98231-3997", "5571982313997")).toBe(true);
  });

  it("casa com/sem código do país", () => {
    expect(phonesMatch("71982313997", "5571982313997")).toBe(true);
  });

  it("9º DÍGITO: casa o cadastro (com 9) com o wa_id do WhatsApp (sem 9)", () => {
    // Cadastro tem "...98231..."; a Meta entrega o wa_id como "...8231..." (sem o 9).
    expect(phonesMatch("+55 71 98231-3997", "557182313997")).toBe(true);
    expect(phonesMatch("557182313997", "5571982313997")).toBe(true);
  });

  it("não casa números de assinantes diferentes", () => {
    expect(phonesMatch("+55 71 98231-3997", "+55 71 98231-3998")).toBe(false);
    expect(phonesMatch("+55 11 98888-0001", "+55 71 98231-3997")).toBe(false);
  });

  it("não casa apenas por DDD igual", () => {
    expect(phonesMatch("+55 71 98231-3997", "+55 71 97777-0002")).toBe(false);
  });

  it("string vazia nunca casa", () => {
    expect(phonesMatch("", "5571982313997")).toBe(false);
  });
});
