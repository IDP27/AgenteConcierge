import { describe, expect, it } from "vitest";
import { toWhatsAppMarkup } from "./markup.js";

describe("toWhatsAppMarkup", () => {
  it("**negrito** do modelo vira *negrito* do WhatsApp", () => {
    // Sem isto, o hóspede vê os asteriscos literais no aparelho.
    expect(toWhatsAppMarkup("**Quarto 204 — código 483035**")).toBe(
      "*Quarto 204 — código 483035*",
    );
  });

  it("__negrito__ também vira *negrito*", () => {
    expect(toWhatsAppMarkup("__importante__")).toBe("*importante*");
  });

  it("título markdown vira negrito (WhatsApp não tem títulos)", () => {
    expect(toWhatsAppMarkup("## Seu extrato")).toBe("*Seu extrato*");
  });

  it("preserva o negrito que já está na sintaxe do WhatsApp", () => {
    expect(toWhatsAppMarkup("*Quarto 204*")).toBe("*Quarto 204*");
  });

  it("não mexe em texto sem marcação", () => {
    const text = "Olá, Bruno! Sua chave é 483035.";
    expect(toWhatsAppMarkup(text)).toBe(text);
  });

  it("converte várias ocorrências na mesma mensagem", () => {
    expect(toWhatsAppMarkup("**Total:** R$ 900,00 em **2 itens**")).toBe(
      "*Total:* R$ 900,00 em *2 itens*",
    );
  });

  it("tabela markdown vira linhas (o WhatsApp não tem tabelas)", () => {
    const table = [
      "| Item | Valor |",
      "|---|---|",
      "| Jantar romântico | R$ 450,00 |",
      "| **Total** | **R$ 900,00** |",
    ].join("\n");

    expect(toWhatsAppMarkup(table)).toBe(
      ["*Item — Valor*", "• Jantar romântico — R$ 450,00", "• *Total* — *R$ 900,00*"].join("\n"),
    );
  });

  it("preserva o texto ao redor da tabela", () => {
    const text = ["Aqui está seu extrato:", "", "| A | B |", "|---|---|", "| x | y |", "", "Tudo certo?"].join("\n");
    expect(toWhatsAppMarkup(text)).toBe(
      ["Aqui está seu extrato:", "", "*A — B*", "• x — y", "", "Tudo certo?"].join("\n"),
    );
  });
});
