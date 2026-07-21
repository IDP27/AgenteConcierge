import { describe, expect, it } from "vitest";
import { canTransition } from "./reservation-repo.js";

describe("canTransition (máquina de estados da reserva)", () => {
  it.each([
    ["confirmed", "checked_in_digital", true],
    ["confirmed", "checked_in", true], // chegada sem check-in digital
    ["confirmed", "cancelled", true],
    ["checked_in_digital", "checked_in", true],
    ["checked_in_digital", "cancelled", true],
    ["checked_in", "checked_out", true],
  ] as const)("permite %s → %s", (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });

  it.each([
    ["confirmed", "checked_out"], // não pula a estadia
    ["checked_in_digital", "confirmed"], // não retrocede
    ["checked_in", "cancelled"], // hóspede na casa não é "cancelado"
    ["checked_out", "checked_in"], // pós-estadia é terminal
    ["cancelled", "confirmed"], // cancelada é terminal
    ["checked_out", "confirmed"],
  ] as const)("rejeita %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});
