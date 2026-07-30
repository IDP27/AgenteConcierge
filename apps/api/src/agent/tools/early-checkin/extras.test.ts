import { describe, expect, it } from "vitest";
import { computeExtras, describeCharge, nightsOf, fmtBRL } from "./extras.js";

const EXTRAS = [
  {
    id: "taxa-ambiental",
    title: "Taxa ambiental",
    explanation: "Financia o tratamento de resíduos",
    priceCents: 800,
    unit: "por_pessoa_dia" as const,
    mandatory: true,
  },
  {
    id: "convenio-medico",
    title: "Convênio médico de estadia",
    explanation: "Cobre atendimentos no ambulatório 24h",
    priceCents: 1200,
    unit: "por_pessoa_dia" as const,
    mandatory: false,
  },
  {
    id: "estacionamento",
    title: "Estacionamento coberto",
    explanation: "Vaga coberta pela estadia",
    priceCents: 5000,
    unit: "por_estadia" as const,
    mandatory: false,
  },
];

describe("nightsOf", () => {
  it("conta as diárias entre chegada e saída", () => {
    expect(nightsOf(new Date("2026-08-01"), new Date("2026-08-05"))).toBe(4);
  });

  it("mesmo dia conta uma diária, não zero", () => {
    expect(nightsOf(new Date("2026-08-01"), new Date("2026-08-01"))).toBe(1);
  });
});

describe("computeExtras", () => {
  it("cobra a obrigatória mesmo sem o hóspede aceitar nada", () => {
    const c = computeExtras({ extras: EXTRAS, acceptedIds: [], persons: 3, nights: 4 });

    expect(c.lines).toHaveLength(1);
    expect(c.lines[0]).toMatchObject({ id: "taxa-ambiental", qty: 12, totalCents: 9600 });
    expect(c.totalFormatted).toBe("R$ 96,00");
  });

  it("soma obrigatória + aceita — o caso que virou R$ 240 na jornada real", () => {
    const c = computeExtras({
      extras: EXTRAS,
      acceptedIds: ["convenio-medico"],
      persons: 3,
      nights: 4,
    });

    expect(c.totalCents).toBe(24000);
    expect(c.totalFormatted).toBe("R$ 240,00");
  });

  it("por_estadia não multiplica por pessoas nem por diárias", () => {
    const c = computeExtras({
      extras: EXTRAS,
      acceptedIds: ["estacionamento"],
      persons: 3,
      nights: 4,
    });

    const vaga = c.lines.find((l) => l.id === "estacionamento");
    expect(vaga).toMatchObject({ qty: 1, totalCents: 5000 });
  });

  it("ignora id que não existe na configuração", () => {
    const c = computeExtras({
      extras: EXTRAS,
      // O modelo escreveu a grafia errada (underscore em vez de hífen).
      acceptedIds: ["convenio_medico"],
      persons: 1,
      nights: 1,
    });

    expect(c.lines.map((l) => l.id)).toEqual(["taxa-ambiental"]);
  });
});

describe("describeCharge", () => {
  it("marca a obrigatória e fecha com o total, para o agente só repassar", () => {
    const c = computeExtras({
      extras: EXTRAS,
      acceptedIds: ["convenio-medico"],
      persons: 3,
      nights: 4,
    });
    const texto = describeCharge(c, 3, 4);

    expect(texto).toContain("Taxa ambiental (obrigatória)");
    expect(texto).toContain("3 pessoas × 4 diárias");
    expect(texto).toContain("Total a lançar na conta do quarto: R$ 240,00");
    // O opcional não pode aparecer marcado como obrigatório.
    expect(texto).toContain("Convênio médico de estadia: ");
    expect(texto).not.toContain("Convênio médico de estadia (obrigatória)");
  });

  it("singulariza pessoa e diária", () => {
    const c = computeExtras({ extras: EXTRAS, acceptedIds: [], persons: 1, nights: 1 });
    expect(describeCharge(c, 1, 1)).toContain("R$ 8,00 = R$ 8,00");
  });

  it("sem linhas, sem texto", () => {
    expect(describeCharge({ lines: [], totalCents: 0, totalFormatted: "R$ 0,00" }, 2, 3)).toBe("");
  });
});

describe("fmtBRL", () => {
  it("usa vírgula decimal", () => {
    expect(fmtBRL(24000)).toBe("R$ 240,00");
    expect(fmtBRL(800)).toBe("R$ 8,00");
  });
});
