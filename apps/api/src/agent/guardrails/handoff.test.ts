import { describe, expect, it } from "vitest";
import { detectHandoffReason } from "./handoff.js";

describe("detectHandoffReason", () => {
  it.each([
    "quero falar com um atendente",
    "posso falar com uma pessoa?",
    "chama o gerente por favor",
    "prefiro atendimento humano",
  ])("detecta pedido explícito: %s", (text) => {
    expect(detectHandoffReason(text)).toMatch(/explicitamente/);
  });

  it.each([
    "isso é um absurdo!",
    "que atendimento péssimo",
    "inaceitável, já pedi isso várias vezes",
    "vou reclamar no procon",
  ])("detecta frustração: %s", (text) => {
    expect(detectHandoffReason(text)).toMatch(/frustração/i);
  });

  it.each([
    "qual o horário da piscina?",
    "quero pedir toalhas extras",
    "tem programação infantil amanhã?",
  ])("não dispara em mensagens normais: %s", (text) => {
    expect(detectHandoffReason(text)).toBeNull();
  });
});
