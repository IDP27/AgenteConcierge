import { describe, expect, it } from "vitest";
import { joinSegments, mergeSegments } from "./segments.js";

describe("mergeSegments", () => {
  it("descarta a repetição literal — o caso visto na jornada", () => {
    const segs = [
      "Quase lá! Você vem acompanhado ou vai ficar só?",
      "Quase lá! Você vem acompanhado ou vai ficar só?",
    ];
    expect(mergeSegments(segs)).toEqual(["Quase lá! Você vem acompanhado ou vai ficar só?"]);
  });

  it("mantém a versão mais completa quando o modelo reescreve e acrescenta", () => {
    const curto = "Que férias em família 😊 Qual é a data de nascimento da Marina e do Téo?";
    const longo = `${curto} Ah, também quero confirmar: seu endereço ficou como Av. Paulista, 2200 — está certo?`;

    expect(mergeSegments([curto, longo])).toEqual([longo]);
  });

  it("não confunde continuação com repetição", () => {
    const segs = ["Deixa eu verificar sua reserva.", "Encontrei! Você chega amanhã às 15h."];
    expect(mergeSegments(segs)).toEqual(segs);
  });

  it("preserva a ordem e os segmentos legítimos entre repetições", () => {
    const segs = [
      "Vou registrar os seus dados agora mesmo.",
      "Endereço salvo com sucesso, tudo certo.",
      "Vou registrar os seus dados agora mesmo.",
    ];
    // A primeira ocorrência sai; a segunda (idêntica, mais ao fim) fica.
    expect(mergeSegments(segs)).toEqual([
      "Endereço salvo com sucesso, tudo certo.",
      "Vou registrar os seus dados agora mesmo.",
    ]);
  });

  it("não descarta interjeições curtas que por acaso prefixam a frase seguinte", () => {
    // "Ótimo!" prefixa "Ótimo! Agora o CEP." — mas é curto demais para
    // arriscar, e some-lo não melhora nada.
    expect(mergeSegments(["Ótimo!", "Ótimo! Agora o CEP, por favor."])).toEqual([
      "Ótimo!",
      "Ótimo! Agora o CEP, por favor.",
    ]);
  });

  it("ignora diferença de espaçamento ao comparar", () => {
    const segs = ["Perfeito, já registrei\n\n  seus dados.", "Perfeito, já registrei seus dados."];
    expect(mergeSegments(segs)).toHaveLength(1);
  });

  it("descarta vazios e espaços em branco", () => {
    expect(mergeSegments(["  ", "", "Olá!"])).toEqual(["Olá!"]);
  });
});

describe("joinSegments", () => {
  it("separa por linha em branco", () => {
    expect(joinSegments(["Primeiro.", "Segundo."])).toBe("Primeiro.\n\nSegundo.");
  });

  it("sem segmentos, string vazia", () => {
    expect(joinSegments([])).toBe("");
  });
});
